// 跨校「学号 + 姓名」判定与 roster 残留自测（REQ-003 D2/D14/D16/B5）：
//   1. 判定只读 students 名册 + classes 状态；roster 残留不再有任何放行作用（D16）；
//   2. 匹配键 = 规范化学号 + 规范化姓名：同号不同名不命中，不同号同名不命中；
//   3. 学号规范化：全角转半角、去内部空白；大小写敏感（D14）；
//   4. 学校字段不参与匹配 → 跨校「同号同名」会互相命中，属已知风险（B5，本期不解决）；
//   5. 教师改名后按新的「学号 + 姓名」立即生效，旧名字立即失效。
// 运行：node scripts/offline/run-crossschool.cjs
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');

// 桩替换 AI 模块（本用例不真的提问，但 require api 会拉起依赖链）
const convPath = require.resolve(repoPath('cloudfunctions/api/ai/conversation.js'));
require.cache[convPath] = { id: convPath, filename: convPath, loaded: true, exports: { ensureCollections: async () => {} } };

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };

const T0 = '2026-09-11T09:30:00.000Z';
seed('teachers', [
  { _id: 'TA', username: 'ta', name: 'A校老师', role: 'teacher', status: 'active' },
  { _id: 'TB', username: 'tb', name: 'B校老师', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'sa', token: 'tok-a', teacher_id: 'TA', expires_at: Date.now() + 86400000 },
  { _id: 'sb', token: 'tok-b', teacher_id: 'TB', expires_at: Date.now() + 86400000 }
]);
seed('classes', [
  { _id: 'CA', name: '机械2401', school: 'A校', status: 'active', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', created_at: T0 },
  { _id: 'CB', name: '机械2401', school: 'B校', status: 'active', owner_teacher_id: 'TB', owner_teacher_name: 'B校老师', created_at: T0 }
]);
seed('students', [
  { _id: 'A1', school: 'A校', class_id: 'CA', class_name: '机械2401', name: '甲', student_no: '2024001', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', created_at: T0 },
  { _id: 'B1', school: 'B校', class_id: 'CB', class_name: '机械2401', name: '乙', student_no: '2024001', owner_teacher_id: 'TB', owner_teacher_name: 'B校老师', created_at: T0 },
  // 大小写敏感：名册里是小写字母学号
  { _id: 'C1', school: 'A校', class_id: 'CA', class_name: '机械2401', name: '小写', student_no: 's2890658', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', created_at: T0 }
]);
// roster 残留：具名记录 + 无姓名旧记录（都不应再影响判定）
seed('roster', [
  { _id: 'R-A', student_id: '2024001', name: '甲', created_at: T0 },
  { _id: 'R-LEGACY', student_id: '2024919', created_at: T0 }
]);

const aCall = (p) => teacherFn.main(Object.assign({ token: 'tok-a' }, p));
const status = async (openid) => { asOpenid(openid); return apiFn.main({ action: 'roster.status' }); };

(async () => {
  // ---- 同号不同名：各自按自己的「学号 + 姓名」判定 ----
  asOpenid('openid-A');
  await apiFn.main({ action: 'register', school: 'A校', name: '甲', studentId: '2024001' });
  asOpenid('openid-B');
  await apiFn.main({ action: 'register', school: 'B校', name: '乙', studentId: '2024001' });
  asOpenid('openid-C');
  await apiFn.main({ action: 'register', school: 'A校', name: '丙', studentId: '2024001' });
  const sa = await status('openid-A');
  check('A1 A 校「2024001 + 甲」命中名册 → student/ok',
    sa.level === 'student' && sa.reason === 'ok' && sa.in_roster === true, JSON.stringify(sa));
  const sb = await status('openid-B');
  check('A2 B 校「2024001 + 乙」同样命中（同号不同名互不干扰）',
    sb.level === 'student' && sb.reason === 'ok', JSON.stringify(sb));
  const sc = await status('openid-C');
  check('A3 同号但姓名不同且不在名册 → not_in_roster（禁止学号-only 放行）',
    sc.level === 'guest' && sc.reason === 'not_in_roster', JSON.stringify(sc.reason));

  // ---- 学号规范化（D14）----
  seed('users', [
    { _id: 'UF', openid: 'openid-F', role: 'student', student_id: '２０２４００１', name: '甲', school: 'A校', created_at: T0 },
    { _id: 'US', openid: 'openid-S', role: 'student', student_id: '2024 001', name: '甲', school: 'A校', created_at: T0 },
    { _id: 'UU', openid: 'openid-U', role: 'student', student_id: 'S2890658', name: '小写', school: 'A校', created_at: T0 },
    { _id: 'UL', openid: 'openid-L', role: 'student', student_id: '2024919', name: '己', school: 'A校', created_at: T0 }
  ]);
  const fullwidth = await status('openid-F');
  check('A4 全角学号「２０２４００１」规范化后命中 → student/ok',
    fullwidth.level === 'student', JSON.stringify(fullwidth.reason));
  const spaced = await status('openid-S');
  check('A5 学号内部空白「2024 001」规范化后命中 → student/ok',
    spaced.level === 'student', JSON.stringify(spaced.reason));
  const upper = await status('openid-U');
  check('A6 大小写敏感：S2890658 不匹配名册里的 s2890658 → not_in_roster',
    upper.level === 'guest' && upper.reason === 'not_in_roster', JSON.stringify(upper.reason));

  // ---- roster 残留不再参与放行（D16）----
  const legacy = await status('openid-L');
  check('A7 roster 里只有无姓名的旧记录（2024919）→ 不再放行（判定源是 students）',
    legacy.level === 'guest' && legacy.reason === 'not_in_roster', JSON.stringify(legacy.reason));
  const backfill = await aCall({ action: 'roster.backfill', dry_run: true });
  check('A8 roster.backfill 已下线 → ACTION_RETIRED',
    backfill.ok === false && backfill.code === 'ACTION_RETIRED', JSON.stringify(backfill.code));

  // ---- 教师改名立即生效 ----
  const renamed = await aCall({ action: 'student.update', doc_id: 'A1', name: '甲甲' });
  check('A9 教师把名册里的「甲」改名为「甲甲」成功', renamed.ok === true, JSON.stringify(renamed.code || ''));
  const afterRename = await status('openid-A');
  check('A9b 改名后旧「学号 + 姓名」立即失效（服务端实时重算，无缓存）',
    afterRename.level === 'guest' && afterRename.reason === 'not_in_roster', JSON.stringify(afterRename.reason));
  seed('users', [{ _id: 'UN', openid: 'openid-N', role: 'student', student_id: '2024001', name: '甲甲', school: 'A校', created_at: T0 }]);
  const newName = await status('openid-N');
  check('A9c 新「学号 + 姓名」立即可用', newName.level === 'student', JSON.stringify(newName.reason));

  // ---- B5 已知风险：跨校同号同名会互相命中（学校不参与匹配）----
  seed('students', [
    { _id: 'X1', school: 'C校', class_id: 'CA', class_name: '机械2401', name: '同名', student_no: '2024888', owner_teacher_id: 'TA', owner_teacher_name: 'A校老师', created_at: T0 }
  ]);
  seed('users', [{ _id: 'UX', openid: 'openid-X', role: 'student', student_id: '2024888', name: '同名', school: '完全不同的学校', created_at: T0 }]);
  const crossSchool = await status('openid-X');
  check('A10 跨校同「学号 + 姓名」会命中（学校不参与匹配，B5 已知风险）',
    crossSchool.level === 'student', JSON.stringify(crossSchool.reason));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
