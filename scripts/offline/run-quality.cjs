// 数据标记 + 回填 + 报表三条线 离线自测（REQ-003 第一阶段）。
// 覆盖：线归属优先级、演示班标记与权限、回填幂等与 manual 保护、驾驶舱三条线与排除计数、
//       教师驾驶舱范围过滤、学习记录 / AI 分析的测试数据排除。
// 运行：node scripts/offline/run-quality.cjs（或 node scripts/run-all.js 统一运行）
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();

// 内部账号名单必须在 require 云函数之前设置（模块加载时读取环境变量）
process.env.INTERNAL_OPENIDS = 'o-internal';

const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function dump(name) { return JSON.stringify(Array.from(table(name).values()).sort((a, b) => String(a._id).localeCompare(String(b._id)))); }
function user(id) { return table('users').get(id); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const nowIso = '2026-09-13T02:00:00.000Z';
seed('teachers', [
  { _id: 'T1', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active', created_at: nowIso },
  { _id: 'T2', username: 't2', name: '教师二', role: 'teacher', status: 'active', created_at: nowIso },
  { _id: 'T3', username: 't3', name: '教师三', role: 'teacher', status: 'active', created_at: nowIso }
]);
seed('teacher_sessions', [
  { _id: 's1', token: 'tok-super', teacher_id: 'T1', expires_at: Date.now() + 86400000 },
  { _id: 's2', token: 'tok-t2', teacher_id: 'T2', expires_at: Date.now() + 86400000 },
  { _id: 's3', token: 'tok-t3', teacher_id: 'T3', expires_at: Date.now() + 86400000 }
]);
seed('classes', [
  { _id: 'C1', name: '26机械①②', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T2', owner_teacher_name: '教师二', created_at: nowIso },
  { _id: 'C2', name: '教师组', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T2', owner_teacher_name: '教师二', created_at: nowIso },
  { _id: 'C3', name: '26机械③④', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T3', owner_teacher_name: '教师三', created_at: nowIso }
]);
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_id: 'C1', class_name: '26机械①②', name: '张三', student_no: '26210010101', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: nowIso },
  { _id: 'S2', school: '安徽建筑大学', class_id: 'C2', class_name: '教师组', name: '毛亚岐', student_no: '500450', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: nowIso },
  { _id: 'S3', school: '安徽建筑大学', class_id: '', class_name: '', name: '李四', student_no: '999999', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: nowIso },
  { _id: 'S4', school: '安徽建筑大学', class_id: 'C3', class_name: '26机械③④', name: '赵六', student_no: '26210010202', owner_teacher_id: 'T3', owner_teacher_name: '教师三', source: 'teacher', created_at: nowIso }
  ,
  // 名册里写了班级名、但没有关联班级实体（class_id 为空）——应计入「未分班」，并保留原文本作提示
  { _id: 'S5', school: '安徽建筑大学', class_id: '', class_name: '教师组', name: '钱七', student_no: '999998', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: nowIso }
]);
seed('users', [
  { _id: 'U1', openid: 'o-stu', role: 'student', school: '安徽建筑大学', name: '张三', student_id: '26210010101', profile_completed: true, created_at: '2026-09-10T01:00:00.000Z' },
  { _id: 'U2', openid: 'o-internal', role: 'student', school: '安徽建筑大学', name: '毛亚岐', student_id: '500450', profile_completed: true, created_at: '2026-09-10T01:10:00.000Z' },
  { _id: 'U3', openid: 'o-demo', role: 'student', school: '安徽建筑大学', name: '毛亚岐', student_id: '500450', profile_completed: true, created_at: '2026-09-10T01:20:00.000Z' },
  { _id: 'U4', openid: 'o-test', role: 'student', name: 'csj', student_id: '86804388', profile_completed: true, created_at: '2026-09-03T01:00:00.000Z' },
  { _id: 'U5', openid: 'o-guest', role: 'student', school: '某校', name: '王五', student_id: '123456', profile_completed: true, created_at: '2026-09-10T02:00:00.000Z' },
  { _id: 'U6', openid: 'o-old', role: 'student', created_at: '2026-09-01T02:00:00.000Z' },
  { _id: 'U7', openid: 'o-stu3', role: 'student', school: '安徽建筑大学', name: '赵六', student_id: '26210010202', profile_completed: true, created_at: '2026-09-11T02:00:00.000Z' }
]);

// 近 7 天每个账号一条会话 + 一条事件；两个"在册学情"账号各一条 AI 提问
const recent = '2026-09-13T01:00:00.000Z';
const ownerOf = { U1: 'o-stu', U2: 'o-internal', U3: 'o-demo', U4: 'o-test', U5: 'o-guest', U6: 'o-old', U7: 'o-stu3' };
seed('learning_sessions', Object.keys(ownerOf).map((uid, i) => ({
  _id: 'L' + (i + 1), user_id: uid, openid: ownerOf[uid], module: 'point', duration: 120, interaction_count: 5,
  is_valid: true, created_at: recent, end_time: recent
})));
seed('learning_records', Object.keys(ownerOf).map((uid, i) => ({
  _id: 'E' + (i + 1), user_id: uid, openid: ownerOf[uid], event_type: 'chapter_enter', chapter_id: 'point',
  chapter_name: '点的投影', student_id: '', student_name: '', created_at: recent
})));
seed('ai_conversations', Object.keys(ownerOf).map((uid, i) => ({
  _id: 'A' + (i + 1), openid: ownerOf[uid], title: '提问' + (i + 1), knowledge_point: 'G01', created_at: recent
})));
seed('ai_messages', Object.keys(ownerOf).flatMap((uid, i) => ([
  { _id: 'M' + (i + 1) + 'u', conversation_id: 'A' + (i + 1), role: 'user', content: '问题' + (i + 1), knowledge_point: 'G01', created_at: recent },
  { _id: 'M' + (i + 1) + 'a', conversation_id: 'A' + (i + 1), role: 'assistant', content: '回答' + (i + 1), created_at: recent }
])));

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const t2Call = (p) => teacherFn.main(Object.assign({ token: 'tok-t2' }, p));
const t3Call = (p) => teacherFn.main(Object.assign({ token: 'tok-t3' }, p));

(async () => {
  // ---------- 1. 演示班标记与权限 ----------
  const teacherDemo = await t2Call({ action: 'class.update', class_id: 'C2', is_demo: true });
  check('1a 普通教师标记演示班被拒（403）', teacherDemo.ok === false && teacherDemo.code === 'FORBIDDEN', JSON.stringify(teacherDemo.code));
  const superDemo = await superCall({ action: 'class.update', class_id: 'C2', is_demo: true });
  check('1b 超管可标记演示班', superDemo.ok === true && superDemo.class.is_demo === true, JSON.stringify(superDemo.class && superDemo.class.is_demo));
  const t2List = await t2Call({ action: 'class.list' });
  const demoRow = (t2List.items || []).find((c) => c.id === 'C2');
  check('1c class.list 暴露 is_demo', !!demoRow && demoRow.is_demo === true, JSON.stringify(demoRow && demoRow.is_demo));
  const undoDemo = await superCall({ action: 'class.update', class_id: 'C2', is_demo: false });
  const redoDemo = await superCall({ action: 'class.update', class_id: 'C2', is_demo: true });
  check('1d is_demo 可取消与恢复', undoDemo.ok === true && undoDemo.class.is_demo === false && redoDemo.ok === true, JSON.stringify(undoDemo.class && undoDemo.class.is_demo));

  // ---------- 2. 线归属与三条线 ----------
  const dashAll = await superCall({ action: 'dashboard' });
  check('2a 超管 scope=all', dashAll.scope === 'all', dashAll.scope);
  // 注意：此时尚未回填，U4（86804388 csj）还没有 data_quality，因此落 guest 线
  check('2b 线归属计数正确（internal1 / demo1 / test0 / guest3 / student2）',
    JSON.stringify(dashAll.line_detail) === JSON.stringify({ internal: 1, demo: 1, test: 0, guest: 3, student: 2 }),
    JSON.stringify(dashAll.line_detail));
  check('2c 三条线求和 = 总用户数（7）',
    dashAll.lines.total === 7 && dashAll.lines.student + dashAll.lines.guest + dashAll.lines.test === 7,
    JSON.stringify(dashAll.lines));
  check('2d 测试线 = internal + demo + test（回填前为 2）',
    dashAll.lines.test === 2, JSON.stringify(dashAll.lines.test));

  // ---------- 3. 驾驶舱排除与范围 ----------
  check('3a 近 7 天点线面只统计在册学情（2 条，排除 5 条，其中测试/演示 2 条、游客 3 条）',
    dashAll.plp_week === 2 && dashAll.excluded.sessions === 5
    && dashAll.excluded.sessions_test === 2 && dashAll.excluded.sessions_guest === 3,
    JSON.stringify({ plp_week: dashAll.plp_week, excluded: dashAll.excluded }));
  check('3b AI 提问只统计在册学情（2 条，排除 5 条，其中测试/演示 2 条、游客 3 条）',
    dashAll.ai_week === 2 && dashAll.excluded.ai === 5
    && dashAll.excluded.ai_test === 2 && dashAll.excluded.ai_guest === 3,
    JSON.stringify({ ai_week: dashAll.ai_week, excluded_ai: dashAll.excluded.ai }));
  check('3c 演示班名册被排除（5 条名册 → 4；教师组 1 人已排除）',
    dashAll.roster_total === 4 && dashAll.excluded.demo_roster === 1,
    JSON.stringify({ roster_total: dashAll.roster_total, demo_roster: dashAll.excluded.demo_roster }));
  check('3c2 名册三个口径自洽：roster_total = 已注册 + 未注册',
    dashAll.roster_total === dashAll.registered_count + dashAll.unregistered_count,
    JSON.stringify({ roster_total: dashAll.roster_total, registered: dashAll.registered_count, unregistered: dashAll.unregistered_count }));
  check('3d 班级概况不含演示班',
    (dashAll.classes || []).every((c) => c.class_name !== '教师组') && (dashAll.classes || []).length === 3,
    JSON.stringify((dashAll.classes || []).map((c) => c.class_name)));
  check('3e 归属只认 class_id：未分班的合并为一行（2 条），并保留名册原文本作提示',
    (dashAll.classes || []).some((c) => c.class_name === '未分班' && c.total === 2
      && (c.class_legacy_names || []).indexOf('教师组') >= 0),
    JSON.stringify(dashAll.classes));
  check('3e2 class_name 不再产生独立班级行（不会出现第二个「教师组」）',
    (dashAll.classes || []).filter((c) => c.class_name === '教师组').length === 0,
    JSON.stringify((dashAll.classes || []).map((c) => c.class_name)));
  check('3f 排除提示进入 alerts',
    (dashAll.alerts || []).some((a) => a.text.indexOf('已排除非学情数据') >= 0),
    JSON.stringify((dashAll.alerts || []).map((a) => a.text)));

  const dashT2 = await t2Call({ action: 'dashboard' });
  check('3g 教师 scope=me', dashT2.scope === 'me', dashT2.scope);
  check('3h 教师只看到自己名册范围的活动（1 条，另一位教师的 1 条不可见）',
    dashT2.plp_week === 1, JSON.stringify({ t2: dashT2.plp_week, super: dashAll.plp_week }));
  check('3i 教师名册统计只含自己名下且排除演示班（3 条：1 在班 + 2 未分班）',
    dashT2.roster_total === 3, JSON.stringify(dashT2.roster_total));
  const dashT3 = await t3Call({ action: 'dashboard' });
  check('3j 另一位教师只看到自己的 1 条', dashT3.plp_week === 1, JSON.stringify(dashT3.plp_week));

  // ---------- 4. 回填 ----------
  const dry = await superCall({ action: 'data.backfillQuality', dry_run: true });
  check('4a 回填预览：internal 跳过 1、待写 6（test1 / unknown1 / production4）',
    dry.ok === true && dry.skipped.internal === 1 && dry.pending === 6
    && dry.categories.test === 1 && dry.categories.unknown === 1 && dry.categories.production === 4,
    JSON.stringify({ skipped: dry.skipped, pending: dry.pending, categories: dry.categories }));
  const badConfirm = await superCall({ action: 'data.backfillQuality', dry_run: false, confirm_count: 1 });
  check('4b confirm_count 不符被拒', badConfirm.ok === false && badConfirm.code === 'CONFIRM_MISMATCH', JSON.stringify(badConfirm.code));
  const commit = await superCall({ action: 'data.backfillQuality', dry_run: false, confirm_count: dry.pending });
  check('4c 回填执行成功（6 条）', commit.ok === true && commit.updated === 6, JSON.stringify(commit.updated));
  check('4d 内部账号不写 data_quality', !user('U2').data_quality, JSON.stringify(user('U2').data_quality));
  check('4e 显式测试账号写 test', user('U4').data_quality === 'test' && user('U4').data_quality_source === 'auto', JSON.stringify(user('U4')));
  check('4f T0 之前注册的账号写 unknown', user('U6').data_quality === 'unknown', JSON.stringify(user('U6').data_quality));
  check('4g T0 之后的普通账号写 production', user('U1').data_quality === 'production', JSON.stringify(user('U1').data_quality));
  const dry2 = await superCall({ action: 'data.backfillQuality', dry_run: true });
  check('4h 回填幂等（再跑待写 0）', dry2.pending === 0 && dry2.skipped.unchanged === 6, JSON.stringify({ pending: dry2.pending, skipped: dry2.skipped }));
  const logs = Array.from(table('maintenance_logs').values());
  check('4i 回填写入审计留痕', logs.some((l) => l.action === 'data.backfillQuality' && l.updated === 6), JSON.stringify(logs.map((l) => l.action)));
  check('4j 非超管不能回填', (await t2Call({ action: 'data.backfillQuality' })).code === 'FORBIDDEN');

  // ---------- 5. 人工标记 ----------
  const badQuality = await superCall({ action: 'data.markQuality', user_ids: ['U5'], quality: 'prod' });
  check('5a 非法标记被拒', badQuality.ok === false && badQuality.code === 'BAD_QUALITY', JSON.stringify(badQuality.code));
  check('5b 非超管不能人工标记', (await t2Call({ action: 'data.markQuality', user_ids: ['U5'], quality: 'test' })).code === 'FORBIDDEN');
  const mark = await superCall({ action: 'data.markQuality', user_ids: ['U5'], quality: 'test' });
  check('5c 人工标记成功并写 manual', mark.ok === true && user('U5').data_quality === 'test' && user('U5').data_quality_source === 'manual',
    JSON.stringify({ q: user('U5').data_quality, s: user('U5').data_quality_source }));
  const dry3 = await superCall({ action: 'data.backfillQuality', dry_run: true });
  check('5d 回填不覆盖人工标记（U5 仍为 test，且被计入 manual 跳过）',
    user('U5').data_quality === 'test' && dry3.skipped.manual === 1, JSON.stringify({ dry3: dry3.skipped, u5: user('U5').data_quality }));
  const dashAfterMark = await superCall({ action: 'dashboard' });
  check('5e 人工标记后线归属变化（游客 1、测试 4）',
    dashAfterMark.line_detail.guest === 1 && dashAfterMark.line_detail.test === 2,
    JSON.stringify(dashAfterMark.line_detail));
  check('5f 人工标记写入审计', Array.from(table('maintenance_logs').values()).some((l) => l.action === 'data.markQuality'), '');

  // ---------- 6. 学习记录 / AI 分析默认排除 ----------
  const learning = await superCall({ action: 'learning.list' });
  // 注意：此刻 U5 已被人工标记为 test，因此排除明细为 测试 4 条（internal1 + demo1 + test2）、游客 1 条
  check('6a 学习记录只含在册学情（2 条），并分别回报测试与游客的排除数',
    learning.total === 2 && learning.excluded_test === 4 && learning.excluded_guest === 1,
    JSON.stringify({ total: learning.total, test: learning.excluded_test, guest: learning.excluded_guest }));
  check('6b 学习记录不含内部/测试账号的事件',
    (learning.items || []).every((r) => r.student_no === '26210010101' || r.student_no === '26210010202'),
    JSON.stringify((learning.items || []).map((r) => r.student_no)));
  const ai = await superCall({ action: 'ai.questions' });
  check('6c AI 分析只含在册学情（2 条），并分别回报测试与游客的排除数',
    ai.summary.total === 2 && ai.excluded_test === 4 && ai.excluded_guest === 1,
    JSON.stringify({ total: ai.summary.total, test: ai.excluded_test, guest: ai.excluded_guest }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
