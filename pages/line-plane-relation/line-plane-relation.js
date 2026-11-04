// 直线与平面相交求交点 · 独立知识点互动页。
//
// 顶部选择直线、平面类型；下方根据两者积聚性选择两个投影面；
// 底部按步骤作图，每个步骤只更新当前作图状态。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const drawHelpers = require('../index/draw-helpers.js');
const renderScene = require('../index/render-scene.js');
const model = require('./line-plane-model.js');
const renderMethods = require('./line-plane-render.js');

const COMPACT_SPATIAL_HEIGHT_RATIO = 0.4;

const LINE_OPTIONS = [
  { key: 'general', label: '一般位置直线' },
  { key: 'vertical', label: '铅垂线' },
  { key: 'frontProjecting', label: '正垂线' },
  { key: 'profileProjecting', label: '侧垂线' }
];

const PLANE_OPTIONS = [
  { key: 'general', label: '一般位置平面' },
  { key: 'vertical', label: '铅垂面' },
  { key: 'frontProjecting', label: '正垂面' },
  { key: 'profileProjecting', label: '侧垂面' }
];

const PROJECTION_SUFFIX = {
  H: '水平投影面 H',
  V: '正立投影面 V',
  W: '侧立投影面 W'
};

const AUXILIARY_PLANE_NAMES = {
  H: '铅垂面（垂直于 H 面）',
  V: '正垂面（垂直于 V 面）',
  W: '侧垂面（垂直于 W 面）'
};

function cloneLine(line) {
  return model.cloneLine(line);
}

function getLineKind(index) {
  return LINE_OPTIONS[index] ? LINE_OPTIONS[index].key : 'general';
}

function getPlaneKind(index) {
  return PLANE_OPTIONS[index] ? PLANE_OPTIONS[index].key : 'general';
}

function getPlane(planeKind) {
  return model.clonePlane(
    model.PLANE_PRESETS[planeKind] || model.DEFAULT_PLANE
  );
}

function formatPoint(point) {
  if (!point) return '无唯一交点';
  return `K(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`;
}

function buildSteps(geometry) {
  if (!geometry.relation.intersection) {
    if (geometry.relation.kind === 'inPlane') {
      return [{
        title: '判断：直线在平面内',
        description: '直线与平面没有唯一的交点，不能继续求单独的点 K。'
      }];
    }
    if (geometry.relation.kind === 'parallel') {
      return [{
        title: '判断：直线平行于平面',
        description: '直线与平面没有交点，因此本题不存在交点 K。'
      }];
    }
    return [{
      title: '判断：当前线段退化',
      description: '端点重合，无法确定直线方向。'
    }];
  }
  if (geometry.methodKind === 'auxiliary') {
    const selectedPlane = geometry.auxiliaryPlane
      ? geometry.auxiliaryPlane.projectionPlane
      : 'H';
    const recommendedPlane = geometry.auxiliaryPlane
      ? geometry.auxiliaryPlane.recommendedProjectionPlane
      : selectedPlane;
    return [
      {
        title: '作 Q，并求平面内交线 12',
        description: `推荐作${AUXILIARY_PLANE_NAMES[recommendedPlane]}；`
          + `当前选择作${AUXILIARY_PLANE_NAMES[selectedPlane]}，`
          + `使其 ${selectedPlane} 面投影积聚为一条迹线，`
          + '再求 Q 与平面 ABC 的交线 12。'
      },
      {
        title: '画交线 12 的另外两面投影',
        description: '由点 1、2 向另外两个投影面作投影，'
          + '并画出投影连线检查对应关系。'
      },
      {
        title: '求交点 K 并连接投影',
        description: '求 EF 与交线 12 的交点 K，'
          + '补全三个投影并显示 K 的投影连线。'
      }
    ];
  }
  if (geometry.methodKind === 'plane') {
    const view = geometry.planeAccumulationPlane;
    return [
      {
        title: '利用平面积聚线',
        description: `高亮 ABC 在 ${view} 面的积聚投影。`
      },
      {
        title: `求 ${view === 'V' ? 'k′' : (view === 'W' ? 'k″' : 'k')}`,
        description: '直线 EF 的对应投影与平面积聚线相交。'
      },
      {
        title: '完成交点 K',
        description: '由已知投影补全 K 的其余投影。'
      }
    ];
  }
  if (geometry.methodKind === 'line') {
    const view = geometry.lineAccumulationPlane;
    const suffix = view === 'V' ? '′' : (view === 'W' ? '″' : '');
    return [
      {
        title: `连接 ce，延长交 ab 于 1`,
        description: `在 ${view} 面投影中连接 c${suffix} 与 e${suffix}，`
          + `延长后与 a${suffix}b${suffix} 交于点 1${suffix}。`
      },
      {
        title: '求 c1 的三面投影',
        description: '补齐点 1 与线段 c1 在另外两个投影面的投影，'
          + '并用投影连线检查对应关系。'
      },
      {
        title: '求交点 K 并连接投影',
        description: '利用 c1 与 EF 的对应投影求得交点 K，'
          + '补全三面投影并显示 K 的投影连线。'
      }
    ];
  }
  return [
    {
      title: '识别双重积聚',
      description: `EF 在 ${geometry.lineAccumulationPlane} 面积聚为点，`
        + `ABC 在 ${geometry.planeAccumulationPlane} 面积聚为线。`
    },
    {
      title: '任选一种积聚性',
      description: '可直接取直线积聚点，也可先求平面积聚线与直线投影的交点。'
    },
    {
      title: '完成交点 K',
      description: '补齐 K 的两个投影并检查点的投影对应关系。'
    }
  ];
}

