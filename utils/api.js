const SURVEY_ID = 'geometry_learning_2026';
const SURVEY_VERSION = 'v1';

function cloudAvailable() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

function callApi(action, payload) {
  if (!cloudAvailable()) {
    return Promise.resolve({ ok: false, code: 'NO_CLOUD', msg: '云能力不可用' });
  }
  return wx.cloud.callFunction({ name: 'api', data: Object.assign({ action }, payload || {}) })
    .then((res) => res.result || { ok: false, code: 'EMPTY_RESULT', msg: '空响应' })
    .catch((error) => ({ ok: false, code: 'NETWORK', msg: String(error && error.message || error) }));
}

function login() {
  return callApi('login');
}

function register(profile) {
  return callApi('register', {
    school: profile.school,
    name: profile.name,
    student_id: profile.studentId
  });
}

function rosterStatus() {
  return callApi('roster.status');
}

// 说明：roster.import / roster.list / roster.remove / roster.clear 已随白名单集合 roster 下线
// （REQ-003 D16）——名册只由教师端维护，学生端不再有任何名册写入口。

function startSession(module) {
  return callApi('session.start', { module });
}

function endSession(sessionId, duration, interactionCount) {
  return callApi('session.end', {
    session_id: sessionId,
    duration,
    interaction_count: interactionCount
  });
}

function statistics(markInvite) {
  return callApi('statistics', { mark_invite: !!markInvite });
}

// 学习行为事件上报（进入/退出章节、AI 提问等）
function recordEvent(eventType, payload) {
  return callApi('record.event', Object.assign({ event_type: eventType }, payload || {}));
}

function submitSurvey(answers) {
  return callApi('survey.submit', {
    survey_id: SURVEY_ID,
    survey_version: SURVEY_VERSION,
    answers
  });
}

function aiAsk(message, conversationId, knowledgePoint, imageBase64) {
  return callApi('ai.ask', {
    message,
    conversation_id: conversationId || null,
    knowledge_point: knowledgePoint || null,
    image_base64: imageBase64 || null
  });
}

function aiList() {
  return callApi('ai.list');
}

function aiDetail(conversationId) {
  return callApi('ai.detail', { conversation_id: conversationId });
}

function aiFeedback(messageId, rating, reason) {
  return callApi('ai.feedback', { message_id: messageId, rating, reason: reason || null });
}

module.exports = {
  SURVEY_ID,
  SURVEY_VERSION,
  login,
  register,
  rosterStatus,
  startSession,
  endSession,
  recordEvent,
  statistics,
  submitSurvey,
  aiAsk,
  aiList,
  aiDetail,
  aiFeedback
};
