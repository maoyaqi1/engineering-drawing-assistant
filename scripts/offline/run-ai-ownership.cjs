// AI 对话与反馈的资源归属自测。
//
// 覆盖：
//   1. B 不能使用 A 的 conversation_id 续问，且拒绝前不读取历史、不调用模型、不写消息；
//   2. B 不能评价 A 的消息；
//   3. 只有助手消息可以评价；
//   4. A 本人续问、查看详情和评价仍然正常。
//
// 说明：LLM、Prompt 和检索服务使用桩；对话、消息归属与 feedback 写入使用真实模块。
const {
  repoPath,
  table,
  seed,
  size,
  createReporter
} = require('./test-context.cjs');
const { check, printSummary } = createReporter();

function stubModule(relativePath, exports) {
  const file = require.resolve(repoPath(relativePath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const modelInputs = [];
stubModule('cloudfunctions/api/ai/llm.js', {
  chatCompletion: async ({ messages }) => {
    modelInputs.push(messages);
    return { content: 'stub 回答', model: 'deepseek-chat', usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } };
  },
  visionChatCompletion: async () => ({ content: 'stub 视觉回答', model: 'qwen-vl-plus', usage: {} })
});
stubModule('cloudfunctions/api/ai/prompt.js', {
  buildPrompt: () => [{ role: 'system', content: 'stub' }],
  buildImageMessages: () => [{ role: 'system', content: 'stub' }],
  generateTitle: (text) => String(text || '新对话').slice(0, 20)
});
stubModule('cloudfunctions/api/ai/teacher-service.js', {
  askTeacherService: async () => null
});

const apiFn = require(repoPath('cloudfunctions/api/index.js'));
const asOpenid = (openid) => { global.__CURRENT_OPENID = openid; };
const api = (payload) => apiFn.main(payload);

const nowIso = new Date().toISOString();
seed('classes', [{ _id: 'C1', name: '边界测试班', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T1' }]);
seed('students', [
  { _id: 'S-A', student_no: '910001', name: '甲同学', class_id: 'C1', class_name: '边界测试班', owner_teacher_id: 'T1' },
  { _id: 'S-B', student_no: '910002', name: '乙同学', class_id: 'C1', class_name: '边界测试班', owner_teacher_id: 'T1' }
]);
seed('users', [
  {
    _id: 'U-A', openid: 'openid-a', role: 'student', status: 'active', profile_completed: true,
    school: '安徽建筑大学', name: '甲同学', student_id: '910001', created_at: nowIso, last_login_at: nowIso
  },
  {
    _id: 'U-B', openid: 'openid-b', role: 'student', status: 'active', profile_completed: true,
    school: '安徽建筑大学', name: '乙同学', student_id: '910002', created_at: nowIso, last_login_at: nowIso
  }
]);

(async () => {
  asOpenid('openid-a');
  const first = await api({ action: 'ai.ask', message: '什么是截交线？' });
  check('A0 A 本人首次提问成功', first.ok === true && !!first.conversation_id && !!first.message_id,
    JSON.stringify({ ok: first.ok, conversation: first.conversation_id, message: first.message_id }));

  const conversationId = first.conversation_id;
  const assistantMessageId = first.message_id;
  const userMessageId = first.user_message_id;
  const messageCountBefore = size('ai_messages');
  const modelCallsBefore = modelInputs.length;

  asOpenid('openid-b');
  const crossAsk = await api({ action: 'ai.ask', message: '继续回答我', conversation_id: conversationId });
  check('A1 B 使用 A 的对话 ID 续问被拒绝', crossAsk.ok === false && crossAsk.code === 'CONVERSATION_NOT_FOUND',
    JSON.stringify(crossAsk));
  check('A2 跨账号拒绝发生在模型调用和历史写入之前',
    modelInputs.length === modelCallsBefore && size('ai_messages') === messageCountBefore,
    JSON.stringify({ modelCalls: modelInputs.length, messages: size('ai_messages') }));

  const crossFeedback = await api({ action: 'ai.feedback', message_id: assistantMessageId, rating: 'positive' });
  check('A3 B 不能评价 A 的助手消息',
    crossFeedback.ok === false && crossFeedback.code === 'MESSAGE_NOT_FOUND', JSON.stringify(crossFeedback));
  const assistantBefore = table('ai_messages').get(assistantMessageId);
  check('A4 跨账号反馈失败后消息未被修改',
    !assistantBefore.feedback_rating && !assistantBefore.feedback_reason,
    JSON.stringify({ rating: assistantBefore.feedback_rating, reason: assistantBefore.feedback_reason }));

  const crossDetail = await api({ action: 'ai.detail', conversation_id: conversationId });
  check('A5 B 查看 A 的对话详情仍返回通用 NOT_FOUND',
    crossDetail.ok === false && crossDetail.code === 'NOT_FOUND', JSON.stringify(crossDetail));

  asOpenid('openid-a');
  const ownFollowUp = await api({ action: 'ai.ask', message: '请再说一个例子', conversation_id: conversationId });
  check('A6 A 本人续问正常且上下文继续落在同一对话',
    ownFollowUp.ok === true && ownFollowUp.conversation_id === conversationId, JSON.stringify(ownFollowUp));

  const ownDetail = await api({ action: 'ai.detail', conversation_id: conversationId });
  check('A7 A 本人查看详情正常', ownDetail.ok === true && ownDetail.conversation.messages.length >= 4,
    JSON.stringify({ ok: ownDetail.ok, count: ownDetail.conversation && ownDetail.conversation.messages.length }));

  const ownFeedback = await api({ action: 'ai.feedback', message_id: assistantMessageId, rating: 'positive' });
  check('A8 A 本人评价助手消息正常', ownFeedback.ok === true, JSON.stringify(ownFeedback));

  const userFeedback = await api({ action: 'ai.feedback', message_id: userMessageId, rating: 'positive' });
  check('A9 用户消息不允许评价', userFeedback.ok === false && userFeedback.code === 'MESSAGE_NOT_FEEDBACKABLE',
    JSON.stringify(userFeedback));
  const userMessage = table('ai_messages').get(userMessageId);
  check('A10 非法角色反馈不产生写入', !userMessage.feedback_rating, JSON.stringify(userMessage.feedback_rating));

  const imageAsk = await api({ action: 'ai.ask', message: '', image_base64: 'A'.repeat(80) });
  const imageUserMessage = Array.from(table('ai_messages').values())
    .filter((message) => message.conversation_id === imageAsk.conversation_id && message.role === 'user')
    .pop();
  check('A11 图片提问正常，但 ai_messages 不新增 has_image 字段',
    imageAsk.ok === true && imageUserMessage && !Object.prototype.hasOwnProperty.call(imageUserMessage, 'has_image'),
    JSON.stringify({ ok: imageAsk.ok, keys: imageUserMessage && Object.keys(imageUserMessage) }));

  process.exitCode = printSummary({ separator: false, compactDetail: true }) ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
