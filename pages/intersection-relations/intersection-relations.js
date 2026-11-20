// 线面、面面相交 · 概念概览页。
//
// 页面负责概念导览和入口跳转；具体线面求交作图继续复用
// pages/line-plane-relation/line-plane-relation。
const api = require('../../utils/api.js');

Page({
  data: {},

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
      title: '线面、面面相交的概念与求法',
      path: '/pages/intersection-relations/intersection-relations'
    };
  },

  openLinePlane() {
    this.recordInteraction();
    wx.navigateTo({
      url: '/pages/line-plane-relation/line-plane-relation',
      fail: () => {
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
      }
    });
  },

  openPlanePlane() {
    this.recordInteraction();
    wx.navigateTo({
      url: '/pages/plane-plane-relation/plane-plane-relation',
      fail: () => {
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
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
    api.startSession('intersection-relations').then((res) => {
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
        chapter_id: 'intersection-relations',
        chapter_name: '线面、面面相交',
        page: 'intersection-relations',
        knowledge_point_id: 'G08',
        metadata: { content_mode: 'concept' }
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
      chapter_id: 'intersection-relations',
      chapter_name: '线面、面面相交',
      page: 'intersection-relations',
      knowledge_point_id: 'G08',
      duration,
      metadata: {
        content_mode: 'concept',
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  }
});
