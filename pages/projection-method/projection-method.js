// 投影法基础 · 独立交互式教学页。
//
// 页面只维护交互参数与动画进度；射线求交、投影结果和比例关系全部由
// projection-method-model.js 计算，Canvas 绘制集中在 projection-method-render.js。
const api = require('../../utils/api.js');
const model = require('./projection-method-model.js');
const renderer = require('./projection-method-render.js');

const METHOD_OPTIONS = Object.freeze([
  { key: 'center', label: '中心投影' },
  { key: 'parallel', label: '平行投影' }
]);

const PROPERTY_OPTIONS = Object.freeze([
  { key: 'invariance', title: '不变性' },
  { key: 'accumulation', title: '积聚性' },
  { key: 'incidence', title: '从属性' },
  { key: 'ratio', title: '等比性' }
]);

const STAGE_SELECTORS = Object.freeze([
  { key: 'methods', selector: '#methodsCanvas' },
  { key: 'property', selector: '#propertyCanvas' }
]);

function createPropertyDisplay(propertyKey, value) {
  const scene = model.createPropertyScene(propertyKey, value);
  const definition = scene.definition;
  const currentValue = scene.parameter;
  let summary = '';
  if (propertyKey === 'ratio') {
    const data = scene.ratio;
    summary = `EH:HF = ${(data.sourceRatioBefore / data.sourceRatioAfter).toFixed(2)}`
      + `；eh:hf = ${(data.projectedRatioBefore / data.projectedRatioAfter).toFixed(2)}`;
  } else if (propertyKey === 'accumulation') {
    summary = '空间直线积聚为一点；与其平行的平面图形积聚为一条直线。';
  } else if (propertyKey === 'incidence') {
    summary = 'H ∈ EF，则 h ∈ ef；J ∈ △ABC，则 j ∈ △abc。';
  } else {
    summary = '直线仍投影为直线，平行线仍投影为平行线；图形平行于 P 时反映实形。';
  }
  return {
    propertyKey,
    propertyDefinition: definition.definition,
    propertyValue: currentValue,
    propertySummary: summary
  };
}

