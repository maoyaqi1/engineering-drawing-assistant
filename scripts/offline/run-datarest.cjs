// 数据维护工具 data.reset 离线自测：权限、预览、防误删、只清过程表、留痕。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function size(name) { return table(name).size; }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const T0 = '2026-09-11T02:00:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'TA', username: 'ta', name: '普通教师', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'sa', token: 'tok-a', teacher_id: 'TA', expires_at: Date.now() + 86400000 }
]);
// 名册与账号类（必须原样保留）
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2024001', name: '甲' },
  { _id: 'U2', openid: 'o2', role: 'student', student_id: '2024002', name: '乙' }
]);
seed('students', [
  { _id: 'S1', student_no: '2024001', name: '甲', owner_teacher_id: 'TA', class_name: '测试班' },
  { _id: 'S2', student_no: '2024002', name: '乙', owner_teacher_id: 'TA', class_name: '测试班' }
]);
seed('classes', [{ _id: 'C1', name: '测试班', status: 'active', owner_teacher_id: 'TA' }]);
seed('roster', [
  { _id: 'R1', student_id: '2024001', name: '甲' },
  { _id: 'R2', student_id: '2024002', name: '乙' }
]);
seed('teacher_notes', [{ _id: 'N1', doc_id: 'S1', content: '备注' }]);
// 过程/行为数据（可清理）
seed('learning_sessions', [
  { _id: 'LS1', openid: 'o1', module: 'point', created_at: T0 },
  { _id: 'LS2', openid: 'o1', module: 'line', created_at: T0 },
  { _id: 'LS3', openid: 'o2', module: 'plane', created_at: T0 }
]);
seed('learning_records', [
  { _id: 'LR1', openid: 'o1', event_type: 'chapter_enter', created_at: T0 },
  { _id: 'LR2', openid: 'o2', event_type: 'chapter_exit', created_at: T0 }
]);
seed('ai_conversations', [{ _id: 'AC1', openid: 'o1', title: '问答', created_at: T0 }]);
seed('ai_messages', [
  { _id: 'AM1', conversation_id: 'AC1', role: 'user', content: '问题', created_at: T0 },
  { _id: 'AM2', conversation_id: 'AC1', role: 'assistant', content: '回答', created_at: T0 }
]);
seed('survey_responses', [{ _id: 'SR1', user_id: 'U1', submitted_at: T0 }]);
seed('survey_invites', [{ _id: 'SI1', user_id: 'U1', completed: false, created_at: T0 }]);

const superCall = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));
const teacherCall = (p) => teacherFn.main(Object.assign({ token: 'tok-a' }, p));

(async () => {
  // T1 普通教师无权
  const t1 = await teacherCall({ action: 'data.reset', dry_run: true });
  check('T1 普通教师调用被拒（403 FORBIDDEN）', t1.ok === false && t1.code === 'FORBIDDEN', JSON.stringify(t1.code));

  // T2 预览：只统计、不删除
  const t2 = await superCall({ action: 'data.reset', dry_run: true });
  const expectCounts = {
    learning_sessions: 3, learning_records: 2, ai_conversations: 1,
    ai_messages: 2, survey_responses: 1, survey_invites: 1
  };
  const countsOk = t2.ok === true && t2.total === 10
    && Object.keys(expectCounts).every((k) => t2.counts[k] === expectCounts[k]);
  check('T2 预览统计正确（合计 10 条，6 张表）', countsOk, JSON.stringify(t2.counts || t2));
  check('T2b 预览不删除任何数据', size('learning_sessions') === 3 && size('ai_messages') === 2);
  check('T2c 预览返回 labels 便于前端展示', Array.isArray(t2.labels) && t2.labels.length === 6, JSON.stringify((t2.labels || []).map((l) => l.key)));

  // T3 confirm_count 不一致 → 拒绝且不删
  const t3 = await superCall({ action: 'data.reset', dry_run: false, confirm_count: 999 });
  check('T3 confirm_count 不一致被拒', t3.ok === false && t3.code === 'CONFIRM_MISMATCH', JSON.stringify(t3.code));
  check('T3b 被拒后数据未被删除', size('learning_sessions') === 3);

  // T4 名册/账号类集合不允许清理
  const t4 = await superCall({ action: 'data.reset', collections: ['students', 'roster', 'teachers', 'users'], dry_run: true });
  check('T4 传入名册/账号类集合被拒（403 FORBIDDEN_COLLECTION）',
    t4.ok === false && t4.code === 'FORBIDDEN_COLLECTION', JSON.stringify(t4.code));
  check('T4b 名册类数据完好', size('students') === 2 && size('roster') === 2 && size('teachers') === 2 && size('users') === 2);

  // T5 只清理指定子集
  const t5pre = await superCall({ action: 'data.reset', collections: ['ai_messages'], dry_run: true });
  check('T5 指定子集预览正确', t5pre.ok === true && t5pre.total === 2 && t5pre.counts.ai_messages === 2, JSON.stringify(t5pre.counts));
  const t5 = await superCall({ action: 'data.reset', collections: ['ai_messages'], dry_run: false, confirm_count: 2 });
  check('T5b 子集清理成功且只影响该表', t5.ok === true && t5.removed.ai_messages === 2 && size('ai_messages') === 0 && size('ai_conversations') === 1,
    JSON.stringify({ removed: t5.removed, conv: size('ai_conversations') }));

  // T6 全量清理（默认范围）
  const t6pre = await superCall({ action: 'data.reset', dry_run: true });
  check('T6 第二次预览合计为 8 条', t6pre.ok === true && t6pre.total === 8, String(t6pre.total));
  const t6 = await superCall({ action: 'data.reset', dry_run: false, confirm_count: 8 });
  const cleared = ['learning_sessions', 'learning_records', 'ai_conversations', 'ai_messages', 'survey_responses', 'survey_invites']
    .every((k) => size(k) === 0);
  check('T6b 六张过程表已清空', t6.ok === true && cleared,
    JSON.stringify({ ok: t6.ok, sizes: ['learning_sessions', 'learning_records', 'ai_conversations', 'ai_messages', 'survey_responses', 'survey_invites'].map((k) => k + ':' + size(k)) }));
  check('T6c 名册/账号/备注类数据完好',
    size('students') === 2 && size('classes') === 1 && size('roster') === 2 && size('users') === 2 && size('teachers') === 2 && size('teacher_notes') === 1,
    JSON.stringify({ students: size('students'), classes: size('classes'), roster: size('roster'), users: size('users'), teachers: size('teachers'), notes: size('teacher_notes') }));
  check('T7 清理已写入 maintenance_logs 留痕', size('maintenance_logs') === 2
    && Array.from(table('maintenance_logs').values()).every((l) => l.action === 'data.reset' && l.operator_name === '超级管理员'),
    JSON.stringify(Array.from(table('maintenance_logs').values()).map((l) => ({ a: l.action, op: l.operator_name, total: l.total }))));
  check('T8 清理后再预览为 0 条', (await superCall({ action: 'data.reset', dry_run: true })).total === 0);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
