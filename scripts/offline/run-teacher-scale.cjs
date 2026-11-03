// 教师端超过 1000 条记录时的完整性自测。
//
// 覆盖：
//   1. 注册用户与名册均超过 1000 条时不漏人、不重复；
//   2. 普通教师查询在数据库条件中限定本人名册；
//   3. 班级详情和驾驶舱的注册匹配口径一致；
//   4. 未入册用户列表不会在 1000 条处静默截断。
const {
  repoPath,
  seed,
  createReporter
} = require('./test-context.cjs');
const { check, printSummary } = createReporter();

const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));
const teacherCall = (token, payload) => teacherFn.main(Object.assign({ token }, payload));

const nowIso = new Date().toISOString();
seed('teachers', [
  {
    _id: 'T1', username: 't1', name: '普通教师', role: 'teacher', status: 'active',
    created_at: nowIso
  },
  {
    _id: 'TS', username: 'super', name: '超级管理员', role: 'super_admin', status: 'active',
    created_at: nowIso
  }
]);
seed('teacher_sessions', [
  { _id: 'sess-t1', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 },
  { _id: 'sess-super', token: 'tok-super', teacher_id: 'TS', expires_at: Date.now() + 86400000 }
]);
seed('classes', [{
  _id: 'C1', name: '规模测试班', school: '安徽建筑大学', status: 'active',
  owner_teacher_id: 'T1', owner_teacher_name: '普通教师', created_at: nowIso, updated_at: nowIso
}]);

const roster = [];
const users = [];
for (let i = 1; i <= 1001; i += 1) {
  const suffix = String(i).padStart(4, '0');
  roster.push({
    _id: 'S' + suffix,
    student_no: '93' + suffix,
    name: '学生' + suffix,
    school: '安徽建筑大学',
    class_id: 'C1',
    class_name: '规模测试班',
    owner_teacher_id: 'T1',
    owner_teacher_name: '普通教师',
    created_at: nowIso
  });
  users.push({
    _id: 'U' + suffix,
    openid: 'openid-' + suffix,
    role: 'student',
    status: 'active',
    profile_completed: true,
    student_id: '93' + suffix,
    name: '学生' + suffix,
    school: '安徽建筑大学',
    created_at: nowIso,
    last_login_at: nowIso
  });
}
// 额外 1001 个已注册但不在名册中的用户，用于验证未入册列表也完整。
for (let i = 1; i <= 1001; i += 1) {
  const suffix = String(i).padStart(4, '0');
  users.push({
    _id: 'G' + suffix,
    openid: 'guest-' + suffix,
    role: 'student',
    status: 'active',
    profile_completed: true,
    student_id: '94' + suffix,
    name: '游客' + suffix,
    school: '另一所学校',
    created_at: nowIso,
    last_login_at: nowIso
  });
}
seed('students', roster);
seed('users', users);

(async () => {
  const normalList = await teacherCall('tok-t1', { action: 'student.list' });
  const normalIds = new Set((normalList.items || []).map((item) => item.id));
  check('D1 普通教师名册列表超过 1000 条时不截断',
    normalList.ok === true && normalList.total === 1001 && normalList.items.length === 1001 && normalIds.size === 1001,
    JSON.stringify({ ok: normalList.ok, total: normalList.total, items: (normalList.items || []).length }));
  check('D2 第 1001 条学生仍能与注册账号匹配',
    normalList.items.some((item) => item.student_no === '931001' && item.registered === true),
    JSON.stringify(normalList.items.find((item) => item.student_no === '931001')));

  const detail = await teacherCall('tok-t1', { action: 'class.detail', class_id: 'C1' });
  check('D3 班级详情不截断且注册匹配完整',
    detail.ok === true && detail.summary.member_count === 1001 && detail.summary.registered_count === 1001,
    JSON.stringify(detail.summary));

  const dash = await teacherCall('tok-t1', { action: 'dashboard' });
  check('D4 驾驶舱名册与注册人数口径一致',
    dash.ok === true && dash.roster_total === 1001 && dash.registered_count === 1001,
    JSON.stringify({ roster: dash.roster_total, registered: dash.registered_count }));

  const unrostered = await teacherCall('tok-super', { action: 'student.list', source: 'registered' });
  const guestIds = new Set((unrostered.items || []).map((item) => item.openid));
  check('D5 未入册用户超过 1000 条时不截断、不重复',
    unrostered.ok === true && unrostered.items.length === 1001 && guestIds.size === 1001
      && unrostered.summary.registered === 1001,
    JSON.stringify({ items: (unrostered.items || []).length, unique: guestIds.size, summary: unrostered.summary }));

  const superList = await teacherCall('tok-super', { action: 'student.list' });
  check('D6 超管名册列表同样完整',
    superList.ok === true && superList.items.length === 1001,
    JSON.stringify({ ok: superList.ok, items: (superList.items || []).length }));

  process.exitCode = printSummary({ separator: false, compactDetail: true }) ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
