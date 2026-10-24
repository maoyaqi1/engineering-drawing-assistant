// 课程讲解播放页：从 AI 教师回答里的"配套讲解"卡片进入，定位到片段起点播放。
//
// 播放入口由服务端开关控制（云函数环境变量 VIDEO_PLAYBACK）：关掉时不下发 file_id，
// 前端不会跳到这里（契约 §4）。
//
// V2.1：本页同时承担 AI 教学事件里"学生行为"的采集（设计说明 §7.2 / §7.3）——
//   · 进入本页 = 学生点击并打开了视频 → video_open（带片段起点）
//   · 播放到结束（播放器 ended）→ video_complete（带结束位置与媒体总时长）
// 事件只写 ai_teaching_events，不写 learning_records、不改 ai_messages 结构；
// 上报失败一律静默，埋点不得影响播放。
const api = require('../../utils/api.js');

Page({
  data: {
    src: '',
    title: '课程讲解',
    start: 0,
    label: '',
    failed: false
  },

  onLoad(options) {
    const src = decodeURIComponent((options && options.src) || '');
    const start = parseInt((options && options.start) || '0', 10) || 0;
    const title = decodeURIComponent((options && options.title) || '课程讲解');
    // 教学事件关联键：旧版 AI 页不带这些参数时全部为空，此时只播放、不上报
    this.track = {
      videoId: decodeURIComponent((options && options.video_id) || ''),
      conversationId: decodeURIComponent((options && options.conversation_id) || ''),
      messageId: decodeURIComponent((options && options.message_id) || ''),
      knowledgePointId: decodeURIComponent((options && options.knowledge_point_id) || ''),
      videoTitle: decodeURIComponent((options && options.title) || '')
    };
    // 播放位置/时长追踪（timeupdate 累积，ended 时一并上报）；
    // 放在实例属性上，避免高频 setData 触发重渲染。
    this.position = start;
    this.duration = 0;
    this.reported = {};
    this.setData({
      src,
      start,
      title,
      label: decodeURIComponent((options && options.label) || '')
    });
    wx.setNavigationBarTitle({ title });
    this.reportTeachingEvent('video_open', { video_position: start });
  },

  // 播放中：记录当前位置与媒体总时长（ended 时上报）
  onProgress(event) {
    const detail = (event && event.detail) || {};
    if (Number.isFinite(detail.currentTime)) this.position = detail.currentTime;
    if (Number.isFinite(detail.duration) && detail.duration > 0) this.duration = detail.duration;
  },

  // 播放到结束 = 系统认定的完成（§7.3：第一版直接采用播放器的"播放结束"事件）
  onEnded() {
    this.reportTeachingEvent('video_complete', {
      video_position: this.position,
      duration: this.duration
    });
  },

  // 上报一次教学事件：同一页面同一类型只上报一次；没有 video_id 时不上报。
  // 事件是旁路数据，失败不提示、不重试（不能因为埋点打断播放）。
  reportTeachingEvent(eventType, extra) {
    const track = this.track || {};
    if (!track.videoId) return;
    if (!this.reported) this.reported = {};
    if (this.reported[eventType]) return;
    this.reported[eventType] = true;
    api.aiTeachingEvent(eventType, Object.assign({
      video_id: track.videoId,
      video_title: track.videoTitle,
      conversation_id: track.conversationId,
      message_id: track.messageId,
      knowledge_point_id: track.knowledgePointId
    }, extra || {})).catch(() => null);
  },

  onError(event) {
    // 最常见原因是云存储里没有这个文件名（videoId 与实际上传的文件名不一致）
    console.error('课程讲解播放失败：', event && event.detail);
    this.setData({ failed: true });
    this.checkReadable();
  },

  // 自检：单独探测这个文件能不能读出来，用来区分两类完全不同的故障
  //   · 不可读 → 多为云存储权限（安全规则）不允许普通用户读取
  //   · 可读但播不动 → 视频格式/编码或网络问题
  // 只在开发者工具的 Console 里留痕，不向学生展示技术细节。
  checkReadable() {
    const src = this.data.src;
    if (!src || typeof wx === 'undefined' || !wx.cloud || !wx.cloud.getTempFileURL) return;
    wx.cloud.getTempFileURL({ fileList: [src] }).then((res) => {
      const item = (res && res.fileList && res.fileList[0]) || {};
      const ok = item.status === 0 && !!item.tempFileURL;
      console.log('云存储可读性自检：', ok ? '文件可读' : '文件不可读', item);
    }).catch((err) => {
      console.error('云存储可读性自检失败：', err);
    });
  },

  onUnload() {
    const ctx = wx.createVideoContext('courseVideo');
    if (ctx) ctx.pause();
  }
});
