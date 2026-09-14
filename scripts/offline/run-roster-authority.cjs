// 名单权威性自测：以老师录入的名册/白名单为准。
// 学生自己改错学号或姓名 → 自己就不在白名单（老师不需要管）；学生自己改回与老师一致 → 自动恢复。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');

// 桩替换 AI 模块
const convPath = require.resolve(repoPath('cloudfunctions/api/ai/conversation.js'));
require.cache[convPath] = { id: convPath, filename: convPath, loaded: true, exports: { ensureCollections: async () => {}, answerQuestion: async () => ({ ok: true, answer: 'stub' }) } };

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }
function rosterRows(no) { return Array.from(table('roster').values()).filter((r) => r.student_id === no); }
function studentRows(no) { return Array.from(table('students').values()).filter((r) => r.student_no === no); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };

const T0 = '2026-09-11T02:00:00.000Z';
seed('teachers', [{ _id: 'TA', username: 'ta', name: '任课教师', role: 'teacher', status: 'active' }]);
seed('teacher_sessions', [{ _id: 'sa', token: 'tok-a', teacher_id: 'TA', expires_at: Date.now() + 86400000 }]);
const teacherCall = (p) => teacherFn.main(Object.assign({ token: 'tok-a' }, p));

(async () => {
  // 老师在班级页录入学生 → 名册 + 白名单
  const created = await teacherCall({ action: 'student.create', school: '安徽建筑大学', name: '毛亚岐', student_no: '500450', class_name: '教师组' });
  check('T1 老师录入学生成功（名册 + 自动开通 AI 白名单）',
    created.ok === true && studentRows('500450').length === 1 && rosterRows('500450').length === 1,
    JSON.stringify({ students: studentRows('500450').length, roster: rosterRows('500450').length }));
  const rosterSnapshot = JSON.stringify(rosterRows('500450').map((r) => r.name));
  const studentSnapshot = JSON.stringify(studentRows('500450').map((r) => r.name));

  // 学生用与老师一致的信息注册 → 在白名单
  asOpenid('openid-stu');
  const reg = await apiFn.main({ action: 'register', school: '安徽建筑大学', name: '毛亚岐', studentId: '500450' });
  const s1 = await apiFn.main({ action: 'roster.status' });
  check('T2 学生填写与老师一致的信息 → 在白名单（可提问）',
    reg.ok === true && s1.ok === true && s1.in_roster === true, JSON.stringify({ reg: reg.ok, in: s1.in_roster }));

  // 学生自己把姓名改错 → 自己就不在白名单
  const wrong = await apiFn.main({ action: 'register', school: '安徽建筑大学', name: '毛亚奇', studentId: '500450' });
  const s2 = await apiFn.main({ action: 'roster.status' });
  check('T3 学生自己改错姓名 → 自己不在白名单（以老师端为准）',
    wrong.ok === true && s2.ok === true && s2.in_roster === false, JSON.stringify({ ok: wrong.ok, in: s2.in_roster }));

  // 关键：老师端数据完全没被这次改名影响（老师不需要管）
  check('T4 学生改名不影响老师的名册与白名单（老师无需处理）',
    JSON.stringify(studentRows('500450').map((r) => r.name)) === studentSnapshot
    && JSON.stringify(rosterRows('500450').map((r) => r.name)) === rosterSnapshot,
    JSON.stringify({ students: studentRows('500450').map((r) => r.name), roster: rosterRows('500450').map((r) => r.name) }));
  check('T4b 白名单里没有产生"毛亚奇"这条多余记录',
    rosterRows('500450').every((r) => r.name === '毛亚岐'),
    JSON.stringify(rosterRows('500450').map((r) => r.name)));

  // 学生自己改回与老师一致 → 自动恢复
  const back = await apiFn.main({ action: 'register', school: '安徽建筑大学', name: '毛亚岐', studentId: '500450' });
  const s3 = await apiFn.main({ action: 'roster.status' });
  check('T5 学生自己改回与老师一致 → 自动恢复白名单（无需老师操作）',
    back.ok === true && s3.ok === true && s3.in_roster === true, JSON.stringify({ ok: back.ok, in: s3.in_roster }));

  // 防冒用：另一个微信号想用相同的「学号+姓名」→ 被拒
  asOpenid('openid-other');
  const steal = await apiFn.main({ action: 'register', school: '安徽建筑大学', name: '毛亚岐', studentId: '500450' });
  check('T6 另一个微信号用相同的「学号+姓名」注册被拒（防冒用）',
    steal.ok === false && steal.code === 'STUDENT_ID_TAKEN', JSON.stringify(steal.code));

  // 学号相同但姓名不同 → 允许（不同学校可能同学号），且不在白名单
  asOpenid('openid-real2');
  const other = await apiFn.main({ action: 'register', school: 'B校', name: '李四', studentId: '500450' });
  const s4 = await apiFn.main({ action: 'roster.status' });
  check('T7 同学号不同姓名可注册，但不在白名单（不会误放行）',
    other.ok === true && s4.ok === true && s4.in_roster === false, JSON.stringify({ ok: other.ok, in: s4.in_roster }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
