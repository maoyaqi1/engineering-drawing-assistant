// 拍照配额原子预占、幂等和失败返还自测。
//
// 覆盖：
//   1. 同一用户并发图片请求最多 2 个进入 AI；
//   2. 同一 request_id 处理中不重复调用模型，完成后重试不重复消费；
//   3. 不同用户配额独立；
//   4. AI 失败释放租约，同一请求可以重试；
//   5. 审计事件写入失败时回答成功并返回 audit_pending；
//   6. 上线当天旧 ai_photo_ask 事件折算；
//   7. 北京时间跨日与 10 分钟过期租约。
process.env.INTERNAL_OPENIDS = 'openid-photo-internal';

const {
  repoPath,
  sdk,
  table,
  seed,
  rows,
  createReporter
} = require('./test-context.cjs');
const { check, printSummary } = createReporter();

const aiCalls = [];
const realWarn = console.warn;
console.warn = () => {};
let releaseGate;
let gate = new Promise((resolve) => { releaseGate = resolve; });
let failNextAnswer = false;
let callSeq = 0;
const convPath = require.resolve(repoPath('cloudfunctions/api/ai/conversation.js'));
require.cache[convPath] = {
  id: convPath,
  filename: convPath,
  loaded: true,
  exports: {
    ensureCollections: async () => {},
    answerQuestion: async (params) => {
      aiCalls.push(params);
      await gate;
      if (failNextAnswer) {
        failNextAnswer = false;
        const error = new Error('simulated vision failure');
        error.code = 'VISION_FAILED';
        error.status = 503;
        throw error;
      }
      callSeq += 1;
      return {
        conversation_id: 'conv-' + callSeq,
        message: { role: 'assistant', content: 'stub 回答' },
        message_id: 'msg-' + callSeq,
        user_message_id: 'user-msg-' + callSeq,
        knowledge_point: 'G01',
        model: 'qwen-vl-plus',
        usage: {},
        video_refs: [],
        sources: []
      };
    },
    listConversations: async () => [],
    getConversationDetail: async () => null,
    recordFeedback: async () => ({ ok: true })
  }
};

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const photoQuota = require(repoPath('cloudfunctions/api/ai/photo-quota.js'));
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);
const IMG = 'A'.repeat(80);
const IMG2 = 'B'.repeat(80);
const nowIso = new Date().toISOString();

seed('classes', [{
  _id: 'C1', name: '配额测试班', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T1'
}]);
seed('students', [
  {
    _id: 'S1', student_no: '970001', name: '配额甲', class_id: 'C1', class_name: '配额测试班',
    owner_teacher_id: 'T1'
  },
  {
    _id: 'S2', student_no: '970002', name: '配额乙', class_id: 'C1', class_name: '配额测试班',
    owner_teacher_id: 'T1'
  },
  {
    _id: 'S3', student_no: '970003', name: '配额旧', class_id: 'C1', class_name: '配额测试班',
    owner_teacher_id: 'T1'
  },
  {
    _id: 'S4', student_no: '970004', name: '配额失败', class_id: 'C1', class_name: '配额测试班',
    owner_teacher_id: 'T1'
  },
  {
    _id: 'S5', student_no: '970005', name: '配额内部', class_id: 'C1', class_name: '配额测试班',
    owner_teacher_id: 'T1'
  }
]);
seed('users', [
  ['U1', 'openid-photo-a', '配额甲', '970001'],
  ['U2', 'openid-photo-b', '配额乙', '970002'],
  ['U3', 'openid-photo-legacy', '配额旧', '970003'],
  ['U4', 'openid-photo-fail', '配额失败', '970004'],
  ['U5', 'openid-photo-internal', '配额内部', '970005']
].map(([id, openid, name, studentId]) => ({
  _id: id,
  openid,
  role: 'student',
  status: 'active',
  profile_completed: true,
  school: '安徽建筑大学',
  name,
  student_id: studentId,
  created_at: nowIso,
  last_login_at: nowIso
})));

function photoEvents(openid) {
  return rows('learning_records')
    .filter((row) => row.openid === openid && row.event_type === 'ai_photo_ask');
}

