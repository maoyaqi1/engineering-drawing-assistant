// 最大斜度线 · 独立互动页。
//
// 页面只维护所选投影面和当前候选方向；几何真值来自
// maximum-slope-model.js，Canvas 绘制集中在 maximum-slope-render.js。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const drawHelpers = require('../index/draw-helpers.js');
const renderScene = require('../index/render-scene.js');
const model = require('./maximum-slope-model.js');
const renderMethods = require('./maximum-slope-render.js');

const COMPACT_SPATIAL_HEIGHT_RATIO = 0.4;
const TOUCH_RADIUS = 30;

const pageDefinition = Object.assign({
  data: {
    selectedPlane: 'H',
    projectionAngleSymbol: 'α',
    planeAngleText: '0.0°',
    lineAngleText: '0.0°',
    isMaximum: true,
    plane: model.clonePlane(),
    canvasDragging: false
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
    this._draggingDirectionHandle = false;
    this.updateGeometry('H', null, false);
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
    this.clearDragState();
    this.setData({ canvasDragging: false });
    this.endLearningSession();
  },

  onUnload() {
    this.endLearningSession();
    this.clearDragState();
    this._geometry = null;
    this.canvas = null;
    this.context = null;
  },

  onShareAppMessage() {
    return {
      title: '最大斜度线',
      path: '/pages/maximum-slope-line/maximum-slope-line'
    };
  },

  updateGeometry(selectedPlane, orientation, redraw) {
    const geometry = model.buildGeometryFromOrientation(
      this.data.plane,
      selectedPlane,
      orientation
    );
    if (!geometry) return;
    this._geometry = geometry;
    this.setData(Object.assign({
      selectedPlane
    }, this.createDisplayPatch(geometry)), () => {
      if (redraw !== false) this.scheduleCanvasDraw();
    });
  },

  createDisplayPatch(geometry) {
    return {
      projectionAngleSymbol: geometry.projectionSymbol,
      planeAngleText: `${geometry.maximumAngleDegrees.toFixed(1)}°`,
      lineAngleText: `${geometry.angleDegrees.toFixed(1)}°`,
      isMaximum: geometry.isMaximum
    };
  },

  selectPlane(event) {
    const selectedPlane = event.currentTarget.dataset.plane;
    if (!model.PROJECTION_DEFINITIONS[selectedPlane]
      || selectedPlane === this.data.selectedPlane) {
      return;
    }
    this.recordInteraction();
    this.clearDragState();
    this.setData({ canvasDragging: false });
    this.updateGeometry(selectedPlane, null, true);
  },

  handleReset() {
    this.recordInteraction();
    this.clearDragState();
    this.setData({ canvasDragging: false });
    this.updateGeometry('H', null, true);
  },

  clearDragState() {
    this._draggingDirectionHandle = false;
  },

  handleTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this._geometry || !this.canvasWidth) return;
    const viewType = this._geometry.viewType;
    const handle = this.getProjectionScreenPoints(
      this._geometry.candidate.positiveEnd
    )[viewType];
    if (Math.hypot(touch.x - handle.x, touch.y - handle.y) > TOUCH_RADIUS) {
      return;
    }
    this.recordInteraction();
    this._draggingDirectionHandle = true;
    this.setData({ canvasDragging: true });
  },

  handleTouchMove(event) {
    if (!this._draggingDirectionHandle || !this._geometry) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const geometry = this._geometry;
    const viewType = geometry.viewType;
    const anchor = this.getProjectionScreenPoints(geometry.anchor)[viewType];
    const screenDelta = {
      x: touch.x - anchor.x,
      y: touch.y - anchor.y
    };
    if (Math.hypot(screenDelta.x, screenDelta.y) < 8) return;
    let viewDelta;
    if (viewType === 'front') {
      viewDelta = { u: -screenDelta.x, v: -screenDelta.y };
    } else if (viewType === 'top') {
      viewDelta = { u: -screenDelta.x, v: screenDelta.y };
    } else {
      viewDelta = { u: screenDelta.x, v: -screenDelta.y };
    }
    const orientation = model.orientationFromViewVector(
      geometry.basis,
      geometry.projectionPlane,
      viewDelta
    );
    if (!Number.isFinite(orientation)) return;
    const nextGeometry = model.buildGeometryFromOrientation(
      this.data.plane,
      geometry.projectionPlane,
      orientation
    );
    if (!nextGeometry) return;
    this._geometry = nextGeometry;
    const displayPatch = this.createDisplayPatch(nextGeometry);
    const displayChanged = Object.keys(displayPatch).some(
      (key) => this.data[key] !== displayPatch[key]
    );
    if (displayChanged) {
      this.setData(displayPatch, () => this.scheduleCanvasDraw());
    } else {
      this.scheduleCanvasDraw();
    }
  },

  handleTouchEnd() {
    if (!this._draggingDirectionHandle) return;
    this.clearDragState();
    this.setData({ canvasDragging: false }, () => this.scheduleCanvasDraw());
  },

  handleTouchCancel() {
    this.handleTouchEnd();
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  startLearningSession() {
    if (this._sessionRunning || !getApp().globalData.user) return;
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._sessionStart = Date.now();
    api.startSession('maximum-slope-line').then((res) => {
      if (res && res.ok) this._sessionId = res.session_id;
      api.recordEvent('chapter_enter', {
        session_id: this._sessionId || '',
        chapter_id: 'maximum-slope-line',
        chapter_name: '最大斜度线',
        page: 'maximum-slope-line',
        knowledge_point_id: 'G04',
        metadata: {
          projection_plane: this.data.selectedPlane
        }
      });
    }).catch(() => {});
  },

  endLearningSession() {
    if (!this._sessionRunning || this._sessionEnded) return;
    this._sessionEnded = true;
    this._sessionRunning = false;
    const duration = Math.max(
      0,
      Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000)
    );
    api.recordEvent('chapter_exit', {
      session_id: this._sessionId || '',
      chapter_id: 'maximum-slope-line',
      chapter_name: '最大斜度线',
      page: 'maximum-slope-line',
      knowledge_point_id: 'G04',
      duration,
      metadata: {
        projection_plane: this.data.selectedPlane,
        interaction_count: this._interactionCount || 0
      }
    });
    if (this._sessionId) {
      api.endSession(this._sessionId, duration, this._interactionCount || 0);
      this._sessionId = null;
    }
  }
}, projection, drawHelpers, renderScene, renderMethods);

const getBaseLayout = projection.getLayout;
pageDefinition.getLayout = function getLayout() {
  const baseLayout = getBaseLayout.call(this);
  if (baseLayout.split) return baseLayout;
  const dividerY = this.canvasHeight * COMPACT_SPATIAL_HEIGHT_RATIO;
  const topHeight = dividerY;
  const bottomHeight = this.canvasHeight - dividerY;
  return Object.assign({}, baseLayout, {
    dividerY,
    topHeight,
    bottomHeight,
    projectionTop: dividerY,
    projectionHeight: bottomHeight,
    unit: Math.min(baseLayout.leftWidth / 27, topHeight / 24),
    isoOrigin: {
      x: baseLayout.leftWidth * 0.5,
      y: topHeight * 0.58
    },
    projectionOrigin: {
      x: baseLayout.leftWidth * 0.5,
      y: dividerY + bottomHeight * 0.5
    }
  });
};

Page(pageDefinition);