function createMethodPatch(geometry, lineKind, planeKind) {
  const intersection = geometry.relation.intersection;
  const lineAccumulationPlane = geometry.lineAccumulationPlane;
  const planeAccumulationPlane = geometry.planeAccumulationPlane;
  const methodLabels = {
    auxiliary: {
      label: '作辅助平面法',
      badge: '辅助平面',
      description: '直线和平面都没有积聚性。含直线 EF 作特殊位置辅助平面 Q，'
        + '求出 Q 与平面 ABC 的交线 12，再求 EF 与 12 的交点 K。'
    },
    plane: {
      label: '利用平面的积聚性',
      badge: '平面有积聚性',
      description: `平面 ABC 在 ${PROJECTION_SUFFIX[planeAccumulationPlane]}`
        + '积聚为直线。可先得到交点的一个投影，再补齐其余投影。'
    },
    line: {
      label: '利用直线的积聚性',
      badge: '直线有积聚性',
      description: `直线 EF 在 ${PROJECTION_SUFFIX[lineAccumulationPlane]}`
        + '积聚为点，该点就是交点的一个投影。'
    },
    both: {
      label: '两种积聚性均可直接利用',
      badge: '双重积聚',
      description: `直线 EF 在 ${PROJECTION_SUFFIX[lineAccumulationPlane]}`
        + `积聚为点，平面 ABC 在 ${PROJECTION_SUFFIX[planeAccumulationPlane]}`
        + '积聚为线，可从任一侧直接求出交点。'
    }
  };
  let methodKind = geometry.methodKind;
  if (!intersection) {
    methodKind = 'none';
  }
  const method = methodLabels[methodKind] || {
    label: geometry.relation.kind === 'inPlane'
      ? '直线在平面内'
      : '直线平行于平面',
    badge: '无唯一交点',
    description: geometry.relation.kind === 'inPlane'
      ? 'EF 的两个端点都在平面 ABC 内，整条直线属于该平面。'
      : '直线方向与平面内至少一条直线平行，二者没有交点。'
  };
  const steps = buildSteps(geometry);
  return {
    methodKind,
    methodLabel: method.label,
    methodBadge: method.badge,
    methodDescription: method.description,
    steps,
    currentStep: 1,
    appliedStep: 0,
    isComplete: false,
    currentStepTitle: steps[0].title,
    currentStepDescription: steps[0].description,
    guideActionText: '显示本步作图',
    resultPointText: intersection ? '按步骤完成作图' : '无唯一交点',
    resultProjectionText: intersection ? '完成后显示 k、k′、k″' : '不存在 K',
    lineAccumulationText: lineAccumulationPlane
      ? `EF 在 ${lineAccumulationPlane} 面积聚为点`
      : 'EF 无积聚性',
    planeAccumulationText: planeAccumulationPlane
      ? `ABC 在 ${planeAccumulationPlane} 面积聚为线`
      : 'ABC 无积聚性',
    selectionText: `${LINE_OPTIONS.find((item) => item.key === lineKind).label}`
      + ` × ${PLANE_OPTIONS.find((item) => item.key === planeKind).label}`
  };
}

