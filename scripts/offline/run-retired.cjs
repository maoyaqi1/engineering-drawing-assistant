// 运维型批量物理删除下线自测（REQ-003 D5/R24，D16）：
//   1. 已下线的 action 一律回 ACTION_RETIRED：data.reset / data.emptyAccounts / data.legacyRoster /
//      roster.backfill / student.purge；
//   2. 下线调用不产生任何删除、也不写审计噪声（数据条数逐表不变）；
//   3. 保留的治理通道仍然可用：data.personList / data.personPurge（合规按人）、
//      data.markQuality / data.backfillQuality（标记 + 回填）。
// 运行：node scripts/offline/run-retired.cjs
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
seed('classes', [{ _id: 'C1', name: '机械2401', status: 'active', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0 }]);
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_name: '机械2401', class_id: 'C1', name: '甲', student_no: '2025001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0 }
]);
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2025001', name: '甲', school: '安徽建筑大学', data_quality: 'production', data_quality_source: 'auto', created_at: T0 },
  { _id: 'U2', openid: 'o2', role: 'student', student_id: '', name: '', school: '', created_at: T0 }
]);
// 过程数据（假设全是测试期产生的）：下线的批量清理不得碰它们
seed('learning_sessions', [{ _id: 'L1', user_id: 'U1', openid: 'o1', is_valid: true, created_at: T0 }]);
seed('learning_records', [{ _id: 'R1', user_id: 'U1', openid: 'o1', event_type: 'chapter_enter', created_at: T0 }]);
seed('ai_conversations', [{ _id: 'A1', openid: 'o1', created_at: T0 }]);
seed('ai_messages', [{ _id: 'M1', conversation_id: 'A1', role: 'user', content: 'hi', created_at: T0 }]);
seed('survey_responses', [{ _id: 'V1', user_id: 'U1', survey_id: 'geometry_learning_2026', submitted_at: T0 }]);
seed('survey_invites', [{ _id: 'I1', user_id: 'U1', trigger_count: 1, completed: true, created_at: T0 }]);
seed('roster', [{ _id: 'RB1', student_id: '2025900', name: '', source: 'legacy_import', created_at: T0 }]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const t1 = (p) => teacherFn.main(Object.assign({ token: 'tok-t1' }, p));

const TRACKED = ['users', 'students', 'roster', 'learning_sessions', 'learning_records',
  'ai_conversations', 'ai_messages', 'survey_responses', 'survey_invites'];
const snapshot = () => TRACKED.map((n) => n + ':' + table(n).size).join('|');

(async () => {
  const before = snapshot();
  const logsBefore = table('maintenance_logs').size;

  const retired = [
    ['data.reset', { collections: ['learning_sessions'] }],
    ['data.emptyAccounts', { dry_run: true }],
    ['data.legacyRoster', { dry_run: true }],
    ['roster.backfill', { dry_run: true }],
    ['student.purge', { dry_run: true, owner_teacher_id: 'T1' }]
  ];
  for (const [action, extra] of retired) {
    // eslint-disable-next-line no-await-in-loop
    const r = await superCall(Object.assign({ action }, extra));
    check('X ' + action + ' 已下线 → ACTION_RETIRED', r.ok === false && r.code === 'ACTION_RETIRED', JSON.stringify(r.code));
  }
  check('X2 普通教师拿到同样的"已下线"结果（不泄露权限差异）',
    (await t1({ action: 'data.reset' })).code === 'ACTION_RETIRED');

  check('X3 下线调用后所有集合条数不变（不产生任何物理删除）', snapshot() === before,
    JSON.stringify({ after: snapshot(), before }));
  check('X4 下线调用不写审计噪声', table('maintenance_logs').size === logsBefore,
    JSON.stringify({ after: table('maintenance_logs').size, before: logsBefore }));

  // 保留通道：按人清理（合规）与打标/回填（治理）
  const personList = await superCall({ action: 'data.personList', keyword: '' });
  check('Y1 data.personList 仍可用，且不再依赖已废弃的 roster 集合（残留白名单行不入列）',
    personList.ok === true && !(personList.items || []).some((it) => (it.stage || '').includes('白名单')),
    JSON.stringify((personList.items || []).map((it) => it.stage)));
  const personPre = await superCall({ action: 'data.personPurge', dry_run: true, targets: ['user:U1'] });
  check('Y2 data.personPurge 仍在（dry_run 预览可用）', personPre.ok === true, JSON.stringify(personPre.code || personPre.mode));
  const mark = await superCall({ action: 'data.markQuality', user_ids: ['U2'], quality: 'test' });
  check('Y3 data.markQuality 仍在（人工标记生效）',
    mark.ok === true && table('users').get('U2').data_quality === 'test' && table('users').get('U2').data_quality_source === 'manual',
    JSON.stringify(mark));
  const backfill = await superCall({ action: 'data.backfillQuality', dry_run: true });
  check('Y4 data.backfillQuality 仍可用，且跳过人工标记',
    backfill.ok === true && backfill.mode === 'dry_run' && backfill.skipped.manual === 1,
    JSON.stringify({ mode: backfill.mode, skipped: backfill.skipped }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
