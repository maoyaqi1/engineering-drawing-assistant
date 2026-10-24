// AI 教师 V2.1「教学事件」自测（设计说明《AI教师 V2.1 设计说明》§19 Step 1–4、§20 测试 A–E）。
//
// 覆盖：
//   A 有视频：ai.ask 推荐视频 → ai_teaching_events 写入 video_recommend（关联键与字段齐全）
//   B 打开视频：ai.teaching_event video_open → 写入 video_open（含打开位置）
//   C 完整观看：ai.teaching_event video_complete → 写入 video_complete（含位置与时长）
//   D 没有视频：不写 video_recommend，也不会出现 video_open / video_complete；
//               客户端不能伪造 video_recommend，缺 video_id 被拒
//   E 追问："我还是不懂"仍继承知识点，事件采集不影响既有追问机制
//   F 边界：非在册学生被拒；ai_messages 结构未变；教学事件不落 learning_records
// 运行：node scripts/offline/run-teaching-events.cjs（scripts/run-all.js 会自动收录）
//
// 说明：LLM 与千问检索引擎用桩替换（离线不联网），其余全部是仓库里的真实代码：
//       api 云函数入口 / ai/conversation.js / ai/teaching-events.js / ai/knowledge.js。
// 边界：内存桩 + 内存库，不连云端；不替代部署后在真机与真实数据库上的验证
//       （未部署不算验证，AGENTS.md C11）。
const {
  repoPath,
  sdk,
  table,
  seed,
  rows,
  createReporter
} = require('./test-context.cjs');
const { results, check, printSummary } = createReporter();

