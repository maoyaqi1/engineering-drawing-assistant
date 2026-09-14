// 学生鉴权模型自测（游客 / 在册学生）。对应 docs/requirements/REQ-003.md 与 DoD：
//   1. 教师是名册唯一录入端，学生端不能写名册（roster.* 写入口已下线）；
//   2. 判定源 = students 名册（按键查询）+ classes 状态；
//   3. 匹配键 = 学号 + 姓名（规范化：去空白 + 全角转半角）；学校不参与放行；禁止学号-only 放行；
//   4. 游客可正常使用互动功能与埋点（session / record.event / statistics 不被拒）；
//   5. AI 相关 action 服务端强制校验，且区分 NO_PROFILE 与 NOT_IN_ROSTER；
//   6. 名册被删除后，服务端再次校验立即收回权限（不依赖前端缓存）；
//   7. register 只写 users，不写名册。
// 说明：班级停用 / 未分班 / 读库失败 / 快照 / 问卷 / 权限收窄见 run-access2.cjs。
// 运行：node scripts/offline/run-access.cjs（或 node scripts/run-all.js 统一运行）
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');

// 桩替换 AI 模块，避免加载真实 LLM 依赖链；同时记录是否真的走到了 AI 模块
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
      return { answer: 'stub 回答', knowledge_point: 'kp', message: { role: 'assistant', content: 'stub 回答' } };
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
function studentRows(no) { return Array.from(table('students').values()).filter((r) => r.student_no === no); }
function studentRow(no) { return Array.from(table('students').values()).find((r) => r.student_no === no); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);

const nowIso = '2026-09-13T02:00:00.000Z';
seed('teachers', [{ _id: 'TA', username: 'ta', name: '任课教师', role: 'teacher', status: 'active', created_at: nowIso }]);
seed('teacher_sessions', [{ _id: 'sa', token: 'tok-a', teacher_id: 'TA', expires_at: Date.now() + 86400000 }]);
const teacherCall = (payload) => teacherFn.main(Object.assign({ token: 'tok-a' }, payload));