Page({
  data: {
    methodOptions: METHOD_OPTIONS,
    methodMode: 'center',
    parallelSliderValue: 75,
    parallelAngleDeg: 90,
    propertyOptions: PROPERTY_OPTIONS,
    ...createPropertyDisplay('invariance', 0),
    demoComplete: {
      methods: false,
      property: false
    },
    completedDemoCount: 0
  },

  onLoad() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this._sessionRunning = false;
    this._sessionEnded = false;
    this._interactionCount = 0;
    this._methodProgress = 0;
    this._parallelSliderValue = 75;
    this._parallelAngleDeg = 90;
    this._propertyValue = 0;
    this._animationTokens = {};
    this._canvasInitToken = 0;
    this._dirtyStages = new Set();
    this._drawScheduled = false;
    this._canvasStages = {};
    this._didInitialMethodPlay = false;
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
    this._dirtyStages.clear();
  },

  onShareAppMessage() {
    return {
      title: '投影法基础 · 中心/平行投影与基本性质',
      path: '/pages/projection-method/projection-method'
    };
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
      if (!this._didInitialMethodPlay) {
        this._didInitialMethodPlay = true;
        this.animateMethods(0, 1, 2200);
      }
    });
  },

  getStageState(stageKey) {
    if (stageKey === 'methods') {
      return {
        mode: this.data.methodMode,
        progress: model.clamp(this._methodProgress || 0, 0, 1),
        parallelAngleDeg: this._parallelAngleDeg == null
          ? this.data.parallelAngleDeg
          : this._parallelAngleDeg,
        parallelDirectionSign: this.data.parallelSliderValue >= 75 ? -1 : 1,
        showLabels: true
      };
    }
    return {
      key: this.data.propertyKey,
      parameter: this._propertyValue == null
        ? this.data.propertyValue
        : this._propertyValue,
      showLabels: true
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

  requestFrame(stageKey, callback) {
    const stage = this._canvasStages && this._canvasStages[stageKey];
    if (stage && stage.canvas && stage.canvas.requestAnimationFrame) {
      return stage.canvas.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16);
  },

  stopStageAnimation(stageKey) {
    this._animationTokens[stageKey] = (this._animationTokens[stageKey] || 0) + 1;
  },

  stopAllAnimations() {
    this.stopStageAnimation('methods');
  },

  animateMethods(from, to, duration) {
    this.stopStageAnimation('methods');
    const token = this._animationTokens.methods;
    const start = Date.now();
    const min = Math.min(from, to);
    const span = Math.abs(to - from);
    const step = () => {
      if (this._isUnloaded || token !== this._animationTokens.methods) return;
      const elapsed = Math.min(1, (Date.now() - start) / duration);
      const eased = model.easeInOut(elapsed);
      const progress = clampProgress(min + span * eased, Math.min(from, to), Math.max(from, to));
      this._methodProgress = progress;
      this.scheduleStageDraw('methods');
      if (elapsed < 1) {
        this.requestFrame('methods', step);
        return;
      }
      this._methodProgress = to;
      this.markDemoComplete('methods');
      this.scheduleStageDraw('methods');
    };
    step();
  },

  selectMethod(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!METHOD_OPTIONS.some((item) => item.key === mode) || mode === this.data.methodMode) return;
    this.recordInteraction();
    this.stopStageAnimation('methods');
    this._methodProgress = 0;
    this.setData({
      methodMode: mode,
      parallelSliderValue: 75,
      parallelAngleDeg: 90
    }, () => {
      this._parallelSliderValue = 75;
      this._parallelAngleDeg = 90;
      this.scheduleStageDraw('methods');
      this.animateMethods(0, 1, 2200);
    });
  },

  handleParallelAngleChange(event) {
    if (this.data.methodMode !== 'parallel') return;
    const parallelSliderValue = Math.round(model.clamp(
      Number(event.detail.value),
      0,
      150
    ));
    const parallelAngleDeg = 90 - Math.abs(parallelSliderValue - 75);
    this.recordInteraction();
    this._parallelSliderValue = parallelSliderValue;
    this._parallelAngleDeg = parallelAngleDeg;
    this.setData({ parallelSliderValue, parallelAngleDeg });
    this.scheduleStageDraw('methods');
  },

  handleMethodReplay() {
    this.recordInteraction();
    this._methodProgress = 0;
    this.scheduleStageDraw('methods');
    this.animateMethods(0, 1, 2200);
  },

  selectProperty(event) {
    const propertyKey = event.currentTarget.dataset.property;
    const definition = model.getPropertyDefault(propertyKey);
    if (!definition) return;
    this.recordInteraction();
    this._propertyValue = definition.defaultValue;
    this.setData(createPropertyDisplay(propertyKey, definition.defaultValue));
    this.scheduleStageDraw('property');
    this.markDemoComplete('property');
  },

  markDemoComplete(stageKey) {
    if (!stageKey || this.data.demoComplete[stageKey]) return;
    const demoComplete = Object.assign({}, this.data.demoComplete, { [stageKey]: true });
    const completedDemoCount = Object.keys(demoComplete)
      .filter((key) => demoComplete[key]).length;
    this.setData({
      demoComplete,
      completedDemoCount
    });
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  startLearningSession() {
    if (this._sessionRunning || !getApp().globalData.user) return;
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._pageVisible = true;
    this._sessionStartPending = true;
    this._sessionCycle = (this._sessionCycle || 0) + 1;
    this._sessionStart = Date.now();
    const sessionCycle = this._sessionCycle;
    api.startSession('projection-method').then((res) => {
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
        chapter_id: 'projection-method',
        chapter_name: '投影法基础',
        page: 'projection-method',
        knowledge_point_id: 'G01',
        metadata: { section: 'overview' }
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
      chapter_id: 'projection-method',
      chapter_name: '投影法基础',
      page: 'projection-method',
      knowledge_point_id: 'G01',
      duration,
      metadata: {
        completed_demo_count: this.data.completedDemoCount,
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  }
});

function clampProgress(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
