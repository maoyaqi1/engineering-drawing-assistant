// 名册删除通道自测（REQ-003 R21/R24，D5）：
//   1. `student.purge`（超管按条件批量物理删除名册）已下线 → ACTION_RETIRED，且不产生任何删除；
//   2. 名册删改归名册归属教师本人：student.delete 只能删自己名下的行；
//   3. 超管对他人名册只读；只有自己名下的（历史孤儿）记录才能删。
// 运行：node scripts/offline/run-purge.cjs
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
  { _id: 'T1', username: 't1', name: '教师一', role: 'teacher', status: 'active' },
  { _id: 'T2', username: 't2', name: '教师二', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'st', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 },
  { _id: 'st2', token: 'tok-t2', teacher_id: 'T2', expires_at: Date.now() + 86400000 }
]);
seed('classes', [
  { _id: 'C1', name: '机械2401', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0, updated_at: T0 }
]);
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_name: '机械2401', class_id: 'C1', name: '甲', student_no: '2025001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'S2', school: '安徽建筑大学', class_name: '机械2401', class_id: 'C1', name: '乙', student_no: '2025002', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'S3', school: '安徽建筑大学', class_name: '', class_id: '', name: '丙', student_no: '2025003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'S9', school: '合肥大学', class_name: '车辆2401', name: '丁', student_no: '2099001', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: T0, updated_at: T0 },
  // 历史孤儿：owner 是超管本人（早期误收编留下的）
  { _id: 'SX', school: '某大学', class_name: '', name: '戊', student_no: '2025900', owner_teacher_id: 'SUPER', owner_teacher_name: '超级管理员', source: 'teacher', created_at: T0, updated_at: T0 }
]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const t1 = (p) => teacherFn.main(Object.assign({ token: 'tok-t1' }, p));

(async () => {
  const size = () => table('students').size;
  const logs = () => table('maintenance_logs').size;
  const before = size();

  // P1/P2 批量物理删除已下线（普通教师与超管都拿到同一个"已下线"结果）
  const byTeacher = await t1({ action: 'student.purge', owner_teacher_id: 'T1', dry_run: true });
  check('P1 教师调用 student.purge → ACTION_RETIRED（不再有批量删除）',
    byTeacher.ok === false && byTeacher.code === 'ACTION_RETIRED', JSON.stringify(byTeacher.code));
  const bySuper = await superCall({ action: 'student.purge', keyword: '甲', dry_run: false, confirm_count: 1 });
  check('P2 超管调用 student.purge → ACTION_RETIRED，且名册条数不变',
    bySuper.ok === false && bySuper.code === 'ACTION_RETIRED' && size() === before,
    JSON.stringify({ code: bySuper.code, size: size(), before }));
  check('P2b 下线调用不写审计噪声（maintenance_logs 无新增）', logs() === 0, logs());

  // P3 教师不能删他人名册
  const cross = await t1({ action: 'student.delete', doc_id: 'S9' });
  check('P3 教师删除别班/他人名册 → 403，且记录仍在',
    cross.ok === false && cross.code === 'FORBIDDEN' && table('students').has('S9'), JSON.stringify(cross.code));

  // P4 教师删除自己名册里的行
  const own = await t1({ action: 'student.delete', doc_id: 'S3' });
  check('P4 教师删除自己录入的学生 → 成功，且只删这一行',
    own.ok === true && !table('students').has('S3') && table('students').has('S1') && size() === before - 1,
    JSON.stringify({ dropped: !table('students').has('S3'), size: size() }));

  // P5 超管对教师名册只读
  const superCross = await superCall({ action: 'student.delete', doc_id: 'S1' });
  check('P5 超管删除教师名册 → 403（R21），记录仍在',
    superCross.ok === false && superCross.code === 'FORBIDDEN' && table('students').has('S1'),
    JSON.stringify(superCross.code));
  const superUpdate = await superCall({ action: 'student.update', doc_id: 'S1', name: '甲改' });
  check('P5b 超管修改教师名册 → 403（R21）',
    superUpdate.ok === false && superUpdate.code === 'FORBIDDEN', JSON.stringify(superUpdate.code));

  // P6 超管只删自己名下的孤儿记录
  const superOwn = await superCall({ action: 'student.delete', doc_id: 'SX' });
  check('P6 超管可删除自己名下（owner=超管）的孤儿名册记录',
    superOwn.ok === true && !table('students').has('SX'), JSON.stringify(superOwn));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