(async () => {
  asOpenid('openid-photo-a');
  const callsBefore = aiCalls.length;
  const concurrent = [
    api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'race-1' }),
    api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'race-2' }),
    api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'race-3' }),
    api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'race-1' })
  ];
  await new Promise((resolve) => setTimeout(resolve, 20));
  check('C1 并发时最多 2 个请求进入 AI 处理链路',
    aiCalls.length - callsBefore === 2, String(aiCalls.length - callsBefore));
  releaseGate();
  const results = await Promise.all(concurrent);
  const accepted = results.filter((result) => result.ok).length;
  const exceeded = results.filter((result) => !result.ok && result.code === 'IMAGE_QUOTA_EXCEEDED').length;
  const inProgress = results.filter((result) => !result.ok && result.code === 'PHOTO_REQUEST_IN_PROGRESS').length;
  check('C2 并发结果最多 2 次成功，超额与同请求处理中分别返回',
    accepted === 2 && exceeded === 1 && inProgress === 1,
    JSON.stringify({ accepted, exceeded, inProgress }));
  check('C3 成功审计事件恰好 2 条', photoEvents('openid-photo-a').length === 2,
    String(photoEvents('openid-photo-a').length));

  const callsBeforeReplay = aiCalls.length;
  const replay = await api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'race-1' });
  check('C4 已完成请求重试不再次调用 AI',
    replay.ok === false && replay.code === 'PHOTO_REQUEST_ALREADY_COMPLETED'
      && aiCalls.length === callsBeforeReplay,
    JSON.stringify(replay));
  check('C5 已完成请求重试不新增审计事件',
    photoEvents('openid-photo-a').length === 2, String(photoEvents('openid-photo-a').length));

  asOpenid('openid-photo-b');
  const otherUser = await api({ action: 'ai.ask', message: '', image_base64: IMG2, request_id: 'other-1' });
  check('C6 不同用户配额独立',
    otherUser.ok === true && otherUser.photo_quota.used === 1 && otherUser.photo_quota.remaining === 1,
    JSON.stringify(otherUser.photo_quota));

  asOpenid('openid-photo-fail');
  failNextAnswer = true;
  const failed = await api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'fail-1' });
  check('C7 AI 失败返回可重试错误且租约已释放',
    failed.ok === false && failed.code === 'VISION_FAILED' && failed.quota_release_pending === false
      && failed.photo_quota && failed.photo_quota.used === 0 && failed.photo_quota.remaining === 2,
    JSON.stringify(failed));
  check('C7b AI 失败不写 ai_photo_ask 审计事件',
    photoEvents('openid-photo-fail').length === 0, String(photoEvents('openid-photo-fail').length));
  const retryAfterFailure = await api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'fail-1' });
  check('C8 同一请求在 AI 失败后可以重新预占并成功',
    retryAfterFailure.ok === true && retryAfterFailure.photo_quota.used === 1,
    JSON.stringify(retryAfterFailure.photo_quota));

  sdk.__failNextAdd('learning_records');
  const auditFailed = await api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'audit-1' });
  check('C9 审计写入失败不影响回答，并返回 audit_pending',
    auditFailed.ok === true && auditFailed.photo_quota.audit_pending === true,
    JSON.stringify(auditFailed.photo_quota));
  check('C9b 审计失败不伪造 ai_photo_ask 事件',
    photoEvents('openid-photo-fail').length === 1, String(photoEvents('openid-photo-fail').length));

  const yesterday = Date.parse('2026-10-24T15:59:59.000Z'); // 北京时间 23:59:59
  const today = Date.parse('2026-10-24T16:00:00.000Z');     // 北京时间次日 00:00:00
  check('C10 北京时间跨日前后使用不同配额文档',
    photoQuota.beijingDateKey(yesterday) === '2026-10-24'
      && photoQuota.beijingDateKey(today) === '2026-10-25'
      && photoQuota.quotaDocumentId('openid-photo-a', '2026-10-24')
        !== photoQuota.quotaDocumentId('openid-photo-a', '2026-10-25'),
    JSON.stringify({ yesterday: photoQuota.beijingDateKey(yesterday), today: photoQuota.beijingDateKey(today) }));

  const leaseStart = Date.now();
  const firstLease = await photoQuota.reserve({
    openid: 'openid-lease-test', imageBase64: IMG, requestId: 'lease-1', nowMs: leaseStart
  });
  const expiredLease = await photoQuota.reserve({
    openid: 'openid-lease-test', imageBase64: IMG, requestId: 'lease-1',
    nowMs: leaseStart + photoQuota.LEASE_TTL_MS + 1
  });
  check('C11 超过 10 分钟的 pending 租约可重新预占',
    firstLease.state === 'reserved' && expiredLease.state === 'reserved',
    JSON.stringify({ first: firstLease.state, afterExpiry: expiredLease.state }));

  asOpenid('openid-photo-legacy');
  seed('learning_records', [{
    _id: 'legacy-photo-1',
    openid: 'openid-photo-legacy',
    event_type: 'ai_photo_ask',
    created_at: new Date().toISOString()
  }]);
  const legacyUse = await api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'legacy-1' });
  check('C12 上线当天已有 1 条旧消费时只剩 1 次',
    legacyUse.ok === true && legacyUse.photo_quota.used === 2 && legacyUse.photo_quota.remaining === 0,
    JSON.stringify(legacyUse.photo_quota));

  asOpenid('openid-photo-internal');
  const internal = await api({ action: 'ai.ask', message: '', image_base64: IMG, request_id: 'internal-1' });
  check('C13 内部账号仍不限次并继续记录审计事件',
    internal.ok === true && internal.photo_quota.unlimited === true
      && photoEvents('openid-photo-internal').length === 1,
    JSON.stringify({ quota: internal.photo_quota, events: photoEvents('openid-photo-internal').length }));

  console.warn = realWarn;
  process.exitCode = printSummary({ separator: false, compactDetail: true }) ? 1 : 0;
})().catch((error) => {
  console.warn = realWarn;
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
