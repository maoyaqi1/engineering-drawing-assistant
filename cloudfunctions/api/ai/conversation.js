const cloud = require('wx-server-sdk');
// 微信云函数需先 init 才能使用 database()；此模块可能在主入口 init 之前被 require，
// 因此在模块加载时自行初始化（重复 init 是幂等的）。
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const CONFIG = require('./config.js');
const { matchKnowledgePoint } = require('./knowledge.js');
const { buildPrompt, buildImageMessages, generateTitle } = require('./prompt.js');
const { chatCompletion, visionChatCompletion } = require('./llm.js');

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

  let result;
  if (hasImage) {
    const imageDataUrl = imageBase64.indexOf('data:') === 0 ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    result = await visionChatCompletion({ messages: buildImageMessages({ message: text, imageDataUrl, currentKnowledgePoint: currentKp }) });
  } else {
    result = await chatCompletion({ messages: buildPrompt({ message: text, history, currentKnowledgePoint: currentKp }) });
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
    usage: result.usage
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
