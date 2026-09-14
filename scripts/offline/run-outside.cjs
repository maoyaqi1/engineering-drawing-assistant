// 「白名单以外的人」自测：未入册列表的录入教师显示、以及把误收编到超管名下的记录释放回去。
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
// 误收编到超管名下、且没进任何班级的记录（待释放）
seed('students', [
  { _id: 'P1', school: '某大学', class_name: '', name: '乙', student_no: '2027002', owner_teacher_id: 'SUPER', owner_teacher_name: '超级管理员', source: 'teacher', created_at: T0, updated_at: T0 },
  // 正常在班的记录（不应被清理）
  { _id: 'P2', school: '安徽建筑大学', class_name: '机械2401', name: '丙', student_no: '2027003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', class_id: 'C1', created_at: T0, updated_at: T0 }
]);
seed('classes', [{ _id: 'C1', name: '机械2401', status: 'active', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0, updated_at: T0 }]);
seed('roster', [
  { _id: 'R1', student_id: '2027002', name: '乙', source: 'teacher_roster', created_at: T0 },
  { _id: 'R2', student_id: '2027003', name: '丙', source: 'teacher_roster', created_at: T0 }
]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));

(async () => {
  // W1 未入册列表：录入教师显示为空（前端渲染为「无」）
  const list = await superCall({ action: 'student.list', source: 'registered' });
  const item = (list.items || []).find((s) => s.student_no === '2027001');
  check('W1 未入册列表可查到该学生', !!item, JSON.stringify(list.items || []));
  check('W1b 录入教师为空（界面显示「无」）', item && item.owner_teacher_name === '', JSON.stringify(item && item.owner_teacher_name));

  // W2 清理误收编记录：只看"某位教师名下 + 未分班"
  const pre = await superCall({ action: 'student.purge', owner_teacher_id: 'SUPER', no_class: true, dry_run: true });
  check('W2 预览只匹配超管名下未分班的记录', pre.ok === true && pre.matched === 1 && pre.preview[0].student_no === '2027002',
    JSON.stringify({ matched: pre.matched }));
  const all = await superCall({ action: 'student.purge', owner_teacher_id: 'SUPER', dry_run: true });
  check('W2b 不带 no_class 时匹配超管名下全部记录', all.ok === true && all.matched === 1, JSON.stringify({ matched: all.matched }));

  // W3 提交清理：删除记录并撤销其白名单
  const done = await superCall({ action: 'student.purge', owner_teacher_id: 'SUPER', no_class: true, dry_run: false, confirm_count: pre.matched });
  check('W3 释放成功', done.ok === true && done.removed_students === 1, JSON.stringify({ removed: done.removed_students }));
  check('W3b 该学号的白名单被撤销', !Array.from(table('roster').values()).some((r) => r.student_id === '2027002'),
    JSON.stringify(Array.from(table('roster').values()).map((r) => r.student_id)));
  check('W3c 在班学生与其它白名单不受影响', table('students').has('P2')
    && Array.from(table('roster').values()).some((r) => r.student_id === '2027003'),
    JSON.stringify(Array.from(table('students').keys())));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