const pageDefinition = Object.assign({
  data: {
    mode: 'intersection',
    lineOptions: LINE_OPTIONS.map((item) => item.label),
    planeOptions: PLANE_OPTIONS.map((item) => item.label),
    lineIndex: 0,
    planeIndex: 0,
    lineKind: 'general',
    planeKind: 'general',
    plane: getPlane('general'),
    line: model.buildLineForCombination(model.DEFAULT_PLANE, 'general'),
    methodKind: 'auxiliary',
    methodLabel: '作辅助平面法',
    methodBadge: '辅助平面',
    methodDescription: '',
    steps: [],
    auxiliaryOptions: [
      { key: 'H', label: '⊥ H 面' },
      { key: 'V', label: '⊥ V 面' },
      { key: 'W', label: '⊥ W 面' }
    ],
    auxiliaryProjectionPlane: null,
    recommendedAuxiliaryProjectionPlane: null,
    currentStep: 1,
    appliedStep: 0,
    isComplete: false,
    currentStepTitle: '作 Q，并求平面内交线 12',
    currentStepDescription: '选择辅助平面的垂直方向，并求 Q 与平面 ABC 的交线 12。',
    guideActionText: '显示本步作图',
    resultPointText: '按步骤完成作图',
    resultProjectionText: '完成后显示 k、k′、k″',
    lineAccumulationText: 'EF 无积聚性',
    planeAccumulationText: 'ABC 无积聚性',
    selectionText: '一般位置直线 × 一般位置平面',
    showExtension: false,
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
    this.updateGeometry(this.data.line, false);
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
    this._geometry = null;
    this.canvas = null;
    this.context = null;
  },

  onShareAppMessage() {
    return {
      title: '线面相交求交点',
      path: '/pages/line-plane-relation/line-plane-relation'
    };
  },

  handleLinePicker(event) {
    const lineIndex = Number(event.detail.value);
    if (!Number.isInteger(lineIndex) || !LINE_OPTIONS[lineIndex]) return;
    const lineKind = getLineKind(lineIndex);
    if (lineKind === this.data.lineKind) return;
    this.recordInteraction();
    const line = model.buildLineForCombination(this.data.plane, lineKind);
    this.setData({
      lineIndex,
      lineKind,
      line: cloneLine(line)
    }, () => this.updateGeometry(line, true));
  },

  handlePlanePicker(event) {
    const planeIndex = Number(event.detail.value);
    if (!Number.isInteger(planeIndex) || !PLANE_OPTIONS[planeIndex]) return;
    const planeKind = getPlaneKind(planeIndex);
    if (planeKind === this.data.planeKind) return;
    this.recordInteraction();
    const plane = getPlane(planeKind);
    const line = model.buildLineForCombination(plane, this.data.lineKind);
    this.setData({
      planeIndex,
      planeKind,
      plane,
      line: cloneLine(line)
    }, () => this.updateGeometry(line, true));
  },

  updateGeometry(line, redraw, auxiliaryProjectionPlane) {
    const geometry = model.buildGeometry(this.data.plane, line, {
      auxiliaryProjectionPlane
    });
    if (!geometry) return;
    this._geometry = geometry;
    const auxiliaryPlane = geometry.auxiliaryPlane;
    this.setData(Object.assign({
      line: cloneLine(line),
      plane: model.clonePlane(geometry.plane.plane),
      mode: 'intersection',
      auxiliaryProjectionPlane: auxiliaryPlane
        ? auxiliaryPlane.projectionPlane
        : null,
      recommendedAuxiliaryProjectionPlane: auxiliaryPlane
        ? auxiliaryPlane.recommendedProjectionPlane
        : null
    }, createMethodPatch(
      geometry,
      this.data.lineKind,
      this.data.planeKind
    )), () => {
      if (redraw !== false) this.scheduleCanvasDraw();
    });
  },

  selectAuxiliaryPlane(event) {
    const projectionPlane = event.currentTarget.dataset.plane;
    if (!['H', 'V', 'W'].includes(projectionPlane)
      || this.data.methodKind !== 'auxiliary'
      || this.data.currentStep !== 1
      || this.data.appliedStep !== 0) {
      return;
    }
    this.recordInteraction();
    this.updateGeometry(
      this.data.line,
      true,
      projectionPlane
    );
  },

  handleStepTap(event) {
    if (this.data.isComplete) return;
    this.recordInteraction();
    const geometry = this._geometry;
    const intersection = geometry && geometry.relation.intersection;
    const currentStep = this.data.currentStep;
    const hasDrawnCurrent = this.data.appliedStep >= currentStep;
    if (!hasDrawnCurrent) {
      const complete = currentStep === this.data.steps.length;
      this.setData({
        appliedStep: currentStep,
        isComplete: complete,
        guideActionText: complete ? '作图完成' : '进入下一步',
        resultPointText: intersection && complete
          ? formatPoint(intersection.point)
          : (intersection ? '作图进行中' : '无唯一交点')
      }, () => this.scheduleCanvasDraw());
      return;
    }
    const nextStep = Math.min(currentStep + 1, this.data.steps.length);
    this.setData({
      currentStep: nextStep,
      currentStepTitle: this.data.steps[nextStep - 1].title,
      currentStepDescription: this.data.steps[nextStep - 1].description,
      guideActionText: '显示本步作图'
    }, () => this.scheduleCanvasDraw());
  },

  handleReset() {
    this.recordInteraction();
    const intersection = this._geometry
      && this._geometry.relation.intersection;
    const firstStep = this.data.steps && this.data.steps[0];
    this.setData({
      currentStep: 1,
      appliedStep: 0,
      isComplete: false,
      currentStepTitle: firstStep ? firstStep.title : '',
      currentStepDescription: firstStep ? firstStep.description : '',
      guideActionText: '显示本步作图',
      resultPointText: intersection ? '按步骤完成作图' : '无唯一交点'
    }, () => this.scheduleCanvasDraw());
  },

  recordInteraction() {
    this._interactionCount = (this._interactionCount || 0) + 1;
  },

  startLearningSession() {
    if (this._sessionRunning || !getApp().globalData.user) return;
    this._sessionEnded = false;
    this._sessionRunning = true;
    this._sessionStart = Date.now();
    api.startSession('line-plane-relation').then((res) => {
      if (res && res.ok) this._sessionId = res.session_id;
      api.recordEvent('chapter_enter', {
        session_id: this._sessionId || '',
        chapter_id: 'line-plane-relation',
        chapter_name: '线面相交求交点',
        page: 'line-plane-relation',
        knowledge_point_id: 'G08',
        metadata: {
          line_type: this.data.lineKind,
          plane_type: this.data.planeKind
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
      chapter_id: 'line-plane-relation',
      chapter_name: '线面相交求交点',
      page: 'line-plane-relation',
      knowledge_point_id: 'G08',
      duration,
      metadata: {
        line_type: this.data.lineKind,
        plane_type: this.data.planeKind,
        method_kind: this.data.methodKind,
        completed: this.data.isComplete,
        interaction_count: this._interactionCount || 0
      }
    });
    if (this._sessionId) {
      api.endSession(this._sessionId, duration, this._interactionCount || 0);
      this._sessionId = null;
    }
  }
}, projection, drawHelpers, renderScene, renderMethods);

// 竖屏压缩空间区，为双面投影和作图步骤留出高度；宽屏继续使用首页左右布局。
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
