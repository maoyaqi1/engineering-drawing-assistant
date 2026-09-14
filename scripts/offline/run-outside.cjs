// 「未入册用户」自测（REQ-003 D4/D7/R21/D23）：
//   1. 未入册列表包含「已注册未入册」与「未注册游客」两类，可筛选；
//   2. 误收编到超管名下的孤儿记录，由超管本人按 owner 删除（student.purge 已下线）；
//   3. 超管不得删除教师名下的名册（R21）。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const T0 = '2026-09-11T09:30:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'T1', username: 't1', name: '教师一', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'st', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 }
]);
// 自主注册、但不在任何名册里的学生（白名单以外）
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2027001', name: '甲', school: '某大学', created_at: T0, last_login_at: T0 }
]);
// 误收编到超管名下、且没进任何班级的孤儿记录（待释放）
seed('students', [
  { _id: 'P1', school: '某大学', class_name: '', name: '乙', student_no: '2027002', owner_teacher_id: 'SUPER', owner_teacher_name: '超级管理员', source: 'teacher', created_at: T0, updated_at: T0 },
  // 正常在班的记录（不应被清理）
  { _id: 'P2', school: '安徽建筑大学', class_name: '机械2401', name: '丙', student_no: '2027003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', class_id: 'C1', created_at: T0, updated_at: T0 }
]);
seed('classes', [{ _id: 'C1', name: '机械2401', status: 'active', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0, updated_at: T0 }]);
// 未注册游客（只登录过，没填资料）——D7 要求也出现在未入册列表里
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2027001', name: '甲', school: '某大学', created_at: T0, last_login_at: T0 },
  { _id: 'U2', openid: 'o2', role: 'student', student_id: '', name: '', school: '', created_at: T0, last_login_at: T0 }
]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));

(async () => {
  // W1 未入册列表：含已注册未入册 + 未注册游客
  const list = await superCall({ action: 'student.list', source: 'registered' });
  const item = (list.items || []).find((s) => s.student_no === '2027001');
  check('W1 未入册列表可查到该学生', !!item, JSON.stringify(list.items || []));
  check('W1b 录入教师为空（界面显示「无」）', item && item.owner_teacher_name === '', JSON.stringify(item && item.owner_teacher_name));
  check('W1c 未注册游客也在列表里（D7），summary 分开计数',
    (list.items || []).some((s) => s.id === 'U2' && s.registered === false)
    && list.summary.registered === 1 && list.summary.unregistered === 1,
    JSON.stringify(list.summary));
  const onlyUnreg = await superCall({ action: 'student.list', source: 'registered', profile: '未注册' });
  check('W1d profile=未注册 可筛选出未注册游客',
    onlyUnreg.ok === true && onlyUnreg.items.length === 1 && onlyUnreg.items[0].id === 'U2',
    JSON.stringify((onlyUnreg.items || []).map((s) => s.id)));

  // W2 释放孤儿记录：student.purge 已下线 → 只能由名册归属人行级删除
  const retired = await superCall({ action: 'student.purge', owner_teacher_id: 'SUPER', no_class: true, dry_run: true });
  check('W2 student.purge 已下线（ACTION_RETIRED，不再有超管批量物理删名册）',
    retired.ok === false && retired.code === 'ACTION_RETIRED', JSON.stringify(retired.code));
  const forbidden = await superCall({ action: 'student.delete', doc_id: 'P2' });
  check('W2b 超管删除教师名下的名册 → 403（R21）',
    forbidden.ok === false && forbidden.code === 'FORBIDDEN', JSON.stringify(forbidden.code));

  // W3 超管释放自己名下（owner=SUPER）的孤儿记录
  const done = await superCall({ action: 'student.delete', doc_id: 'P1' });
  check('W3 超管可删除自己名下的孤儿名册记录', done.ok === true, JSON.stringify(done));
  check('W3b 孤儿记录已删除', !table('students').has('P1'), JSON.stringify(Array.from(table('students').keys())));
  check('W3c 教师名下的在班学生不受影响', table('students').has('P2')
    && table('students').get('P2').owner_teacher_id === 'T1',
    JSON.stringify(Array.from(table('students').keys())));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
