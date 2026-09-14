// 第二阶段鉴权自测（REQ-003 R3–R9、R15、R25、R30、R31、D3/D8/D17/D21/D22）：
//   1. 四态 + 四种原因：no_profile / not_in_roster / class_archived / no_class；
//   2. fail closed：读 classes 失败 → ACCESS_CHECK_FAILED（可重试，不误报"不在名册"）；
//   3. is_internal 只豁免班级检查、不豁免名册命中（A1-补）；
//   4. 会话 / 事件 access 快照：写入后永不更新（B3）；
//   5. 问卷门槛：邀请与提交都只面向在册学生（D15/R31）；
//   6. 登录写入 is_internal（环境变量强制覆盖，D22）与 data_quality（R25）；
//   7. 判定路径为按键查询、上限 2000，且全仓不再读写 roster 集合（B6/C1/D16）。
// 运行：node scripts/offline/run-access2.cjs
const fs = require('fs');
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();

// INTERNAL_OPENIDS 在云函数模块加载时读取，因此必须在 require 之前设置
process.env.INTERNAL_OPENIDS = 'openid-internal,openid-internal2,openid-internal3';

const sdk = require('wx-server-sdk');

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
      return { message: { role: 'assistant', content: 'stub 回答' }, conversation_id: 'c1' };
    },
    listConversations: async () => [],
    getConversationDetail: async () => null,
    recordFeedback: async () => ({ ok: true })
  }
};

const apiFn = require(repoPath('cloudfunctions/api/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function rows(name) { return Array.from(table(name).values()); }
function userByOpenid(openid) { return rows('users').find((u) => u.openid === openid); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);
const status = (openid) => { asOpenid(openid); return api({ action: 'roster.status' }); };

const T0 = '2026-09-11T09:30:00.000Z';
// 班级：一个活动班、一个停用班
seed('classes', [
  { _id: 'CA', name: '机械2401', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 },
  { _id: 'CD', name: '机械2402', school: '安徽建筑大学', status: 'archived', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 }
]);
// 名册：在班 / 停用班 / 未分班 / 内部账号（未分班）
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_id: 'CA', class_name: '机械2401', name: '在班甲', student_no: '3001', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 },
  { _id: 'S2', school: '安徽建筑大学', class_id: 'CD', class_name: '机械2402', name: '停用丙', student_no: '3002', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 },
  { _id: 'S3', school: '安徽建筑大学', class_id: '', class_name: '', name: '未分班丁', student_no: '3003', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 },
  { _id: 'S4', school: '安徽建筑大学', class_id: '', class_name: '', name: '内部戊', student_no: '3004', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 },
  { _id: 'S5', school: '安徽建筑大学', class_id: 'CA', class_name: '机械2401', name: '内部己', student_no: '3005', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 }
]);

const register = async (openid, name, studentId) => {
  asOpenid(openid);
  return api({ action: 'register', school: '安徽建筑大学', name, studentId });
};

