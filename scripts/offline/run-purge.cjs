// student.purge（批量清理）离线自测：权限、筛选、预览、确认、白名单同步、边界。
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

const T = '2026-09-11T09:30:0';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'T1', username: 't1', name: '教师一', role: 'teacher', status: 'active' },
  { _id: 'T2', username: 't2', name: '教师二', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'st', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 }
]);
// 导入批次：S1–S5（教师一 / 安徽建筑大学 / 机械2401）
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_name: '机械2401', name: '甲', student_no: '2025001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '0.000Z', updated_at: T + '0.000Z' },
  { _id: 'S2', school: '安徽建筑大学', class_name: '机械2401', name: '乙', student_no: '2025002', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '1.000Z', updated_at: T + '1.000Z' },
  { _id: 'S3', school: '安徽建筑大学', class_name: '机械2401', name: '丙', student_no: '2025003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '2.000Z', updated_at: T + '2.000Z' },
  { _id: 'S4', school: '安徽建筑大学', class_name: '机械2401', name: '丁', student_no: '2025004', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '3.000Z', updated_at: T + '3.000Z' },
  { _id: 'S5', school: '安徽建筑大学', class_name: '机械2401', name: '戊', student_no: '2025005', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '4.000Z', updated_at: T + '4.000Z' },
  // 早先的合法记录（同教师、同学校、不同班级）
  { _id: 'S6', school: '安徽建筑大学', class_name: '机械2400', name: '己', student_no: '2024001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z' },
  // 其他教师的记录
  { _id: 'S7', school: '合肥大学', class_name: '车辆2401', name: '庚', student_no: '2026001', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: T + '5.000Z', updated_at: T + '5.000Z' }
]);
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2025001', name: '甲', created_at: '2026-09-11T09:40:00.000Z', last_login_at: '2026-09-11T09:40:00.000Z' }
]);
seed('roster', [
  { _id: 'R1', student_id: '2025001', source: 'teacher_roster', created_at: T + '0.000Z' },
  { _id: 'R2', student_id: '2025002', source: 'teacher_roster', created_at: T + '1.000Z' },
  { _id: 'R3', student_id: '2099001', created_at: '2026-09-01T10:00:00.000Z' }
]);
seed('teacher_notes', [
  { _id: 'N1', student_doc_id: 'S1', teacher_id: 'T1', teacher_name: '教师一', content: '备注', created_at: T + '0.000Z' },
  { _id: 'N2', student_doc_id: 'S6', teacher_id: 'T1', teacher_name: '教师一', content: '保留', created_at: '2026-09-01T10:00:00.000Z' }
]);
seed('learning_records', [
  { _id: 'L1', openid: 'o1', user_id: 'U1', event_type: 'login', created_at: '2026-09-11T09:41:00.000Z' }
]);

const FILTER = { school: '安徽建筑大学', class_name: '机械2401', created_from: '2026-09-11T09:30:00.000Z', created_to: '2026-09-11T09:31:00.000Z' };
const usersBefore = dump('users');
const learningBefore = dump('learning_records');

async function call(payload) { return await teacherFn.main(Object.assign({ token: 'tok-super' }, payload)); }

