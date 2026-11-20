// 平面的表示方法 · 单页知识点。
//
// 六种表示方式共用同一一般位置平面；切换仅改变当前几何元素和教学说明。
// 几何真值位于 plane-representation-model.js，Canvas 绘制位于 render 模块。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const drawHelpers = require('../index/draw-helpers.js');
const renderScene = require('../index/render-scene.js');
const model = require('./plane-representation-model.js');
const renderMethods = require('./plane-representation-render.js');

function createModeDisplay(modeKey) {
  const definition = model.getModeDefinition(modeKey);
  return {
    selectedMode: definition.key,
    modeLabel: definition.label,
    modeSymbol: model.MODE_OPTIONS.find((item) => item.key === definition.key).symbol,
    ruleTitle: definition.ruleTitle,
    rule: definition.rule,
    projectionNote: definition.projectionNote
  };
}

const pageDefinition = Object.assign({
  data: Object.assign({
    modeOptions: model.MODE_OPTIONS
  }, createModeDisplay('threePoints')),

  onLoad() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this._sessionRunning = false;
    this._sessionEnded = false;
    this._interactionCount = 0;
  },

  onReady() {
    this.initializeCanvas();
  },

  onResize() {
    this.initializeCanvas();
  },

  onShow() {
    this.startLearningSession();
  },

  onHide() {
    this.endLearningSession();
  },

  onUnload() {
    this.endLearningSession();
    this.canvas = null;
    this.context = null;
  },

  onShareAppMessage() {
    return {
      title: '平面的表示方法 · 五种几何元素与迹线',
      path: '/pages/plane-representation/plane-representation'
    };
  },

  selectMode(event) {
    const modeKey = event.currentTarget.dataset.mode;
    const definition = model.MODE_DEFINITIONS[modeKey];
    if (!definition || modeKey === this.data.selectedMode) return;
    this.recordInteraction();
    this.setData(createModeDisplay(modeKey), () => this.scheduleCanvasDraw());
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  startLearningSession() {
    const app = getApp();
    if (this._sessionRunning
      || !app
      || !app.globalData
      || !app.globalData.user) {
      return;
    }
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._pageVisible = true;
    this._sessionStartPending = true;
    this._sessionCycle = (this._sessionCycle || 0) + 1;
    this._sessionStart = Date.now();
    const sessionCycle = this._sessionCycle;
    api.startSession('plane-representation').then((res) => {
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
        session_id: sessionId,
        chapter_id: 'plane-representation',
        chapter_name: '平面的表示方法',
        page: 'plane-representation',
        knowledge_point_id: 'plane-representation',
        metadata: {
          representation: this.data.selectedMode
        }
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
    if (this._sessionEnded) return;
    if (!this._sessionRunning) return;
    this._sessionEnded = true;
    this._sessionRunning = false;
    if (!this._sessionId) return;
    const duration = Math.max(
      0,
      Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000)
    );
    api.recordEvent('chapter_exit', {
      session_id: this._sessionId,
      chapter_id: 'plane-representation',
      chapter_name: '平面的表示方法',
      page: 'plane-representation',
      knowledge_point_id: 'plane-representation',
      duration,
      metadata: {
        representation: this.data.selectedMode,
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  }
}, projection, drawHelpers, renderScene, renderMethods);

Page(pageDefinition);
