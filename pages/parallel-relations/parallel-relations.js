// 线面、面面平行 · 静态图文知识点页。
//
// 页面只负责双 Canvas 初始化和视频号入口；平行条件由纯模型计算，
// Canvas 负责空间关系示意图。
const api = require('../../utils/api.js');
const model = require('./parallel-relations-model.js');
const renderer = require('./parallel-relations-render.js');
const videoRefs = require('./parallel-relations-video.js');

const CANVAS_STAGES = Object.freeze([
  { key: 'linePlane', selector: '#linePlaneCanvas' },
  { key: 'planePlane', selector: '#planePlaneCanvas' }
]);

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
    this._isUnloaded = false;
    this._pageVisible = false;
    this._sessionRunning = false;
    this._sessionEnded = false;
    this._interactionCount = 0;
    this._canvasInitToken = 0;
    this._canvasStages = {};
    this._scenes = {
      linePlane: model.buildLinePlaneScene(),
      planePlane: model.buildPlanePlaneScene()
    };
  },

  onReady() {
    this.initializeCanvases();
  },

  onResize() {
    this.initializeCanvases();
  },

  onShow() {
    this.startLearningSession();
  },

  onHide() {
    this.endLearningSession();
  },

  onUnload() {
    this._isUnloaded = true;
    this.endLearningSession();
    this._canvasInitToken += 1;
    this._canvasStages = {};
    this._scenes = null;
  },

  onShareAppMessage() {
    return {
      title: '线面、面面平行的几何条件',
      path: '/pages/parallel-relations/parallel-relations'
    };
  },

  initializeCanvases() {
    if (this._isUnloaded || typeof this.createSelectorQuery !== 'function') {
      return;
    }
    const initToken = ++this._canvasInitToken;
    const query = this.createSelectorQuery();
    CANVAS_STAGES.forEach((stage) => {
      query.select(stage.selector).fields({ node: true, size: true });
    });
    query.exec((results) => {
      if (this._isUnloaded || initToken !== this._canvasInitToken) return;
      const pixelRatio = Math.min(
        (wx.getWindowInfo && wx.getWindowInfo().pixelRatio)
          || (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio)
          || 1,
        3
      );
      this._canvasStages = {};
      CANVAS_STAGES.forEach((stage, index) => {
        const info = results && results[index];
        if (!info || !info.node || !info.width || !info.height) return;
        const canvas = info.node;
        const context = canvas.getContext('2d');
        canvas.width = Math.round(info.width * pixelRatio);
        canvas.height = Math.round(info.height * pixelRatio);
        context.scale(pixelRatio, pixelRatio);
        this._canvasStages[stage.key] = {
          canvas,
          context,
          width: info.width,
          height: info.height
        };
        this.drawStage(stage.key);
      });
    });
  },

  drawStage(stageKey) {
    const stage = this._canvasStages && this._canvasStages[stageKey];
    if (!stage || !this._scenes) return;
    if (stageKey === 'linePlane') {
      renderer.drawLinePlaneScene(
        stage.context,
        stage.width,
        stage.height,
        this._scenes.linePlane
      );
      return;
    }
    renderer.drawPlanePlaneScene(
      stage.context,
      stage.width,
      stage.height,
      this._scenes.planePlane
    );
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
    api.startSession('parallel-relations').then((res) => {
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
        chapter_id: 'parallel-relations',
        chapter_name: '线面、面面平行',
        page: 'parallel-relations',
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
      chapter_id: 'parallel-relations',
      chapter_name: '线面、面面平行',
      page: 'parallel-relations',
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
