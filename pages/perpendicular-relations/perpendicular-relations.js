// 线面、面面垂直 · 静态图文知识点页。
//
// 页面只负责两张教学参考图和视频号入口。
const api = require('../../utils/api.js');
const videoRefs = require('./perpendicular-relations-video.js');

Page({
  data: {
    videoRefs
  },

  onLoad() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this._pageVisible = false;
    this._sessionRunning = false;
    this._sessionEnded = false;
    this._interactionCount = 0;
  },

  onShow() {
    this.startLearningSession();
  },

  onHide() {
    this.endLearningSession();
  },

  onUnload() {
    this.endLearningSession();
  },

  onShareAppMessage() {
    return {
      title: '线面、面面垂直的几何条件',
      path: '/pages/perpendicular-relations/perpendicular-relations'
    };
  },

  handleVideoTap(event) {
    const videoKey = event.currentTarget.dataset.videoKey;
    const video = this.data.videoRefs && this.data.videoRefs[videoKey];
    if (!video) return;
    this.recordInteraction();
    if (!video.finderUserName || !video.feedId) {
      wx.showToast({ title: '视频号内容待配置', icon: 'none' });
      return;
    }
    if (typeof wx.openChannelsActivity !== 'function') {
      wx.showToast({ title: '当前微信版本不支持视频号', icon: 'none' });
      return;
    }
    wx.openChannelsActivity({
      finderUserName: video.finderUserName,
      feedId: video.feedId,
      fail: () => {
        wx.showToast({ title: '视频打开失败，请稍后重试', icon: 'none' });
      }
    });
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  startLearningSession() {
    const app = getApp();
    if (this._sessionRunning || !app || !app.globalData || !app.globalData.user) {
      return;
    }
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._pageVisible = true;
    this._sessionStartPending = true;
    this._sessionCycle = (this._sessionCycle || 0) + 1;
    this._sessionStart = Date.now();
    const sessionCycle = this._sessionCycle;
    api.startSession('perpendicular-relations').then((res) => {
      const sessionId = res && res.ok ? res.session_id : '';
      if (sessionCycle !== this._sessionCycle) {
        if (sessionId) api.endSession(sessionId, 0, 0);
        return;
      }
      this._sessionStartPending = false;
      if (!sessionId) {
        this._sessionRunning = false;
        return;
      }
      if (!this._pageVisible || this._sessionEnded) {
        api.endSession(sessionId, 0, 0);
        this._sessionRunning = false;
        return;
      }
      this._sessionId = sessionId;
      api.recordEvent('chapter_enter', {
        session_id: this._sessionId,
        chapter_id: 'perpendicular-relations',
        chapter_name: '线面、面面垂直',
        page: 'perpendicular-relations',
        knowledge_point_id: 'G08',
        metadata: { content_mode: 'static' }
      });
    }).catch(() => {
      if (sessionCycle === this._sessionCycle) {
        this._sessionStartPending = false;
        this._sessionRunning = false;
      }
    });
  },

  endLearningSession() {
    this._pageVisible = false;
    if (this._sessionEnded || !this._sessionRunning) return;
    this._sessionEnded = true;
    this._sessionRunning = false;
    if (!this._sessionId) return;
    const duration = Math.max(
      0,
      Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000)
    );
    api.recordEvent('chapter_exit', {
      session_id: this._sessionId,
      chapter_id: 'perpendicular-relations',
      chapter_name: '线面、面面垂直',
      page: 'perpendicular-relations',
      knowledge_point_id: 'G08',
      duration,
      metadata: {
        content_mode: 'static',
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  }
});
