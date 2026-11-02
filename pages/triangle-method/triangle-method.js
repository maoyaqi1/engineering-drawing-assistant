// 直角三角形法求实长与倾角——教材式三视图练习页。
//
// 画布的三视图、空间直线和端点拖动直接复用 pages/index 的现有模块；
// 本页只在同一次绘制结果上叠加“所选投影面的夹角 + 空间直角三角形
// + 三视图中的直角三角形”。不修改首页及其冻结交互。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const drawHelpers = require('../index/draw-helpers.js');
const renderScene = require('../index/render-scene.js');
const mathUtils = require('../index/math-utils.js');
const touch = require('../index/touch.js');
const renderMethods = require('./triangle-render.js');
const {
  computeLineMetrics,
  getProjectionTarget
} = require('./triangle-metrics.js');

const DEFAULT_LINE = {
  a: { x: 2, y: 2, z: 6 },
  b: { x: 6, y: 5, z: 2 }
};
const COMPACT_SPATIAL_HEIGHT_RATIO = 0.4;

function cloneLine(line) {
  // 重置和初始化都使用深拷贝，避免默认线对象被拖动逻辑修改。
  return { a: { ...line.a }, b: { ...line.b } };
}

const pageDefinition = Object.assign({
  data: {
    mode: 'line',
    lineType: 'general',
    canvasDragging: false,
    selectedPlane: 'H',
    line: cloneLine(DEFAULT_LINE),
    targetView: null
  },

  onLoad() {
    const app = getApp();
    // 本页依赖登录态进行章节埋点；无会话时直接回到现有登录入口。
    if (!app || !app.globalData || !app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this._sessionRunning = false;
    this._sessionEnded = false;
    this._interactionCount = 0;
    this.updateMetrics('H', false);
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
    const wasDragging = this.draggingProjection != null
      || this.draggingLineProjection != null
      || this.draggingPlaneProjection != null;
    this.clearDragState();
    const patch = { canvasDragging: false };
    if (wasDragging) {
      // 拖动期间 line/lineType 只写内存热路径；离开页面时必须提交一次，
      // 保证再次显示时 WXML 坐标与 Canvas 使用的是同一份端点状态。
      patch.line = cloneLine(this.data.line);
      patch.lineType = this.data.lineType;
    }
    this.setData(patch, () => {
      if (wasDragging) this.updateMetrics(this.data.selectedPlane, false);
    });
    this.endLearningSession();
  },

  onUnload() {
    this.endLearningSession();
    this.clearDragState();
    this._metrics = null;
    this._target = null;
    this.canvas = null;
    this.context = null;
  },

  onShareAppMessage() {
    return {
      title: '直角三角形法求实长与倾角',
      path: '/pages/triangle-method/triangle-method'
    };
  },

  startLearningSession() {
    // 一次可见周期只建立一个学习会话；避免 onShow 重入时重复 startSession。
    if (this._sessionRunning || !getApp().globalData.user) return;
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._sessionStart = Date.now();
    api.startSession('triangle-method').then((res) => {
      if (res && res.ok) this._sessionId = res.session_id;
      api.recordEvent('chapter_enter', {
        session_id: this._sessionId || '',
        chapter_id: 'triangle-method',
        chapter_name: '直角三角形法求实长与倾角',
        page: 'triangle-method',
        knowledge_point_id: 'G03',
        metadata: { selected_plane: this.data.selectedPlane }
      });
    }).catch(() => {});
  },

  endLearningSession() {
    // onHide / onUnload 可能先后触发，_sessionEnded 保证退出事件只提交一次。
    if (!this._sessionRunning || this._sessionEnded) return;
    this._sessionEnded = true;
    this._sessionRunning = false;
    const duration = Math.max(0, Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000));
    api.recordEvent('chapter_exit', {
      session_id: this._sessionId || '',
      chapter_id: 'triangle-method',
      chapter_name: '直角三角形法求实长与倾角',
      page: 'triangle-method',
      knowledge_point_id: 'G03',
      duration,
      metadata: {
        selected_plane: this.data.selectedPlane,
        interaction_count: this._interactionCount || 0
      }
    });
    if (this._sessionId) {
      api.endSession(this._sessionId, duration, this._interactionCount || 0);
      this._sessionId = null;
    }
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  // 拖动期间只更新实例派生值供 Canvas 读取；松手后再同步 WXML 数字卡片。
  syncLiveMetrics(selectedPlane) {
    const plane = selectedPlane || this.data.selectedPlane;
    this._metrics = computeLineMetrics(this.data.line.a, this.data.line.b);
    this._target = getProjectionTarget(this._metrics, plane);
    return { metrics: this._metrics, target: this._target };
  },

  updateMetrics(selectedPlane, redraw) {
    // metrics/target 是唯一派生结果；WXML 只拿它们裁剪后的展示字段。
    const { metrics, target } = this.syncLiveMetrics(selectedPlane);

    this.setData({
      selectedPlane,
      targetView: target ? {
        projection: target.projection,
        projectionName: target.projectionName,
        baseLineLabel: target.baseLineLabel,
        deltaLabel: target.deltaLabel,
        deltaAxisLabel: target.deltaAxisLabel,
        differenceExpression: target.differenceExpression,
        angleName: target.angleName
      } : null
    }, () => {
      if (redraw !== false) this.scheduleCanvasDraw();
    });
  },

  // touch.js 的三种拖动主体互斥，但页面生命周期与重置必须统一回收，
  // 否则页面隐藏或重置后可能残留旧触摸事件的目标。
  clearDragState() {
    this.draggingProjection = null;
    this.draggingLineProjection = null;
    this.draggingPlaneProjection = null;
  },

  selectPlane(event) {
    const selectedPlane = event.currentTarget.dataset.plane;
    if (!['H', 'V', 'W'].includes(selectedPlane) || selectedPlane === this.data.selectedPlane) return;
    this.recordInteraction();
    this.updateMetrics(selectedPlane, true);
  },

  // 与首页“重置”语义一致：恢复默认端点并回到初始 H 面观察状态。
  // 同时清理触摸拖动引用和滚动锁，避免重置后残留上一次拖动状态。
  handleReset() {
    this.recordInteraction();
    this.clearDragState();
    this.setData({
      line: cloneLine(DEFAULT_LINE),
      lineType: 'general',
      canvasDragging: false,
      selectedPlane: 'H'
    }, () => this.updateMetrics('H', true));
  },

  // 三视图拖动完全调用首页 touch.js；包装层只负责在移动期间刷新派生角度，
  // 并在触摸结束后把最新数值同步到四个要素卡片。
  handleTouchStart(event) {
    touch.handleTouchStart.call(this, event);
  },

  handleTouchMove(event) {
    touch.handleTouchMove.call(this, event);
    this.syncLiveMetrics(this.data.selectedPlane);
    this.scheduleCanvasDraw();
  },

  handleTouchEnd(event) {
    touch.handleTouchEnd.call(this, event);
    this.updateMetrics(this.data.selectedPlane, true);
  },

  handleTouchCancel(event) {
    touch.handleTouchEnd.call(this, event);
    this.updateMetrics(this.data.selectedPlane, true);
  }
}, projection, drawHelpers, renderScene, mathUtils, touch, renderMethods);

// 用户确认压缩直角三角形法页纵向尺寸；页面布局仍由唯一 getLayout() 派生。
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
