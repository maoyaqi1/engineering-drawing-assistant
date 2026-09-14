// 账号唯一性自测：同一 openid 反复登录 / 反复修改资料，是否始终只有一条记录并只保留最后一次信息。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');

// 用桩替换 AI 模块，避免加载 LLM 依赖链
const convPath = require.resolve(repoPath('cloudfunctions/api/ai/conversation.js'));
require.cache[convPath] = { id: convPath, filename: convPath, loaded: true, exports: { ensureCollections: async () => {}, answerQuestion: async () => ({ ok: true, answer: 'stub' }) } };

const apiFn = require(repoPath('cloudfunctions/api/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function users() { return Array.from(table('users').values()); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };

(async () => {
  // T1 同一 openid 首次登录 → 建 1 条
  asOpenid('openid-same');
  const l1 = await apiFn.main({ action: 'login' });
  check('T1 首次登录创建 1 条账号', l1.ok === true && users().length === 1, JSON.stringify(users().length));
  check('T1b 初始没有学校/姓名/学号', !users()[0].school && !users()[0].name && !users()[0].student_id);

  // T2 反复登录多次 → 仍然 1 条（不新增）
  for (let i = 0; i < 3; i += 1) await apiFn.main({ action: 'login' });
  check('T2 反复登录仍是同一条（不会新增）', users().length === 1, JSON.stringify(users().length));

  // T3 反复修改资料（姓名/学号/学校各不同）→ 只有 1 条，且只保留最后一次
  const r1 = await apiFn.main({ action: 'register', school: 'A校', name: '张三', studentId: '1001' });
  const r2 = await apiFn.main({ action: 'register', school: 'B校', name: '张三丰', studentId: '1002' });
  const r3 = await apiFn.main({ action: 'register', school: 'C校', name: '张君宝', studentId: '1003' });
  const u = users();
  check('T3 三次修改资料后仍只有 1 条账号', r1.ok && r2.ok && r3.ok && u.length === 1, JSON.stringify(u.length));
  check('T3b 只保留最后一次的信息（C校/张君宝/1003）',
    u[0].school === 'C校' && u[0].name === '张君宝' && u[0].student_id === '1003',
    JSON.stringify({ school: u[0].school, name: u[0].name, student_id: u[0].student_id }));
  check('T3c 记录带有 updated_at（便于看最后修改时间）', !!u[0].updated_at, JSON.stringify(u[0].updated_at));
  check('T3d 旧值没有残留成历史记录（不存在 1002 那条账号）',
    !users().some((x) => x.student_id === '1002' || x.student_id === '1001'),
    JSON.stringify(users().map((x) => x.student_id)));

  // T4 另一台设备/另一个微信号（不同 openid）用不同资料 → 各自 1 条
  asOpenid('openid-other');
  await apiFn.main({ action: 'login' });
  await apiFn.main({ action: 'register', school: 'A校', name: '李四', studentId: '2001' });
  check('T4 不同微信号各自 1 条（共 2 条）', users().length === 2, JSON.stringify(users().map((x) => x.openid)));

  // T5 防冒用：另一个 openid 用「学号+姓名」与已存在的完全相同 → 被拒
  asOpenid('openid-third');
  await apiFn.main({ action: 'login' });
  const dup = await apiFn.main({ action: 'register', school: 'A校', name: '李四', studentId: '2001' });
  check('T5 同「学号+姓名」被其它微信号占用时被拒（防冒用）',
    dup.ok === false && dup.code === 'STUDENT_ID_TAKEN', JSON.stringify(dup.code));
  check('T5b 被拒后该 openid 仍是空资料（没有写入半条脏数据）',
    users().filter((x) => x.openid === 'openid-third').every((x) => !x.name && !x.student_id),
    JSON.stringify(users().filter((x) => x.openid === 'openid-third').map((x) => ({ n: x.name, s: x.student_id }))));

  // T6 自愈：历史遗留的同 openid 多条（并发登录可能留下）→ 登录时自动收敛为一条
  table('users').clear();
  table('users').set('D1', { _id: 'D1', openid: 'openid-dup', role: 'student', name: '', student_id: '', school: '', created_at: '2026-09-01T00:00:00.000Z', last_login_at: '2026-09-01T00:00:00.000Z' });
  table('users').set('D2', { _id: 'D2', openid: 'openid-dup', role: 'student', name: '王五', student_id: '3001', school: 'A校', profile_completed: true, created_at: '2026-09-05T00:00:00.000Z', updated_at: '2026-09-06T00:00:00.000Z', last_login_at: '2026-09-06T00:00:00.000Z' });
  asOpenid('openid-dup');
  const t6 = await apiFn.main({ action: 'login' });
  check('T6 重复 openid 自动收敛为一条', users().length === 1, JSON.stringify(users().map((x) => x._id)));
  check('T6b 保留的是"填过资料"的那条（不会误删有效资料）',
    t6.ok === true && t6.user && t6.user.student_id === '3001' && t6.user.name === '王五',
    JSON.stringify({ id: t6.user && t6.user._id, no: t6.user && t6.user.student_id }));

  // T7 两条都填过资料 → 保留 updated_at 最新的
  table('users').clear();
  table('users').set('E1', { _id: 'E1', openid: 'openid-dup2', role: 'student', name: '旧名', student_id: '4001', school: 'A校', profile_completed: true, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z' });
  table('users').set('E2', { _id: 'E2', openid: 'openid-dup2', role: 'student', name: '新名', student_id: '4002', school: 'B校', profile_completed: true, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-08T00:00:00.000Z' });
  asOpenid('openid-dup2');
  const t7 = await apiFn.main({ action: 'login' });
  check('T7 两条都有资料时保留最后更新的那条',
    users().length === 1 && t7.user && t7.user.student_id === '4002' && t7.user.name === '新名',
    JSON.stringify({ left: users().map((x) => x.student_id), got: t7.user && t7.user.student_id }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
