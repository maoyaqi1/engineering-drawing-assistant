// AI 外部检索请求的隐私与返回约束自测。
//
// 覆盖：
//   1. 发往课程检索服务的请求不包含历史对话、openid、姓名或学号；
//   2. 即使调用方传入 history，也不会透传给外部服务；
//   3. video_refs 按 score 降序，最多保留 3 条。
process.env.QWEN_TEACHER_BASE_URL = 'https://example.invalid';
process.env.QWEN_TEACHER_TOKEN = 'offline-test-token';

const { EventEmitter } = require('events');
const https = require('https');
const { createReporter } = require('./test-context.cjs');
const { check, printSummary } = createReporter();

let sentBody = null;
https.request = (options, callback) => {
  const req = new EventEmitter();
  req.write = (payload) => {
    sentBody = JSON.parse(Buffer.from(payload).toString('utf8'));
  };
  req.end = () => {
    const res = new EventEmitter();
    res.statusCode = 200;
    process.nextTick(() => {
      res.emit('data', Buffer.from(JSON.stringify({
        matched: true,
        answer: '测试回答',
        model: 'qwen-turbo',
        sources: [],
        video_refs: [
          { video_id: 'video-low', start: 1, score: 0.2 },
          { video_id: 'video-top', start: 2, score: 0.9 },
          { video_id: 'video-mid', start: 3, score: 0.55 },
          { video_id: 'video-second', start: 4, score: 0.8 }
        ]
      })));
      res.emit('end');
    });
    callback(res);
  };
  req.destroy = () => {};
  return req;
};

const { askTeacherService } = require('../../cloudfunctions/api/ai/teacher-service.js');

(async () => {
  const result = await askTeacherService({
    question: '相贯线怎么画',
    conversationId: 'conversation-test',
    knowledgePoint: 'G15',
    history: [{ role: 'user', content: '这条历史不得外发' }]
  });

  check('P1 外部检索请求已生成', !!sentBody);
  check('P2 不发送 history 字段', !!sentBody && !Object.prototype.hasOwnProperty.call(sentBody, 'history'));
  check('P3 不发送用户身份字段',
    !!sentBody && !['openid', 'student_id', 'student_no', 'name'].some((key) => Object.prototype.hasOwnProperty.call(sentBody, key)));
  check('P4 视频按相关度降序且最多 3 条',
    !!result && result.videoRefs.map((item) => item.video_id).join(',') === 'video-top,video-second,video-mid',
    JSON.stringify(result && result.videoRefs));

  process.exitCode = printSummary() ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
