// 数据维护·按人清理 离线自测：列表统计、预览、防误删、**只删选中的人**（隔离性）、留痕。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function size(name) { return table(name).size; }
function rows(name) { return Array.from(table(name).values()); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const T0 = '2026-09-11T02:00:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'TA', username: 'ta', name: '任课教师', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'sa', token: 'tok-a', teacher_id: 'TA', expires_at: Date.now() + 86400000 }
]);
// 三个人：甲（测试账号）、乙、丙（真实数据）
seed('users', [
  { _id: 'UA', openid: 'openid-a', role: 'student', student_id: 'A001', name: '甲', school: 'A校', created_at: T0, last_login_at: T0 },
  { _id: 'UB', openid: 'openid-b', role: 'student', student_id: 'B001', name: '乙', school: 'A校', created_at: T0 },
  { _id: 'UC', openid: 'openid-c', role: 'student', student_id: 'C001', name: '丙', school: 'B校', created_at: T0 }
]);
seed('students', [
  { _id: 'SA', student_no: 'A001', name: '甲', school: 'A校', owner_teacher_id: 'TA', owner_teacher_name: '任课教师' },
  { _id: 'SB', student_no: 'B001', name: '乙', school: 'A校', owner_teacher_id: 'TA', owner_teacher_name: '任课教师' },
  { _id: 'SC', student_no: 'C001', name: '丙', school: 'B校', owner_teacher_id: 'TA', owner_teacher_name: '任课教师' }
]);
seed('roster', [
  { _id: 'RA', student_id: 'A001', name: '甲' },
  { _id: 'RB', student_id: 'B001', name: '乙' },
  { _id: 'RC', student_id: 'C001', name: '丙' }
]);
seed('teacher_notes', [
  { _id: 'NA', doc_id: 'SA', content: '甲的备注' },
  { _id: 'NB', doc_id: 'SB', content: '乙的备注' }
]);
seed('learning_sessions', [
  { _id: 'LSA1', openid: 'openid-a', user_id: 'UA', module: 'point', created_at: T0 },
  { _id: 'LSA2', openid: 'openid-a', user_id: 'UA', module: 'line', created_at: T0 },
  { _id: 'LSB1', openid: 'openid-b', user_id: 'UB', module: 'plane', created_at: T0 },
  { _id: 'LSC1', openid: 'openid-c', user_id: 'UC', module: 'point', created_at: T0 }
]);
seed('learning_records', [
  { _id: 'LRA1', openid: 'openid-a', user_id: 'UA', event_type: 'chapter_enter', created_at: T0 },
  { _id: 'LRB1', openid: 'openid-b', user_id: 'UB', event_type: 'chapter_enter', created_at: T0 }
]);
seed('ai_conversations', [
  { _id: 'CVA', openid: 'openid-a', title: '甲的问题', created_at: T0 },
  { _id: 'CVB', openid: 'openid-b', title: '乙的问题', created_at: T0 }
]);
seed('ai_messages', [
  { _id: 'MA1', conversation_id: 'CVA', role: 'user', content: '甲问', created_at: T0 },
  { _id: 'MA2', conversation_id: 'CVA', role: 'assistant', content: '答甲', created_at: T0 },
  { _id: 'MB1', conversation_id: 'CVB', role: 'user', content: '乙问', created_at: T0 }
]);
seed('survey_responses', [
  { _id: 'SRA', user_id: 'UA', answer: 1, submitted_at: T0 },
  { _id: 'SRB', user_id: 'UB', answer: 2, submitted_at: T0 }
]);
seed('survey_invites', [{ _id: 'SIA', user_id: 'UA', completed: false }]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const teacherCall = (p) => teacherFn.main(Object.assign({ token: 'tok-a' }, p));
const behaviorScope = { behavior: true, roster: false, account: false };

(async () => {
  // T1 权限
  const t1 = await teacherCall({ action: 'data.personList' });
  check('T1 普通教师不能查看清理列表（403）', t1.ok === false && t1.code === 'FORBIDDEN', JSON.stringify(t1.code));
  const t1b = await teacherCall({ action: 'data.personPurge', user_ids: ['UA'] });
  check('T1b 普通教师不能按人清理（403）', t1b.ok === false && t1b.code === 'FORBIDDEN', JSON.stringify(t1b.code));

  // T2 列表与每人数据量
  const t2 = await superCall({ action: 'data.personList' });
  const jia = (t2.items || []).find((i) => i.student_no === 'A001') || {};
  check('T2 列表返回 3 个人', t2.ok === true && (t2.items || []).length === 3, JSON.stringify(t2.total));
  check('T2b 甲的数据量统计正确（8 条）',
    jia.total === 8 && jia.counts.learning_sessions === 2 && jia.counts.learning_records === 1
    && jia.counts.ai_conversations === 1 && jia.counts.ai_messages === 2
    && jia.counts.survey_responses === 1 && jia.counts.survey_invites === 1,
    JSON.stringify(jia.counts));
  check('T2c 列表带名册归属与白名单标记', jia.in_class_roster === true && jia.in_roster === true && jia.owner_teacher_name === '任课教师');
  check('T2e 阶段划分正确（甲=已入册）+ 带 openid 与登录时间',
    jia.stage === '已入册' && jia.openid === 'openid-a' && !!jia.created_at,
    JSON.stringify({ stage: jia.stage, openid: jia.openid }));
  const t2d = await superCall({ action: 'data.personList', keyword: 'B001' });
  check('T2d 支持按学号/姓名/学校搜索', t2d.ok === true && (t2d.items || []).length === 1 && t2d.items[0].name === '乙', JSON.stringify((t2d.items || []).map((i) => i.name)));

  // T3 预览：只统计不删
  const t3 = await superCall({ action: 'data.personPurge', user_ids: ['UA'], scope: behaviorScope, dry_run: true });
  check('T3 预览正确（1 人 / 8 条）', t3.ok === true && t3.people_count === 1 && t3.total_records === 8, JSON.stringify({ p: t3.people_count, r: t3.total_records }));
  check('T3b 预览不删除任何数据', size('learning_sessions') === 4 && size('ai_messages') === 3);

  // T4 confirm_count 必须等于人数
  const t4 = await superCall({ action: 'data.personPurge', user_ids: ['UA'], scope: behaviorScope, dry_run: false, confirm_count: 2 });
  check('T4 confirm_count 与人数不一致被拒', t4.ok === false && t4.code === 'CONFIRM_MISMATCH', JSON.stringify(t4.code));
  check('T4b 被拒后数据未动', size('learning_sessions') === 4 && size('users') === 3);

  // T5 按人清理行为数据：只删甲，乙丙一条不动
  const t5 = await superCall({ action: 'data.personPurge', user_ids: ['UA'], scope: behaviorScope, dry_run: false, confirm_count: 1 });
  check('T5 清理成功且各表条数正确',
    t5.ok === true && t5.removed.learning_sessions === 2 && t5.removed.learning_records === 1
    && t5.removed.ai_conversations === 1 && t5.removed.ai_messages === 2
    && t5.removed.survey_responses === 1 && t5.removed.survey_invites === 1,
    JSON.stringify(t5.removed));
  const leftSessions = rows('learning_sessions').map((r) => r.openid).sort();
  check('T5b 乙丙的学习会话完好（只剩 openid-b / openid-c）',
    leftSessions.length === 2 && leftSessions.join(',') === 'openid-b,openid-c', JSON.stringify(leftSessions));
  check('T5c 乙丙的 AI 消息完好（只剩乙那条）',
    rows('ai_messages').length === 1 && rows('ai_messages')[0].conversation_id === 'CVB',
    JSON.stringify(rows('ai_messages').map((m) => m.conversation_id)));
  check('T5d 乙的问卷作答完好', rows('survey_responses').length === 1 && rows('survey_responses')[0].user_id === 'UB');
  check('T5e 只清行为数据时，名册/白名单/账号都不动',
    size('students') === 3 && size('roster') === 3 && size('users') === 3 && size('teacher_notes') === 2,
    JSON.stringify({ students: size('students'), roster: size('roster'), users: size('users'), notes: size('teacher_notes') }));

  // T6 连带删名册、白名单与账号：同样只影响甲
  const t6 = await superCall({
    action: 'data.personPurge', user_ids: ['UA'],
    scope: { behavior: false, roster: true, account: true }, dry_run: false, confirm_count: 1
  });
  check('T6 连带删除条数正确（名册1/白名单1/备注1/账号1）',
    t6.ok === true && t6.removed.students === 1 && t6.removed.roster === 1
    && t6.removed.teacher_notes === 1 && t6.removed.users === 1,
    JSON.stringify(t6.removed));
  check('T6b 乙丙的名册/白名单/账号完好',
    size('students') === 2 && size('roster') === 2 && size('users') === 2
    && rows('students').every((s) => s.student_no !== 'A001')
    && rows('roster').every((r) => r.student_id !== 'A001')
    && rows('users').every((u) => u.student_id !== 'A001'),
    JSON.stringify({ students: rows('students').map((s) => s.student_no), users: rows('users').map((u) => u.student_id) }));
  check('T6c 乙的教师备注未被误删', size('teacher_notes') === 1 && rows('teacher_notes')[0]._id === 'NB');

  // T7 留痕
  check('T7 两次按人清理都写入 maintenance_logs',
    size('maintenance_logs') === 2 && rows('maintenance_logs').every((l) => l.action === 'data.personPurge' && l.operator_name === '超级管理员'),
    JSON.stringify(rows('maintenance_logs').map((l) => ({ a: l.action, op: l.operator_name }))));

  // T8 边界：未勾选 / 超过上限 / 已不存在
  const t8a = await superCall({ action: 'data.personPurge', user_ids: [], scope: behaviorScope });
  check('T8 未勾选任何人被拒（NO_SELECTION）', t8a.ok === false && t8a.code === 'NO_SELECTION', JSON.stringify(t8a.code));
  const tooMany = Array.from({ length: 51 }, (_, i) => 'X' + i);
  const t8b = await superCall({ action: 'data.personPurge', user_ids: tooMany, scope: behaviorScope });
  check('T8b 一次超过 50 人被拒（TOO_MANY_SELECTED）', t8b.ok === false && t8b.code === 'TOO_MANY_SELECTED', JSON.stringify(t8b.code));
  const t8c = await superCall({ action: 'data.personPurge', user_ids: ['UA'], scope: behaviorScope });
  check('T8c 选中的人已不存在时返回 NOT_FOUND', t8c.ok === false && t8c.code === 'NOT_FOUND', JSON.stringify(t8c.code));
  const t8d = await superCall({ action: 'data.personPurge', user_ids: ['UB'], scope: { behavior: false, roster: false, account: false } });
  check('T8d 未选择任何清理范围被拒（NO_SCOPE）', t8d.ok === false && t8d.code === 'NO_SCOPE', JSON.stringify(t8d.code));

  // T9 用户实际遇到的问题：账号已删，但名册/白名单还有残留 → 列表必须能看到
  seed('students', [
    { _id: 'SA_LEFT', student_no: 'A001', name: '甲', school: 'A校', owner_teacher_id: 'TA', owner_teacher_name: '任课教师', created_at: T0 }
  ]);
  seed('roster', [{ _id: 'RA_LEFT', student_id: 'A001', name: '甲', created_at: T0 }]);
  seed('learning_records', [
    { _id: 'LR_LEFT', student_id: 'A001', student_name: '甲', event_type: 'chapter_enter', created_at: T0 }
  ]);
  const t9 = await superCall({ action: 'data.personList' });
  const left = (t9.items || []).find((i) => i.student_no === 'A001') || {};
  check('T9 仅名册/白名单残留也能被列出（带 key 与来源标记）',
    left.key === 'name:A001|甲' && left.has_account === false && left.in_class_roster === true && left.in_roster === true,
    JSON.stringify({ key: left.key, account: left.has_account, roster: left.in_class_roster, white: left.in_roster }));
  check('T9b 残留记录会统计出其按「学号+姓名」写的行为记录',
    left.counts && left.counts.learning_records === 1, JSON.stringify(left.counts));
  check('T9c 无账号但有名册记录 → 阶段为「名册已录入·未注册」（不能误标为残留垃圾）',
    left.stage === '名册已录入·未注册', JSON.stringify(left.stage));

  // T10 清理这个残留（只清名册+白名单+行为记录），乙丙不受影响
  const t10 = await superCall({
    action: 'data.personPurge',
    targets: ['name:A001|甲'],
    scope: { behavior: true, roster: true, account: false },
    dry_run: false, confirm_count: 1
  });
  check('T10 残留记录可被清理（名册1/白名单1/行为记录1）',
    t10.ok === true && t10.removed.students === 1 && t10.removed.roster === 1 && t10.removed.learning_records === 1,
    JSON.stringify(t10.removed));
  check('T10b 乙丙的名册与白名单完好',
    size('students') === 2 && size('roster') === 2
    && rows('students').every((s) => s.student_no !== 'A001') && rows('roster').every((r) => r.student_id !== 'A001'),
    JSON.stringify({ students: rows('students').map((s) => s.student_no), roster: rows('roster').map((r) => r.student_id) }));
  const t10c = await superCall({ action: 'data.personList' });
  check('T10c 清理后列表只剩乙丙（可重新录入甲）',
    (t10c.items || []).length === 2 && !(t10c.items || []).some((i) => i.student_no === 'A001'),
    JSON.stringify((t10c.items || []).map((i) => i.student_no)));

  // T11 历史遗留：只有学号、没有姓名的白名单记录（早期按学号批量导入）
  seed('roster', [
    { _id: 'LG1', student_id: '076005', name: '', source: 'legacy_import', created_at: T0 },
    { _id: 'LG2', student_id: '20260303010120', name: '', source: 'legacy_import', created_at: T0 },
    { _id: 'LG3', student_id: '23210010119', name: '', source: 'legacy_import', created_at: T0 },
    { _id: 'RB', student_id: 'B001', name: '乙', created_at: T0 }
  ]);
  const t11 = await superCall({ action: 'data.personList' });
  const lg = (t11.items || []).find((i) => i.student_no === '076005') || {};
  check('T11 无姓名的旧白名单能被列出并标注',
    lg.key === 'name:076005|' && lg.nameless_roster === true && lg.has_account === false && lg.in_roster === true,
    JSON.stringify({ key: lg.key, nameless: lg.nameless_roster }));

  // T12 逐条清理（选中该残留记录）
  const t12 = await superCall({
    action: 'data.personPurge', targets: ['name:076005|'],
    scope: { behavior: false, roster: true, account: false }, dry_run: false, confirm_count: 1
  });
  check('T12 无姓名的白名单记录可逐条清理',
    t12.ok === true && t12.removed.roster === 1 && !rows('roster').some((r) => r._id === 'LG1'),
    JSON.stringify(t12.removed));
  check('T12b 具名白名单记录（乙）未被误删', rows('roster').some((r) => r._id === 'RB'));

  // T13 一键清理全部无姓名的旧白名单
  const t13pre = await superCall({ action: 'data.legacyRoster', dry_run: true });
  check('T13 旧白名单预览统计正确（剩 2 条，来源 legacy_import）',
    t13pre.ok === true && t13pre.total === 2 && t13pre.by_source.legacy_import === 2,
    JSON.stringify({ total: t13pre.total, by: t13pre.by_source }));
  const t13bad = await superCall({ action: 'data.legacyRoster', dry_run: false, confirm_count: 99 });
  check('T13b confirm_count 不一致被拒', t13bad.ok === false && t13bad.code === 'CONFIRM_MISMATCH', JSON.stringify(t13bad.code));
  const t13 = await superCall({ action: 'data.legacyRoster', dry_run: false, confirm_count: 2 });
  check('T13c 一键清理成功且具名记录（乙、丙）完好',
    t13.ok === true && t13.removed === 2
    && rows('roster').length === 2
    && rows('roster').every((r) => !!String(r.name || '').trim()),
    JSON.stringify({ removed: t13.removed, left: rows('roster').map((r) => r.name) }));
  check('T13d 普通教师不能执行该清理',
    (await teacherCall({ action: 'data.legacyRoster', dry_run: true })).code === 'FORBIDDEN');

  // T14 空账号（已登录但从未注册）：无学号、无姓名
  seed('users', [
    { _id: 'UE1', openid: 'openid-e1', role: 'student', student_id: '', name: '', school: '', created_at: T0 },
    { _id: 'UE2', openid: 'openid-e2', role: 'student', student_id: '  ', name: '  ', school: '', created_at: T0 }
  ]);
  const t14list = await superCall({ action: 'data.personList' });
  const empties = (t14list.items || []).filter((i) => i.has_account && !String(i.name || '').trim() && !String(i.student_no || '').trim());
  check('T14 空账号会出现在列表里（来源=账号，字段全空）', empties.length === 2, JSON.stringify(empties.map((e) => e.key)));
  check('T14a 空账号阶段为「仅登录未注册」并带 openid（触达记录）',
    empties.every((e) => e.stage === '仅登录未注册' && !!e.openid),
    JSON.stringify(empties.map((e) => ({ s: e.stage, o: e.openid }))));

  const t14pre = await superCall({ action: 'data.emptyAccounts', dry_run: true });
  check('T14b 空账号预览统计正确（2 条）', t14pre.ok === true && t14pre.total === 2, JSON.stringify(t14pre.total));
  const t14bad = await superCall({ action: 'data.emptyAccounts', dry_run: false, confirm_count: 1 });
  check('T14c confirm_count 不一致被拒', t14bad.ok === false && t14bad.code === 'CONFIRM_MISMATCH', JSON.stringify(t14bad.code));
  check('T14d 普通教师不能清理空账号',
    (await teacherCall({ action: 'data.emptyAccounts', dry_run: true })).code === 'FORBIDDEN');

  const t14 = await superCall({ action: 'data.emptyAccounts', dry_run: false, confirm_count: 2 });
  check('T14e 空账号清理成功（2 条）且已完成注册的学生账号完好',
    t14.ok === true && t14.removed === 2
    && !rows('users').some((u) => u._id === 'UE1' || u._id === 'UE2')
    && rows('users').length === 2
    && rows('users').every((u) => !!String(u.student_id || '').trim()),
    JSON.stringify({ removed: t14.removed, left: rows('users').map((u) => u.student_id) }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