// ---- 在 require 云函数之前替换三个外部依赖（LLM / 提示词 / 千问检索服务）----
function stubModule(relativePath, exports) {
  const file = require.resolve(repoPath(relativePath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

stubModule('cloudfunctions/api/ai/llm.js', {
  chatCompletion: async () => ({ content: 'stub 回答', model: 'deepseek-chat', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } }),
  visionChatCompletion: async () => ({ content: 'stub 视觉回答', model: 'qwen-vl-plus', usage: {} })
});
stubModule('cloudfunctions/api/ai/prompt.js', {
  buildPrompt: () => [{ role: 'system', content: 'stub' }],
  buildImageMessages: () => [{ role: 'system', content: 'stub' }],
  generateTitle: (text) => String(text || '新对话').slice(0, 20)
});
// 千问侧检索：由用例逐次设定（有视频 / 无视频）
let serviceReply = null;
stubModule('cloudfunctions/api/ai/teacher-service.js', {
  askTeacherService: async () => serviceReply
});

// 云函数在"推视频/不推视频"时会写一行 console.warn 诊断日志。本用例断言的是事件表内容，
// 这里临时静音，避免诊断日志盖住用例汇总行；诊断本身不在本用例的覆盖范围内。
const realWarn = console.warn;
console.warn = () => {};

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function eventsOf(openid, eventType) {
  return rows('ai_teaching_events').filter((row) => row.openid === openid && row.event_type === eventType);
}

const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);
const teacherCall = (payload) => teacherFn.main(Object.assign({ token: 'tok-1' }, payload));

// 服务侧返回的视频引用（契约 §3 字段）
const VIDEO_REF = {
  video_id: 'xt_G04_018',
  video_title: '4求两交叉直线的公垂线',
  kp_title: '平面的投影',
  start: 12,
  end: 452,
  time_label: '00:12 - 07:32',
  score: 0.71
};
const VIDEO_ASK = { content: '服务侧回答', model: 'qwen-turbo', usage: {}, videoRefs: [VIDEO_REF], sources: [] };
const NO_VIDEO_ASK = { content: '服务侧回答', model: 'qwen-turbo', usage: {}, videoRefs: [], sources: [] };

const nowIso = new Date().toISOString();
seed('teachers', [{ _id: 'T1', username: 't1', name: '任课教师', role: 'teacher', status: 'active', created_at: nowIso }]);
seed('teacher_sessions', [{ _id: 's1', token: 'tok-1', teacher_id: 'T1', expires_at: Date.now() + 86400000 }]);

(async () => {
  // 前置：建活动班级 + 把学生录入名册（AI 提问与教学事件都要在册学生）
  const cls = await teacherCall({ action: 'class.create', name: '教学事件测试班', school: '安徽建筑大学' });
  const classId = cls && cls.class && cls.class.id;
  await teacherCall({ action: 'student.create', school: '安徽建筑大学', name: '张三', student_no: '880101', class_id: classId });

  asOpenid('o-v21');
  await api({ action: 'register', school: '安徽建筑大学', name: '张三', studentId: '880101' });
  const status = await api({ action: 'roster.status' });
  check('前置：该账号是在册学生', status.level === 'student', JSON.stringify({ level: status.level, reason: status.reason }));

  // ---------- A. 有视频：推荐事件 ----------
  serviceReply = VIDEO_ASK;
  const ask1 = await api({ action: 'ai.ask', message: '什么是平面？' });
  check('A1 有视频：正常回答并返回配套讲解标题与时间点（2026-10-09 起不再下发可播地址 file_id）',
    ask1.ok === true && ask1.video_refs.length === 1 && !!ask1.video_refs[0].video_title && !ask1.video_refs[0].file_id,
    JSON.stringify({ ok: ask1.ok, refs: (ask1.video_refs || []).length }));
  check('A2 知识点识别仍为 G04（未被事件采集影响）', ask1.knowledge_point === 'G04', String(ask1.knowledge_point));

  const recs = eventsOf('o-v21', 'video_recommend');
  check('A3 video_recommend 恰好 1 条', recs.length === 1, String(recs.length));
  const rec = recs[0] || {};
  check('A4 关联键齐全（openid/学号/对话/消息/视频/知识点）',
    rec.openid === 'o-v21' && rec.student_id === '880101' && rec.conversation_id === ask1.conversation_id
      && rec.message_id === ask1.message_id && rec.video_id === VIDEO_REF.video_id && rec.knowledge_point_id === 'G04',
    JSON.stringify({ student_id: rec.student_id, conv: rec.conversation_id, msg: rec.message_id, video: rec.video_id, kp: rec.knowledge_point_id }));
  check('A5 知识点名称由服务端按 id 补齐', rec.knowledge_point_name === '平面的投影', String(rec.knowledge_point_name));
  check('A6 推荐分数与片段区间入表',
    rec.recommend_score === 0.71 && !!rec.metadata && rec.metadata.start === 12 && rec.metadata.end === 452,
    JSON.stringify({ score: rec.recommend_score, metadata: rec.metadata }));
  check('A7 teaching_type 第一版留空（不臆断教学策略）', rec.teaching_type === '', JSON.stringify(rec.teaching_type));
  check('A8 created_at 为 ISO 时间', /^\d{4}-\d{2}-\d{2}T/.test(String(rec.created_at)), String(rec.created_at));
  check('A9 推荐事件不写 video_position（推荐时还没有播放）', rec.video_position === null, JSON.stringify(rec.video_position));

  // ---------- B. 打开视频 ----------
  const openRes = await api({
    action: 'ai.teaching_event',
    event_type: 'video_open',
    video_id: VIDEO_REF.video_id,
    video_title: VIDEO_REF.video_title,
    conversation_id: ask1.conversation_id,
    message_id: ask1.message_id,
    knowledge_point_id: 'G04',
    video_position: 12
  });
  check('B1 video_open 上报成功', openRes.ok === true && !!openRes.event_id, JSON.stringify(openRes));
  const opens = eventsOf('o-v21', 'video_open');
  check('B2 写入 video_open 并关联对话与消息',
    opens.length === 1 && opens[0].conversation_id === ask1.conversation_id
      && opens[0].message_id === ask1.message_id && opens[0].video_id === VIDEO_REF.video_id,
    JSON.stringify(opens[0] && { conv: opens[0].conversation_id, msg: opens[0].message_id }));
  check('B3 打开位置写入 video_position', opens.length === 1 && opens[0].video_position === 12,
    JSON.stringify(opens[0] && opens[0].video_position));

  // ---------- C. 完整观看 ----------
  const doneRes = await api({
    action: 'ai.teaching_event',
    event_type: 'video_complete',
    video_id: VIDEO_REF.video_id,
    conversation_id: ask1.conversation_id,
    message_id: ask1.message_id,
    video_position: 452.4,
    duration: 452.4
  });
  check('C1 video_complete 上报成功', doneRes.ok === true && !!doneRes.event_id, JSON.stringify(doneRes));
  const dones = eventsOf('o-v21', 'video_complete');
  check('C2 完成事件带位置与时长',
    dones.length === 1 && dones[0].video_position === 452.4 && dones[0].duration === 452.4,
    JSON.stringify(dones[0] && { position: dones[0].video_position, duration: dones[0].duration }));

  // ---------- D. 没有视频 / 伪造事件 ----------
  const forged = await api({ action: 'ai.teaching_event', event_type: 'video_recommend', video_id: VIDEO_REF.video_id });
  check('D1 客户端不能伪造 video_recommend', forged.ok === false && forged.code === 'INVALID_EVENT_TYPE', JSON.stringify(forged));
  const noVideoId = await api({ action: 'ai.teaching_event', event_type: 'video_open' });
  check('D2 缺 video_id 被拒', noVideoId.ok === false && noVideoId.code === 'MISSING_VIDEO_ID', JSON.stringify(noVideoId));

  const eventsBefore = rows('ai_teaching_events').length;
  serviceReply = NO_VIDEO_ASK;
  // 与前端一致：同一段对话要带上 conversation_id（pages/ai/ai.js 的 this.data.conversationId）
  const ask2 = await api({ action: 'ai.ask', message: '圆柱的三视图怎么画？', conversation_id: ask1.conversation_id });
  check('D3 无视频时正常回答且不下发 video_refs',
    ask2.ok === true && Array.isArray(ask2.video_refs) && ask2.video_refs.length === 0,
    JSON.stringify({ ok: ask2.ok, refs: (ask2.video_refs || []).length }));
  check('D4 无视频时不写任何教学事件', rows('ai_teaching_events').length === eventsBefore,
    rows('ai_teaching_events').length + ' / ' + eventsBefore);
  check('D5 无视频不产生 video_open / video_complete',
    eventsOf('o-v21', 'video_open').length === 1 && eventsOf('o-v21', 'video_complete').length === 1,
    JSON.stringify({ open: eventsOf('o-v21', 'video_open').length, complete: eventsOf('o-v21', 'video_complete').length }));

  // ---------- E. 追问：既有机制不受影响 ----------
  // 单独开一段对话来问追问，避免与 D 段（同一对话里换了知识点）混淆：
  // 追问上下文来自 conversation.knowledge_point（对话创建时的知识点），这是既有实现。
  serviceReply = VIDEO_ASK;
  const ask3 = await api({ action: 'ai.ask', message: '什么是平面？' });
  const followUp = await api({ action: 'ai.ask', message: '我还是不懂', conversation_id: ask3.conversation_id });
  check('E1 追问仍继承原知识点（G04）',
    followUp.ok === true && followUp.knowledge_point === 'G04' && followUp.knowledge_point === ask3.knowledge_point,
    JSON.stringify({ first: ask3.knowledge_point, followUp: followUp.knowledge_point }));
  check('E2 追问仍落在同一段对话（会话上下文连续）', followUp.conversation_id === ask3.conversation_id,
    JSON.stringify({ first: ask3.conversation_id, followUp: followUp.conversation_id }));
  const recsAfter = eventsOf('o-v21', 'video_recommend');
  const followUpRecs = recsAfter.filter((row) => row.message_id === followUp.message_id);
  // 目前共 3 条推荐：A 段 1 条 + E 段（首问 + 追问）2 条
  check('E3 追问这一轮的推荐也照常入表',
    recsAfter.length === 3 && followUpRecs.length === 1
      && followUpRecs[0].knowledge_point_id === 'G04'
      && followUpRecs[0].conversation_id === followUp.conversation_id,
    JSON.stringify({ total: recsAfter.length, kp: followUpRecs[0] && followUpRecs[0].knowledge_point_id }));

  // ---------- F. 边界 ----------
  asOpenid('o-outsider');
  await api({ action: 'register', school: '安徽建筑大学', name: '路人甲', studentId: '999999' });
  const denied = await api({ action: 'ai.teaching_event', event_type: 'video_open', video_id: VIDEO_REF.video_id });
  check('F1 非在册学生上报被拒', denied.ok === false && denied.code === 'NOT_IN_ROSTER', JSON.stringify(denied));

  const allowedMessageKeys = ['conversation_id', 'role', 'content', 'knowledge_point', 'created_at',
    'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'feedback_rating', 'feedback_reason'];
  const messageKeys = new Set();
  rows('ai_messages').forEach((row) => Object.keys(row).forEach((key) => { if (key !== '_id') messageKeys.add(key); }));
  const unexpectedKeys = Array.from(messageKeys).filter((key) => allowedMessageKeys.indexOf(key) < 0);
  check('F2 ai_messages 结构未变（无新增字段）', unexpectedKeys.length === 0, unexpectedKeys.join(','));

  const leaked = rows('learning_records').filter((row) => /^video_/.test(String(row.event_type || '')));
  check('F3 教学事件未写进 learning_records', leaked.length === 0, String(leaked.length));
  check('F4 集合 ai_teaching_events 已建立', sdk.__store.has('ai_teaching_events'), 'ai_teaching_events');

  // ---------- 输出 ----------
  console.warn = realWarn;
  process.exitCode = printSummary({ separator: false, compactDetail: true }) ? 1 : 0;
})().catch((e) => {
  console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
