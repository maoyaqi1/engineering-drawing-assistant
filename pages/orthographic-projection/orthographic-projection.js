// 正投影 · 正投影的基本性质互动页。
//
// 页面只维护当前关系、小段投影动画和学习会话状态；几何真值全部由
// orthographic-projection-model.js 计算，Canvas 绘制集中在 render 模块。
const api = require('../../utils/api.js');
const model = require('./orthographic-projection-model.js');
const renderer = require('./orthographic-projection-render.js');

const STAGE_SELECTORS = Object.freeze([
  { key: 'relation', selector: '#relationCanvas' }
]);

function createRelationDisplay(relationKey) {
  const scene = model.createRelationScene(relationKey);
  const definition = scene.definition;
  const lineMetrics = scene.line.metrics;
  const planeMetrics = scene.plane.metrics;
  return {
    relationKey: definition.key,
    relationProperty: definition.property,
    relationCondition: definition.condition,
    relationCaption: definition.caption,
    relationLineType: definition.lineType,
    relationPlaneType: definition.planeType,
    relationLineResult: definition.lineResult,
    relationPlaneResult: definition.planeResult,
    relationBridgeTitle: definition.bridgeTitle,
    relationBridge: definition.bridge,
    lineMeasure: `EF ${lineMetrics.trueLength.toFixed(2)} → ef ${lineMetrics.projectedLength.toFixed(2)}`,
    planeMeasure: planeMetrics.isProjectionCollinear
      ? `S△ABC ${planeMetrics.trueArea.toFixed(2)} → 积聚线`
      : `S△ABC ${planeMetrics.trueArea.toFixed(2)} → S△abc ${planeMetrics.projectedArea.toFixed(2)}`
  };
}

Page({
  data: {
    relationOptions: model.RELATION_OPTIONS,
    ...createRelationDisplay('parallel')
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
    this._relationProgress = 0;
    this._animationToken = 0;
    this._canvasInitToken = 0;
    this._drawScheduled = false;
    this._dirtyStages = new Set();
    this._canvasStages = {};
    this._didInitialPlay = false;
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
    this.stopAllAnimations();
    this.endLearningSession();
  },

  onUnload() {
    this._isUnloaded = true;
    this.stopAllAnimations();
    this.endLearningSession();
    this._canvasInitToken += 1;
    this._canvasStages = {};
    if (this._dirtyStages) this._dirtyStages.clear();
  },

  initializeCanvases() {
    if (this._isUnloaded || typeof this.createSelectorQuery !== 'function') return;
    const initToken = ++this._canvasInitToken;
    const query = this.createSelectorQuery();
    STAGE_SELECTORS.forEach((item) => {
      query.select(item.selector).fields({ node: true, size: true });
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
      STAGE_SELECTORS.forEach((item, index) => {
        const info = results && results[index];
        if (!info || !info.node || !info.width || !info.height) return;
        const canvas = info.node;
        const context = canvas.getContext('2d');
        canvas.width = Math.round(info.width * pixelRatio);
        canvas.height = Math.round(info.height * pixelRatio);
        context.scale(pixelRatio, pixelRatio);
        this._canvasStages[item.key] = {
          canvas,
          context,
          width: info.width,
          height: info.height
        };
      });
      Object.keys(this._canvasStages).forEach((stageKey) => {
        this.drawStage(stageKey);
      });
      if (!this._didInitialPlay) {
        this._didInitialPlay = true;
        this.animateRelation(0, 1, 1500);
      }
    });
  },

  getStageState(stageKey) {
    if (stageKey !== 'relation') return {};
    return {
      relationKey: this.data.relationKey,
      progress: model.clamp(this._relationProgress, 0, 1)
    };
  },

  drawStage(stageKey) {
    const stage = this._canvasStages && this._canvasStages[stageKey];
    if (!stage) return;
    renderer.drawStage(
      stage.context,
      stage.width,
      stage.height,
      stageKey,
      this.getStageState(stageKey)
    );
  },

  scheduleStageDraw(stageKey) {
    this._dirtyStages.add(stageKey);
    if (this._drawScheduled) return;
    this._drawScheduled = true;
    const stage = this._canvasStages && this._canvasStages[stageKey];
    const run = () => {
      this._drawScheduled = false;
      const dirty = Array.from(this._dirtyStages);
      this._dirtyStages.clear();
      dirty.forEach((key) => this.drawStage(key));
    };
    if (stage && stage.canvas && stage.canvas.requestAnimationFrame) {
      stage.canvas.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  },

  requestFrame(callback) {
    const stage = this._canvasStages && this._canvasStages.relation;
    if (stage && stage.canvas && stage.canvas.requestAnimationFrame) {
      return stage.canvas.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16);
  },

  stopAllAnimations() {
    this._animationToken = (this._animationToken || 0) + 1;
  },

  animateRelation(from, to, duration) {
    this.stopAllAnimations();
    const token = this._animationToken;
    const start = Date.now();
    const min = Math.min(from, to);
    const span = Math.abs(to - from);
    const step = () => {
      if (this._isUnloaded || token !== this._animationToken) return;
      const elapsed = Math.min(1, (Date.now() - start) / duration);
      const eased = model.easeInOut ? model.easeInOut(elapsed) : elapsed;
      this._relationProgress = min + span * eased;
      this.scheduleStageDraw('relation');
      if (elapsed < 1) {
        this.requestFrame(step);
        return;
      }
      this._relationProgress = to;
      this.scheduleStageDraw('relation');
    };
    step();
  },

  selectRelation(event) {
    const relationKey = event.currentTarget.dataset.relation;
    if (!model.RELATION_DEFINITIONS[relationKey]
      || relationKey === this.data.relationKey) return;
    this.recordInteraction();
    this.stopAllAnimations();
    this._relationProgress = 0;
    this.setData(createRelationDisplay(relationKey), () => {
      this.scheduleStageDraw('relation');
      this.animateRelation(0, 1, 1200);
    });
  },

  handleReplay() {
    this.recordInteraction();
    this.stopAllAnimations();
    this._relationProgress = 0;
    this.scheduleStageDraw('relation');
    this.animateRelation(0, 1, 1200);
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  startLearningSession() {
    const app = getApp();
    if (this._sessionRunning || !app || !app.globalData || !app.globalData.user) return;
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._pageVisible = true;
    this._sessionStartPending = true;
    this._sessionCycle = (this._sessionCycle || 0) + 1;
    this._sessionStart = Date.now();
    const sessionCycle = this._sessionCycle;
    api.startSession('orthographic-projection').then((res) => {
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
        session_id: this._sessionId || '',
        chapter_id: 'orthographic-projection',
        chapter_name: '正投影',
        page: 'orthographic-projection',
        knowledge_point_id: 'G01',
        metadata: { section: 'relations' }
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
      session_id: this._sessionId || '',
      chapter_id: 'orthographic-projection',
      chapter_name: '正投影',
      page: 'orthographic-projection',
      knowledge_point_id: 'G01',
      duration,
      metadata: {
        relation_key: this.data.relationKey,
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  }
});
