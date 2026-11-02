// 直角投影定理 · 第一阶段互动页。
//
// 页面只负责状态与事件调度；空间点、空间方向、投影角度都来自
// right-angle-model.js，Canvas 绘制集中在 right-angle-render.js。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const drawHelpers = require('../index/draw-helpers.js');
const renderScene = require('../index/render-scene.js');
const {
  MODEL_MIN,
  MODEL_MAX,
  buildGeometry,
  buildGeometryFromEndpoint
} = require('./right-angle-model.js');
const renderMethods = require('./right-angle-render.js');

const MODEL_STEP = 0.1;
const PROJECTION_TOUCH_MARGIN = 18;
const PROJECTION_TOUCH_TOP = 34;
const COMPACT_SPATIAL_HEIGHT_RATIO = 0.4;

function screenToModelPrecise(distance, unit) {
  if (!Number.isFinite(distance) || !Number.isFinite(unit) || unit <= 0) {
    return MODEL_MIN;
  }
  const value = Math.round((distance / unit) / MODEL_STEP) * MODEL_STEP;
  return Math.max(MODEL_MIN, Math.min(MODEL_MAX, value));
}

const pageDefinition = Object.assign({
  data: {
    selectedLineType: 'horizontal',
    lineTypeName: '水平线',
    planeName: '水平投影面 H',
    parallelPlane: 'H',
    projectionAngleText: '90.0°',
    planeAngleText: '0.0',
    lineParallelText: '是',
    spatialPerpendicularText: '是',
    projectionPerpendicularText: '是',
    validationPassed: true,
    intersectionText: '相交',
    conditionText: '水平线 l ∥ H 面',
    relationHint: '固定水平线 l；拖动 C 或 D 时，另一端保持不动。',
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
    this._lastValidationUpdate = 0;
    this.updateGeometry('horizontal', 3, 3, false);
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
    this._draggingGeneralPoint = false;
    this._draggingView = null;
    this._draggingEndpoint = null;
    this.setData({ canvasDragging: false });
    this.endLearningSession();
  },

  onUnload() {
    this.endLearningSession();
    this._draggingGeneralPoint = false;
    this._draggingView = null;
    this._draggingEndpoint = null;
    this._geometry = null;
    this.canvas = null;
    this.context = null;
  },

  onShareAppMessage() {
    return {
      title: '直角投影定理',
      path: '/pages/right-angle-projection/right-angle-projection'
    };
  },

  // 重新生成同一组空间线及其投影。派生的二维角度只用于展示和判定，
  // 不写回 A/B/C/D/P 五个空间点。
  updateGeometry(lineType, cArmLength, dArmLength, redraw) {
    const geometry = buildGeometry(lineType, cArmLength, dArmLength);
    if (!geometry) return;
    this._geometry = geometry;
    this.setData(Object.assign({
      selectedLineType: lineType,
      lineTypeName: geometry.lineTypeName,
      planeName: geometry.planeName,
      parallelPlane: geometry.parallelPlane,
      conditionText: `${geometry.lineTypeName} l ∥ ${geometry.parallelPlane} 面`
    }, this.createValidationPatch(geometry)), () => {
      if (redraw !== false) this.scheduleCanvasDraw();
    });
  },

  selectLineType(event) {
    const lineType = event.currentTarget.dataset.type;
    if (!['horizontal', 'frontal', 'profile'].includes(lineType)
      || lineType === this.data.selectedLineType) return;
    this.recordInteraction();
    const armLengths = this._geometry
      ? this._geometry.armLengths
      : { c: 3, d: 3 };
    this.updateGeometry(lineType, armLengths.c, armLengths.d, true);
  },

  createValidationPatch(geometry) {
    return {
      projectionAngleText: `${geometry.projectionAngle.toFixed(1)}°`,
      planeAngleText: geometry.planeAngle.toFixed(1),
      lineParallelText: geometry.lineParallelToPlane ? '是' : '否',
      spatialPerpendicularText: geometry.spatialPerpendicular ? '是' : '否',
      projectionPerpendicularText: geometry.projectionPerpendicular ? '是' : '否',
      validationPassed: geometry.validationPassed,
      intersectionText: geometry.linesIntersect ? '相交' : '异面',
      relationHint: geometry.validationPassed
        ? `空间 m ⟂ l，因此 ${geometry.parallelPlane} 面投影也保持直角。`
        : `m 尚未垂直 l；继续拖动 C 或 D 至垂直位置，直角将自动高亮。`
    };
  },

  handleReset() {
    this.recordInteraction();
    this._draggingGeneralPoint = false;
    this._draggingView = null;
    this._draggingEndpoint = null;
    this.setData({ canvasDragging: false });
    this.updateGeometry('horizontal', 3, 3, true);
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  // 一般位置线 m 的 C、D 两端都可拖；正、俯、左三个投影中都可命中。
  // 每次只替换命中的空间端点，另一端保持原坐标。
  handleTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this._geometry || !this.canvasWidth) return;
    let hitView = null;
    let hitEndpoint = null;
    ['front', 'top', 'left'].some((viewType) => {
      return ['c', 'd'].some((endpointKey) => {
        const endpointView = this.getProjectionScreenPoints(
          this._geometry.points[endpointKey]
        )[viewType];
        if (Math.hypot(touch.x - endpointView.x, touch.y - endpointView.y) <= 30) {
          hitView = viewType;
          hitEndpoint = endpointKey;
          return true;
        }
        return false;
      });
    });
    if (!hitView || !hitEndpoint) return;
    this.recordInteraction();
    this._draggingGeneralPoint = true;
    this._draggingView = hitView;
    this._draggingEndpoint = hitEndpoint;
    this.setData({ canvasDragging: true });
  },

  handleTouchMove(event) {
    if (!this._draggingGeneralPoint || !this._geometry) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const geometry = this._geometry;
    const metrics = this.getProjectionMetrics();
    const layout = this.getLayout();
    // 先钳制二维触点，再钳制三维坐标；两层限制保证拖动不会离开投影面。
    const touchX = Math.max(layout.projectionLeft + PROJECTION_TOUCH_MARGIN,
      Math.min(layout.projectionLeft + layout.projectionWidth - PROJECTION_TOUCH_MARGIN,
        touch.x));
    const touchY = Math.max(layout.projectionTop + PROJECTION_TOUCH_TOP,
      Math.min(layout.projectionTop + layout.projectionHeight - PROJECTION_TOUCH_MARGIN,
        touch.y));
    const endpoint = { ...geometry.points[this._draggingEndpoint] };
    if (this._draggingView === 'front') {
      endpoint.x = screenToModelPrecise(metrics.origin.x - touchX, metrics.unit);
      endpoint.z = screenToModelPrecise(metrics.origin.y - touchY, metrics.unit);
    } else if (this._draggingView === 'top') {
      endpoint.x = screenToModelPrecise(metrics.origin.x - touchX, metrics.unit);
      endpoint.y = screenToModelPrecise(touchY - metrics.origin.y, metrics.unit);
    } else {
      endpoint.y = screenToModelPrecise(touchX - metrics.origin.x, metrics.unit);
      endpoint.z = screenToModelPrecise(metrics.origin.y - touchY, metrics.unit);
    }
    const nextGeometry = buildGeometryFromEndpoint(
      geometry.lineType,
      this._draggingEndpoint,
      endpoint,
      geometry
    );
    if (!nextGeometry) return;
    this._geometry = nextGeometry;
    const patch = {};
    const now = Date.now();
    const validationStateChanged = nextGeometry.validationPassed
      !== this.data.validationPassed
      || nextGeometry.linesIntersect !== (this.data.intersectionText === '相交');
    if (validationStateChanged
      || now - (this._lastValidationUpdate || 0) >= 100) {
      this._lastValidationUpdate = now;
      Object.assign(patch, this.createValidationPatch(nextGeometry));
    }
    if (Object.keys(patch).length > 0) {
      this.setData(patch, () => this.scheduleCanvasDraw());
    } else {
      this.scheduleCanvasDraw();
    }
  },

  handleTouchEnd() {
    if (!this._draggingGeneralPoint) return;
    this._draggingGeneralPoint = false;
    this._draggingView = null;
    this._draggingEndpoint = null;
    const patch = { canvasDragging: false };
    if (this._geometry) {
      Object.assign(patch, this.createValidationPatch(this._geometry));
    }
    this.setData(patch, () => this.scheduleCanvasDraw());
  },

  handleTouchCancel() {
    this.handleTouchEnd();
  },

  startLearningSession() {
    if (this._sessionRunning || !getApp().globalData.user) return;
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._sessionStart = Date.now();
    api.startSession('right-angle-projection').then((res) => {
      if (res && res.ok) this._sessionId = res.session_id;
      api.recordEvent('chapter_enter', {
        session_id: this._sessionId || '',
        chapter_id: 'right-angle-projection',
        chapter_name: '直角投影定理',
        page: 'right-angle-projection',
        knowledge_point_id: 'right-angle-projection',
        metadata: {
          line_type: this.data.selectedLineType
        }
      });
    }).catch(() => {});
  },

  endLearningSession() {
    if (!this._sessionRunning || this._sessionEnded) return;
    this._sessionEnded = true;
    this._sessionRunning = false;
    const duration = Math.max(0, Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000));
    api.recordEvent('chapter_exit', {
      session_id: this._sessionId || '',
      chapter_id: 'right-angle-projection',
      chapter_name: '直角投影定理',
      page: 'right-angle-projection',
      knowledge_point_id: 'right-angle-projection',
      duration,
      metadata: {
        line_type: this.data.selectedLineType,
        interaction_count: this._interactionCount || 0
      }
    });
    if (this._sessionId) {
      api.endSession(this._sessionId, duration, this._interactionCount || 0);
      this._sessionId = null;
    }
  }
}, projection, drawHelpers, renderScene, renderMethods);

// 本页优先压缩黑色空间区；竖屏仍由本页唯一布局入口统一派生所有屏幕坐标。
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
    isoOrigin: { x: baseLayout.leftWidth * 0.5, y: topHeight * 0.58 },
    projectionOrigin: {
      x: baseLayout.leftWidth * 0.5,
      y: dividerY + bottomHeight * 0.5
    }
  });
};

Page(pageDefinition);
