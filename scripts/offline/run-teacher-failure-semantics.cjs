// 教师端关键读取、班级同步与驾驶舱部分成功自测。
//
// 覆盖：
//   1. 班级成员读取失败时，不改班级主记录，也不报告成功；
//   2. 单条成员快照写入失败时，准确返回成功数、失败数和可重试信息；
//   3. 清除故障后重试可恢复成员快照一致；
//   4. 驾驶舱的旁路统计失败不能被伪装成 0 条，必须返回 partial + warning；
//   5. 空数据仍返回 ok=true，不与接口失败混淆。
const {
  repoPath,
  sdk,
  seed,
  rows,
  createReporter
} = require('./test-context.cjs');
const { check, printSummary } = createReporter();

const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));
const teacherCall = (payload) => teacherFn.main(Object.assign({ token: 'tok-t1' }, payload));

const nowIso = new Date().toISOString();
seed('teachers', [{
  _id: 'T1', username: 't1', name: '普通教师', role: 'teacher', status: 'active', created_at: nowIso
}]);
seed('teacher_sessions', [{
  _id: 'sess-t1', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000
}]);
seed('classes', [{
  _id: 'C1', name: '原班级名', school: '安徽建筑大学', status: 'active',
  owner_teacher_id: 'T1', owner_teacher_name: '普通教师', created_at: nowIso, updated_at: nowIso
}]);
seed('students', [
  {
    _id: 'S1', student_no: '950001', name: '甲同学', class_id: 'C1', class_name: '原班级名',
    owner_teacher_id: 'T1', created_at: nowIso, updated_at: nowIso
  },
  {
    _id: 'S2', student_no: '950002', name: '乙同学', class_id: 'C1', class_name: '原班级名',
    owner_teacher_id: 'T1', created_at: nowIso, updated_at: nowIso
  }
]);

(async () => {
  sdk.__fault('students', true);
  const readFailure = await teacherCall({ action: 'class.update', class_id: 'C1', name: '不应写入' });
  sdk.__fault('students', false);
  const classAfterReadFailure = rows('classes').find((row) => row._id === 'C1');
  check('E1 成员预读失败时返回明确失败',
    readFailure.ok === false && readFailure.code === 'CLASS_MEMBER_READ_FAILED' && readFailure.retryable === true,
    JSON.stringify(readFailure));
  check('E2 成员预读失败时班级主记录保持原值',
    classAfterReadFailure.name === '原班级名', JSON.stringify(classAfterReadFailure));

  sdk.__failNextUpdate('students', 'S2');
  const partial = await teacherCall({ action: 'class.update', class_id: 'C1', name: '新班级名' });
  check('E3 单条成员同步失败时返回部分成功',
    partial.ok === false && partial.code === 'CLASS_MEMBER_SYNC_PARTIAL'
      && partial.renamed_members === 1 && partial.failed_members.length === 1
      && partial.failed_members[0].doc_id === 'S2' && partial.retryable === true,
    JSON.stringify(partial));
  const afterPartial = rows('students').filter((row) => row.class_id === 'C1');
  check('E4 部分成功不谎报全部成员已同步',
    afterPartial.filter((row) => row.class_name === '新班级名').length === 1
      && afterPartial.filter((row) => row.class_name === '原班级名').length === 1,
    JSON.stringify(afterPartial.map((row) => [row._id, row.class_name])));

  const retry = await teacherCall({ action: 'class.update', class_id: 'C1', name: '新班级名' });
  const afterRetry = rows('students').filter((row) => row.class_id === 'C1');
  check('E5 重试后返回成功且所有成员快照一致',
    retry.ok === true && retry.renamed_members === 1
      && afterRetry.every((row) => row.class_name === '新班级名'),
    JSON.stringify({ retry, members: afterRetry.map((row) => row.class_name) }));

  const emptyDash = await teacherCall({ action: 'dashboard' });
  check('E6 合法空数据仍返回正常空态',
    emptyDash.ok === true && emptyDash.ai_today === 0 && emptyDash.partial === false,
    JSON.stringify({ ok: emptyDash.ok, ai_today: emptyDash.ai_today, partial: emptyDash.partial }));

  sdk.__fault('ai_conversations', true);
  const partialDash = await teacherCall({ action: 'dashboard' });
  sdk.__fault('ai_conversations', false);
  check('E7 驾驶舱旁路统计失败标记 partial 并返回可重试 warning',
    partialDash.ok === true && partialDash.partial === true && partialDash.ai_today === null
      && Array.isArray(partialDash.warnings) && partialDash.warnings.length === 1
      && partialDash.warnings[0].code === 'AI_STATS_UNAVAILABLE'
      && partialDash.warnings[0].retryable === true,
    JSON.stringify(partialDash));

  sdk.__fault('students', true);
  const classReadFailure = await teacherCall({ action: 'class.detail', class_id: 'C1' });
  sdk.__fault('students', false);
  check('E8 班级详情读取失败不伪装为空成员列表',
    classReadFailure.ok === false, JSON.stringify(classReadFailure));

  process.exitCode = printSummary({ separator: false, compactDetail: true }) ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
