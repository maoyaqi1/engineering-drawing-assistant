// AI 教师「检索 + 生成」服务（千问侧，腾讯云 SCF 函数 URL）的调用封装。
//
// 契约：docs/AI教师对接契约.md §2（接口字段）、§3（video_refs）、§5（失败与降级）。
//
// 三条约定：
//   1. 本模块只做一件事：把学生问题交给服务方，取回答案与讲解片段；
//   2. **永不抛异常**——未配置环境变量、超时、非 2xx、响应不合法，一律返回 null，
//      由调用方走既有的 DeepSeek + 16 篇知识库路径（契约 §5 的降级要求）；
//   3. QWEN_TEACHER_BASE_URL / QWEN_TEACHER_TOKEN 只写在云函数环境变量里，
//      不落代码、文档、注释或 Git（AGENTS.md C5.4 / C10）。

const https = require('https');
const CONFIG = require('./config.js');

const MAX_BODY_BYTES = 256 * 1024;
const MAX_VIDEO_REFS = 3;
const MAX_SOURCES = 4;
// 命中片段正文：用于本仓库侧生成回答（方案 C 的检索-生成分离），单段截断防爆上下文
const MAX_SEGMENT_CHARS = 400;

function asString(value, maxLength) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return maxLength && trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 只保留契约 §3 规定的字段，逐项校验类型；不合法就丢弃该条（宁缺勿错）
function normalizeVideoRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const videoId = asString(raw.video_id, 200);
  const start = asNumber(raw.start);
  if (!videoId || start == null) return null;
  return {
    video_id: videoId,
    video_title: asString(raw.video_title, 200),
    kp_title: asString(raw.kp_title, 300),
    start: Math.max(0, Math.round(start)),
    end: Math.max(0, Math.round(asNumber(raw.end) || 0)),
    time_label: asString(raw.time_label, 40),
    score: asNumber(raw.score) || 0
  };
}

function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const doc = asString(raw.doc, 200);
  if (!doc) return null;
  return {
    doc,
    kp_id: asString(raw.kp_id, 80),
    score: asNumber(raw.score) || 0,
    // 契约 §2.2：方案的"检索片段正文"由服务侧回传（可选字段，缺失时退回本地 16 篇知识库生成）
    text: asString(raw.text, MAX_SEGMENT_CHARS)
  };
}

function postJson(url, body, timeoutMs) {
  return new Promise((resolve) => {
    let payload;
    try {
      payload = Buffer.from(JSON.stringify(body), 'utf8');
    } catch (e) {
      return resolve(null);
    }
    let req;
    try {
      req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CONFIG.teacherService.token}`,
            'Content-Length': payload.length
          },
          timeout: timeoutMs
        },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') });
          });
        }
      );
    } catch (e) {
      return resolve(null);
    }
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

/**
 * 调用 AI 教师服务。
 * @param {object} p
 * @param {string} p.question 学生问题（纯图片提问时可为空串）
 * @param {string} [p.imageBase64] 学生上传的题目照片（原始 base64 或 data URL）
 * @returns {Promise<null|{content:string, model:string, usage:object, videoRefs:Array, sources:Array}>}
 *          任何异常/未命中/未配置都返回 null，由调用方降级。
 */
async function askTeacherService({ question, conversationId, knowledgePoint, history, imageBase64 }) {
  const cfg = CONFIG.teacherService;
  if (!cfg.baseUrl || !cfg.token) return null; // 未配置 → 静默走老路径
  if (!question && !imageBase64) return null;

  let url;
  try {
    url = new URL(`${cfg.baseUrl}/v1/ai-teacher/ask`);
  } catch (e) {
    return null;
  }

  const body = {
    question: question || '',
    conversation_id: conversationId || null,
    knowledge_point: knowledgePoint || null,
    history: Array.isArray(history) ? history.slice(-12) : [],
    top_k: cfg.topK,
    threshold: cfg.threshold
  };
  // 带图提问：服务侧要先读题（视觉模型）再检索生成，两次模型调用，给更长的超时
  if (imageBase64) body.image_base64 = imageBase64;
  const response = await postJson(
    url,
    body,
    imageBase64 ? cfg.requestTimeoutMsImage : cfg.requestTimeoutMs
  );
  if (!response || response.status !== 200) return null;

  let data;
  try {
    data = JSON.parse(response.text);
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  // matched=false（含课程外问题、服务内闸门未过）→ 交回调用方降级处理
  if (data.matched !== true) return null;

  const content = asString(data.answer, 2000);
  if (!content) return null; // 契约 §5：matched=true 时 answer 不得为空

  const videoRefs = Array.isArray(data.video_refs)
    ? data.video_refs.map(normalizeVideoRef).filter(Boolean).slice(0, MAX_VIDEO_REFS)
    : [];
  const sources = Array.isArray(data.sources)
    ? data.sources.map(normalizeSource).filter(Boolean).slice(0, MAX_SOURCES)
    : [];
  const usage = data.usage || {};

  return {
    content,
    model: asString(data.model, 60) || 'qwen-turbo',
    usage: {
      promptTokens: asNumber(usage.prompt_tokens),
      completionTokens: asNumber(usage.completion_tokens),
      totalTokens: asNumber(usage.total_tokens)
    },
    videoRefs,
    sources
  };
}

module.exports = { askTeacherService };
