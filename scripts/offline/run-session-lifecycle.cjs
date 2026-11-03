// 学习会话结束接口的归属、校验与幂等自测。
//
// 覆盖：
//   1. B 不能结束 A 的会话；
//   2. 不存在的会话与非法数值返回明确错误；
//   3. 重复结束不会覆盖第一次确认的结果；
//   4. 正常结束会同步有效学习次数。
const {
  repoPath,
  table,
  seed,
  createReporter
} = require('./test-context.cjs');
const { check, printSummary } = createReporter();

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);

const nowIso = new Date().toISOString();
seed('users', [
  {
    _id: 'U-A', openid: 'openid-a', role: 'student', status: 'active', profile_completed: true,
    school: '安徽建筑大学', name: '甲同学', student_id: '920001', created_at: nowIso, last_login_at: nowIso
  },
  {
    _id: 'U-B', openid: 'openid-b', role: 'student', status: 'active', profile_completed: true,
    school: '安徽建筑大学', name: '乙同学', student_id: '920002', created_at: nowIso, last_login_at: nowIso
  }
]);

(async () => {
  asOpenid('openid-a');
  const start = await api({ action: 'session.start', module: 'point' });
  check('B0 A 开始学习会话', start.ok === true && !!start.session_id, JSON.stringify(start));

  const original = table('learning_sessions').get(start.session_id);
  const crossUserBefore = Object.assign({}, table('users').get('U-B'));
  asOpenid('openid-b');
  const crossEnd = await api({
    action: 'session.end', session_id: start.session_id, duration: 90, interaction_count: 5
  });
  check('B1 B 不能结束 A 的会话',
    crossEnd.ok === false && crossEnd.code === 'SESSION_NOT_FOUND', JSON.stringify(crossEnd));
  const afterCross = table('learning_sessions').get(start.session_id);
  check('B2 跨账号失败不产生写入',
    afterCross.end_time === original.end_time && afterCross.duration === original.duration
      && afterCross.interaction_count === original.interaction_count && afterCross.is_valid === original.is_valid,
    JSON.stringify(afterCross));
  check('B2b 跨账号失败也不更新请求者账号',
    JSON.stringify(table('users').get('U-B')) === JSON.stringify(crossUserBefore),
    JSON.stringify(table('users').get('U-B')));

  asOpenid('openid-a');
  const invalidDuration = await api({
    action: 'session.end', session_id: start.session_id, duration: -1, interaction_count: 1
  });
  check('B3 负数 duration 返回 INVALID_DURATION',
    invalidDuration.ok === false && invalidDuration.code === 'INVALID_DURATION', JSON.stringify(invalidDuration));

  const nonFiniteDuration = await api({
    action: 'session.end', session_id: start.session_id, duration: Infinity, interaction_count: 1
  });
  check('B3b 非有限 duration 返回 INVALID_DURATION',
    nonFiniteDuration.ok === false && nonFiniteDuration.code === 'INVALID_DURATION', JSON.stringify(nonFiniteDuration));

  const invalidInteraction = await api({
    action: 'session.end', session_id: start.session_id, duration: 10, interaction_count: 1.5
  });
  check('B4 非整数 interaction_count 返回 INVALID_INTERACTION_COUNT',
    invalidInteraction.ok === false && invalidInteraction.code === 'INVALID_INTERACTION_COUNT',
    JSON.stringify(invalidInteraction));

  const missing = await api({
    action: 'session.end', session_id: 'not-exists', duration: 10, interaction_count: 1
  });
  check('B5 不存在的会话返回通用 SESSION_NOT_FOUND',
    missing.ok === false && missing.code === 'SESSION_NOT_FOUND', JSON.stringify(missing));

  const firstEnd = await api({
    action: 'session.end', session_id: start.session_id, duration: 90, interaction_count: 5
  });
  check('B6 A 正常结束会话并判定有效',
    firstEnd.ok === true && firstEnd.is_valid === true && firstEnd.valid_session_count === 1,
    JSON.stringify(firstEnd));
  const confirmed = table('learning_sessions').get(start.session_id);

  const repeatedEnd = await api({
    action: 'session.end', session_id: start.session_id, duration: 999, interaction_count: 999
  });
  check('B7 重复结束返回原有确认结果且标记 already_ended',
    repeatedEnd.ok === true && repeatedEnd.already_ended === true && repeatedEnd.is_valid === true,
    JSON.stringify(repeatedEnd));
  const afterRepeat = table('learning_sessions').get(start.session_id);
  check('B8 重复结束不覆盖第一次确认的时间和数值',
    afterRepeat.end_time === confirmed.end_time && afterRepeat.duration === confirmed.duration
      && afterRepeat.interaction_count === confirmed.interaction_count && afterRepeat.is_valid === confirmed.is_valid,
    JSON.stringify(afterRepeat));

  const stats = await api({ action: 'statistics', mark_invite: false });
  check('B9 有效学习次数统计保持兼容',
    stats.ok === true && stats.valid_session_count === 1, JSON.stringify(stats));

  const concurrentStart = await api({ action: 'session.start', module: 'line' });
  const concurrentResults = await Promise.all([
    api({ action: 'session.end', session_id: concurrentStart.session_id, duration: 10, interaction_count: 3 }),
    api({ action: 'session.end', session_id: concurrentStart.session_id, duration: 20, interaction_count: 9 })
  ]);
  const concurrentRow = table('learning_sessions').get(concurrentStart.session_id);
  check('B10 并发结束只有一个首次提交，另一个返回已结束',
    concurrentResults.filter((result) => result.ok && result.already_ended === false).length === 1
      && concurrentResults.filter((result) => result.ok && result.already_ended === true).length === 1,
    JSON.stringify(concurrentResults));
  check('B11 并发结束不会混写两次请求的数值',
    (concurrentRow.duration === 10 && concurrentRow.interaction_count === 3)
      || (concurrentRow.duration === 20 && concurrentRow.interaction_count === 9),
    JSON.stringify(concurrentRow));

  process.exitCode = printSummary({ separator: false, compactDetail: true }) ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
