// REQ-002 第一阶段后端离线自测（桩 + 内存库），验证 class.* 的权限、去重、双写与归档行为。
// 运行：node scripts/offline/run.cjs（或 node scripts/run-all.js 统一运行）
// 边界：不替代真实部署后的验证（未部署不算验证，见 AGENTS.md C11）。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) {
  rows.forEach((row) => table(name).set(row._id, row));
}
function dump(name) {
  return JSON.stringify(Array.from(table(name).values()).sort((a, b) => String(a._id).localeCompare(String(b._id))));
}
function student(id) {
  return table('students').get(id);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
}

const nowIso = '2026-09-11T00:00:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active', created_at: nowIso },
  { _id: 'T1', username: 't1', name: '教师一', role: 'teacher', status: 'active', created_at: nowIso },
  { _id: 'T2', username: 't2', name: '教师二', role: 'teacher', status: 'active', created_at: nowIso }
]);
seed('teacher_sessions', [
  { _id: 'sess1', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 },
  { _id: 'sess2', token: 'tok-t2', teacher_id: 'T2', expires_at: Date.now() + 86400000 },
  { _id: 'sess3', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 }
]);
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2024001', name: '张三', school: '安徽建筑大学', created_at: nowIso, last_login_at: nowIso }
]);
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_name: '', name: '张三', student_no: '2024001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: nowIso, updated_at: nowIso },
  { _id: 'S2', school: '安徽建筑大学', class_name: '', name: '李四', student_no: '2024002', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: nowIso, updated_at: nowIso },
  { _id: 'S3', school: '安徽建筑大学', class_name: '', name: '王五', student_no: '2024003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: nowIso, updated_at: nowIso },
  { _id: 'S4', school: '合肥大学', class_name: '', name: '赵六', student_no: '2024004', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: nowIso, updated_at: nowIso }
]);
seed('roster', [{ _id: 'R1', student_id: '2024001', source: 'teacher_roster', created_at: nowIso }]);

const rosterBefore = dump('roster');
const studentsBefore = table('students').size;

async function main(payload) {
  return await teacherFn.main(Object.assign({ token: 'tok-t1' }, payload));
}