(async () => {
  // ---------- A. 未填资料的用户：游客，可互动，AI 被拒且原因为 no_profile ----------
  asOpenid('openid-no-profile');
  const login = await api({ action: 'login' });
  const statusNoProfile = await api({ action: 'roster.status' });
  check('A1 未填资料：login 成功且 registered=false', login.ok === true && login.registered === false, JSON.stringify(login.registered));
  check('A2 未填资料：level=guest / reason=no_profile / in_roster=false / profile_completed=false',
    statusNoProfile.ok === true && statusNoProfile.level === 'guest' && statusNoProfile.reason === 'no_profile'
    && statusNoProfile.in_roster === false && statusNoProfile.profile_completed === false,
    JSON.stringify(statusNoProfile));
  const askNoProfile = await api({ action: 'ai.ask', message: '你好' });
  check('A3 未填资料：ai.ask 被服务端拒绝 → NO_PROFILE',
    askNoProfile.ok === false && askNoProfile.code === 'NO_PROFILE', JSON.stringify(askNoProfile.code));
  check('A3b 未填资料：被拒时没有调用 AI 模块', aiCalls.length === 0, aiCalls.length);

  const start = await api({ action: 'session.start', module: 'point' });
  const end = await api({ action: 'session.end', session_id: start.session_id, duration: 90, interaction_count: 5 });
  const event = await api({ action: 'record.event', event_type: 'chapter_enter', chapter_id: 'point' });
  const stats = await api({ action: 'statistics', mark_invite: false });
  check('A4 游客可正常使用互动与埋点（session.start / session.end / record.event / statistics 都不被拒）',
    start.ok === true && end.ok === true && event.ok === true && stats.ok === true,
    JSON.stringify({ start: start.ok, end: end.ok, event: event.ok, stats: stats.ok }));

  const studentsSizeBefore = table('students').size;
  const studentImport = await api({ action: 'roster.import', student_ids: ['700001'] });
  check('A5 学生端不能写名册（roster.import → ACTION_RETIRED）',
    studentImport.ok === false && studentImport.code === 'ACTION_RETIRED', JSON.stringify(studentImport.code));
  check('A5b 学生端操作后名册条数不变', table('students').size === studentsSizeBefore,
    table('students').size + '/' + studentsSizeBefore);
  const rosterWrites = ['roster.list', 'roster.remove', 'roster.clear'];
  const retired = [];
  for (const action of rosterWrites) {
    // eslint-disable-next-line no-await-in-loop
    const r = await api({ action });
    retired.push(action + ':' + (r && r.code));
  }
  check('A5c 其余 roster 写入口同样下线（list / remove / clear 全部 ACTION_RETIRED）',
    retired.every((s) => s.endsWith(':ACTION_RETIRED')), retired.join(','));

  // ---------- B. 已填资料但不在名册：游客，可互动，AI 被拒且原因为 not_in_roster ----------
  asOpenid('openid-not-in-roster');
  const reg = await api({ action: 'register', school: '安徽建筑大学', name: '张三', studentId: '700001' });
  const statusNotIn = await api({ action: 'roster.status' });
  check('B1 注册成功且名册未增加记录（register 只写 users）',
    reg.ok === true && table('students').size === studentsSizeBefore,
    JSON.stringify({ ok: reg.ok, students: table('students').size }));
  check('B2 资料已填但不在名册：level=guest / reason=not_in_roster / profile_completed=true',
    statusNotIn.level === 'guest' && statusNotIn.reason === 'not_in_roster'
    && statusNotIn.in_roster === false && statusNotIn.profile_completed === true,
    JSON.stringify(statusNotIn));
  check('B2b 状态接口回显姓名与学号（便于学生核对）',
    statusNotIn.name === '张三' && statusNotIn.student_id === '700001',
    JSON.stringify({ name: statusNotIn.name, student_id: statusNotIn.student_id }));
  const askNotIn = await api({ action: 'ai.ask', message: '你好' });
  check('B3 资料已填但不在名册：ai.ask → NOT_IN_ROSTER',
    askNotIn.ok === false && askNotIn.code === 'NOT_IN_ROSTER', JSON.stringify(askNotIn.code));
  const guestStart = await api({ action: 'session.start', module: 'solid' });
  check('B4 该游客仍可使用互动模块（session.start 正常）', guestStart.ok === true, JSON.stringify(guestStart.ok));
  check('B4b register 响应带上本次 access 结果',
    !!reg.access && reg.access.level === 'guest' && reg.access.reason === 'not_in_roster',
    JSON.stringify(reg.access));

  // ---------- C. 教师录入 + 分到活动班级后成为在册学生 ----------
  const cls = await teacherCall({ action: 'class.create', name: '教师组', school: '安徽建筑大学' });
  const classId = cls && cls.class && cls.class.id;
  check('C0 教师建班成功（后续判定需要活动班级）', !!classId, JSON.stringify(cls));
  const created = await teacherCall({
    action: 'student.create', school: '安徽建筑大学', name: '张三', student_no: '700001', class_id: classId
  });
  const statusStudent = await api({ action: 'roster.status' });
  check('C1 教师录入学生成功（只写名册 students，不再有白名单副本）',
    created.ok === true && studentRows('700001').length === 1 && !table('roster').size,
    JSON.stringify({ ok: created.ok, students: studentRows('700001').length, roster: table('roster').size }));
  check('C2 录入并分班后：level=student / reason=ok / in_roster=true / class_name 回显',
    statusStudent.level === 'student' && statusStudent.reason === 'ok' && statusStudent.in_roster === true
    && statusStudent.class_name === '教师组',
    JSON.stringify({ level: statusStudent.level, reason: statusStudent.reason, class_name: statusStudent.class_name }));
  const askStudent = await api({ action: 'ai.ask', message: '什么是截交线？' });
  check('C3 正式学生：ai.ask 放行并真正进入 AI 模块',
    askStudent.ok === true && aiCalls.length === 1, JSON.stringify({ ok: askStudent.ok, aiCalls: aiCalls.length }));

  // ---------- D. 匹配键：必须学号 + 姓名；学校不参与 ----------
  asOpenid('openid-same-id-diff-name');
  await api({ action: 'register', school: '安徽建筑大学', name: '李四', studentId: '700001' });
  const sameIdStatus = await api({ action: 'roster.status' });
  check('D1 仅学号相同、姓名不同 → 不放行（禁止学号-only 放行）',
    sameIdStatus.in_roster === false && sameIdStatus.reason === 'not_in_roster',
    JSON.stringify({ in_roster: sameIdStatus.in_roster, reason: sameIdStatus.reason }));

  await teacherCall({ action: 'student.create', school: '安徽建筑大学', name: '周七', student_no: '700004', class_id: classId });
  asOpenid('openid-diff-school');
  const regDiffSchool = await api({ action: 'register', school: '某某职业技术学院', name: '周七', studentId: '700004' });
  const diffSchoolStatus = await api({ action: 'roster.status' });
  check('D2 学校字段不参与放行（学校不同、学号姓名一致仍放行）',
    regDiffSchool.ok === true && diffSchoolStatus.in_roster === true && diffSchoolStatus.level === 'student',
    JSON.stringify({ in_roster: diffSchoolStatus.in_roster, level: diffSchoolStatus.level }));

  // 名册里姓名带首尾空格（模拟历史脏数据）→ 两端规范化后应放行
  table('students').set('manual-padded', {
    _id: 'manual-padded', student_no: '700005', name: '  王五  ', class_id: classId, class_name: '教师组',
    owner_teacher_id: 'TA', owner_teacher_name: '任课教师', source: 'teacher', created_at: nowIso
  });
  asOpenid('openid-padded-name');
  await api({ action: 'register', school: '安徽建筑大学', name: '王五', studentId: '700005' });
  const paddedStatus = await api({ action: 'roster.status' });
  check('D3 姓名两端空格被归一化（名册"  王五  " 与填写"王五"匹配）',
    paddedStatus.in_roster === true && paddedStatus.level === 'student', JSON.stringify(paddedStatus.reason));

  // ---------- E. 名册删除后：服务端再次校验立即收回 ----------
  const targetDoc = studentRow('700001');
  const removed = await teacherCall({ action: 'student.delete', doc_id: targetDoc._id });
  asOpenid('openid-not-in-roster');
  const statusAfterRemove = await api({ action: 'roster.status' });
  const askAfterRemove = await api({ action: 'ai.ask', message: '还能提问吗？' });
  check('E1 教师删除名册后：状态回到 not_in_roster',
    removed.ok === true && statusAfterRemove.reason === 'not_in_roster' && statusAfterRemove.in_roster === false,
    JSON.stringify({ removed: removed.ok, reason: statusAfterRemove.reason }));
  check('E2 删除后 ai.ask 被服务端再次拒绝（不依赖前端缓存）',
    askAfterRemove.ok === false && askAfterRemove.code === 'NOT_IN_ROSTER', JSON.stringify(askAfterRemove.code));

  // ---------- F. AI 相关 action 全部走鉴权 ----------
  asOpenid('openid-same-id-diff-name'); // 游客
  const list = await api({ action: 'ai.list' });
  const detail = await api({ action: 'ai.detail', conversation_id: 'c1' });
  const feedback = await api({ action: 'ai.feedback', message_id: 'm1', rating: 'up' });
  check('F1 游客调用 ai.list / ai.detail / ai.feedback 同样被拒（统一走 resolveAccess）',
    list.ok === false && detail.ok === false && feedback.ok === false
    && list.code === 'NOT_IN_ROSTER' && detail.code === 'NOT_IN_ROSTER' && feedback.code === 'NOT_IN_ROSTER',
    JSON.stringify({ list: list.code, detail: detail.code, feedback: feedback.code }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
