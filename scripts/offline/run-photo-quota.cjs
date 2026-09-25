// 拍照提问每日限额自测（2026-09-25 用户要求：每天 2 次；测试账号不限次）。
// 覆盖：
//   1. 正式学生：第 1、2 次放行并回传剩余次数；第 3 次被拒且**不进入 AI 模块**（不产生视觉调用）
//   2. 纯文字提问不受限额影响
//   3. 计数以服务端事件 ai_photo_ask 为准（客户端计数不可信）
//   4. 内部/测试账号不限次（unlimited=true）
// 运行：node scripts/offline/run-photo-quota.cjs（run-all.js 会自动收录本文件）
//
// 边界：不覆盖"跨天重置"（需要伪造时钟）；跨天逻辑见 cloudfunctions/api/index.js 的 startOfTodayInBeijing()。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
// 内部账号名单必须在 require 云函数之前设置（与 run-quality.cjs 一致）
process.env.INTERNAL_OPENIDS = 'openid-internal';

const sdk = require('wx-server-sdk');

// 桩替换 AI 模块：既能拦住真实 LLM 依赖链，又能断言"被拒时没有进入 AI 模块"
const aiCalls = [];
const convPath = require.resolve(repoPath('cloudfunctions/api/ai/conversation.js'));
require.cache[convPath] = {
  id: convPath,
  filename: convPath,
  loaded: true,
  exports: {
    ensureCollections: async () => {},
    answerQuestion: async (params) => {
      aiCalls.push(params);
      return { message: { role: 'assistant', content: 'stub 回答' }, video_refs: [], sources: [] };
    },
    listConversations: async () => [],
    getConversationDetail: async () => ({ id: 'c1', messages: [] }),
    recordFeedback: async () => ({ ok: true })
  }
};

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function countEvents(openid, eventType) {
  return Array.from(table('learning_records').values())
    .filter((r) => r.openid === openid && r.event_type === eventType).length;
}

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);
const teacherCall = (payload) => teacherFn.main(Object.assign({ token: 'tok-1' }, payload));

// 满足 hasImage 判定（conversation.js: length > 40）
const IMG = 'A'.repeat(80);
const nowIso = new Date().toISOString();
seed('teachers', [{ _id: 'T1', username: 't1', name: '任课教师', role: 'teacher', status: 'active', created_at: nowIso }]);
seed('teacher_sessions', [{ _id: 's1', token: 'tok-1', teacher_id: 'T1', expires_at: Date.now() + 86400000 }]);

(async () => {
  // 前置：建一个活动班级并把学生录入名册
  const cls = await teacherCall({ action: 'class.create', name: '限额测试班', school: '安徽建筑大学' });
  const classId = cls && cls.class && cls.class.id;
  await teacherCall({ action: 'student.create', school: '安徽建筑大学', name: '张三', student_no: '880001', class_id: classId });

  // ---------- A. 正式学生：每天 2 次 ----------
  asOpenid('openid-stu');
  await api({ action: 'register', school: '安徽建筑大学', name: '张三', studentId: '880001' });
  const status = await api({ action: 'roster.status' });
  check('A0 前置：该账号是在册学生', status.level === 'student', JSON.stringify({ level: status.level, reason: status.reason }));

  const callsBefore = aiCalls.length;
  const p1 = await api({ action: 'ai.ask', message: '', image_base64: IMG });
  check('A1 第 1 次拍照提问放行', p1.ok === true, JSON.stringify(p1.code || p1.ok));
  check('A2 回传配额且剩余 1 次', !!(p1.photo_quota && p1.photo_quota.remaining === 1), JSON.stringify(p1.photo_quota));

  const p2 = await api({ action: 'ai.ask', message: '', image_base64: IMG });
  check('A3 第 2 次拍照提问放行', p2.ok === true && p2.photo_quota.remaining === 0, JSON.stringify(p2.photo_quota));

  const p3 = await api({ action: 'ai.ask', message: '', image_base64: IMG });
  check('A4 第 3 次被拒（IMAGE_QUOTA_EXCEEDED）', p3.ok === false && p3.code === 'IMAGE_QUOTA_EXCEEDED', JSON.stringify(p3));
  check('A5 被拒时不进入 AI 模块（不产生视觉调用）', aiCalls.length === callsBefore + 2, JSON.stringify({ aiCalls: aiCalls.length }));

  const textAsk = await api({ action: 'ai.ask', message: '什么是截交线？' });
  check('A6 纯文字提问不受限额影响', textAsk.ok === true, JSON.stringify(textAsk.code || textAsk.ok));
  check('A7 服务端事件记账：ai_photo_ask 恰好 2 条', countEvents('openid-stu', 'ai_photo_ask') === 2,
    String(countEvents('openid-stu', 'ai_photo_ask')));

  // ---------- B. 另一个学生互不影响 ----------
  await teacherCall({ action: 'student.create', school: '安徽建筑大学', name: '李四', student_no: '880002', class_id: classId });
  asOpenid('openid-stu2');
  await api({ action: 'register', school: '安徽建筑大学', name: '李四', studentId: '880002' });
  const q1 = await api({ action: 'ai.ask', message: '', image_base64: IMG });
  check('B1 另一名学生的额度独立（第 1 次仍放行）', q1.ok === true && q1.photo_quota.remaining === 1, JSON.stringify(q1.photo_quota));
  check('B2 第一名学生的事件数不受影响', countEvents('openid-stu', 'ai_photo_ask') === 2,
    String(countEvents('openid-stu', 'ai_photo_ask')));

  // ---------- C. 内部/测试账号不限次 ----------
  asOpenid('openid-internal');
  await api({ action: 'register', school: '安徽建筑大学', name: '内部测试', studentId: '880003' });
  let allOk = true;
  let lastQuota = null;
  for (let i = 0; i < 4; i += 1) {
    const r = await api({ action: 'ai.ask', message: '', image_base64: IMG });
    if (!r.ok) allOk = false;
    lastQuota = r.photo_quota;
  }
  check('C1 内部账号连续 4 次拍照均放行', allOk === true, JSON.stringify(lastQuota));
  check('C2 内部账号标记 unlimited', !!(lastQuota && lastQuota.unlimited === true), JSON.stringify(lastQuota));

  // ---------- 输出 ----------
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' :: ' + r.detail : '')));
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exitCode = failed.length ? 1 : 0;
})();
