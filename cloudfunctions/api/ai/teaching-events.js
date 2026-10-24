// AI 教师教学事件（V2.1）：把「AI 怎么教、学生怎么反应」落到独立集合 ai_teaching_events。
//
// 设计依据：《AI教师 V2.1 设计说明》§4（新增集合）、§5/§6（字段）、§7（第一版三个事件）、
//          §12（与既有集合的边界）、§19（Step 1–4）。
// 边界：
//   1. 只写数据库，不增加大模型调用（§16）；
//   2. 不修改 ai_messages 结构（§3.2；C8 第 4 条）；
//   3. 事件写入失败不得影响回答主链——调用方必须自行兜底（§3.1）。
//
// 与既有集合的分工：
//   ai_messages        → 这段对话"说了什么"
//   ai_teaching_events → AI"怎么教"、学生"怎么反应"
//   learning_records   → 学生在整个学习系统里的行为（不接收教学事件，§12.3）

const cloud = require('wx-server-sdk');
// 微信云函数需先 init 才能使用 database()；本模块可能在主入口 init 之前被 require，
// 因此在模块加载时自行初始化（重复 init 是幂等的）。
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const { getKnowledgeContent } = require('./knowledge.js');

const db = cloud.database();
const EVENTS_COLLECTION = 'ai_teaching_events';

// 第一版正式实现的事件类型（设计说明 §7）
const EVENT_VIDEO_RECOMMEND = 'video_recommend';
const EVENT_VIDEO_OPEN = 'video_open';
const EVENT_VIDEO_COMPLETE = 'video_complete';
// 客户端只允许上报"学生行为"。video_recommend 由服务端在推荐时写入，
// 不接受客户端上报（否则学生可以伪造"AI 推荐过"的假事实）。
const CLIENT_EVENT_TYPES = [EVENT_VIDEO_OPEN, EVENT_VIDEO_COMPLETE];
// 第二阶段预留（§8）：followup_question / positive_feedback / negative_feedback。
// 数据模型允许，但第一版不接收：既有 ai_messages 反馈（recordFeedback）已带
// positive / negative，第二阶段再把它们并入本集合，此处不预先造枚举。

const MAX_TEXT = 300;
// 播放位置/时长上限（12 小时）：挡住异常值（含 NaN / Infinity）污染统计
const MAX_SECONDS = 12 * 60 * 60;

function now() {
  return new Date().toISOString();
}

function asText(value, maxLength) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  const limit = maxLength || MAX_TEXT;
  return s.length > limit ? s.slice(0, limit) : s;
}

// 秒值：必须有限且非负，否则返回 null（不写 NaN / Infinity）
function asSeconds(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n * 10) / 10, MAX_SECONDS);
}

// 分数：有限数值即保留（检索分数口径由服务侧决定，这里不做范围假设）
function asScore(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 知识点名称由服务端按 id 从知识库登记表取；客户端不必（也不应）自带，
// 保证同一知识点在事件表里的名称口径一致。
function knowledgePointName(id) {
  const key = asText(id, 40);
  if (!key) return '';
  try {
    const point = getKnowledgeContent(key);
    return point ? asText(point.title, 120) : '';
  } catch (e) {
    return '';
  }
}

// 统一落库入口：字段固定（设计说明 §5），多余的字段一律不落库，
// 避免客户端把任意内容塞进教学事件表。
async function writeEvent(record) {
  const data = {
    openid: record.openid,
    student_id: asText(record.student_id, 60),
    conversation_id: asText(record.conversation_id, 80),
    message_id: asText(record.message_id, 80),
    event_type: record.event_type,
    knowledge_point_id: asText(record.knowledge_point_id, 40),
    knowledge_point_name: knowledgePointName(record.knowledge_point_id),
    video_id: asText(record.video_id, 200),
    video_title: asText(record.video_title, 200),
    teaching_type: asText(record.teaching_type, 40),
    recommend_score: asScore(record.recommend_score),
    video_position: asSeconds(record.video_position),
    duration: asSeconds(record.duration),
    metadata: record.metadata || null,
    created_at: now()
  };
  const added = await db.collection(EVENTS_COLLECTION).add({ data });
  return added._id;
}

/**
 * §7.1 video_recommend：AI 向学生返回了一个可播放/可查看的视频推荐。
 * "推荐"不代表学生已经看到或观看——学生行为由 video_open / video_complete 记录。
 * 由 answerQuestion 在拿到视频引用后调用，一条引用一条事件（服务最多返回 3 条）。
 */
async function recordVideoRecommend({ openid, studentId, conversationId, messageId, knowledgePoint, videoRef }) {
  if (!openid || !videoRef || !videoRef.video_id) return null;
  return writeEvent({
    openid,
    student_id: studentId,
    conversation_id: conversationId,
    message_id: messageId,
    event_type: EVENT_VIDEO_RECOMMEND,
    knowledge_point_id: knowledgePoint,
    video_id: videoRef.video_id,
    video_title: videoRef.video_title,
    teaching_type: videoRef.teaching_type,
    recommend_score: videoRef.score,
    // 推荐事件的 video_position 保持空：它记录的是"播放位置"，推荐时还没有播放；
    // 片段区间放在 metadata，供 V2.3 的智能推荐使用。
    video_position: null,
    duration: null,
    metadata: {
      start: asSeconds(videoRef.start),
      end: asSeconds(videoRef.end),
      time_label: asText(videoRef.time_label, 40)
    }
  });
}

/**
 * §7.2 video_open / §7.3 video_complete：学生行为，只能由客户端上报这两类。
 * 返回 {ok:false, code, msg} 表示入参不合法（不抛异常）；数据库异常由调用方兜底。
 */
async function recordStudentVideoEvent({ openid, studentId, eventType, payload }) {
  if (!openid) return { ok: false, code: 'NO_OPENID', msg: '无法获取用户身份' };
  if (CLIENT_EVENT_TYPES.indexOf(eventType) < 0) {
    return { ok: false, code: 'INVALID_EVENT_TYPE', msg: '不支持的教学事件类型' };
  }
  const p = payload || {};
  const videoId = asText(p.video_id, 200);
  if (!videoId) return { ok: false, code: 'MISSING_VIDEO_ID', msg: '缺少视频标识' };
  const eventId = await writeEvent({
    openid,
    student_id: studentId,
    conversation_id: p.conversation_id,
    message_id: p.message_id,
    event_type: eventType,
    knowledge_point_id: p.knowledge_point_id,
    video_id: videoId,
    video_title: p.video_title,
    video_position: p.video_position,
    duration: p.duration
  });
  return { ok: true, event_id: eventId, event_type: eventType, video_id: videoId };
}

module.exports = {
  EVENTS_COLLECTION,
  EVENT_VIDEO_RECOMMEND,
  EVENT_VIDEO_OPEN,
  EVENT_VIDEO_COMPLETE,
  recordVideoRecommend,
  recordStudentVideoEvent
};
