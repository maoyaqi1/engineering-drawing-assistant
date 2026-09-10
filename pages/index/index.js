const SectionGeometry = require('./section-geometry.js');
const BasicSolid = require('./basic-solid.js');

const DEFAULT_POINT = Object.freeze({ x: 4, y: 3, z: 5 });
const MODEL_MIN = 0;
const MODEL_LIMIT = 8;
const ISOMETRIC_DEPTH_Z = 0.76;
// 云能力仅在微信小程序可用；网页版（web/、web-release/）下 api 为 null，相关逻辑自动空跑，不影响 V0.1.0 绘图
const api = (typeof wx !== 'undefined' && wx.cloud) ? require('../../utils/api.js') : null;

Page({
  data: {
    mode: 'point',
    canvasDragging: false,
    moduleIndex: 0,
    moduleOptions: ['点', '直线', '平面', '基本立体', '平面切割立体'],
    point: { ...DEFAULT_POINT },
    pointType: 'general',
    lineType: 'general',
    line: {
      a: { x: 2, y: 2, z: 6 },
      b: { x: 6, y: 5, z: 2 }
    },
    planeType: 'general',
    plane: {
      a: { x: 2, y: 2, z: 6 },
      b: { x: 7, y: 4, z: 2 },
      c: { x: 4, y: 7, z: 5 }
    },
    section: {
      solidType: 'pentagonalPrism',
      planeType: 'frontProjecting',
      angle: 42,
      offset: 0
    },
    solid: {
      type: 'prism',
      sides: 5,
      radius: 2,
      height: 3,
      majorRadius: 3,
      minorRadius: 1,
      position: { x: 4, y: 3, z: 3 },
      rotation: { x: 0, y: 0, z: 0 }
    },
    solidTypes: ['棱柱', '棱锥', '圆柱', '圆锥', '圆球', '圆环'],
    solidTypeIndex: 0,
    poseTabs: ['旋转', '平移'],
    poseTabIndex: 0,
    axisKeys: ['x', 'y', 'z'],
    axisLabels: ['X', 'Y', 'Z'],
    rotationAxis: 'x',
    translationAxis: 'x',
    rotationAxisIndex: 0,
    translationAxisIndex: 0,
    rotationValue: 0,
    translationValue: 4
  },

  onReady() {
    this.initializeCanvas();
  },

  onShow() {
    this.ensureSession();
  },

  onHide() {
    this.endSession();
  },

  ensureSession() {
    if (!api) return;
    const app = getApp();
    if (!app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    if (!app.globalData.user.student_id) {
      wx.redirectTo({ url: '/pages/register/register' });
      return;
    }
    this._sessionStart = Date.now();
    this._interactionCount = 0;
    this._sessionEnded = false;
    api.startSession(this.data.mode).then((res) => {
      if (res && res.ok) this._sessionId = res.session_id;
      this.trackChapterEnter();
    });
    api.statistics(true).then((res) => {
      if (res && res.ok && !res.survey_completed && res.can_invite && res.valid_session_count >= 5) {
        this.inviteSurvey();
      }
    });
  },

  endSession() {
    if (!api || !this._sessionId || this._sessionEnded) return;
    this._sessionEnded = true;
    this.trackChapterExit();
    const duration = Math.max(0, Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000));
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  },

  // ---- 学习行为埋点：只追加事件记录，不改变既有交互与渲染逻辑 ----
  trackEvent(eventType, payload) {
    if (!api || !api.recordEvent) return;
    const names = {
      point: '点的投影',
      line: '直线的投影',
      plane: '平面的投影',
      solid: '基本立体',
      section: '平面切割立体'
    };
    const chapterId = this.data.mode;
    api.recordEvent(eventType, Object.assign({
      session_id: this._sessionId || '',
      chapter_id: chapterId,
      chapter_name: names[chapterId] || chapterId,
      page: 'index'
    }, payload || {}));
  },

  trackChapterEnter() {
    this._chapterStart = Date.now();
    this.trackEvent('chapter_enter');
  },

  trackChapterExit() {
    if (!this._chapterStart) return;
    const duration = Math.max(0, Math.floor((Date.now() - this._chapterStart) / 1000));
    this._chapterStart = null;
    this.trackEvent('chapter_exit', { duration });
  },

  recordInteraction() {
    if (!api) return;
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  inviteSurvey() {
    if (this._surveyPrompted) return;
    this._surveyPrompted = true;
    wx.showModal({
      title: '使用反馈调查',
      content: '你已连续使用工程制图学习助手 5 次。我们希望了解这个工具是否真正帮助了你的学习。',
      confirmText: '开始调查',
      cancelText: '暂时不做',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/survey/survey' });
      }
    });
  },

  onUnload() {
    this.endSession();
    this.canvas = null;
    this.context = null;
    this.sectionSolidCache = null;
    this.sectionResultCache = null;
  },

  initializeCanvas() {
    const init = (retry) => {
      const query = this.createSelectorQuery();
      query.select('#geometryCanvas').fields({ node: true, size: true }).exec((results) => {
        const canvasInfo = results && results[0];
        if (!canvasInfo || !canvasInfo.node || canvasInfo.width < 50) {
          if (retry > 0) setTimeout(() => init(retry - 1), 300);
          return;
        }
        const pixelRatio = Math.min(wx.getWindowInfo().pixelRatio || 1, 3);
        this.canvas = canvasInfo.node;
        this.context = this.canvas.getContext('2d');
        this.canvasWidth = canvasInfo.width;
        this.canvasHeight = canvasInfo.height;
        this.canvas.width = canvasInfo.width * pixelRatio;
        this.canvas.height = canvasInfo.height * pixelRatio;
        this.context.scale(pixelRatio, pixelRatio);
        this.drawScene();
      });
    };
    init(4);
  },

  resetPoint() {
    if (this.data.mode === 'solid') {
      this.handleReset();
      return;
    }
    if (this.data.mode === 'section') {
      this.setData({
        'section.planeType': 'frontProjecting',
        'section.angle': 42,
        'section.offset': 0
      }, () => this.drawScene());
      return;
    }
    if (this.data.mode === 'plane') {
      const plane = this.getPlaneTypePreset(this.data.planeType);
      this.setData({ plane }, () => this.drawScene());
      return;
    }
    if (this.data.mode === 'line') {
      const line = this.getLineTypePreset(this.data.lineType);
      this.setData({ line }, () => this.drawScene());
      return;
    }
    const point = this.getPointTypePreset(this.data.pointType);
      this.setData({ point }, () => this.drawScene());
  },

  goToAi() {
    if (typeof wx !== 'undefined' && wx.navigateTo) {
      wx.navigateTo({ url: '/pages/ai/ai' });
    }
  },

  goRuler() {
    if (typeof wx !== 'undefined' && wx.navigateTo) {
      wx.navigateTo({ url: '/pages/ruler/ruler' });
    }
  },

  goProfile() {
    if (typeof wx !== 'undefined' && wx.navigateTo) {
      wx.navigateTo({ url: '/pages/register/register' });
    }
  },

  handleModulePicker(event) {
    this.recordInteraction();
    const moduleIndex = Number(event.detail.value);
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= this.data.moduleOptions.length) return;
    const mode = ['point', 'line', 'plane', 'solid', 'section'][moduleIndex];
    this.draggingProjection = null;
    this.draggingLineProjection = null;
    this.draggingPlaneProjection = null;
    const titles = { point: '点的三面投影', line: '直线的三面投影', plane: '平面的三面投影', section: '平面切割立体', solid: '基本立体' };
    wx.setNavigationBarTitle({ title: titles[mode] });
    const chapterChanged = mode !== this.data.mode;
    if (chapterChanged) this.trackChapterExit();
    this.setData({ mode, moduleIndex }, () => {
      this.drawScene();
      if (chapterChanged) this.trackChapterEnter();
    });
  },

  handleSolidType(event) {
    this.recordInteraction();
    const solidType = event.currentTarget.dataset.type;
    const validTypes = ['triangularPyramid', 'pentagonalPrism', 'cylinder', 'cone', 'sphere', 'torus'];
    if (!validTypes.includes(solidType)) return;
    this.setData({ 'section.solidType': solidType }, () => this.drawScene());
  },

  handleSectionSlider(event) {
    this.recordInteraction();
    this.applySectionLive(event);
    this.setData({ section: this.data.section }, () => this.scheduleCanvasDraw());
  },

  applySectionLive(event) {
    const key = event.currentTarget.dataset.key;
    const value = Number(event.detail.value);
    if (!['angle', 'offset'].includes(key) || !Number.isFinite(value)) return;
    const normalizedValue = key === 'offset' ? Math.round(value * 10) / 10 : Math.round(value);
    this.setLivePath('section.' + key, normalizedValue);
    if (key === 'angle') this.setLivePath('section.planeType', this.getSectionPlaneType(normalizedValue));
  },

  handleSectionLive(event) {
    this.recordInteraction();
    this.applySectionLive(event);
    this.scheduleCanvasDraw();
  },

  handleSectionPlaneType(event) {
    this.recordInteraction();
    const planeType = event.currentTarget.dataset.type;
    const presetAngles = { horizontal: 0, frontProjecting: 42, profile: 90 };
    if (!Object.prototype.hasOwnProperty.call(presetAngles, planeType)) return;
    this.setData({
      'section.planeType': planeType,
      'section.angle': presetAngles[planeType]
    }, () => this.drawScene());
  },

  handleSizeSliderLive(event) {
    this.recordInteraction();
    const key = event.currentTarget.dataset.key;
    const value = Number(event.detail.value);
    if (!Number.isFinite(value)) return;
    const solid = this.data.solid;
    solid[key] = Math.round(value * 10) / 10;
    solid.position = this.sanitizeSolidPosition(solid);
    this.scheduleCanvasDraw();
  },

  handleSizeSlider(event) {
    this.recordInteraction();
    const key = event.currentTarget.dataset.key;
    const value = Number(event.detail.value);
    if (!Number.isFinite(value)) return;
    const solid = Object.assign({}, this.data.solid, {
      position: Object.assign({}, this.data.solid.position),
      rotation: Object.assign({}, this.data.solid.rotation)
    });
    solid[key] = Math.round(value * 10) / 10;
    solid.position = this.sanitizeSolidPosition(solid);
    this.setData({ solid, translationValue: solid.position[this.data.translationAxis] }, () => this.drawScene());
  },

  handleRotationAxis(event) {
    this.recordInteraction();
    const index = Number(event.detail.value);
    const axis = this.data.axisKeys[index];
    if (!axis) return;
    const rotationValue = Number(this.data.solid.rotation[axis]) || 0;
    this.setData({ rotationAxisIndex: index, rotationAxis: axis, rotationValue }, () => this.drawScene());
  },

  handleRotationAngleLive(event) {
    this.recordInteraction();
    const value = Number(event.detail.value);
    if (!Number.isFinite(value)) return;
    const v = Math.round(value);
    this.data.solid.rotation[this.data.rotationAxis] = v;
    this.data.rotationValue = v;
    this.scheduleCanvasDraw();
  },

  handleRotationAngle(event) {
    this.recordInteraction();
    const value = Number(event.detail.value);
    if (!Number.isFinite(value)) return;
    this.setData({
      [`solid.rotation.${this.data.rotationAxis}`]: Math.round(value),
      rotationValue: Math.round(value)
    }, () => this.drawScene());
  },

  handleTranslationAxis(event) {
    this.recordInteraction();
    const index = Number(event.detail.value);
    const axis = this.data.axisKeys[index];
    if (!axis) return;
    const translationValue = Number(this.data.solid.position[axis]) || 0;
    this.setData({ translationAxisIndex: index, translationAxis: axis, translationValue }, () => this.drawScene());
  },

  handleTranslationLive(event) {
    this.recordInteraction();
    const value = Number(event.detail.value);
    if (!Number.isFinite(value)) return;
    const solid = this.data.solid;
    const axis = this.data.translationAxis;
    solid.position[axis] = Math.round(value * 10) / 10;
    solid.position = this.sanitizeSolidPosition(solid);
    this.scheduleCanvasDraw();
  },

  handleTranslation(event) {
    this.recordInteraction();
    const value = Number(event.detail.value);
    if (!Number.isFinite(value)) return;
    const solid = Object.assign({}, this.data.solid, {
      position: Object.assign({}, this.data.solid.position),
      rotation: Object.assign({}, this.data.solid.rotation)
    });
    const axis = this.data.translationAxis;
    solid.position[axis] = Math.round(value * 10) / 10;
    solid.position = this.sanitizeSolidPosition(solid);
    this.setData({ solid, translationValue: solid.position[axis] }, () => this.drawScene());
  },

  sanitizeSolidPosition(solid) {
    const type = solid.type;
    let r = Math.max(0.5, Number(solid.radius) || 2);
    let halfH = Math.max(0.1, Number(solid.height) / 2 || 1.5);
    if (type === 'torus') { r = (Number(solid.majorRadius) || 3) + (Number(solid.minorRadius) || 1); halfH = Number(solid.minorRadius) || 1; }
    if (type === 'sphere') { halfH = r; }
    const p = solid.position || {};
    return {
      x: this.clamp(Number(p.x) || 0, r, 8 - r),
      y: this.clamp(Number(p.y) || 0, r, 8 - r),
      z: this.clamp(Number(p.z) || 0, halfH, 8 - halfH)
    };
  },

  handleSidesStep(event) {
    this.recordInteraction();
    const delta = Number(event.currentTarget.dataset.delta);
    const next = this.clamp((Number(this.data.solid.sides) || 5) + delta, 3, 8);
    this.setData({ 'solid.sides': next }, () => this.drawScene());
  },

  handleBasicSolidType(event) {
    this.recordInteraction();
    const index = Number(event.currentTarget.dataset.type);
    const types = ['prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'torus'];
    if (index < 0 || index >= types.length) return;
    this.setData({ solidTypeIndex: index, solid: this.defaultSolidParams(types[index]) }, () => this.drawScene());
  },

  defaultSolidParams(type) {
    return {
      type,
      sides: 5,
      radius: 2,
      height: 3,
      majorRadius: type === 'torus' ? 2 : 3,
      minorRadius: type === 'torus' ? 0.8 : 1,
      position: type === 'torus' ? { x: 4, y: 4, z: 3 } : { x: 4, y: 3, z: 3 },
      rotation: { x: 0, y: 0, z: 0 }
    };
  },

  handlePoseTab(event) {
    this.recordInteraction();
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ poseTabIndex: index }, () => this.drawScene());
  },

  handleAxisChip(event) {
    this.recordInteraction();
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.poseTabIndex === 0) this.handleRotationAxis({ detail: { value: index } });
    else this.handleTranslationAxis({ detail: { value: index } });
  },

  handleRotate90(event) {
    this.recordInteraction();
    const axis = this.data.rotationAxis || 'x';
    const current = Number(this.data.solid.rotation[axis]) || 0;
    const next = (current + 90) % 360;
    this.setData({
      [`solid.rotation.${axis}`]: next,
      rotationAxis: axis,
      rotationAxisIndex: this.data.axisKeys.indexOf(axis),
      rotationValue: next
    }, () => this.drawScene());
  },

  handleReset() {
    this.recordInteraction();
    const currentType = this.data.solid.type || 'prism';
    const solid = this.defaultSolidParams(currentType);
    const typeIndex = ['prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'torus'].indexOf(currentType);
    this.setData({
      solid,
      solidTypeIndex: typeIndex >= 0 ? typeIndex : 0,
      poseTabIndex: 0,
      rotationAxisIndex: 0,
      translationAxisIndex: 0,
      rotationAxis: 'x',
      translationAxis: 'x',
      rotationValue: 0,
      translationValue: 4,
    }, () => this.drawScene());
  },

  getSectionPlaneType(angle) {
    const normalizedAngle = ((angle % 180) + 180) % 180;
    if (normalizedAngle === 0) return 'horizontal';
    if (normalizedAngle === 90) return 'profile';
    return 'frontProjecting';
  },

  handlePlaneType(event) {
    this.recordInteraction();
    const planeType = event.currentTarget.dataset.type;
    const validTypes = ['general', 'horizontal', 'frontal', 'profile', 'vertical', 'frontProjecting', 'profileProjecting'];
    if (!validTypes.includes(planeType)) return;
    const plane = this.getPlaneTypePreset(planeType);
    this.setData({ planeType, plane }, () => this.drawScene());
  },

  getPlaneTypePreset(planeType) {
    const presets = {
      general: {
        a: { x: 2, y: 2, z: 6 }, b: { x: 7, y: 4, z: 2 }, c: { x: 4, y: 7, z: 5 }
      },
      horizontal: {
        a: { x: 2, y: 2, z: 4 }, b: { x: 6, y: 3, z: 4 }, c: { x: 4, y: 7, z: 4 }
      },
      frontal: {
        a: { x: 2, y: 3, z: 6 }, b: { x: 6, y: 3, z: 2 }, c: { x: 3, y: 3, z: 2 }
      },
      profile: {
        a: { x: 3, y: 2, z: 6 }, b: { x: 3, y: 6, z: 2 }, c: { x: 3, y: 7, z: 5 }
      },
      vertical: {
        a: { x: 2, y: 2, z: 6 }, b: { x: 6, y: 6, z: 2 }, c: { x: 4, y: 4, z: 3 }
      },
      frontProjecting: {
        a: { x: 2, y: 2, z: 6 }, b: { x: 6, y: 6, z: 2 }, c: { x: 4, y: 7, z: 4 }
      },
      profileProjecting: {
        a: { x: 2, y: 2, z: 6 }, b: { x: 6, y: 6, z: 2 }, c: { x: 7, y: 4, z: 4 }
      }
    };
    const preset = presets[planeType];
    return { a: { ...preset.a }, b: { ...preset.b }, c: { ...preset.c } };
  },

  handleLineType(event) {
    this.recordInteraction();
    const lineType = event.currentTarget.dataset.type;
    const validTypes = ['general', 'horizontal', 'frontal', 'profile', 'vertical', 'frontProjecting', 'profileProjecting'];
    if (!validTypes.includes(lineType)) return;
    const line = this.getLineTypePreset(lineType);
    this.setData({ lineType, line }, () => this.drawScene());
  },

  getLineTypePreset(lineType) {
    // 当前课程统一限定在第一分角，两个端点的坐标均不小于零。
    const a = { x: 2, y: 2, z: 6 };
    const endpoints = {
      general: { x: 6, y: 5, z: 2 },
      horizontal: { x: 6, y: 5, z: 6 },
      frontal: { x: 6, y: 2, z: 2 },
      profile: { x: 2, y: 6, z: 2 },
      vertical: { x: 2, y: 2, z: 1 },
      frontProjecting: { x: 2, y: 6, z: 6 },
      profileProjecting: { x: 6, y: 2, z: 6 }
    };
    return { a: { ...a }, b: { ...endpoints[lineType] } };
  },

  handlePointType(event) {
    this.recordInteraction();
    const pointType = event.currentTarget.dataset.type;
    const validTypes = ['general', 'planeH', 'planeV', 'planeW', 'axisX', 'axisY', 'axisZ', 'origin'];
    if (!validTypes.includes(pointType)) return;
    const point = this.getPointTypePreset(pointType);
    this.setData({ pointType, point }, () => this.drawScene());
  },

  getPointTypePreset(pointType) {
    const presets = {
      general: { ...DEFAULT_POINT },
      planeH: { x: 4, y: 3, z: 0 },
      planeV: { x: 4, y: 0, z: 5 },
      planeW: { x: 0, y: 3, z: 5 },
      axisX: { x: 4, y: 0, z: 0 },
      axisY: { x: 0, y: 4, z: 0 },
      axisZ: { x: 0, y: 0, z: 5 },
      origin: { x: 0, y: 0, z: 0 }
    };
    return { ...presets[pointType] };
  },

  handleTouchStart(event) {
    this.recordInteraction();
    const touch = event.touches && event.touches[0];
    if (!touch || !this.canvasWidth) return;
    if (this.data.mode === 'section' || this.data.mode === 'solid') return;
    if (this.data.mode === 'plane') {
      this.handlePlaneTouchStart(touch);
      this.setDragLock(this.draggingPlaneProjection != null);
      return;
    }
    if (this.data.mode === 'line') {
      this.handleLineTouchStart(touch);
      this.setDragLock(this.draggingLineProjection != null);
      return;
    }
    const projections = this.getProjectionScreenPoints();
    const hitRadius = 30;
    this.draggingProjection = null;
    ['front', 'top', 'left'].some((viewType) => {
      const screenPoint = projections[viewType];
      if (Math.hypot(touch.x - screenPoint.x, touch.y - screenPoint.y) <= hitRadius) {
        this.draggingProjection = viewType;
        return true;
      }
      return false;
    });
    this.setDragLock(this.draggingProjection != null);
  },

  handleTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    if (this.data.mode === 'section' || this.data.mode === 'solid') return;
    if (this.data.mode === 'plane') {
      this.handlePlaneTouchMove(touch);
      return;
    }
    if (this.data.mode === 'line') {
      this.handleLineTouchMove(touch);
      return;
    }
    if (!this.draggingProjection) return;

    const metrics = this.getProjectionMetrics();
    const nextPoint = { ...this.data.point };
    if (this.draggingProjection === 'front') {
      nextPoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
      nextPoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
    } else if (this.draggingProjection === 'top') {
      nextPoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
      nextPoint.y = this.screenToModel(touch.y - metrics.origin.y, metrics.unit);
    } else {
      nextPoint.y = this.screenToModel(touch.x - metrics.origin.x, metrics.unit);
      nextPoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
    }
    this.setLivePath('point', nextPoint);
    this.setLivePath('pointType', 'general');
    this.scheduleCanvasDraw();
  },

  handleTouchEnd() {
    const wasDragging = this.draggingProjection != null || this.draggingLineProjection != null || this.draggingPlaneProjection != null;
    if (wasDragging) {
      if (this.data.mode === 'point') {
        this.setData({ point: this.data.point, pointType: this.data.pointType, canvasDragging: false }, () => this.scheduleCanvasDraw());
      } else if (this.data.mode === 'plane') {
        this.setData({ plane: this.data.plane, planeType: this.data.planeType, canvasDragging: false }, () => this.scheduleCanvasDraw());
      } else if (this.data.mode === 'line') {
        this.setData({ line: this.data.line, lineType: this.data.lineType, canvasDragging: false }, () => this.scheduleCanvasDraw());
      } else {
        this.setData({ canvasDragging: false });
      }
    } else {
      this.setDragLock(false);
    }
    this.draggingProjection = null;
    this.draggingLineProjection = null;
    this.draggingPlaneProjection = null;
  },

  scheduleCanvasDraw() {
    if (this._drawScheduled) return;
    this._drawScheduled = true;
    const canvasRaf = this.canvas && this.canvas.requestAnimationFrame;
    const run = () => {
      this._drawScheduled = false;
      if (this.context) this.drawScene();
    };
    if (canvasRaf) {
      canvasRaf.call(this.canvas, run);
    } else {
      setTimeout(run, 16);
    }
  },

  setLivePath(path, value) {
    const parts = String(path).split('.');
    let cur = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) return;
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  },

  setDragLock(active) {
    if (this.data.canvasDragging !== active) this.setData({ canvasDragging: active });
  },

  handlePlaneTouchStart(touch) {
    const hitRadius = 30;
    this.draggingPlaneProjection = null;
    ['a', 'b', 'c'].some((pointKey) => {
      const projections = this.getProjectionScreenPoints(this.data.plane[pointKey]);
      return ['front', 'top', 'left'].some((viewType) => {
        const screenPoint = projections[viewType];
        if (Math.hypot(touch.x - screenPoint.x, touch.y - screenPoint.y) <= hitRadius) {
          this.draggingPlaneProjection = { pointKey, viewType };
          return true;
        }
        return false;
      });
    });
  },

  handlePlaneTouchMove(touch) {
    if (!this.draggingPlaneProjection) return;
    const { pointKey, viewType } = this.draggingPlaneProjection;
    const metrics = this.getProjectionMetrics();
    const point = { ...this.data.plane[pointKey] };
    if (viewType === 'front') {
      point.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
      point.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
    } else if (viewType === 'top') {
      point.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
      point.y = this.screenToModel(touch.y - metrics.origin.y, metrics.unit);
    } else {
      point.y = this.screenToModel(touch.x - metrics.origin.x, metrics.unit);
      point.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
    }
    const nextPlane = { ...this.data.plane, [pointKey]: point };
    if (!this.isPlaneNonCollinear(nextPlane)) return;
    this.setLivePath(`plane.${pointKey}`, point);
    this.setLivePath('planeType', 'general');
    this.scheduleCanvasDraw();
  },

  isPlaneNonCollinear(plane) {
    const ab = {
      x: plane.b.x - plane.a.x,
      y: plane.b.y - plane.a.y,
      z: plane.b.z - plane.a.z
    };
    const ac = {
      x: plane.c.x - plane.a.x,
      y: plane.c.y - plane.a.y,
      z: plane.c.z - plane.a.z
    };
    const cross = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x
    };
    return cross.x * cross.x + cross.y * cross.y + cross.z * cross.z > 1e-8;
  },

  handleLineTouchStart(touch) {
    const hitRadius = 30;
    this.draggingLineProjection = null;
    ['a', 'b'].some((endpointKey) => {
      const projections = this.getProjectionScreenPoints(this.data.line[endpointKey]);
      return ['front', 'top', 'left'].some((viewType) => {
        const screenPoint = projections[viewType];
        if (Math.hypot(touch.x - screenPoint.x, touch.y - screenPoint.y) <= hitRadius) {
          this.draggingLineProjection = { endpointKey, viewType };
          return true;
        }
        return false;
      });
    });
  },

  handleLineTouchMove(touch) {
    if (!this.draggingLineProjection) return;
    const { endpointKey, viewType } = this.draggingLineProjection;
    const metrics = this.getProjectionMetrics();
    const endpoint = { ...this.data.line[endpointKey] };
    if (viewType === 'front') {
      endpoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
      endpoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
    } else if (viewType === 'top') {
      endpoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
      endpoint.y = this.screenToModel(touch.y - metrics.origin.y, metrics.unit);
    } else {
      endpoint.y = this.screenToModel(touch.x - metrics.origin.x, metrics.unit);
      endpoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
    }
    this.setLivePath(`line.${endpointKey}`, endpoint);
    this.setLivePath('lineType', 'general');
    this.scheduleCanvasDraw();
  },

  getProjectionMetrics() {
    const layout = this.getLayout();
    return {
      origin: layout.projectionOrigin,
      unit: Math.min(layout.rightWidth / 21, layout.bottomHeight / 23)
    };
  },

  getProjectionScreenPoints(sourcePoint) {
    const metrics = this.getProjectionMetrics();
    const { origin, unit } = metrics;
    const point = sourcePoint || this.getPrimaryPoint();
    return {
      front: { x: origin.x - point.x * unit, y: origin.y - point.z * unit },
      top: { x: origin.x - point.x * unit, y: origin.y + point.y * unit },
      left: { x: origin.x + point.y * unit, y: origin.y - point.z * unit }
    };
  },

  getPrimaryPoint() {
    if (this.data.mode === 'plane') return this.data.plane.a;
    return this.data.mode === 'line' ? this.data.line.a : this.data.point;
  },

  screenToModel(screenDistance, unit) {
    return this.clamp(Math.round(screenDistance / unit), MODEL_MIN, MODEL_LIMIT);
  },

  getLayout() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const dividerY = height * 0.46;
    const topHeight = dividerY;
    const bottomHeight = height - dividerY;
    return {
      dividerY,
      topHeight,
      bottomHeight,
      leftWidth: width,
      rightWidth: width,
      // X/Y 取相反极值时横向跨度最大，预留完整的 ±8 坐标显示范围。
      unit: Math.min(width / 27, topHeight / 24),
      isoOrigin: { x: width * 0.5, y: topHeight * 0.58 },
      projectionOrigin: { x: width * 0.5, y: dividerY + bottomHeight * 0.5 }
    };
  },

  projectIsometric(point) {
    const layout = this.getLayout();
    // 统一的斜轴测基底：X 向左下、Y 向右下、Z 向上。
    // H: z=0，V: y=0，W: x=0；空间点和三个投影点必须共用此映射。
    const horizontalFactor = 0.78;
    const depthFactor = 0.38;
    return {
      x: layout.isoOrigin.x + (point.y - point.x) * horizontalFactor * layout.unit,
      y: layout.isoOrigin.y + (point.x + point.y) * depthFactor * layout.unit - point.z * layout.unit
    };
  },

  worldToView(point, viewType) {
    if (viewType === 'front') return { u: point.x, v: point.z };
    if (viewType === 'top') return { u: point.x, v: -point.y };
    return { u: -point.y, v: point.z };
  },

  drawScene() {
    if (!this.context || !this.canvasWidth) return;
    const context = this.context;
    const layout = this.getLayout();
    context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawIsometricPanel(context, layout);
    if (this.data.mode === 'line') this.drawLineIsometricOverlay(context);
    if (this.data.mode === 'plane') this.drawPlaneIsometricOverlay(context);
    if (this.data.mode === 'section') this.drawSectionIsometricOverlay(context);
    if (this.data.mode === 'solid') BasicSolid.drawIso(context, this);
    this.drawProjectionPanels(context, layout);
    if (this.data.mode === 'line') this.drawLineProjectionOverlay(context, layout);
    if (this.data.mode === 'plane') this.drawPlaneProjectionOverlay(context);
    if (this.data.mode === 'section') this.drawSectionProjectionOverlay(context);
    if (this.data.mode === 'solid') BasicSolid.drawViews(context, this);
  },

  drawIsometricPanel(context, layout) {
    context.save();
    context.beginPath();
    context.rect(0, 0, layout.leftWidth, layout.topHeight);
    context.fillStyle = '#090a0c';
    context.fill();
    context.clip();

    const origin = layout.isoOrigin;
    const edge = layout.unit * 9;
    context.fillStyle = 'rgba(50, 184, 110, 0.24)';
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(origin.x - edge * 1.2, origin.y + edge * 0.6);
    context.lineTo(origin.x, origin.y + edge * 1.08);
    context.lineTo(origin.x + edge * 1.2, origin.y + edge * 0.6);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(52, 132, 246, 0.24)';
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(origin.x - edge * 1.2, origin.y + edge * 0.6);
    context.lineTo(origin.x - edge * 1.2, origin.y - edge * 1.15);
    context.lineTo(origin.x, origin.y - edge * 0.92);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(245, 196, 55, 0.22)';
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(origin.x + edge * 1.2, origin.y + edge * 0.6);
    context.lineTo(origin.x + edge * 1.2, origin.y - edge * 1.15);
    context.lineTo(origin.x, origin.y - edge * 0.92);
    context.closePath();
    context.fill();

    const axes = [
      { end: this.projectIsometric({ x: 9, y: 0, z: 0 }), color: '#b4b8bf', label: 'X' },
      { end: this.projectIsometric({ x: 0, y: 9, z: 0 }), color: '#b4b8bf', label: 'Y' },
      { end: this.projectIsometric({ x: 0, y: 0, z: 10 }), color: '#b4b8bf', label: 'Z' }
    ];
    axes.forEach((axis) => {
      this.drawArrow(context, origin, axis.end, axis.color);
      this.drawText(context, axis.label, axis.end.x + 3, axis.end.y - 5, '#e3e5e8', 10, '600');
    });
    const spaceTitle = this.data.mode === 'line' ? '空间直线及投影' : (this.data.mode === 'plane' ? '空间平面及投影' : (this.data.mode === 'section' ? '空间截切及截交线' : (this.data.mode === 'solid' ? '空间立体' : '空间投影面')));
    this.drawText(context, spaceTitle, 12, 22, '#d9dde4', 11, '600');
    this.drawText(context, 'V 面', origin.x - edge * 0.72, origin.y - edge * 0.42, '#78b7ff', 9, '600');
    this.drawText(context, 'W 面', origin.x + edge * 0.58, origin.y - edge * 0.42, '#f2d36c', 9, '600');
    this.drawText(context, 'H 面', origin.x - 10, origin.y + edge * 0.74, '#6ed59a', 9, '600');

    if (this.data.mode === 'section' || this.data.mode === 'solid') {
      context.restore();
      return;
    }

    const primaryPoint = this.getPrimaryPoint();
    const pointScreen = this.projectIsometric(primaryPoint);
    const groundPoint = this.projectIsometric({ ...primaryPoint, z: 0 });
    const frontPoint = this.projectIsometric({ x: primaryPoint.x, y: 0, z: primaryPoint.z });
    const sidePoint = this.projectIsometric({ x: 0, y: primaryPoint.y, z: primaryPoint.z });
    this.drawProjectionLine(context, pointScreen, groundPoint, '#7d838c');
    this.drawProjectionLine(context, pointScreen, frontPoint, '#7d838c');
    this.drawProjectionLine(context, pointScreen, sidePoint, '#7d838c');
    this.drawPoint(context, groundPoint, '#ff4f53', 5, 'a');
    this.drawPoint(context, frontPoint, '#ff4f53', 5, "a′");
    this.drawPoint(context, sidePoint, '#ff4f53', 5, 'a″');
    this.drawPoint(context, pointScreen, '#ff4f53', 5, 'A');
    context.restore();
  },

  drawLineIsometricOverlay(context) {
    const a = this.data.line.a;
    const b = this.data.line.b;
    const aSpace = this.projectIsometric(a);
    const bSpace = this.projectIsometric(b);
    const projections = (point) => ({
      front: this.projectIsometric({ x: point.x, y: 0, z: point.z }),
      top: this.projectIsometric({ x: point.x, y: point.y, z: 0 }),
      left: this.projectIsometric({ x: 0, y: point.y, z: point.z })
    });
    const aViews = projections(a);
    const bViews = projections(b);

    context.save();
    context.lineWidth = 2.2;
    context.strokeStyle = '#ffb347';
    this.drawLine(context, aSpace, bSpace);
    context.lineWidth = 1.8;
    context.strokeStyle = '#f06b6b';
    this.drawLine(context, aViews.front, bViews.front);
    context.strokeStyle = '#55c985';
    this.drawLine(context, aViews.top, bViews.top);
    context.strokeStyle = '#5b91ed';
    this.drawLine(context, aViews.left, bViews.left);
    this.drawProjectionLine(context, bSpace, bViews.front, '#737b86');
    this.drawProjectionLine(context, bSpace, bViews.top, '#737b86');
    this.drawProjectionLine(context, bSpace, bViews.left, '#737b86');
    this.drawPoint(context, bViews.front, '#5b91ed', 5, "b′");
    this.drawPoint(context, bViews.top, '#5b91ed', 5, 'b');
    this.drawPoint(context, bViews.left, '#5b91ed', 5, 'b″');
    this.drawPoint(context, bSpace, '#5b91ed', 5, 'B');
    this.drawPoint(context, aSpace, '#ff4f53', 5, 'A');
    context.restore();
  },

  drawPlaneIsometricOverlay(context) {
    const points = ['a', 'b', 'c'].map((key) => this.data.plane[key]);
    const spacePoints = points.map((point) => this.projectIsometric(point));
    const viewPoints = (viewName) => points.map((point) => {
      if (viewName === 'front') return this.projectIsometric({ x: point.x, y: 0, z: point.z });
      if (viewName === 'top') return this.projectIsometric({ x: point.x, y: point.y, z: 0 });
      return this.projectIsometric({ x: 0, y: point.y, z: point.z });
    });
    const front = viewPoints('front');
    const top = viewPoints('top');
    const left = viewPoints('left');

    context.save();
    this.drawPolygon(context, spacePoints, 'rgba(53, 195, 200, 0.30)', '#67e1e5', 2.2);
    this.drawPolygon(context, front, 'rgba(223, 87, 87, 0.13)', '#df5757', 1.5);
    this.drawPolygon(context, top, 'rgba(67, 166, 108, 0.13)', '#43a66c', 1.5);
    this.drawPolygon(context, left, 'rgba(55, 121, 208, 0.13)', '#3779d0', 1.5);
    ['b', 'c'].forEach((key, index) => {
      const point = this.data.plane[key];
      const space = this.projectIsometric(point);
      const views = [front[index + 1], top[index + 1], left[index + 1]];
      views.forEach((viewPoint) => this.drawProjectionLine(context, space, viewPoint, '#737b86'));
    });
    const colors = ['#ff4f53', '#3779d0', '#f0a62e'];
    const labels = ['A', 'B', 'C'];
    spacePoints.forEach((point, index) => this.drawPoint(context, point, colors[index], 5, labels[index]));
    this.drawPoint(context, front[1], colors[1], 5, "b′");
    this.drawPoint(context, top[1], colors[1], 5, 'b');
    this.drawPoint(context, left[1], colors[1], 5, 'b″');
    this.drawPoint(context, front[2], colors[2], 5, "c′");
    this.drawPoint(context, top[2], colors[2], 5, 'c');
    this.drawPoint(context, left[2], colors[2], 5, 'c″');
    context.restore();
  },

  drawProjectionPanels(context, layout) {
    const contextWidth = this.canvasWidth;
    const height = this.canvasHeight;
    const origin = layout.projectionOrigin;
    const metrics = this.getProjectionMetrics();
    const unit = metrics.unit;
    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, layout.dividerY, layout.rightWidth, layout.bottomHeight);
    context.strokeStyle = '#31343a';
    context.lineWidth = 1.5;
    this.drawLine(context, { x: 0, y: layout.dividerY }, { x: contextWidth, y: layout.dividerY });
    context.strokeStyle = '#777d85';
    context.lineWidth = 1;
    this.drawLine(context, { x: 10, y: origin.y }, { x: contextWidth - 10, y: origin.y });
    this.drawLine(context, { x: origin.x, y: layout.dividerY + 34 }, { x: origin.x, y: height - 18 });
    this.drawText(context, 'Z', origin.x + 5, layout.dividerY + 34, '#525861', 10, '600');
    this.drawText(context, 'X', 8, origin.y - 5, '#525861', 10, '600');
    this.drawText(context, 'Y', origin.x + 5, height - 10, '#525861', 10, '600');

    if (this.data.mode === 'section') {
      this.drawText(context, '立体三视图与截交线', 12, layout.dividerY + 23, '#3b4654', 11, '600');
      context.restore();
      return;
    }

    const projectionTitle = this.data.mode === 'line' ? '直线三面投影 · 拖动端点' : (this.data.mode === 'plane' ? '平面三面投影 · 拖动顶点' : (this.data.mode === 'solid' ? '基本立体三视图' : '三面投影展开 · 拖动红点'));
    this.drawText(context, projectionTitle, 12, layout.dividerY + 23, '#3b4654', 11, '600');
    if (this.data.mode !== 'point') {
      context.restore();
      return;
    }

    const { front, top, left } = this.getProjectionScreenPoints();
    this.drawProjectionCorrespondence(context, { front, top, left }, this.getPrimaryPoint().y, origin, unit, '#c8cdd3');
    this.drawPoint(context, front, '#ff4f53', 5, "a′");
    this.drawPoint(context, top, '#ff4f53', 5, 'a');
    this.drawPoint(context, left, '#ff4f53', 5, 'a″');
    context.restore();
  },

  drawLineProjectionOverlay(context) {
    const aViews = this.getProjectionScreenPoints(this.data.line.a);
    const bViews = this.getProjectionScreenPoints(this.data.line.b);
    const origin = this.getProjectionMetrics().origin;
    const unit = this.getProjectionMetrics().unit;

    context.save();
    [
      { point: this.data.line.a, views: aViews },
      { point: this.data.line.b, views: bViews }
    ].forEach((entry) => {
      this.drawProjectionCorrespondence(context, entry.views, entry.point.y, origin, unit, '#c4cad1');
    });
    context.lineWidth = 2.2;
    context.strokeStyle = '#df5757';
    this.drawLine(context, aViews.front, bViews.front);
    context.strokeStyle = '#43a66c';
    this.drawLine(context, aViews.top, bViews.top);
    context.strokeStyle = '#3779d0';
    this.drawLine(context, aViews.left, bViews.left);
    this.drawPoint(context, aViews.front, '#ff4f53', 5, "a′");
    this.drawPoint(context, aViews.top, '#ff4f53', 5, 'a');
    this.drawPoint(context, aViews.left, '#ff4f53', 5, 'a″');
    this.drawPoint(context, bViews.front, '#3779d0', 5, "b′");
    this.drawPoint(context, bViews.top, '#3779d0', 5, 'b');
    this.drawPoint(context, bViews.left, '#3779d0', 5, 'b″');
    context.restore();
  },

  drawPlaneProjectionOverlay(context) {
    const keys = ['a', 'b', 'c'];
    const projections = keys.map((key) => this.getProjectionScreenPoints(this.data.plane[key]));
    const front = projections.map((views) => views.front);
    const top = projections.map((views) => views.top);
    const left = projections.map((views) => views.left);
    const metrics = this.getProjectionMetrics();

    context.save();
    this.drawPolygon(context, front, 'rgba(223, 87, 87, 0.12)', '#df5757', 2.2);
    this.drawPolygon(context, top, 'rgba(67, 166, 108, 0.12)', '#43a66c', 2.2);
    this.drawPolygon(context, left, 'rgba(55, 121, 208, 0.12)', '#3779d0', 2.2);
    [0, 1, 2].forEach((index) => {
      this.drawProjectionCorrespondence(
        context,
        { front: front[index], top: top[index], left: left[index] },
        this.data.plane[keys[index]].y,
        metrics.origin,
        metrics.unit,
        '#c4cad1'
      );
    });
    const redrawOutline = (points, color) => {
      context.strokeStyle = color;
      context.lineWidth = 2.2;
      context.setLineDash([]);
      for (let index = 0; index < points.length; index += 1) {
        this.drawLine(context, points[index], points[(index + 1) % points.length]);
      }
    };
    redrawOutline(front, '#df5757');
    redrawOutline(top, '#43a66c');
    redrawOutline(left, '#3779d0');
    const colors = ['#ff4f53', '#3779d0', '#f0a62e'];
    const suffixes = [
      ["a′", 'a', 'a″'], ["b′", 'b', 'b″'], ["c′", 'c', 'c″']
    ];
    projections.forEach((views, index) => {
      this.drawPoint(context, views.front, colors[index], 5, suffixes[index][0]);
      this.drawPoint(context, views.top, colors[index], 5, suffixes[index][1]);
      this.drawPoint(context, views.left, colors[index], 5, suffixes[index][2]);
    });
    context.restore();
  },

  getSectionResult() {
    if (!this.sectionSolidCache) this.sectionSolidCache = {};
    const solidType = this.data.section.solidType;
    const resultKey = `${solidType}:${this.data.section.angle}:${this.data.section.offset}`;
    if (this.sectionResultCache && this.sectionResultCache.key === resultKey) {
      return this.sectionResultCache.value;
    }
    if (!this.sectionSolidCache[solidType]) {
      this.sectionSolidCache[solidType] = SectionGeometry.createSolid(solidType);
      this.sectionSolidCache[solidType].type = solidType;
    }
    const solid = this.sectionSolidCache[solidType];
    const plane = SectionGeometry.createCuttingPlane(this.data.section.angle, this.data.section.offset);
    const sectionSegments = SectionGeometry.intersectSolid(solid, plane);
    const sideSigns = this.getSectionSideSigns(plane);
    const retainedTriangles = this.createClippedTriangles(solid.renderTriangles, plane, sideSigns.retainedSign);
    const removedTriangles = this.createClippedTriangles(solid.renderTriangles, plane, sideSigns.removedSign);
    const sectionCapTriangles = SectionGeometry.createSectionCaps(sectionSegments, plane, sideSigns.removedSign);
    const retainedClosedTriangles = retainedTriangles.concat(sectionCapTriangles);
    const retainedSolid = { renderTriangles: retainedClosedTriangles, projectionLineSets: {} };
    const value = {
      solid,
      plane,
      sectionSegments,
      sideSigns,
      retainedSolid,
      retainedTriangles,
      removedTriangles,
      sectionCapTriangles
    };
    this.sectionResultCache = { key: resultKey, value };
    return value;
  },

  drawSectionIsometricOverlay(context) {
    const { solid, plane, sectionSegments, sideSigns, retainedTriangles, removedTriangles } = this.getSectionResult();
    const planeBoundary = this.getCuttingPlaneBoundary(plane);
    context.save();
    this.drawRenderedSolid(context, solid, plane, sideSigns.removedSign, false);
    this.drawSpatialSolidEdges(context, solid, plane, sideSigns.removedSign, false, removedTriangles);
    this.drawRenderedSolid(context, solid, plane, sideSigns.retainedSign, true);
    this.drawSpatialSolidEdges(context, solid, plane, sideSigns.retainedSign, true, retainedTriangles);
    // 截平面是虚拟教学辅助面，不参与实体遮挡，始终作为顶层覆盖显示。
    if (planeBoundary.length === 4) {
      this.drawPolygon(
        context,
        planeBoundary.map((vertex) => this.projectIsometric(vertex)),
        'rgba(235, 55, 62, 0.22)',
        '#ff3b43',
        2
      );
    }
    context.strokeStyle = '#ff4f53';
    context.lineWidth = 3;
    sectionSegments.forEach((segment) => {
      this.drawLine(context, this.projectIsometric(segment[0]), this.projectIsometric(segment[1]));
    });
    context.restore();
  },

  drawSpatialSolidEdges(context, solid, plane, keepSign, isRetained, surfaceTriangles) {
    const featureEdges = this.getSpatialFeatureEdges(solid);
    const lineSets = { visible: [], hidden: [] };
    featureEdges.forEach((edge) => {
      const clippedEdge = this.clipSegmentByPlane(edge, plane, keepSign);
      if (!clippedEdge) return;
      if (this.isSpatialFeatureEdgeVisible(edge, clippedEdge, solid, surfaceTriangles)) lineSets.visible.push(clippedEdge);
      else lineSets.hidden.push(clippedEdge);
    });
    context.save();
    context.strokeStyle = isRetained ? 'rgba(255, 255, 255, 0.72)' : 'rgba(218, 230, 236, 0.28)';
    context.lineWidth = isRetained ? 0.65 : 0.55;
    context.setLineDash([2.5, 3]);
    lineSets.hidden.forEach((clippedEdge) => {
      this.drawLine(
        context,
        this.projectIsometric(clippedEdge[0]),
        this.projectIsometric(clippedEdge[1])
      );
    });
    context.strokeStyle = isRetained ? '#ffffff' : 'rgba(225, 238, 244, 0.52)';
    context.lineWidth = isRetained ? 1.35 : 0.75;
    context.setLineDash([]);
    lineSets.visible.forEach((clippedEdge) => {
      this.drawLine(
        context,
        this.projectIsometric(clippedEdge[0]),
        this.projectIsometric(clippedEdge[1])
      );
    });
    context.restore();
  },

  isSpatialFeatureEdgeVisible(originalEdge, clippedEdge, solid, surfaceTriangles) {
    if (solid.type === 'triangularPyramid' || solid.type === 'pentagonalPrism') {
      const facings = this.getPolyhedronEdgeFacings(solid, originalEdge);
      if (facings.length) return facings.some((facing) => facing >= -1e-8);
    }
    return this.isIsometricEdgeVisible(clippedEdge, surfaceTriangles);
  },

  getPolyhedronEdgeFacings(solid, edge) {
    if (!solid.polyhedronEdgeFacings) {
      const edgeMap = new Map();
      const vertexKey = (vertex) => `${Math.round(vertex.x * 1e6)}:${Math.round(vertex.y * 1e6)}:${Math.round(vertex.z * 1e6)}`;
      solid.triangles.forEach((triangle) => {
        const ab = {
          x: triangle[1].x - triangle[0].x,
          y: triangle[1].y - triangle[0].y,
          z: triangle[1].z - triangle[0].z
        };
        const ac = {
          x: triangle[2].x - triangle[0].x,
          y: triangle[2].y - triangle[0].y,
          z: triangle[2].z - triangle[0].z
        };
        const normal = {
          x: ab.y * ac.z - ab.z * ac.y,
          y: ab.z * ac.x - ab.x * ac.z,
          z: ab.x * ac.y - ab.y * ac.x
        };
        const facing = normal.x + normal.y + normal.z * ISOMETRIC_DEPTH_Z;
        for (let index = 0; index < 3; index += 1) {
          const next = (index + 1) % 3;
          const keys = [vertexKey(triangle[index]), vertexKey(triangle[next])].sort();
          const key = `${keys[0]}|${keys[1]}`;
          if (!edgeMap.has(key)) edgeMap.set(key, []);
          edgeMap.get(key).push(facing);
        }
      });
      solid.polyhedronEdgeFacings = edgeMap;
    }
    const vertexKey = (vertex) => `${Math.round(vertex.x * 1e6)}:${Math.round(vertex.y * 1e6)}:${Math.round(vertex.z * 1e6)}`;
    const keys = [vertexKey(edge[0]), vertexKey(edge[1])].sort();
    return solid.polyhedronEdgeFacings.get(`${keys[0]}|${keys[1]}`) || [];
  },

  isIsometricEdgeVisible(edge, triangles) {
    const projectedStart = this.projectIsometric(edge[0]);
    const projectedEnd = this.projectIsometric(edge[1]);
    const midpoint = {
      x: (projectedStart.x + projectedEnd.x) / 2,
      y: (projectedStart.y + projectedEnd.y) / 2
    };
    const edgeDepth = (this.getIsometricDepth(edge[0]) + this.getIsometricDepth(edge[1])) / 2;
    let nearestDepth = -Infinity;
    triangles.forEach((triangle) => {
      const projected = triangle.map((vertex) => this.projectIsometric(vertex));
      const barycentric = this.getBarycentricCoordinates(midpoint, projected);
      if (!barycentric) return;
      const depth = barycentric[0] * this.getIsometricDepth(triangle[0])
        + barycentric[1] * this.getIsometricDepth(triangle[1])
        + barycentric[2] * this.getIsometricDepth(triangle[2]);
      nearestDepth = Math.max(nearestDepth, depth);
    });
    return nearestDepth <= edgeDepth + 1e-4;
  },

  getIsometricDepth(point) {
    return point.x + point.y + point.z * ISOMETRIC_DEPTH_Z;
  },

  getSpatialFeatureEdges(solid) {
    if (solid.type === 'sphere' || solid.type === 'torus') return [];
    if (solid.type === 'cylinder' || solid.type === 'cone') {
      if (!solid.spatialSilhouetteEdges) {
        solid.spatialSilhouetteEdges = solid.edges.filter((edge) => {
          const isGenerator = Math.abs(edge[0].z - edge[1].z) > 1e-8;
          return !isGenerator || this.isProjectedBoundaryEdge(edge, solid.triangles);
        });
      }
      return solid.spatialSilhouetteEdges;
    }
    return solid.edges;
  },

  isProjectedBoundaryEdge(edge, triangles) {
    const start = this.projectIsometric(edge[0]);
    const end = this.projectIsometric(edge[1]);
    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const edgeLength = Math.hypot(edgeX, edgeY);
    if (edgeLength <= 1e-8) return false;
    let hasPositive = false;
    let hasNegative = false;
    const tolerance = edgeLength * 1e-5;
    triangles.forEach((triangle) => {
      triangle.forEach((vertex) => {
        const projected = this.projectIsometric(vertex);
        const side = edgeX * (projected.y - start.y) - edgeY * (projected.x - start.x);
        if (side > tolerance) hasPositive = true;
        if (side < -tolerance) hasNegative = true;
      });
    });
    return !(hasPositive && hasNegative);
  },

  clipSegmentByPlane(edge, plane, keepSign) {
    const distances = edge.map((vertex) => keepSign * (
      vertex.x * plane.normal.x + vertex.y * plane.normal.y + vertex.z * plane.normal.z - plane.constant
    ));
    const insideFirst = distances[0] >= -1e-8;
    const insideSecond = distances[1] >= -1e-8;
    if (!insideFirst && !insideSecond) return null;
    if (insideFirst && insideSecond) return edge;
    const t = distances[0] / (distances[0] - distances[1]);
    const intersection = {
      x: edge[0].x + (edge[1].x - edge[0].x) * t,
      y: edge[0].y + (edge[1].y - edge[0].y) * t,
      z: edge[0].z + (edge[1].z - edge[0].z) * t
    };
    return insideFirst ? [edge[0], intersection] : [intersection, edge[1]];
  },

  simplifyLoopVertices(loop) {
    const count = loop.length;
    if (count <= 2) return loop.slice();
    const result = [];
    for (let index = 0; index < count; index += 1) {
      const prev = loop[(index - 1 + count) % count];
      const cur = loop[index];
      const next = loop[(index + 1) % count];
      const e1 = { x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z };
      const e2 = { x: next.x - cur.x, y: next.y - cur.y, z: next.z - cur.z };
      const cross = {
        x: e1.y * e2.z - e1.z * e2.y,
        y: e1.z * e2.x - e1.x * e2.z,
        z: e1.x * e2.y - e1.y * e2.x
      };
      if (Math.hypot(cross.x, cross.y, cross.z) > 1e-8) result.push(cur);
    }
    return result.length ? result : loop.slice();
  },

  drawSectionPointCorrespondence(context) {
    const result = this.getSectionResult();
    const segments = result.sectionSegments;
    if (!segments || !segments.length) return;
    const loops = SectionGeometry.createSectionLoops(segments);
    if (!loops.length) return;
    const metrics = this.getProjectionMetrics();
    const origin = metrics.origin;
    const unit = metrics.unit;
    const color = '#c9d0d8';
    const key = (p) => `${Math.round(p.x * 1e6)}:${Math.round(p.y * 1e6)}:${Math.round(p.z * 1e6)}`;
    const reps = [];
    loops.forEach((loop) => {
      this.simplifyLoopVertices(loop).forEach((point) => {
        const k = key(point);
        if (!reps.some((existing) => key(existing) === k)) reps.push(point);
      });
    });
    const step = Math.max(1, Math.ceil(reps.length / 6));
    const selected = [];
    for (let index = 0; index < reps.length; index += step) selected.push(reps[index]);
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 0.8;
    context.setLineDash([]);
    selected.forEach((point) => {
      const front = { x: origin.x - point.x * unit, y: origin.y - point.z * unit };
      const top = { x: origin.x - point.x * unit, y: origin.y + point.y * unit };
      const left = { x: origin.x + point.y * unit, y: origin.y - point.z * unit };
      const topAxis = { x: origin.x, y: top.y };
      const leftAxis = { x: left.x, y: origin.y };
      // 长对正：正视↔俯视（共 X）；高平齐：正视↔左视（共 Z）
      this.drawProjectionLine(context, front, top, color);
      this.drawProjectionLine(context, front, left, color);
      // 投影点引向对应投影轴的辅助对应线
      this.drawProjectionLine(context, top, topAxis, color);
      this.drawProjectionLine(context, leftAxis, left, color);
      // 宽相等：该点 H 宽度与 W 宽度之间的转位弧（与点/线/面一致）
      this.drawQuarterTurnForY(context, point.y, origin, unit);
      [front, top, left].forEach((projected) => this.drawDot(context, projected, color));
    });
    context.restore();
  },

  drawDot(context, point, color) {
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.restore();
  },

  drawSectionProjectionOverlay(context) {
    const { solid, plane, sectionSegments, retainedSolid } = this.getSectionResult();
    const views = ['front', 'top', 'left'];
    context.save();
    this.drawSectionPointCorrespondence(context);
    views.forEach((viewType) => {
      this.drawProjectionCenterLines(context, retainedSolid, solid.type, viewType);
      this.drawSolidProjection(context, retainedSolid, viewType);
    });
    const frontLine = this.getCuttingPlaneXZSegment(plane);
    if (frontLine.length === 2) {
      context.strokeStyle = '#e66a6e';
      context.lineWidth = 1.5;
      this.drawLine(
        context,
        this.projectPointToView(frontLine[0], 'front'),
        this.projectPointToView(frontLine[1], 'front')
      );
      this.drawText(
        context,
        'Pv',
        this.projectPointToView(frontLine[1], 'front').x + 4,
        this.projectPointToView(frontLine[1], 'front').y - 4,
        '#c93f45',
        10,
        '600'
      );
    }
    const sectionLoops = SectionGeometry.createSectionLoops(sectionSegments);
    context.strokeStyle = '#e23840';
    context.lineWidth = 2.8;
    context.setLineDash([]);
    views.forEach((viewType) => {
      const drawLoop = (loop) => {
        const projected = loop.map((point) => this.projectPointToView(point, viewType));
        if (projected.length < 2) return;
        context.beginPath();
        context.moveTo(projected[0].x, projected[0].y);
        for (let index = 1; index < projected.length; index += 1) {
          context.lineTo(projected[index].x, projected[index].y);
        }
        context.closePath();
        context.stroke();
      };
      if (sectionLoops.length) {
        sectionLoops.forEach(drawLoop);
      } else {
        sectionSegments.forEach((segment) => {
          this.drawLine(
            context,
            this.projectPointToView(segment[0], viewType),
            this.projectPointToView(segment[1], viewType)
          );
        });
      }
    });
    context.restore();
  },

  drawRenderedSolid(context, solid, plane, keepSign, isRetained) {
    const light = { x: -0.35, y: -0.45, z: 0.82 };
    const renderTriangles = [];
    solid.renderTriangles.forEach((triangle) => {
      const clippedPolygon = this.clipPolygonByPlane(triangle, plane, keepSign);
      if (clippedPolygon.length < 3) return;
      const projected = clippedPolygon.map((vertex) => this.projectIsometric(vertex));
      const ab = {
        x: triangle[1].x - triangle[0].x,
        y: triangle[1].y - triangle[0].y,
        z: triangle[1].z - triangle[0].z
      };
      const ac = {
        x: triangle[2].x - triangle[0].x,
        y: triangle[2].y - triangle[0].y,
        z: triangle[2].z - triangle[0].z
      };
      const normal = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x
      };
      const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
      const diffuse = Math.abs((normal.x * light.x + normal.y * light.y + normal.z * light.z) / length);
      const intensity = 0.55 + diffuse * 0.45;
      const red = Math.round(35 + 55 * intensity);
      const green = Math.round(105 + 100 * intensity);
      const blue = Math.round(145 + 100 * intensity);
      renderTriangles.push({
        projected,
        depth: clippedPolygon.reduce((sum, vertex) => sum + vertex.x + vertex.y + vertex.z * ISOMETRIC_DEPTH_Z, 0) / clippedPolygon.length,
        color: isRetained ? `rgb(${red}, ${green}, ${blue})` : 'rgba(205, 220, 230, 0.18)'
      });
    });
    renderTriangles.sort((first, second) => first.depth - second.depth);
    renderTriangles.forEach((renderTriangle) => {
      for (let index = 1; index < renderTriangle.projected.length - 1; index += 1) {
        this.fillTriangle(
          context,
          [renderTriangle.projected[0], renderTriangle.projected[index], renderTriangle.projected[index + 1]],
          renderTriangle.color
        );
      }
    });
  },

  getSectionSideSigns(plane) {
    // 取模型上方测试点所在半空间为切除侧，保证“上部切除”语义不随角度翻转。
    const topDistance = 4 * plane.normal.x + 8 * plane.normal.z - plane.constant;
    const removedSign = topDistance >= 0 ? 1 : -1;
    return { removedSign, retainedSign: -removedSign };
  },

  createClippedTriangles(triangles, plane, keepSign) {
    const clippedTriangles = [];
    triangles.forEach((triangle) => {
      const polygon = this.clipPolygonByPlane(triangle, plane, keepSign);
      for (let index = 1; index < polygon.length - 1; index += 1) {
        clippedTriangles.push([polygon[0], polygon[index], polygon[index + 1]]);
      }
    });
    return clippedTriangles;
  },

  clipPolygonByPlane(vertices, plane, keepSign) {
    const clipped = [];
    for (let index = 0; index < vertices.length; index += 1) {
      const current = vertices[index];
      const next = vertices[(index + 1) % vertices.length];
      const currentDistance = keepSign * (
        current.x * plane.normal.x + current.y * plane.normal.y + current.z * plane.normal.z - plane.constant
      );
      const nextDistance = keepSign * (
        next.x * plane.normal.x + next.y * plane.normal.y + next.z * plane.normal.z - plane.constant
      );
      const currentInside = currentDistance >= -1e-8;
      const nextInside = nextDistance >= -1e-8;
      if (currentInside) clipped.push(current);
      if (currentInside !== nextInside) {
        const t = currentDistance / (currentDistance - nextDistance);
        clipped.push({
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
          z: current.z + (next.z - current.z) * t
        });
      }
    }
    return clipped;
  },

  drawSolidProjection(context, solid, viewType) {
    const lineSets = this.getProjectionLineSets(solid, viewType);
    context.save();
    context.strokeStyle = '#9aa5b2';
    context.lineWidth = 0.75;
    context.setLineDash([3, 3]);
    lineSets.hidden.forEach((edge) => {
      this.drawLine(
        context,
        this.projectPointToView(edge[0], viewType),
        this.projectPointToView(edge[1], viewType)
      );
    });
    // 可见线后画，避免同位置的隐藏线虚线覆盖可见实线。
    context.strokeStyle = '#4d5a69';
    context.lineWidth = 1.35;
    context.setLineDash([]);
    lineSets.visible.forEach((edge) => {
      this.drawLine(
        context,
        this.projectPointToView(edge[0], viewType),
        this.projectPointToView(edge[1], viewType)
      );
    });
    context.restore();
  },

  drawProjectionCenterLines(context, solid, solidType, viewType) {
    const rotationalTypes = ['cylinder', 'cone', 'sphere', 'torus'];
    if (!rotationalTypes.includes(solidType) || !solid.renderTriangles.length) return;
    const vertices = [];
    solid.renderTriangles.forEach((triangle) => triangle.forEach((vertex) => vertices.push(vertex)));
    const bounds = vertices.reduce((result, vertex) => ({
      minX: Math.min(result.minX, vertex.x),
      maxX: Math.max(result.maxX, vertex.x),
      minY: Math.min(result.minY, vertex.y),
      maxY: Math.max(result.maxY, vertex.y),
      minZ: Math.min(result.minZ, vertex.z),
      maxZ: Math.max(result.maxZ, vertex.z)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const extension = 0.35;
    const center = { x: 4, y: 4, z: 4 };
    const lines = [];
    if (viewType === 'front') {
      lines.push([
        { x: center.x, y: center.y, z: bounds.minZ - extension },
        { x: center.x, y: center.y, z: bounds.maxZ + extension }
      ]);
      if (solidType === 'sphere' || solidType === 'torus') {
        lines.push([
          { x: bounds.minX - extension, y: center.y, z: center.z },
          { x: bounds.maxX + extension, y: center.y, z: center.z }
        ]);
      }
    } else if (viewType === 'left') {
      lines.push([
        { x: center.x, y: center.y, z: bounds.minZ - extension },
        { x: center.x, y: center.y, z: bounds.maxZ + extension }
      ]);
      if (solidType === 'sphere' || solidType === 'torus') {
        lines.push([
          { x: center.x, y: bounds.minY - extension, z: center.z },
          { x: center.x, y: bounds.maxY + extension, z: center.z }
        ]);
      }
    } else {
      lines.push([
        { x: bounds.minX - extension, y: center.y, z: center.z },
        { x: bounds.maxX + extension, y: center.y, z: center.z }
      ], [
        { x: center.x, y: bounds.minY - extension, z: center.z },
        { x: center.x, y: bounds.maxY + extension, z: center.z }
      ]);
    }
    context.save();
    context.strokeStyle = '#718091';
    context.lineWidth = 0.7;
    context.setLineDash([8, 2, 1.5, 2]);
    lines.forEach((line) => this.drawLine(
      context,
      this.projectPointToView(line[0], viewType),
      this.projectPointToView(line[1], viewType)
    ));
    context.restore();
  },

  getProjectionLineSets(solid, viewType) {
    if (!solid.projectionLineSets) solid.projectionLineSets = {};
    if (solid.projectionLineSets[viewType]) return solid.projectionLineSets[viewType];
    const viewDirections = {
      front: { x: 0, y: 1, z: 0 },
      top: { x: 0, y: 0, z: 1 },
      left: { x: 1, y: 0, z: 0 }
    };
    const viewDirection = viewDirections[viewType];
    const edgeMap = new Map();
    const vertexKey = (vertex) => `${Math.round(vertex.x * 1e6)}:${Math.round(vertex.y * 1e6)}:${Math.round(vertex.z * 1e6)}`;
    solid.renderTriangles.forEach((triangle) => {
      const ab = {
        x: triangle[1].x - triangle[0].x,
        y: triangle[1].y - triangle[0].y,
        z: triangle[1].z - triangle[0].z
      };
      const ac = {
        x: triangle[2].x - triangle[0].x,
        y: triangle[2].y - triangle[0].y,
        z: triangle[2].z - triangle[0].z
      };
      const normal = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x
      };
      if (normal.x * normal.x + normal.y * normal.y + normal.z * normal.z <= 1e-12) return;
      const facing = normal.x * viewDirection.x + normal.y * viewDirection.y + normal.z * viewDirection.z;
      for (let index = 0; index < 3; index += 1) {
        const next = (index + 1) % 3;
        const firstKey = vertexKey(triangle[index]);
        const secondKey = vertexKey(triangle[next]);
        const key = firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { edge: [triangle[index], triangle[next]], facings: [], normals: [] });
        const entry = edgeMap.get(key);
        entry.facings.push(facing);
        entry.normals.push(normal);
      }
    });
    const tolerance = 1e-7;
    // 高于 35° 才视为结构棱，避免把圆球、圆环的参数分段误画成网格线。
    const sharpCosine = Math.cos(35 * Math.PI / 180);
    const candidateEdges = [];
    edgeMap.forEach((entry) => {
      if (entry.facings.length === 1) {
        candidateEdges.push(entry.edge);
        return;
      }
      const hasPositive = entry.facings.some((value) => value > tolerance);
      const hasNegative = entry.facings.some((value) => value < -tolerance);
      const hasTangent = entry.facings.some((value) => Math.abs(value) <= tolerance);
      const hasFacingSurface = entry.facings.some((value) => Math.abs(value) > tolerance);
      let isSharp = false;
      if (entry.normals.length >= 2) {
        const first = entry.normals[0];
        const second = entry.normals[1];
        const firstLength = Math.hypot(first.x, first.y, first.z) || 1;
        const secondLength = Math.hypot(second.x, second.y, second.z) || 1;
        const cosine = (first.x * second.x + first.y * second.y + first.z * second.z) / (firstLength * secondLength);
        isSharp = cosine < sharpCosine;
      }
      if ((hasPositive && hasNegative) || (hasTangent && hasFacingSurface) || isSharp) candidateEdges.push(entry.edge);
    });
    const lineSets = { visible: [], hidden: [] };
    candidateEdges.forEach((edge) => {
      if (this.isProjectionEdgeVisible(edge, solid.renderTriangles, viewType)) lineSets.visible.push(edge);
      else lineSets.hidden.push(edge);
    });
    solid.projectionLineSets[viewType] = lineSets;
    return lineSets;
  },

  isProjectionEdgeVisible(edge, triangles, viewType) {
    const projectedStart = this.projectPointToView(edge[0], viewType);
    const projectedEnd = this.projectPointToView(edge[1], viewType);
    const midpoint = {
      x: (projectedStart.x + projectedEnd.x) / 2,
      y: (projectedStart.y + projectedEnd.y) / 2
    };
    const edgeDepth = (this.getViewDepth(edge[0], viewType) + this.getViewDepth(edge[1], viewType)) / 2;
    let nearestDepth = -Infinity;
    triangles.forEach((triangle) => {
      const projected = triangle.map((vertex) => this.projectPointToView(vertex, viewType));
      const barycentric = this.getBarycentricCoordinates(midpoint, projected);
      if (!barycentric) return;
      const depth = barycentric[0] * this.getViewDepth(triangle[0], viewType)
        + barycentric[1] * this.getViewDepth(triangle[1], viewType)
        + barycentric[2] * this.getViewDepth(triangle[2], viewType);
      nearestDepth = Math.max(nearestDepth, depth);
    });
    return nearestDepth <= edgeDepth + 1e-4;
  },

  getViewDepth(point, viewType) {
    // 第一分角：正视观察者位于 +Y，俯视观察者位于 +Z，左视观察者位于 +X。
    // 深度值越大表示越靠近观察者。
    if (viewType === 'front') return point.y;
    if (viewType === 'top') return point.z;
    return point.x;
  },

  getBarycentricCoordinates(point, triangle) {
    const denominator = (triangle[1].y - triangle[2].y) * (triangle[0].x - triangle[2].x)
      + (triangle[2].x - triangle[1].x) * (triangle[0].y - triangle[2].y);
    if (Math.abs(denominator) <= 1e-8) return null;
    const first = ((triangle[1].y - triangle[2].y) * (point.x - triangle[2].x)
      + (triangle[2].x - triangle[1].x) * (point.y - triangle[2].y)) / denominator;
    const second = ((triangle[2].y - triangle[0].y) * (point.x - triangle[2].x)
      + (triangle[0].x - triangle[2].x) * (point.y - triangle[2].y)) / denominator;
    const third = 1 - first - second;
    const tolerance = -1e-5;
    if (first < tolerance || second < tolerance || third < tolerance) return null;
    return [first, second, third];
  },

  fillTriangle(context, triangle, fillStyle) {
    context.beginPath();
    context.moveTo(triangle[0].x, triangle[0].y);
    context.lineTo(triangle[1].x, triangle[1].y);
    context.lineTo(triangle[2].x, triangle[2].y);
    context.closePath();
    context.fillStyle = fillStyle;
    context.fill();
  },


  projectPointToView(point, viewType) {
    const metrics = this.getProjectionMetrics();
    const { origin, unit } = metrics;
    if (viewType === 'front') return { x: origin.x - point.x * unit, y: origin.y - point.z * unit };
    if (viewType === 'top') return { x: origin.x - point.x * unit, y: origin.y + point.y * unit };
    return { x: origin.x + point.y * unit, y: origin.y - point.z * unit };
  },

  getCuttingPlaneXZSegment(plane) {
    const candidates = [];
    const addCandidate = (x, z) => {
      if (x < -1e-8 || x > 8 + 1e-8 || z < -1e-8 || z > 8 + 1e-8) return;
      if (!candidates.some((candidate) => Math.hypot(candidate.x - x, candidate.z - z) < 1e-7)) {
        candidates.push({ x, y: 0, z });
      }
    };
    const { x: normalX, z: normalZ } = plane.normal;
    if (Math.abs(normalZ) > 1e-8) {
      addCandidate(0, plane.constant / normalZ);
      addCandidate(8, (plane.constant - normalX * 8) / normalZ);
    }
    if (Math.abs(normalX) > 1e-8) {
      addCandidate(plane.constant / normalX, 0);
      addCandidate((plane.constant - normalZ * 8) / normalX, 8);
    }
    if (candidates.length <= 2) return candidates;
    let pair = [candidates[0], candidates[1]];
    let longest = 0;
    for (let first = 0; first < candidates.length; first += 1) {
      for (let second = first + 1; second < candidates.length; second += 1) {
        const distance = Math.hypot(candidates[first].x - candidates[second].x, candidates[first].z - candidates[second].z);
        if (distance > longest) {
          longest = distance;
          pair = [candidates[first], candidates[second]];
        }
      }
    }
    return pair;
  },

  getCuttingPlaneBoundary(plane) {
    const frontLine = this.getCuttingPlaneXZSegment(plane);
    if (frontLine.length !== 2) return [];
    return [
      { ...frontLine[0], y: 0 },
      { ...frontLine[1], y: 0 },
      { ...frontLine[1], y: 8 },
      { ...frontLine[0], y: 8 }
    ];
  },

  drawQuarterTurnForY(context, y, origin, unit) {
    const radius = Math.max(8, Math.abs(y * unit));
    context.save();
    context.strokeStyle = '#d4d8dd';
    context.setLineDash([]);
    context.lineWidth = 0.75;
    context.beginPath();
    context.arc(origin.x, origin.y, radius, 0, Math.PI / 2);
    context.stroke();
    context.restore();
  },

  drawProjectionCorrespondence(context, views, y, origin, unit, color) {
    const topAxisPoint = { x: origin.x, y: views.top.y };
    const leftAxisPoint = { x: views.left.x, y: origin.y };
    this.drawProjectionLine(context, views.front, views.top, color);
    this.drawProjectionLine(context, views.front, views.left, color);
    this.drawProjectionLine(context, views.top, topAxisPoint, color);
    this.drawProjectionLine(context, leftAxisPoint, views.left, color);
    this.drawQuarterTurnForY(context, y, origin, unit);
  },

  drawQuarterTurn(context, top, left, origin, unit) {
    this.drawQuarterTurnForY(context, this.getPrimaryPoint().y, origin, unit);
  },

  drawSingleProjection(context, panel) {
    context.save();
    this.roundRect(context, panel.x, panel.y, panel.width, panel.height, 10);
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = '#dce4ec';
    context.stroke();
    context.clip();

    const center = { x: panel.x + panel.width / 2, y: panel.y + panel.height * 0.57 };
    const unit = Math.min(panel.width / 20, panel.height / 22);
    context.strokeStyle = '#d9e0e8';
    context.lineWidth = 1;
    this.drawLine(context, { x: panel.x + 8, y: center.y }, { x: panel.x + panel.width - 8, y: center.y });
    this.drawLine(context, { x: center.x, y: panel.y + 30 }, { x: center.x, y: panel.y + panel.height - 8 });

    const viewPoint = this.worldToView(this.data.point, panel.type);
    const projected = { x: center.x + viewPoint.u * unit, y: center.y - viewPoint.v * unit };
    this.drawProjectionLine(context, projected, { x: projected.x, y: center.y }, '#aab8c6');
    this.drawProjectionLine(context, projected, { x: center.x, y: projected.y }, '#aab8c6');
    this.drawPoint(context, projected, '#286a86', 5, panel.label);
    this.drawText(context, panel.title, panel.x + 10, panel.y + 18, '#41546c', 10, '600');
    context.restore();
  },

  drawPoint(context, point, color, radius, label) {
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
    context.fillStyle = `${color}26`;
    context.fill();
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    this.drawText(context, label, point.x + radius + 5, point.y - radius, '#26384d', 11, '700');
    context.restore();
  },

  drawArrow(context, start, end, color) {
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.8;
    this.drawLine(context, start, end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - 7 * Math.cos(angle - 0.45), end.y - 7 * Math.sin(angle - 0.45));
    context.lineTo(end.x - 7 * Math.cos(angle + 0.45), end.y - 7 * Math.sin(angle + 0.45));
    context.closePath();
    context.fill();
    context.restore();
  },

  drawLine(context, start, end) {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  },

  drawPolygon(context, points, fillStyle, strokeStyle, lineWidth) {
    if (!points || points.length < 3) return;
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.fillStyle = fillStyle;
    context.fill();
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
    context.restore();
  },

  drawDashedLine(context, start, end, color) {
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = color;
    context.lineWidth = 1;
    this.drawLine(context, start, end);
    context.restore();
  },

  drawProjectionLine(context, start, end, color) {
    context.save();
    context.setLineDash([]);
    context.strokeStyle = color;
    context.lineWidth = 0.75;
    this.drawLine(context, start, end);
    context.restore();
  },

  drawText(context, text, x, y, color, size, weight) {
    context.save();
    context.fillStyle = color;
    context.font = `${weight} ${size}px sans-serif`;
    context.fillText(text, x, y);
    context.restore();
  },

  roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
});
