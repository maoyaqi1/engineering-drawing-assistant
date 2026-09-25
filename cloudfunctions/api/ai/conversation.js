const cloud = require('wx-server-sdk');
// 微信云函数需先 init 才能使用 database()；此模块可能在主入口 init 之前被 require，
// 因此在模块加载时自行初始化（重复 init 是幂等的）。
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const CONFIG = require('./config.js');
const { matchKnowledgePoint } = require('./knowledge.js');
const { buildPrompt, buildImageMessages, generateTitle } = require('./prompt.js');
const { chatCompletion, visionChatCompletion } = require('./llm.js');
const { askTeacherService } = require('./teacher-service.js');

const db = cloud.database();
const CONVERSATIONS = 'ai_conversations';
const MESSAGES = 'ai_messages';

function makeError(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function now() {
  return new Date().toISOString();
}

async function ensureCollections() {
  await Promise.all([CONVERSATIONS, MESSAGES].map((name) => db.createCollection(name).catch(() => null)));
}

async function createConversation({ openid, title, knowledgePoint }) {
  const added = await db.collection(CONVERSATIONS).add({ data: {
    openid,
    title: title || '新对话',
    knowledge_point: knowledgePoint || null,
    created_at: now()
  }});
  return added._id;
}

async function getConversation(id) {
  try {
    const res = await db.collection(CONVERSATIONS).doc(id).get();
    return res.data ? Object.assign({ id: id }, res.data) : null;
  } catch (e) {
    return null;
  }
}

async function lastNMessages(conversationId, n) {
  const res = await db.collection(MESSAGES)
    .where({ conversation_id: conversationId })
    .orderBy('created_at', 'desc')
    .limit(n)
    .get();
  return res.data.reverse();
}

async function addMessage({ conversationId, role, content, model, knowledgePoint, promptTokens, completionTokens, totalTokens }) {
  const record = {
    conversation_id: conversationId,
    role,
    content,
    knowledge_point: knowledgePoint || null,
    created_at: now()
  };
  if (model) record.model = model;
  if (promptTokens != null) record.prompt_tokens = promptTokens;
  if (completionTokens != null) record.completion_tokens = completionTokens;
  if (totalTokens != null) record.total_tokens = totalTokens;
  const added = await db.collection(MESSAGES).add({ data: record });
  return added._id;
}

async function answerQuestion({ openid, conversationId, message, knowledgePoint, imageBase64 }) {
  const text = (message || '').trim();
  const hasImage = typeof imageBase64 === 'string' && imageBase64.length > 40;
  if (!text && !hasImage) throw makeError('EMPTY_MESSAGE', 400, '请先输入问题或上传图片。');
  if (text.length > CONFIG.ai.maxUserMessageLength) {
    throw makeError('MESSAGE_TOO_LONG', 400, '问题过长，请精简后再发送。');
  }

  let conversation = null;
  if (conversationId) {
    conversation = await getConversation(conversationId);
    if (!conversation) throw makeError('CONVERSATION_NOT_FOUND', 404, '对话不存在或已过期。');
  }

  const fallbackKp = (conversation && conversation.knowledge_point) || null;
  const currentKp = knowledgePoint
    || matchKnowledgePoint(text, { current: fallbackKp })
    || fallbackKp
    || null;

  const history = conversation
    ? (await lastNMessages(conversation.id, CONFIG.context.maxHistoryMessages)).map((m) => ({
        role: m.role,
        content: m.content
      }))
    : [];

  let result = null;
  // 方案 C（2026-09-25 用户裁决）：**检索交给千问侧服务，生成仍在本仓库完成**。
  // 服务返回命中片段正文（契约 §2.2 sources[].text）+ 视频定位；本仓库用既有教学口径与
  // 16 篇知识库 + 检索片段一起生成回答，保证两条链路口径一致。
  // 服务不可用/超时/未命中时返回 null，下面按既有逻辑生成（契约 §5 降级）。
  let videoRefs = [];
  let sources = [];
  let serviceAnswer = null;
  // AI_IMAGE=off 时忽略图片（成本止损开关）；有文字仍按文字回答。
  if (hasImage && !CONFIG.image.enabled && !text) {
    throw makeError('IMAGE_DISABLED', 400, '拍照提问暂时关闭，请直接用文字描述问题。');
  }
  const useImage = hasImage && CONFIG.image.enabled;
  // 服务侧读题分支只在"没有文字"时生效（其实现为 `if img and not question`），
  // 因此带图提问时先按"纯图片"调用，让服务侧去读题（拍题场景里学生那行"这题怎么做"信息量很低）；
  // 图读不出来（模糊/无文字）再用学生的文字重试一次，两条路都失败才回落本地视觉链路。
  let fromService = await askTeacherService({
    question: useImage ? '' : text,
    conversationId: conversation ? conversation.id : null,
    knowledgePoint: currentKp,
    history,
    imageBase64: useImage ? imageBase64 : null
  });
  if (!fromService && useImage && text) {
    fromService = await askTeacherService({
      question: text,
      conversationId: conversation ? conversation.id : null,
      knowledgePoint: currentKp,
      history,
      imageBase64: null
    });
  }
  if (fromService) {
    videoRefs = fromService.videoRefs;
    sources = fromService.sources;
    // 服务侧生成的回答不再作为主答案，只在下面本仓库生成失败时兜底
    if (fromService.content) {
      serviceAnswer = { content: fromService.content, model: fromService.model, usage: fromService.usage };
    }
    // 调参期诊断：记录"是否推视频、推的是哪个、分数多少"，用于判断阈值该定在哪。
    // 分数偏低却仍过闸的，就是误推的主要来源；阈值定稳后可以删掉。
    // 用 console.warn（云函数日志里保留一行/次；项目静态检查禁止 console.log/debug/info）
    if (videoRefs.length) {
      console.warn('[AI 推视频] score=' + videoRefs[0].score + ' video=' + videoRefs[0].video_id
        + ' 检索片段=' + sources.filter((s) => s && s.text).length + ' q=' + (text || '(图片提问)'));
    } else {
      console.warn('[AI 不推视频] 命中知识但无可用视频片段 q=' + (text || '(图片提问)'));
    }
  }

  // 服务检索到的片段正文（未升级前为空数组，此时只有本仓库 16 篇知识库参与生成）
  const segments = Array.isArray(sources) ? sources.filter((s) => s && s.text) : [];
  try {
    if (hasImage && CONFIG.image.enabled) {
      const imageDataUrl = imageBase64.indexOf('data:') === 0 ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
      result = await visionChatCompletion({
        messages: buildImageMessages({ message: text, imageDataUrl, currentKnowledgePoint: currentKp, segments })
      });
    } else {
      result = await chatCompletion({
        messages: buildPrompt({ message: text, history, currentKnowledgePoint: currentKp, segments })
      });
    }
  } catch (err) {
    // 本仓库生成失败：服务侧若已给出回答则兜底用它，否则照旧向上抛（前端提示稍后重试）
    if (serviceAnswer) result = serviceAnswer;
    else throw err;
  }

  let conv = conversation;
  if (!conv) {
    const cid = await createConversation({ openid, title: generateTitle(text), knowledgePoint: currentKp });
    conv = await getConversation(cid);
  }

  const userId = await addMessage({
    conversationId: conv.id,
    role: 'user',
    content: text || (hasImage ? '（学生上传了一张图）' : ''),
    knowledgePoint: currentKp,
    has_image: !!hasImage
  });
  const assistantId = await addMessage({
    conversationId: conv.id, role: 'assistant', content: result.content, model: result.model,
    knowledgePoint: currentKp,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens
  });

  return {
    conversation_id: conv.id,
    title: conv.title,
    message: { role: 'assistant', content: result.content },
    message_id: assistantId,
    user_message_id: userId,
    knowledge_point: currentKp,
    model: result.model,
    usage: result.usage,
    // 云端文件 ID 由云函数拼好再下发，前端不做字符串拼接；
    // VIDEO_PLAYBACK=off 时不下发 file_id，前端自动退回"只显示标题与时间点"。
    video_refs: videoRefs.map((ref) => (
      CONFIG.video.playback
        ? Object.assign({}, ref, {
            file_id: `${CONFIG.video.cloudBase}/${CONFIG.video.pathPrefix}/${ref.video_id}.mp4`
          })
        : ref
    )),
    sources: sources
  };
}

async function listConversations({ openid, limit }) {
  const res = await db.collection(CONVERSATIONS)
    .where({ openid })
    .orderBy('created_at', 'desc')
    .limit(limit || 30)
    .get();
  return res.data.map((c) => ({ id: c._id, title: c.title, knowledge_point: c.knowledge_point, created_at: c.created_at }));
}

async function getConversationDetail({ openid, conversationId }) {
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.openid !== openid) return null;
  const res = await db.collection(MESSAGES)
    .where({ conversation_id: conversationId })
    .orderBy('created_at', 'asc')
    .limit(100)
    .get();
  return {
    id: conversation.id,
    title: conversation.title,
    knowledge_point: conversation.knowledge_point,
    created_at: conversation.created_at,
    messages: res.data.map((m) => ({
      id: m._id, role: m.role, content: m.content, knowledge_point: m.knowledge_point, created_at: m.created_at
    }))
  };
}

async function recordFeedback({ openid, messageId, rating, reason }) {
  if (!rating || !['positive', 'negative'].includes(rating)) {
    throw makeError('INVALID_RATING', 400, '无效的评价类型。');
  }
  if (rating === 'negative' && !reason) {
    throw makeError('INVALID_REASON', 400, '请选择没帮助的原因。');
  }
  const msg = await db.collection(MESSAGES).doc(messageId).get().catch(() => null);
  if (!msg || !msg.data) throw makeError('MESSAGE_NOT_FOUND', 404, '消息不存在。');
  await db.collection(MESSAGES).doc(messageId).update({
    data: { feedback_rating: rating, feedback_reason: reason || null }
  });
  return { ok: true, messageId, rating, reason: reason || null };
}

module.exports = {
  ensureCollections,
  answerQuestion,
  listConversations,
  getConversationDetail,
  recordFeedback
};
