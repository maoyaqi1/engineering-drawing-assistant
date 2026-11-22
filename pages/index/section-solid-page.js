// 平面与立体相交独立页面的共享装配层。
//
// 两个第六章页面复用原页面的截交几何、空间绘制、三视图和截平面控件，
// 只过滤可见立体类型；不复制 section-geometry.js 或任何几何计算。
(function () {
  const { DEFAULT_POINT } = require('./constants.js');
  const presets = require('./presets.js');
  const session = require('./session.js');
  const mathUtils = require('./math-utils.js');
  const projection = require('./projection.js');
  const uiHandlers = require('./ui-handlers.js');
  const touch = require('./touch.js');
  const drawHelpers = require('./draw-helpers.js');
  const renderScene = require('./render-scene.js');
  const sectionMath = require('./section-math.js');
  const sectionRender = require('./section-render.js');
  const solidProjection = require('./solid-projection.js');

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

  function createSectionSolidPage(config) {
    const solidTypes = config.solidTypes.map((item) => ({
      key: item.key,
      label: item.label
    }));
    const solidTypeKeys = solidTypes.map((item) => item.key);
    const defaultSolidType = config.defaultSolidType || solidTypeKeys[0];
    const pageDefinition = Object.assign({
      data: {
        mode: 'section',
        canvasDragging: false,
        canUseAi: false,
        aiEntryEnabled: false,
        moduleIndex: 4,
        moduleOptions: ['点', '直线', '平面', '基本立体', '平面切割立体'],
        point: Object.assign({}, DEFAULT_POINT),
        section: {
          solidType: defaultSolidType,
          sides: Math.min(8, Math.max(3, Number(config.defaultSides) || 5)),
          planeType: 'frontProjecting',
          angle: 42,
          offset: 0
        },
        sectionSolidTypes: solidTypes,
        sectionSupportsSides: !!config.supportsSides,
        pageTitle: config.pageTitle,
        pageInstruction: config.pageInstruction,
        canvasAriaLabel: config.canvasAriaLabel,
        lessonIndex: config.lessonIndex || '观察 · 06',
        lessonTitle: config.lessonTitle,
        lessonBody: config.lessonBody,
        learningChapterName: config.learningChapterName
      },

      onLoad() {
        this._pageVisible = false;
        this._sessionRunning = false;
        this._sessionEnded = false;
        this._sessionId = null;
        this._sessionStartPending = false;
        this._chapterStart = null;
        this.canvas = null;
        this.context = null;
        this.sectionSolidCache = null;
        this.sectionResultCache = null;
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
        this.sectionSolidCache = null;
        this.sectionResultCache = null;
      },

      onShareAppMessage() {
        return {
          title: '工程制图学习助手 · ' + config.pageTitle,
          path: config.pagePath
        };
      }
    }, session, projection, mathUtils, presets, uiHandlers, touch,
    drawHelpers, renderScene, sectionMath, sectionRender, solidProjection);

    pageDefinition.handleSectionSolidType = function handleSectionSolidType(event) {
      this.recordInteraction();
      const solidType = event.currentTarget.dataset.type;
      if (solidTypeKeys.indexOf(solidType) < 0) return;
      this.setData({ 'section.solidType': solidType }, () => this.drawScene());
    };

    pageDefinition.handleSectionSidesStep = function handleSectionSidesStep(event) {
      this.recordInteraction();
      if (!this.data.sectionSupportsSides) return;
      const delta = Number(event.currentTarget.dataset.delta);
      if (!Number.isFinite(delta)) return;
      const current = Math.min(8, Math.max(3, Math.round(Number(this.data.section.sides) || 5)));
      const next = Math.min(8, Math.max(3, current + delta));
      if (next === current) return;
      this.setData({ 'section.sides': next }, () => this.drawScene());
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
    createSectionSolidPage
  };
})();