(async () => {
  // ---------- A. 四态 ----------
  asOpenid('openid-guest0');
  const sA = await api({ action: 'roster.status' });
  check('A1 未注册游客：guest / no_profile / registered=false',
    sA.level === 'guest' && sA.reason === 'no_profile' && sA.registered === false
    && sA.profile_completed === false && sA.in_roster === false, JSON.stringify(sA));
  check('A2 未注册游客：ai.ask → NO_PROFILE', (await api({ action: 'ai.ask', message: 'hi' })).code === 'NO_PROFILE');

  await register('openid-guest1', '游客乙', '9001');
  const sB = await status('openid-guest1');
  check('A3 已注册游客：guest / not_in_roster / profile_completed=true',
    sB.level === 'guest' && sB.reason === 'not_in_roster' && sB.profile_completed === true && sB.in_roster === false,
    JSON.stringify(sB));
  check('A4 已注册游客：ai.ask → NOT_IN_ROSTER', (await api({ action: 'ai.ask', message: 'hi' })).code === 'NOT_IN_ROSTER');

  await register('openid-student', '在班甲', '3001');
  const sC = await status('openid-student');
  check('A5 在班学生：student / ok / in_roster=true / class_name 回显',
    sC.level === 'student' && sC.reason === 'ok' && sC.in_roster === true && sC.class_name === '机械2401',
    JSON.stringify(sC));
  const ask = await api({ action: 'ai.ask', message: '什么是截交线？' });
  check('A6 在班学生：ai.ask 放行并真正进入 AI 模块', ask.ok === true && aiCalls.length === 1, JSON.stringify(ask.ok));

  await register('openid-archived', '停用丙', '3002');
  const sD = await status('openid-archived');
  check('A7 班级停用：guest / class_archived / in_roster=true（命中名册但班级不可用）',
    sD.level === 'guest' && sD.reason === 'class_archived' && sD.in_roster === true, JSON.stringify(sD));
  check('A8 班级停用：ai.ask → CLASS_ARCHIVED',
    (await api({ action: 'ai.ask', message: 'hi' })).code === 'CLASS_ARCHIVED');
  const archivedSession = await api({ action: 'session.start', module: 'point' });
  check('A9 班级停用：互动与埋点不受影响（session.start 正常）',
    archivedSession.ok === true && archivedSession.access_reason === 'class_archived', JSON.stringify(archivedSession));

  await register('openid-noclass', '未分班丁', '3003');
  const sE = await status('openid-noclass');
  check('A10 未分班：guest / no_class / in_roster=true',
    sE.level === 'guest' && sE.reason === 'no_class' && sE.in_roster === true, JSON.stringify(sE));
  check('A11 未分班：ai.ask → NO_CLASS', (await api({ action: 'ai.ask', message: 'hi' })).code === 'NO_CLASS');
  check('A12 未分班：互动仍可用', (await api({ action: 'session.start', module: 'solid' })).ok === true);

  // ---------- B. 测试账号：全功能开放、不计入学情（2026-09-14 用户决策）----------
  await register('openid-internal2', '内部戊', '3004');   // 名册命中但未分班
  const sF = await status('openid-internal2');
  check('B1 内部账号（未分班）→ student/ok，且标记 test_account/bypass=internal',
    sF.level === 'student' && sF.reason === 'ok' && sF.is_internal === true
    && sF.test_account === true && sF.bypass === 'internal',
    JSON.stringify({ level: sF.level, test_account: sF.test_account, bypass: sF.bypass }));
  check('B1b 内部账号未分班也能提问（AI 不再被 no_class 拒绝）',
    (await api({ action: 'ai.ask', message: 'hi' })).ok === true);

  await register('openid-internal', '内部己改', '3005');  // 名册里是「内部己」，姓名不一致
  const sG = await status('openid-internal');
  check('B2 内部账号不在名册/姓名不一致 → 仍 student/ok（全功能开放），in_roster 反映真实命中为 false',
    sG.level === 'student' && sG.reason === 'ok' && sG.in_roster === false && sG.test_account === true,
    JSON.stringify(sG));
  check('B2b 内部账号无资料（未填姓名学号）也可用全部功能',
    await (async () => {
      asOpenid('openid-internal3');
      await api({ action: 'login' });
      const r = await api({ action: 'roster.status' });
      return r.level === 'student' && r.test_account === true;
    })(), 'internal + 空资料');

  // 人工标记为 test 的账号（未入册列表里可标）：同样全功能开放
  await register('openid-marked-test', '测试员甲', '8001');
  const marked = userByOpenid('openid-marked-test');
  table('users').set(marked._id, Object.assign({}, marked, { data_quality: 'test', data_quality_source: 'manual' }));
  const sT = await status('openid-marked-test');
  check('B3 人工标 test 的账号（不在名册）→ student/ok + bypass=test',
    sT.level === 'student' && sT.test_account === true && sT.bypass === 'test' && sT.in_roster === false,
    JSON.stringify({ level: sT.level, bypass: sT.bypass, in_roster: sT.in_roster }));
  check('B3b 标 test 的账号可提问', (await api({ action: 'ai.ask', message: 'hi' })).ok === true);

  // 回归：未标 test 的普通游客仍被拒（不能把门槛一起放开）
  await register('openid-plain-guest', '普通游客', '8002');
  const sPlain = await status('openid-plain-guest');
  check('B4 未标 test 的普通游客仍被拒（not_in_roster）',
    sPlain.level === 'guest' && sPlain.reason === 'not_in_roster' && !sPlain.test_account,
    JSON.stringify(sPlain.reason));

  // ---------- C. fail closed（R5）----------
  sdk.__fault('classes', true);
  const sH = await status('openid-student');
  check('C1 读 classes 失败：reason=check_failed / retryable=true（不误报"不在名册"）',
    sH.reason === 'check_failed' && sH.retryable === true && sH.in_roster === true, JSON.stringify(sH));
  const askFail = await api({ action: 'ai.ask', message: 'hi' });
  check('C2 fail closed：ai.ask → ACCESS_CHECK_FAILED（拒绝放行，可重试）',
    askFail.ok === false && askFail.code === 'ACCESS_CHECK_FAILED' && askFail.retryable === true,
    JSON.stringify(askFail));
  sdk.__fault('classes', false);
  check('C3 恢复后立即重新可用（判定不缓存，R8）', (await status('openid-student')).level === 'student');

  // ---------- D. access 快照（R30/D8/B3）----------
  const snapOk = await api({ action: 'session.start', module: 'point' }).then(async (r) => {
    // 用「在班学生」起一次会话，随后把班级停用，验证旧快照不回写
    table('classes').set('CA', Object.assign({}, table('classes').get('CA'), { status: 'archived' }));
    return r;
  });
  const okSession = rows('learning_sessions').find((s) => s._id === snapOk.session_id);
  check('D1 会话快照写入 access_level / access_reason / in_roster / is_internal',
    okSession.access_level === 'student' && okSession.access_reason === 'ok'
    && okSession.in_roster === true && okSession.is_internal === false, JSON.stringify(okSession));
  const snapAfter = await api({ action: 'session.start', module: 'line' });
  const newSession = rows('learning_sessions').find((s) => s._id === snapAfter.session_id);
  check('D2 停用后新会话快照为 class_archived',
    newSession.access_level === 'guest' && newSession.access_reason === 'class_archived', JSON.stringify(newSession));
  check('D3 历史快照永不随后续状态变化更新（B3）',
    rows('learning_sessions').find((s) => s._id === snapOk.session_id).access_reason === 'ok');
  table('classes').set('CA', Object.assign({}, table('classes').get('CA'), { status: 'active' }));

  const ev = await api({ action: 'record.event', event_type: 'chapter_enter', chapter_id: 'point' });
  const evRow = rows('learning_records').slice(-1)[0];
  check('D4 事件快照写入 access 三字段', ev.ok === true && evRow.access_level === 'student'
    && evRow.access_reason === 'ok' && evRow.in_roster === true, JSON.stringify(evRow));
  // 测试账号：使用功能正常，但快照带 access_test_account=true，便于"测试过程不计入学情"
  await status('openid-marked-test');
  const testSession = await api({ action: 'session.start', module: 'plane' });
  const testSessionRow = rows('learning_sessions').find((s) => s._id === testSession.session_id);
  const testEvent = await api({ action: 'record.event', event_type: 'chapter_enter', chapter_id: 'plane' });
  const testEventRow = rows('learning_records').slice(-1)[0];
  check('D5 测试账号的会话/事件快照带 access_test_account=true（可据此不计入学情）',
    testEvent.ok === true && testSessionRow.access_test_account === true
    && testSessionRow.access_level === 'student' && testEventRow.access_test_account === true,
    JSON.stringify({ session: testSessionRow.access_test_account, event: testEventRow.access_test_account }));

  // ---------- E. 问卷门槛（D15/R31）----------
  const guestSubmit = await status('openid-guest1').then(() => api({ action: 'survey.submit', answers: { q1: 1 } }));
  check('E1 已注册游客提交问卷 → SURVEY_NOT_IN_ROSTER',
    guestSubmit.ok === false && guestSubmit.code === 'SURVEY_NOT_IN_ROSTER', JSON.stringify(guestSubmit.code));
  const noProfileSubmit = await status('openid-guest0').then(() => api({ action: 'survey.submit', answers: { q1: 1 } }));
  check('E2 未注册游客提交问卷 → SURVEY_NO_PROFILE',
    noProfileSubmit.ok === false && noProfileSubmit.code === 'SURVEY_NO_PROFILE', JSON.stringify(noProfileSubmit.code));
  const studentSubmit = await status('openid-student').then(() => api({ action: 'survey.submit', answers: { q1: 1 } }));
  check('E3 在册学生可提交问卷', studentSubmit.ok === true && studentSubmit.survey_completed === true,
    JSON.stringify(studentSubmit));
  // 班级停用只关 AI（D3）：问卷属于学习反馈，名册学生仍可提交
  const archivedSubmit = await status('openid-archived')
    .then(() => api({ action: 'survey.submit', answers: { q1: 2 } }));
  check('E3b 停用班学生（名册命中）仍可提交问卷（D3：停班只关 AI）',
    archivedSubmit.ok === true, JSON.stringify(archivedSubmit.code || archivedSubmit.survey_completed));
  // 测试账号同样可提交（全功能开放）
  const testSubmit = await status('openid-marked-test').then(() => api({ action: 'survey.submit', answers: { q1: 3 } }));
  check('E3c 测试账号（不在名册）也可提交问卷', testSubmit.ok === true,
    JSON.stringify(testSubmit.code || testSubmit.survey_completed));

  // 邀请：只有在册学生才可能被邀请（游客即使满 5 次有效会话也不邀请）
  await register('openid-guest2', '游客丙', '9002');
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const sess = await api({ action: 'session.start', module: 'point' });
    // eslint-disable-next-line no-await-in-loop
    await api({ action: 'session.end', session_id: sess.session_id, duration: 90, interaction_count: 5 });
  }
  const guestStats = await api({ action: 'statistics', mark_invite: true });
  check('E4 游客满 5 次有效会话也不被邀请（can_invite=false / survey_eligible=false）',
    guestStats.ok === true && guestStats.can_invite === false && guestStats.survey_eligible === false,
    JSON.stringify(guestStats));
  const studentStats = await status('openid-student').then(() => api({ action: 'statistics', mark_invite: true }));
  check('E5 在册学生满 5 次有效会话可被邀请（survey_eligible=true）',
    studentStats.ok === true && studentStats.survey_eligible === true, JSON.stringify(studentStats));

  // ---------- F. 登录写入标记（R25 / D22）----------
  const fresh = userByOpenid('openid-guest1');
  check('F1 新账号登录即带 data_quality=production（T0 之后）与来源 auto',
    fresh.data_quality === 'production' && fresh.data_quality_source === 'auto', JSON.stringify(fresh));
  const internalUser = userByOpenid('openid-internal');
  check('F2 internal 账号登录写入 is_internal=true', internalUser.is_internal === true, JSON.stringify(internalUser.is_internal));
  // 人工改 is_internal 后重新登录 → 被环境变量强制覆盖（D22）
  table('users').set(internalUser._id, Object.assign({}, internalUser, { is_internal: false }));
  asOpenid('openid-internal');
  await api({ action: 'login' });
  check('F3 is_internal 人工不可改：重新登录后被环境变量覆盖回 true',
    userByOpenid('openid-internal').is_internal === true, JSON.stringify(userByOpenid('openid-internal').is_internal));
  // 只有超管能标 test：学生端连字段都写不进来，也不能自封 internal
  const promote = await register('openid-selfpromote', '自封测试', '8003');
  asOpenid('openid-selfpromote');
  await api({
    action: 'register',
    school: '安徽建筑大学',
    name: '自封测试',
    studentId: '8003',
    data_quality: 'test',
    data_quality_source: 'manual',
    is_internal: true,
    profile_completed: true
  });
  const self = userByOpenid('openid-selfpromote');
  check('F4 学生端不能自封为测试账号 / 内部账号（register / login 忽略这些字段）',
    promote.ok === true && self.data_quality === 'production' && self.data_quality_source === 'auto'
    && self.is_internal === false,
    JSON.stringify({ q: self.data_quality, s: self.data_quality_source, i: self.is_internal }));
  check('F4b 自封无效：该账号仍按普通游客判定（not_in_roster）',
    (await status('openid-selfpromote')).reason === 'not_in_roster');

  // ---------- G. 静态约定（B6 / C1 / D16）----------
  const apiSrc = fs.readFileSync(repoPath('cloudfunctions/api/index.js'), 'utf8');
  const teacherSrc = fs.readFileSync(repoPath('cloudfunctions/teacher/index.js'), 'utf8');
  check('G1 判定路径为按键查询（students.where({ student_no }) 而不是全表读）',
    /where\(\{\s*student_no:\s*studentId\s*\}\)/.test(apiSrc), 'where({ student_no }) 缺失');
  check('G2 单次查询上限 2000（B6）',
    /ROSTER_QUERY_LIMIT\s*=\s*2000/.test(apiSrc) && /limit\(ROSTER_QUERY_LIMIT\)/.test(apiSrc));
  const offenders = [];
  const files = ['cloudfunctions/api/index.js', 'cloudfunctions/teacher/index.js', 'utils/api.js',
    'pages/ai/ai.js', 'pages/survey/survey.js', 'pages/index/session.js'];
  const collectionPattern = /collection\(\s*['"]roster['"]\s*\)|fetchAll\(\s*['"]roster['"]\s*\)|removeWhereIn\(\s*['"]roster['"]/;
  files.forEach((rel) => {
    const src = fs.readFileSync(repoPath(rel), 'utf8');
    if (collectionPattern.test(src)) offenders.push(rel);
  });
  check('G3 全仓不再有任何 roster 集合读写（剩 roster.status 这个 action 名）',
    offenders.length === 0, offenders.join(','));
  check('G4 学生端不再有 roster 白名单写入口（import/list/remove/clear 全部 ACTION_RETIRED）',
    (apiSrc.match(/RETIRED_ACTIONS/g) || []).length >= 1 && !/action === 'roster\.import'/.test(apiSrc));
  check('G5 教师端不再同步白名单（无 grantAiAccess / revokeAiAccess）',
    !/grantAiAccess|revokeAiAccess/.test(teacherSrc));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