(async () => {
  // P1 普通教师不可用
  const p1 = await teacherFn.main(Object.assign({ action: 'student.purge', token: 'tok-t1' }, FILTER));
  check('P1 普通教师调用被拒（403）', p1.ok === false && p1.code === 'FORBIDDEN', p1.code);

  // P2 无筛选条件
  const p2 = await call({ action: 'student.purge' });
  check('P2 无筛选条件被拒（NO_FILTER）', p2.ok === false && p2.code === 'NO_FILTER', p2.code);

  // P3 dry_run 预览（首次不传 dry_run 即为预览）
  const p3 = await call(Object.assign({ action: 'student.purge' }, FILTER));
  check('P3 默认即预览（dry_run）', p3.ok === true && p3.mode === 'dry_run' && p3.matched === 5 && p3.preview.length === 5, JSON.stringify({ mode: p3.mode, matched: p3.matched }));
  check('P4 预览不删除数据', table('students').size === 7 && table('roster').size === 3, table('students').size + '/' + table('roster').size);
  check('P5 预览返回提示与剩余数', typeof p3.hint === 'string' && p3.remaining_after_batch === 0 && p3.will_revoke_roster === true, JSON.stringify({ hint: p3.hint, remaining: p3.remaining_after_batch }));

  // P6 registered 过滤
  const p6a = await call(Object.assign({ action: 'student.purge', registered: 'yes' }, FILTER));
  const p6b = await call({ action: 'student.purge', registered: 'no' });
  check('P6 registered=yes 只匹配已注册', p6a.matched === 1, p6a.matched);
  check('P6b registered=no 匹配未注册全部', p6b.matched === 6, p6b.matched);

  // P7 confirm_count 不匹配
  const p7 = await call(Object.assign({ action: 'student.purge', dry_run: false, confirm_count: 4 }, FILTER));
  check('P7 confirm_count 不匹配被拒', p7.ok === false && p7.code === 'CONFIRM_MISMATCH', p7.code);
  check('P7b 拒绝后未删除', table('students').size === 7, table('students').size);

  // P8 limit 生效 + remaining
  const p8 = await call(Object.assign({ action: 'student.purge', dry_run: false, confirm_count: 5, limit: 2 }, FILTER));
  check('P8 按 limit 分批删除', p8.ok === true && p8.removed_students === 2 && p8.remaining === 3, JSON.stringify({ removed: p8.removed_students, remaining: p8.remaining }));
  check('P8b 白名单同步撤销', p8.revoked_roster === 2 && table('roster').size === 1, 'revoked=' + p8.revoked_roster + ' left=' + table('roster').size);
  check('P8c 其他教师的记录不受影响', table('students').has('S6') && table('students').has('S7'), Array.from(table('students').keys()).join(','));

  // P9 再次预览：匹配数减少到剩余 3
  const p9 = await call(Object.assign({ action: 'student.purge' }, FILTER));
  check('P9 二次预览只剩剩余记录', p9.matched === 3, p9.matched);

  // P10 处理剩余
  const p10 = await call(Object.assign({ action: 'student.purge', dry_run: false, confirm_count: 3 }, FILTER));
  check('P10 剩余记录清理完成', p10.removed_students === 3 && p10.remaining === 0, JSON.stringify({ removed: p10.removed_students, remaining: p10.remaining }));
  check('P10b 批次记录已清空，合法记录保留', !table('students').has('S1') && table('students').has('S6'), Array.from(table('students').keys()).join(','));

  // P11 users / learning_records 未被触碰
  check('P11 users 未被触碰', dump('users') === usersBefore, dump('users'));
  check('P11b learning_records 未被触碰', dump('learning_records') === learningBefore, 'ok');

  // P12 purge_notes 选项（默认不清理备注，显式开启才清）
  seed('students', [{ _id: 'S8', school: '测试学校', class_name: '测试班', name: '辛', student_no: '2027001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '9.000Z', updated_at: T + '9.000Z' }]);
  seed('teacher_notes', [{ _id: 'N3', student_doc_id: 'S8', teacher_id: 'T1', content: '待清', created_at: T + '9.000Z' }]);
  const p12a = await call({ action: 'student.purge', school: '测试学校', keyword: '2027001', dry_run: false, confirm_count: 1 });
  check('P12 默认不动备注', table('teacher_notes').has('N3'), table('teacher_notes').size);
  seed('students', [{ _id: 'S9', school: '测试学校2', class_name: '测试班', name: '壬', student_no: '2027002', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '9.500Z', updated_at: T + '9.500Z' }]);
  seed('teacher_notes', [{ _id: 'N4', student_doc_id: 'S9', teacher_id: 'T1', content: '待清', created_at: T + '9.500Z' }]);
  const p12b = await call({ action: 'student.purge', school: '测试学校2', keyword: '2027002', dry_run: false, confirm_count: 1, purge_notes: true });
  check('P12b purge_notes 清掉孤儿备注', p12b.removed_notes === 1 && !table('teacher_notes').has('N4'), JSON.stringify({ notes: p12b.removed_notes }));

  // P13 不撤销白名单的开关
  seed('students', [{ _id: 'S10', school: '测试学校3', class_name: '', name: '癸', student_no: '2027003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T + '9.900Z', updated_at: T + '9.900Z' }]);
  seed('roster', [{ _id: 'R9', student_id: '2027003', source: 'teacher_roster', created_at: T + '9.900Z' }]);
  const p13 = await call({ action: 'student.purge', school: '测试学校3', dry_run: false, confirm_count: 1, also_revoke_roster: false });
  check('P13 also_revoke_roster=false 时保留白名单', p13.revoked_roster === 0 && table('roster').has('R9'), JSON.stringify({ revoked: p13.revoked_roster }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