(async () => {
  // 4. 新建班级成功
  const created = await main({ action: 'class.create', name: '机械2401', school: '安徽建筑大学' });
  const c1 = (created.class && created.class.id) || '';
  check('4 新建班级成功', created.ok && c1 && created.class.status === 'active' && created.class.member_count === 0, JSON.stringify(created));

  // 1. 普通教师只看到自己的班级
  const list1 = await main({ action: 'class.list' });
  check('1 普通教师仅见自己的班级', list1.ok && list1.total === 1 && list1.items[0].id === c1 && list1.is_super === false, JSON.stringify(list1.summary));

  // 5. 同教师同名同校活动班级不能重复
  const dup = await main({ action: 'class.create', name: '机械2401', school: '安徽建筑大学' });
  check('5 同名同校重复被拒', dup.ok === false && dup.code === 'DUPLICATE_CLASS' && dup.msg.indexOf('机械2401') >= 0, dup.code);

  // 6. 不同学校允许同名班级
  const other = await main({ action: 'class.create', name: '机械2401', school: '合肥大学' });
  const c2 = (other.class && other.class.id) || '';
  check('6 不同学校允许同名', other.ok === true && !!c2, JSON.stringify(other.class || other));

  // 另一位教师的班级
  const t2created = await teacherFn.main({ action: 'class.create', token: 'tok-t2', name: '机械2402', school: '合肥大学' });
  const c3 = (t2created.class && t2created.class.id) || '';

  // 2. 超管可以看到全部班级
  const superList = await teacherFn.main({ action: 'class.list', token: 'tok-super', status: 'all' });
  check('2 超管可见全部班级', superList.ok && superList.total === 3 && superList.is_super === true && (superList.owners || []).length === 2, 'total=' + superList.total);

  // 3. 普通教师直接访问他人 class_id 返回 403
  const forbiddenDetail = await main({ action: 'class.detail', class_id: c3 });
  check('3 访问他人班级详情 403', forbiddenDetail.ok === false && forbiddenDetail.code === 'FORBIDDEN', forbiddenDetail.code);
  const forbiddenAdd = await main({ action: 'class.members.add', class_id: c3, doc_ids: ['S1'] });
  check('3b 向他人班级加人 403', forbiddenAdd.ok === false && forbiddenAdd.code === 'FORBIDDEN', forbiddenAdd.code);
  const forbiddenArchive = await main({ action: 'class.archive', class_id: c3 });
  check('3c 停用他人班级 403', forbiddenArchive.ok === false && forbiddenArchive.code === 'FORBIDDEN', forbiddenArchive.code);

  // 超管可查看他人班级
  const superDetail = await teacherFn.main({ action: 'class.detail', token: 'tok-super', class_id: c3 });
  check('2b 超管可查看他人班级详情', superDetail.ok === true && superDetail.class.owner_teacher_id === 'T2', superDetail.code || '');

  // 不存在班级
  const missing = await main({ action: 'class.detail', class_id: 'id_not_exist' });
  check('4b 不存在的班级返回 NOT_FOUND', missing.ok === false && missing.code === 'NOT_FOUND', missing.code);

  // 候选学生：仅本班负责教师名册
  const candidates = await main({ action: 'class.candidates', class_id: c1 });
  check('候选仅含本班负责教师名册', candidates.ok && candidates.total === 3 && candidates.items.every((i) => ['S1', 'S2', 'S3'].indexOf(i.doc_id) >= 0), 'total=' + candidates.total);

  // 7. 添加学生后 class_id / class_name 同步
  const addRes = await main({ action: 'class.members.add', class_id: c1, doc_ids: ['S1', 'S2'] });
  check('7 添加学生成功', addRes.ok && addRes.added === 2 && addRes.failed.length === 0, JSON.stringify(addRes.failed));
  check('7b class_id/class_name 同步写入', student('S1').class_id === c1 && student('S1').class_name === '机械2401' && student('S2').class_id === c1, JSON.stringify({ s1: student('S1').class_id, name: student('S1').class_name }));

  // 跨教师名册的学生不可加入（超管班级范围外）
  const outOfScope = await main({ action: 'class.members.add', class_id: c1, doc_ids: ['S4'] });
  check('7c 非本班负责教师名册的学生被拒', outOfScope.ok === true && outOfScope.added === 0 && outOfScope.failed[0].code === 'NOT_IN_SCOPE', JSON.stringify(outOfScope.failed));

  // 8. 已在活动班级的学生不能重复加入其他班级
  const intoC2 = await main({ action: 'class.members.add', class_id: c2, doc_ids: ['S1'] });
  check('8 已在其他活动班级的学生被拒', intoC2.ok === true && intoC2.added === 0 && intoC2.failed[0].code === 'IN_OTHER_CLASS', JSON.stringify(intoC2.failed));
  const reAdd = await main({ action: 'class.members.add', class_id: c1, doc_ids: ['S1'] });
  check('8b 重复加入本班被拒', reAdd.ok === true && reAdd.added === 0 && reAdd.failed[0].code === 'ALREADY_IN_CLASS', JSON.stringify(reAdd.failed));

  // 13. AI 白名单不因成员变化改变
  check('13 roster 未被成员操作触碰（加人后）', dump('roster') === rosterBefore, dump('roster'));

  // 9. 移出学生后 class_id / class_name 同时为空
  const removed = await main({ action: 'class.members.remove', class_id: c1, doc_ids: ['S2'] });
  check('9 移出成功', removed.ok && removed.removed === 1 && removed.failed.length === 0, JSON.stringify(removed.failed));
  check('9b 移出后两字段同时为空', student('S2').class_id === '' && student('S2').class_name === '', JSON.stringify({ id: student('S2').class_id, name: student('S2').class_name }));
  check('9c 移出后学生记录仍存在', !!student('S2'), 'S2');

  // 10. 重命名班级后成员 class_name 同步
  const renamed = await main({ action: 'class.update', class_id: c1, name: '机械2401A' });
  check('10 重命名成功并同步成员', renamed.ok && renamed.renamed_members === 1 && renamed.class.name === '机械2401A', JSON.stringify({ renamed: renamed.renamed_members, name: renamed.class && renamed.class.name }));
  check('10b 成员 class_name 已同步且 class_id 不变', student('S1').class_name === '机械2401A' && student('S1').class_id === c1, JSON.stringify({ name: student('S1').class_name, id: student('S1').class_id }));

  // 10c 重命名冲突被拒：把 c2 改成与 c1 相同的「名称 + 学校」（c1 此时为 机械2401A / 安徽建筑大学）
  const c1Now = (await main({ action: 'class.detail', class_id: c1 })).class;
  const renameDup = await main({ action: 'class.update', class_id: c2, name: c1Now.name, school: c1Now.school });
  check('10c 重命名冲突被拒（同名同校）', renameDup.ok === false && renameDup.code === 'DUPLICATE_CLASS', renameDup.code);
  const c2After = (await main({ action: 'class.detail', class_id: c2 })).class;
  check('10d 冲突重命名未产生写入', c2After.name === '机械2401' && c2After.school === '合肥大学', JSON.stringify({ name: c2After.name, school: c2After.school }));

  // 11/12. 停用班级：软删除，成员关系与数据保留
  const archived = await main({ action: 'class.archive', class_id: c1 });
  check('11 停用成功', archived.ok && archived.class.status === 'archived', JSON.stringify(archived.class && archived.class.status));
  const c1AfterArchive = (await main({ action: 'class.detail', class_id: c1 })).class;
  check('12 停用后成员关系保留', student('S1').class_id === c1 && student('S1').class_name === c1AfterArchive.name, JSON.stringify({ id: student('S1').class_id, name: student('S1').class_name, class_name: c1AfterArchive.name }));
  check('11b 停用不删除学生记录', table('students').size === studentsBefore, table('students').size + '/' + studentsBefore);
  const activeList = await main({ action: 'class.list' });
  const archivedList = await main({ action: 'class.list', status: 'archived' });
  check('11c 默认列表不含已停用班', activeList.total === 1 && activeList.items[0].id === c2, 'active total=' + activeList.total);
  check('11d 状态筛选可见已停用班', archivedList.total === 1 && archivedList.items[0].id === c1, 'archived total=' + archivedList.total);

  // 停用班级禁止成员变更
  const addArchived = await main({ action: 'class.members.add', class_id: c1, doc_ids: ['S3'] });
  const removeArchived = await main({ action: 'class.members.remove', class_id: c1, doc_ids: ['S1'] });
  check('20a 已停用班级禁止加人', addArchived.ok === false && addArchived.code === 'CLASS_ARCHIVED', addArchived.code);
  check('20b 已停用班级禁止移人', removeArchived.ok === false && removeArchived.code === 'CLASS_ARCHIVED', removeArchived.code);

  // 归档后再归档幂等
  const archiveAgain = await main({ action: 'class.archive', class_id: c1 });
  check('20c 重复停用幂等', archiveAgain.ok === true && archiveAgain.unchanged === true, JSON.stringify(archiveAgain.class && archiveAgain.class.status));

  // 未授权
  const noAuth = await teacherFn.main({ action: 'class.list' });
  check('18 无 token 返回 401', noAuth.ok === false && noAuth.code === 'UNAUTHORIZED', noAuth.code);

  // 13b roster 全程未变
  check('13b roster 全程未变', dump('roster') === rosterBefore, dump('roster'));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
