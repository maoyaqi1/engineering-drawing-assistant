// 首页画布（冻结模块 F1/F3/F4）——页面 data、生命周期、模块挂载与紧凑画布布局适配。
//
// 方法实现按功能拆到同目录模块，全部以普通函数属性挂回 Page，因此 Page 上对外的方法名
// 与拆分前完全一致（index.wxml 的 bind*/catch* 不受影响）；禁止把方法改成箭头函数，
// 那样会丢失页面 this（scripts/integrity-check.js 会对此告警）。
//
// 挂载用 Object.assign（与 utils/api.js 的写法一致）。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入本文件，这样本文件的顶层 const
// 不会与其它模块冲突；小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { DEFAULT_POINT } = require('./constants.js');
  const presets = require('./presets.js');
  const session = require('./session.js');
  const mathUtils = require('./math-utils.js');
  const projection = require('./projection.js');
  const touch = require('./touch.js');
  const drawHelpers = require('./draw-helpers.js');
  const renderScene = require('./render-scene.js');
  const sectionMath = require('./section-math.js');
  const sectionRender = require('./section-render.js');
  const solidProjection = require('./solid-projection.js');
  const uiHandlers = require('./ui-handlers.js');
  const COMPACT_SPATIAL_VERTICAL_PADDING = 2;
  const COMPACT_SPATIAL_FLOOR_UNITS = 9 * 1.08;
  const COMPACT_SPATIAL_UNIT_DIVISOR = 29.3;
  const COMPACT_PROJECTION_TOP_PADDING = 26;
  const COMPACT_PROJECTION_BOTTOM_PADDING = 8;

  function getCompactProjectionMetrics(layout) {
    const unit = Math.min(
      layout.rightWidth / 21,
      (layout.bottomHeight
        - COMPACT_PROJECTION_TOP_PADDING
        - COMPACT_PROJECTION_BOTTOM_PADDING) / 16
    );
    return {
      origin: {
        x: layout.projectionOrigin.x,
        y: layout.projectionTop + COMPACT_PROJECTION_TOP_PADDING + 8 * unit
      },
      unit
    };
  }

  const pageDefinition = Object.assign({
      data: {
        mode: 'point',
        canvasDragging: false,
        canUseAi: false,
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

      onResize() {
        this.initializeCanvas();
      },

      onShow() {
        this.ensureSession();
      },

      onHide() {
        this.endSession();
      },

      onShareAppMessage() {
        return {
          title: '工程制图学习助手 · 让空间投影看得见',
          path: '/pages/index/index'
        };
      },

      onUnload() {
        this.endSession();
        this.canvas = null;
        this.context = null;
        this.sectionSolidCache = null;
        this.sectionResultCache = null;
      },
  }, session, projection, mathUtils, presets, uiHandlers, touch, drawHelpers, renderScene, sectionMath, sectionRender, solidProjection);

  // 五种空间对象共用紧凑画布：保持三维 unit，裁去黑底上下多余空间。
  const getBaseLayout = projection.getLayout;
  pageDefinition.getLayout = function getLayout() {
    const baseLayout = getBaseLayout.call(this);
    if (baseLayout.split) return baseLayout;
    const unit = Math.min(
      baseLayout.leftWidth / 27,
      baseLayout.leftWidth / COMPACT_SPATIAL_UNIT_DIVISOR
    );
    const contentHeight = unit * (10 + COMPACT_SPATIAL_FLOOR_UNITS);
    const topHeight = contentHeight + COMPACT_SPATIAL_VERTICAL_PADDING * 2;
    const bottomHeight = this.canvasHeight - topHeight;
    const projectionMetrics = getCompactProjectionMetrics({
      rightWidth: baseLayout.rightWidth,
      bottomHeight,
      projectionTop: topHeight,
      projectionOrigin: { x: baseLayout.leftWidth * 0.5 }
    });
    return Object.assign({}, baseLayout, {
      dividerY: topHeight,
      topHeight,
      bottomHeight,
      projectionTop: topHeight,
      projectionHeight: bottomHeight,
      unit,
      isoOrigin: {
        x: baseLayout.leftWidth * 0.5,
        y: COMPACT_SPATIAL_VERTICAL_PADDING + 10 * unit
      },
      projectionOrigin: projectionMetrics.origin
    });
  };

  const getBaseProjectionMetrics = projection.getProjectionMetrics;
  pageDefinition.getProjectionMetrics = function getProjectionMetrics() {
    const layout = this.getLayout();
    if (layout.split) {
      return getBaseProjectionMetrics.call(this);
    }
    return getCompactProjectionMetrics(layout);
  };

  Page(pageDefinition);
})();
