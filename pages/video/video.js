// 课程讲解播放页：从 AI 教师回答里的"配套讲解"卡片进入，定位到片段起点播放。
//
// 播放入口由服务端开关控制（云函数环境变量 VIDEO_PLAYBACK）：关掉时不下发 file_id，
// 前端不会跳到这里（契约 §4）。
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
    this.setData({
      src,
      start,
      title,
      label: decodeURIComponent((options && options.label) || '')
    });
    wx.setNavigationBarTitle({ title });
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
