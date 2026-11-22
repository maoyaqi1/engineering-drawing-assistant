// 立体投影独立页面的共享装配层。
//
// 两个页面复用原首页的几何、三视图、尺寸和姿态模块，只过滤可见立体
// 类型；不复制 basic-solid.js 或任何几何计算。
(function () {
  const { DEFAULT_POINT } = require('./constants.js');
  const presets = require('./presets.js');
  const session = require('./session.js');
  const mathUtils = require('./math-utils.js');
  const projection = require('./projection.js');
  const drawHelpers = require('./draw-helpers.js');
  const renderScene = require('./render-scene.js');
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

  function createSolidProjectionPage(config) {
    const solidTypeKeys = config.solidTypeKeys.slice();
    const pageDefinition = Object.assign({
      data: {
        mode: 'solid',
        canvasDragging: false,
        canUseAi: false,
        aiEntryEnabled: !!config.allowAi,
        showAi: !!config.allowAi,
        layoutMode: config.layoutMode || 'default',
        moduleIndex: 3,
        moduleOptions: ['点', '直线', '平面', '基本立体', '平面切割立体'],
        point: Object.assign({}, DEFAULT_POINT),
        solid: presets.defaultSolidParams(solidTypeKeys[0]),
        solidTypes: config.solidTypeLabels.slice(),
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
        translationValue: 4,
        pageTitle: config.pageTitle,
        pageInstruction: '调整立体参数，观察三视图变化'
      },

      onLoad() {
        this._pageVisible = false;
        this._sessionRunning = false;
        this._sessionEnded = false;
        this._sessionId = null;
        this._sessionStartPending = false;
        this.canvas = null;
        this.context = null;
        if (typeof wx !== 'undefined' && wx.setNavigationBarTitle) {
          wx.setNavigationBarTitle({ title: config.pageTitle });
        }
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

      onUnload() {
        this.endSession();
        this.canvas = null;
        this.context = null;
      },

      onShareAppMessage() {
        return {
          title: '工程制图学习助手 · ' + config.pageTitle,
          path: config.pagePath
        };
      }
    }, session, projection, mathUtils, presets, uiHandlers,
    drawHelpers, renderScene);

    pageDefinition.handleBasicSolidType = function handleBasicSolidType(event) {
      this.recordInteraction();
      const index = Number(event.currentTarget.dataset.type);
      const type = solidTypeKeys[index];
      if (!type) return;
      this.setData({
        solidTypeIndex: index,
        solid: this.defaultSolidParams(type)
      }, () => this.drawScene());
    };

    pageDefinition.handleReset = function handleReset() {
      this.recordInteraction();
      const currentType = this.data.solid.type || solidTypeKeys[0];
      const typeIndex = solidTypeKeys.indexOf(currentType);
      this.setData({
        solid: this.defaultSolidParams(currentType),
        solidTypeIndex: typeIndex >= 0 ? typeIndex : 0,
        poseTabIndex: 0,
        rotationAxisIndex: 0,
        translationAxisIndex: 0,
        rotationAxis: 'x',
        translationAxis: 'x',
        rotationValue: 0,
        translationValue: 4
      }, () => this.drawScene());
    };

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

    return pageDefinition;
  }

  module.exports = {
    createSolidProjectionPage
  };
})();
