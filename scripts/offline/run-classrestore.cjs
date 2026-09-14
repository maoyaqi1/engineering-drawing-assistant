// 班级「停用 → 列表可见（置灰） → 恢复」生命周期自测。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function rows(name) { return Array.from(table(name).values()); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const T0 = '2026-09-11T02:00:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'TA', username: 'ta', name: 'A老师', role: 'teacher', status: 'active' },
  { _id: 'TB', username: 'tb', name: 'B老师', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'sa', token: 'tok-a', teacher_id: 'TA', expires_at: Date.now() + 86400000 },
  { _id: 'sb', token: 'tok-b', teacher_id: 'TB', expires_at: Date.now() + 86400000 }
]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const aCall = (p) => teacherFn.main(Object.assign({ token: 'tok-a' }, p));
const bCall = (p) => teacherFn.main(Object.assign({ token: 'tok-b' }, p));

(async () => {
  // 建班 + 录入 2 名学生
  const c1 = await aCall({ action: 'class.create', name: '教师组', school: '安徽建筑大学' });
  const s1 = await aCall({ action: 'student.create', school: '安徽建筑大学', name: '甲', student_no: '5001', class_name: '教师组' });
  const s2 = await aCall({ action: 'student.create', school: '安徽建筑大学', name: '乙', student_no: '5002', class_name: '教师组' });
  check('T1 建班与录入学生成功', c1.ok && s1.ok && s2.ok, JSON.stringify({ c: c1.ok, s: s1.ok && s2.ok }));
  const rosterCountBefore = rows('roster').length;

  // 停用
  const arch = await aCall({ action: 'class.archive', class_id: c1.class.id });
  check('T2 停用成功（status=archived）', arch.ok && arch.class.status === 'archived', JSON.stringify(arch.class && arch.class.status));

  // 默认列表（仅进行中）看不到；「全部」能看到（前端据此置灰显示）
  const activeList = await aCall({ action: 'class.list' });
  const allList = await aCall({ action: 'class.list', status: 'all' });
  check('T3 停用后不在「进行中」列表（默认）', activeList.items.every((c) => c.id !== c1.class.id), JSON.stringify(activeList.items.map((c) => c.name)));
  check('T4 「全部」列表里仍在，且状态为已停用（前端置灰显示的依据）',
    allList.items.some((c) => c.id === c1.class.id && c.status === 'archived'),
    JSON.stringify(allList.items.map((c) => ({ n: c.name, s: c.status }))));

  // 停用不改名单与白名单、成员关系保留
  const detail = await aCall({ action: 'class.detail', class_id: c1.class.id });
  check('T5 停用后成员关系保留（成员数不变）',
    detail.ok && detail.summary.member_count === 2, JSON.stringify(detail.summary));
  check('T6 停用不删除白名单', rows('roster').length === rosterCountBefore, JSON.stringify({ before: rosterCountBefore, after: rows('roster').length }));

  // 恢复
  const restored = await aCall({ action: 'class.archive', class_id: c1.class.id, archived: false });
  check('T7 恢复成功（status 回到 active）', restored.ok && restored.class.status === 'active', JSON.stringify(restored.class && restored.class.status));
  const activeList2 = await aCall({ action: 'class.list' });
  check('T8 恢复后重新出现在「进行中」列表', activeList2.items.some((c) => c.id === c1.class.id), JSON.stringify(activeList2.items.map((c) => c.name)));
  check('T9 恢复后名单与白名单完好（成员仍是 2 人）',
    activeList2.items.find((c) => c.id === c1.class.id).member_count === 2 && rows('roster').length === rosterCountBefore,
    JSON.stringify({ members: activeList2.items.find((c) => c.id === c1.class.id).member_count }));

  // 恢复时的同名冲突保护：先建一个同名活动班级，再停用/恢复原班
  const arch2 = await aCall({ action: 'class.archive', class_id: c1.class.id });
  const dup = await aCall({ action: 'class.create', name: '教师组', school: '安徽建筑大学' });
  const restoreConflict = await aCall({ action: 'class.archive', class_id: c1.class.id, archived: false });
  check('T10 存在同名活动班级时恢复被拒（DUPLICATE_CLASS），避免出现两个同名班',
    arch2.ok && dup.ok && restoreConflict.ok === false && restoreConflict.code === 'DUPLICATE_CLASS',
    JSON.stringify({ dup: dup.ok, code: restoreConflict.code }));

  // 权限：其它老师不能恢复/停用我的班
  const bTry = await bCall({ action: 'class.archive', class_id: c1.class.id, archived: false });
  check('T11 其它教师不能恢复我的班级（403）', bTry.ok === false && bTry.code === 'FORBIDDEN', JSON.stringify(bTry.code));
  // 超管恢复「别人负责的班级」：另建一个不冲突的班来验证
  const bClass = await bCall({ action: 'class.create', name: 'B班', school: 'B校' });
  await bCall({ action: 'class.archive', class_id: bClass.class.id });
  const superTry = await superCall({ action: 'class.archive', class_id: bClass.class.id, archived: false });
  check('T12 超管可以恢复他人负责的班级', superTry.ok === true && superTry.class.status === 'active',
    JSON.stringify({ ok: superTry.ok, status: superTry.class && superTry.class.status, code: superTry.code }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
