// 学号/姓名格式校验 + 按勾选(doc_ids)批量删除 的离线自测。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function dump(name) { return JSON.stringify(Array.from(table(name).values()).sort((a, b) => String(a._id).localeCompare(String(b._id)))); }

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
  { _id: 'st', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 }
]);
seed('students', [
  { _id: 'A1', school: '安徽建筑大学', class_name: '机械2401', name: '甲', student_no: '2025001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'A2', school: '安徽建筑大学', class_name: '机械2401', name: '乙', student_no: '2025002', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'A3', school: '安徽建筑大学', class_name: '机械2401', name: '丙', student_no: '2025003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'B1', school: '合肥大学', class_name: '车辆2401', name: '丁', student_no: '2099001', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: T0, updated_at: T0 }
]);
seed('roster', [
  { _id: 'R1', student_id: '2025001', source: 'teacher_roster', created_at: T0 },
  { _id: 'R2', student_id: '2025002', source: 'teacher_roster', created_at: T0 },
  { _id: 'R3', student_id: '2099001', created_at: T0 }
]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const teacherCall = (p) => teacherFn.main(Object.assign({ token: 'tok-t1' }, p));

(async () => {
  // ---- 格式校验 ----
  const v1 = await teacherCall({ action: 'student.create', school: '安徽建筑大学', class_name: '机械2401', name: '张三', student_no: '叶翰廷' });
  check('V1 学号填中文被拒', v1.ok === false && v1.code === 'STUDENT_NO_NOT_NUMERIC', v1.code + '/' + (v1.msg || ''));

  const v2 = await teacherCall({ action: 'student.create', school: '安徽建筑大学', class_name: '机械2401', name: '26210010106', student_no: '2025100' });
  check('V2 姓名填数字被拒', v2.ok === false && v2.code === 'NAME_HAS_DIGIT', v2.code + '/' + (v2.msg || ''));

  const v3 = await teacherCall({ action: 'student.create', school: '安徽建筑大学', class_name: '机械2401', name: '欧阳婷', student_no: '0301010' });
  check('V3 前导零学号 + 中文姓名可通过', v3.ok === true && v3.student.student_no === '0301010', JSON.stringify(v3.code || v3.student));

  const v4 = await teacherCall({ action: 'student.create', school: '安徽建筑大学', name: '李四', student_no: '123' });
  check('V4 学号位数过短被拒', v4.ok === false && v4.code === 'STUDENT_NO_LENGTH', v4.code);

  const v5 = await teacherCall({ action: 'student.update', doc_id: 'A1', name: '2025999' });
  check('V5 编辑时改成数字姓名被拒', v5.ok === false && v5.code === 'NAME_HAS_DIGIT', v5.code);
  check('V5b 被拒后未写入', table('students').get('A1').name === '甲', table('students').get('A1').name);

  const v6 = await teacherCall({ action: 'student.update', doc_id: 'A1', student_no: 'not-a-number' });
  check('V6 编辑时改成非数字学号被拒', v6.ok === false && v6.code === 'STUDENT_NO_NOT_NUMERIC', v6.code);

  // 批量导入：第 1 行正常，第 2/3 行把姓名与学号填反
  const rows = [
    { school: '安徽建筑大学', class_name: '机械2401', name: '戊', student_no: '2026001' },
    { school: '安徽建筑大学', class_name: '机械2401', name: '26210010106', student_no: '叶翰廷' },
    { school: '安徽建筑大学', class_name: '机械2401', name: '侯振伟', student_no: '2026002' }
  ];
  const v7 = await teacherCall({ action: 'student.import', mode: 'validate', rows });
  check('V7 导入校验拦截反填行', v7.ok === true && v7.summary.valid === 2 && v7.errors.length === 1,
    JSON.stringify({ valid: v7.summary.valid, errors: v7.errors.length, reason: (v7.errors[0] || {}).reason }));
  check('V7b 错误行号正确（第 3 行）', (v7.errors[0] || {}).line === 3, (v7.errors[0] || {}).line);

  const beforeImport = table('students').size;
  const v8 = await teacherCall({ action: 'student.import', mode: 'commit', rows });
  check('V8 导入提交只写入合法行', v8.ok === true && v8.added === 2 && table('students').size === beforeImport + 2,
    JSON.stringify({ added: v8.added, size: table('students').size }));

  // ---- 名册删除：批量通道已下线，只保留归属教师行级删除（REQ-003 R21/R24）----
  const rosterBefore = table('roster').size;
  const studentsBefore = table('students').size;
  const p1 = await superCall({ action: 'student.purge', doc_ids: ['A1', 'A2', 'A3'], dry_run: false });
  check('P1 student.purge（按勾选批量删除）已下线 → ACTION_RETIRED，名册条数不变',
    p1.ok === false && p1.code === 'ACTION_RETIRED' && table('students').size === studentsBefore,
    JSON.stringify({ code: p1.code, size: table('students').size }));

  const p2 = await teacherCall({ action: 'student.delete', doc_id: 'A1' });
  check('P2 教师删除自己录入的学生 → 成功', p2.ok === true && !table('students').has('A1'), JSON.stringify(p2));
  const p3 = await teacherCall({ action: 'student.delete', doc_id: 'A2' });
  check('P3 再次删除自己录入的学生 → 成功（行级删除不受批量下线影响）',
    p3.ok === true && !table('students').has('A2'), JSON.stringify(p3));

  const p4 = await teacherCall({ action: 'student.delete', doc_id: 'B1' });
  check('P4 教师删除他人名册 → 403，记录仍在',
    p4.ok === false && p4.code === 'FORBIDDEN' && table('students').has('B1'), p4.code);

  const p5 = await superCall({ action: 'student.delete', doc_id: 'A3' });
  check('P5 超管删除教师名册 → 403（R21），记录仍在',
    p5.ok === false && p5.code === 'FORBIDDEN' && table('students').has('A3'), p5.code);

  const p6 = await teacherCall({ action: 'student.delete', doc_id: 'NOT_EXIST' });
  check('P6 删除不存在的记录 → NOT_FOUND', p6.ok === false && p6.code === 'NOT_FOUND', p6.code);
  check('P7 roster 残留不被任何删除通道触碰（D16：集合另行下线）',
    table('roster').size === rosterBefore, table('roster').size);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
