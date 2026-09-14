// 跨校同学号场景自测：白名单与判重按「学号 + 姓名」，以及旧白名单姓名补齐。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');

// 用桩替换 AI 模块，避免加载 LLM 依赖链
const convPath = require.resolve(repoPath('cloudfunctions/api/ai/conversation.js'));
require.cache[convPath] = { id: convPath, filename: convPath, loaded: true, exports: { answerQuestion: async () => ({ ok: true, answer: 'stub' }) } };

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function rosterFor(no) { return Array.from(table('roster').values()).filter((r) => r.student_id === no); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const T0 = '2026-09-11T09:30:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'TA', username: 'ta', name: 'A校老师', role: 'teacher', status: 'active' },
  { _id: 'TB', username: 'tb', name: 'B校老师', role: 'teacher', status: 'active' }
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
  // ---- 教师侧：两所学校同一个学号 ----
  const a1 = await aCall({ action: 'student.create', school: 'A校', name: '甲', student_no: '2024001' });
  const b1 = await bCall({ action: 'student.create', school: 'B校', name: '乙', student_no: '2024001' });
  check('T1 同号不同名的两名学生都能录入', a1.ok === true && b1.ok === true, JSON.stringify({ a: a1.code, b: b1.code }));
  const r1 = rosterFor('2024001');
  check('T1b 白名单各存一条（学号+姓名）', r1.length === 2 && r1.some((r) => r.name === '甲') && r1.some((r) => r.name === '乙'),
    JSON.stringify(r1.map((r) => r.name)));

  // ---- 移除 A 校学生，不应影响 B 校同号学生 ----
  const del = await aCall({ action: 'student.delete', doc_id: a1.student.id });
  check('T2 A校学生移除成功', del.ok === true, JSON.stringify(del));
  const r2 = rosterFor('2024001');
  check('T2b 只撤销同号同名，B校学生仍保留白名单', r2.length === 1 && r2[0].name === '乙', JSON.stringify(r2.map((r) => r.name)));

  // ---- 仅改姓名：白名单同步为新「学号+姓名」 ----
  const renamed = await bCall({ action: 'student.update', doc_id: b1.student.id, name: '乙乙' });
  check('T3 改名成功', renamed.ok === true, JSON.stringify(renamed.code || ''));
  const r3 = rosterFor('2024001');
  check('T3b 白名单同步为新姓名', r3.length === 1 && r3[0].name === '乙乙', JSON.stringify(r3.map((r) => r.name)));

  // ---- 旧白名单姓名补齐 ----
  seed('students', [
    { _id: 'C1', school: 'A校', name: '丙', student_no: '2025001', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', source: 'teacher', created_at: T0, updated_at: T0 },
    { _id: 'C2', school: 'A校', name: '丁', student_no: '2025002', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', source: 'teacher', created_at: T0, updated_at: T0 },
    { _id: 'C3', school: 'B校', name: '戊', student_no: '2025002', owner_teacher_id: 'TB', owner_teacher_name: 'B校老师', source: 'teacher', created_at: T0, updated_at: T0 }
  ]);
  seed('roster', [
    { _id: 'RL1', student_id: '2025001', created_at: T0 },                 // 可补齐（唯一命中丙）
    { _id: 'RL2', student_id: '2025002', created_at: T0 },                 // 歧义（丁/戊）
    { _id: 'RL3', student_id: '2099999', created_at: T0 }                  // 名册里没有
  ]);
  const pre = await superCall({ action: 'roster.backfill', dry_run: true });
  check('T4 补齐预览统计正确', pre.ok === true && pre.fillable === 1 && pre.ambiguous === 1 && pre.unmatched === 1,
    JSON.stringify({ fillable: pre.fillable, ambiguous: pre.ambiguous, unmatched: pre.unmatched }));
  const bad = await superCall({ action: 'roster.backfill', dry_run: false, confirm_count: 5 });
  check('T4b confirm_count 不匹配被拒', bad.ok === false && bad.code === 'CONFIRM_MISMATCH', bad.code);
  const done = await superCall({ action: 'roster.backfill', dry_run: false, confirm_count: 1 });
  check('T4c 唯一命中者被补齐姓名', done.ok === true && done.updated === 1 && table('roster').get('RL1').name === '丙',
    JSON.stringify({ updated: done.updated, name: table('roster').get('RL1').name }));
  check('T4d 歧义与查不到的记录未被改动', !table('roster').get('RL2').name && !table('roster').get('RL3').name,
    JSON.stringify({ l2: table('roster').get('RL2').name, l3: table('roster').get('RL3').name }));
  const byN = await aCall({ action: 'roster.backfill', dry_run: true });
  check('T4e 普通教师不能用补齐工具', byN.ok === false && byN.code === 'FORBIDDEN', byN.code);

  // ---- 学生侧：注册判重改为「学号 + 姓名」 ----
  global.__CURRENT_OPENID = 'openid-A';
  const ra = await apiFn.main({ action: 'register', school: 'A校', name: '甲', studentId: '2024001' });
  check('A1 A校学生注册成功', ra.ok === true, JSON.stringify(ra.code || ''));
  global.__CURRENT_OPENID = 'openid-B';
  const rb = await apiFn.main({ action: 'register', school: 'B校', name: '乙', studentId: '2024001' });
  check('A2 同号不同名可注册（以前会被拒）', rb.ok === true, JSON.stringify(rb.code || ''));
  global.__CURRENT_OPENID = 'openid-C';
  const rc = await apiFn.main({ action: 'register', school: 'A校', name: '甲', studentId: '2024001' });
  check('A3 同号同名仍被拒（防冒用）', rc.ok === false && rc.code === 'STUDENT_ID_TAKEN', rc.code);

  // ---- 学生侧：白名单判定按「学号 + 姓名」 ----
  table('roster').clear();
  seed('roster', [{ _id: 'R-A', student_id: '2024001', name: '甲', created_at: T0 }]);
  global.__CURRENT_OPENID = 'openid-A';
  const sa = await apiFn.main({ action: 'roster.status' });
  check('A4 同号同名的学生有 AI 权限', sa.ok === true && sa.in_roster === true, JSON.stringify(sa));
  global.__CURRENT_OPENID = 'openid-B';
  const sb = await apiFn.main({ action: 'roster.status' });
  check('A5 同号不同名的学生无 AI 权限', sb.ok === true && sb.in_roster === false, JSON.stringify(sb));

  // ---- 旧记录（无姓名）不再按学号兜底放行 ----
  seed('roster', [{ _id: 'R-LEGACY', student_id: '2024919', created_at: T0 }]);
  global.__CURRENT_OPENID = 'openid-D';
  await apiFn.main({ action: 'register', school: 'A校', name: '己', studentId: '2024919' });
  const sd = await apiFn.main({ action: 'roster.status' });
  check('A6 旧记录（无姓名）不再按学号兜底放行', sd.ok === true && sd.in_roster === false, JSON.stringify(sd));

  // ---- 用户报告缺陷：同号不同名 + 存在无姓名旧记录 → 依然不放行 ----
  table('roster').clear();
  seed('roster', [
    { _id: 'R-X1', student_id: '2026001', name: '张三', created_at: T0 },
    { _id: 'R-X2', student_id: '2026001', created_at: T0 }
  ]);
  global.__CURRENT_OPENID = 'openid-LISI';
  await apiFn.main({ action: 'register', school: 'A校', name: '李四', studentId: '2026001' });
  const se = await apiFn.main({ action: 'roster.status' });
  check('A7 同号不同名（即使存在无姓名旧记录）无 AI 权限', se.ok === true && se.in_roster === false, JSON.stringify(se));
  global.__CURRENT_OPENID = 'openid-ZHANGSAN';
  await apiFn.main({ action: 'register', school: 'A校', name: '张三', studentId: '2026001' });
  const sf = await apiFn.main({ action: 'roster.status' });
  check('A8 同号同名者有 AI 权限', sf.ok === true && sf.in_roster === true, JSON.stringify(sf));

  // ---- 无姓名旧记录：补齐姓名后恢复放行（教师端 roster.backfill）----
  table('roster').clear();
  seed('students', [
    { _id: 'E1', school: 'A校', name: '王五', student_no: '2027001', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', source: 'teacher', created_at: T0, updated_at: T0 }
  ]);
  seed('roster', [{ _id: 'R-E1', student_id: '2027001', created_at: T0 }]);
  global.__CURRENT_OPENID = 'openid-WANGWU';
  await apiFn.main({ action: 'register', school: 'A校', name: '王五', studentId: '2027001' });
  const g1 = await apiFn.main({ action: 'roster.status' });
  check('A9 无姓名旧记录：补齐前不放行', g1.ok === true && g1.in_roster === false, JSON.stringify(g1));
  const bf = await superCall({ action: 'roster.backfill', dry_run: false, confirm_count: 1 });
  const g2 = await apiFn.main({ action: 'roster.status' });
  check('A10 补齐姓名后恢复放行', bf.ok === true && bf.updated === 1 && g2.ok === true && g2.in_roster === true,
    JSON.stringify({ updated: bf.updated, in_roster: g2.in_roster }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
