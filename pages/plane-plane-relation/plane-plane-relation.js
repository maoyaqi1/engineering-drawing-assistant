// 两平面相交求交线 · 独立知识点互动页。
//
// 顶部选择两个平面类型；有积聚性时直接利用，两个一般位置平面时
// 转化为求交线的两个共有点，最后连线得到 L。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const drawHelpers = require('../index/draw-helpers.js');
const renderScene = require('../index/render-scene.js');
const model = require('./plane-plane-model.js');
const renderMethods = require('./plane-plane-render.js');

const COMPACT_SPATIAL_HEIGHT_RATIO = 0.4;

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

function getPlaneKind(index) {
  return PLANE_OPTIONS[index] ? PLANE_OPTIONS[index].key : 'general';
}

const INITIAL_PLANES = model.getPlanePair('general', 'general');

function accumulationText(label, view) {
  return view
    ? `${label} 在 ${PROJECTION_SUFFIX[view]} 积聚为线`
    : `${label} 无积聚性`;
}

function buildSteps(geometry) {
  if (!geometry.intersectionLine) {
    return [{
      title: '判断：两平面平行',
      description: '两平面没有公共交线，不能继续求交线 L。'
    }];
  }
  if (geometry.methodKind === 'twoLinePlane') {
    const first = geometry.lineIntersections[0];
    const second = geometry.lineIntersections[1];
    return [
      {
        title: `求直线 ${first.edgeLabel} 与平面 ${first.targetName} 的交点 K`,
        description: `取平面 ${first.ownerName} 的边 ${first.edgeLabel}，`
          + `作包含该边且垂直于 ${first.auxiliaryPlane.projectionPlane} 面的`
          + `辅助平面 R1，再求 R1 与平面 ${first.targetName} 的交线，`
          + '最后用边线与这条交线求得交点 K。'
      },
      {
        title: `求直线 ${second.edgeLabel} 与平面 ${second.targetName} 的交点 E`,
        description: `再取平面 ${second.ownerName} 的边 ${second.edgeLabel}，`
          + `作包含该边且垂直于 ${second.auxiliaryPlane.projectionPlane} 面的`
          + `辅助平面 R2，求 R2 与平面 ${second.targetName} 的交线，`
          + '得到第二个共有点 E。'
      },
      {
        title: '连接 K、E 得交线 L',
        description: 'K、E 同时属于 ABC、EFG，连接两点即得交线 L，'
          + '补全 l、l′、l″ 并高亮最终结果。'
      }
    ];
  }
  if (geometry.methodKind === 'plane') {
    return [
      {
        title: '利用平面积聚线',
        description: geometry.accumulationP
          ? '高亮平面 ABC 的积聚投影，交线的一个投影由它直接确定。'
          : '高亮平面 EFG 的积聚投影，交线的一个投影由它直接确定。'
      },
      {
        title: '求交线上的两个共有点',
        description: '在积聚投影上取两个共有点 1、2，'
          + '补全它们的另外两面投影。'
      },
      {
        title: '连接 1、2 得交线 L',
        description: '连接两个共有点，得到交线 L，并完成三面投影。'
      }
    ];
  }
  return [
    {
      title: '识别双重积聚',
      description: `平面 ABC 在 ${PROJECTION_SUFFIX[geometry.accumulationP]}`
        + `积聚，平面 EFG 在 ${PROJECTION_SUFFIX[geometry.accumulationQ]}积聚。`
    },
    {
      title: '取积聚投影的公共点',
      description: '利用两组积聚投影确定交线上的两个共有点 1、2。'
    },
    {
      title: '连接 1、2 得交线 L',
      description: '连接两个共有点，完成交线 L 的三面投影。'
    }
  ];
}

function createMethodPatch(geometry) {
  const line = geometry.intersectionLine;
  const methods = {
    twoLinePlane: {
      label: '两次线面求交',
      badge: '两个一般位置平面',
      description: '每次以边线作投影面垂直面，转化为线面求交，得到 K、E 后连线。'
    },
    plane: {
      label: '利用平面积聚性',
      badge: '一个平面有积聚性',
      description: '利用投影面垂直面的积聚投影，直接确定交线的一个投影。'
    },
    both: {
      label: '利用双重积聚',
      badge: '两个平面均有积聚性',
      description: '两个平面都有积聚投影，可直接确定交线的两个共有点。'
    }
  };
  const methodKind = line ? geometry.methodKind : 'none';
  const method = methods[methodKind] || {
    label: '两平面平行',
    badge: '无交线',
    description: '两平面没有公共点，因此不存在交线。'
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
    guideActionText: line ? '显示本步作图' : '查看判断',
    accumulationPText: accumulationText('ABC', geometry.accumulationP),
    accumulationQText: accumulationText('EFG', geometry.accumulationQ)
  };
}

const pageDefinition = Object.assign({
  data: {
    planePOptions: PLANE_OPTIONS.map((item) => item.label),
    planeQOptions: PLANE_OPTIONS.map((item) => item.label),
    planePIndex: 0,
    planeQIndex: 0,
    planePKind: 'general',
    planeQKind: 'general',
    planeP: INITIAL_PLANES.P,
    planeQ: INITIAL_PLANES.Q,
    methodKind: 'twoLinePlane',
    methodLabel: '两次线面求交',
    methodBadge: '两个一般位置平面',
    methodDescription: '',
    steps: [],
    currentStep: 1,
    appliedStep: 0,
    isComplete: false,
    currentStepTitle: '求边线与另一平面的交点 K',
    currentStepDescription: '',
    guideActionText: '显示本步作图',
    accumulationPText: 'ABC 无积聚性',
    accumulationQText: 'EFG 无积聚性',
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
    this.updateGeometry(
      this.data.planePKind,
      this.data.planeQKind,
      false
    );
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
      title: '面面相交求交线',
      path: '/pages/plane-plane-relation/plane-plane-relation'
    };
  },

  handlePlanePPicker(event) {
    const planePIndex = Number(event.detail.value);
    if (!Number.isInteger(planePIndex) || !PLANE_OPTIONS[planePIndex]) return;
    const planePKind = getPlaneKind(planePIndex);
    if (planePKind === this.data.planePKind) return;
    this.recordInteraction();
    const planes = model.getPlanePair(planePKind, this.data.planeQKind);
    this.setData({
      planePIndex,
      planePKind,
      planeP: planes.P,
      planeQ: planes.Q
    }, () => this.updateGeometry(
      planePKind,
      this.data.planeQKind,
      true
    ));
  },

  handlePlaneQPicker(event) {
    const planeQIndex = Number(event.detail.value);
    if (!Number.isInteger(planeQIndex) || !PLANE_OPTIONS[planeQIndex]) return;
    const planeQKind = getPlaneKind(planeQIndex);
    if (planeQKind === this.data.planeQKind) return;
    this.recordInteraction();
    const planes = model.getPlanePair(this.data.planePKind, planeQKind);
    this.setData({
      planeQIndex,
      planeQKind,
      planeP: planes.P,
      planeQ: planes.Q
    }, () => this.updateGeometry(
      this.data.planePKind,
      planeQKind,
      true
    ));
  },

  updateGeometry(planePKind, planeQKind, redraw) {
    const planes = model.getPlanePair(planePKind, planeQKind);
    const geometry = model.buildPlanePairGeometry(
      planePKind,
      planeQKind
    );
    if (!geometry) return;
    this._geometry = geometry;
    this.setData(Object.assign({
      planeP: planes.P,
      planeQ: planes.Q
    }, createMethodPatch(geometry)), () => {
      if (redraw !== false) this.scheduleCanvasDraw();
    });
  },

  handleStepTap() {
    if (this.data.isComplete) return;
    this.recordInteraction();
    const currentStep = this.data.currentStep;
    const hasDrawnCurrent = this.data.appliedStep >= currentStep;
    if (!hasDrawnCurrent) {
      const complete = currentStep === this.data.steps.length;
      this.setData({
        appliedStep: currentStep,
        isComplete: complete,
        guideActionText: complete ? '作图完成' : '进入下一步'
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
    const firstStep = this.data.steps && this.data.steps[0];
    this.setData({
      currentStep: 1,
      appliedStep: 0,
      isComplete: false,
      currentStepTitle: firstStep ? firstStep.title : '',
      currentStepDescription: firstStep ? firstStep.description : '',
      guideActionText: this._geometry && this._geometry.intersectionLine
        ? '显示本步作图'
        : '查看判断'
    }, () => this.scheduleCanvasDraw());
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
    api.startSession('plane-plane-relation').then((res) => {
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
        session_id: this._sessionId,
        chapter_id: 'plane-plane-relation',
        chapter_name: '面面相交求交线',
        page: 'plane-plane-relation',
        knowledge_point_id: 'G08',
        metadata: {
          plane_p_type: this.data.planePKind,
          plane_q_type: this.data.planeQKind,
          method_kind: this.data.methodKind
        }
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
    if (this._sessionEnded || !this._sessionRunning) return;
    this._sessionEnded = true;
    this._sessionRunning = false;
    if (!this._sessionId) return;
    const duration = Math.max(
      0,
      Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000)
    );
    api.recordEvent('chapter_exit', {
      session_id: this._sessionId,
      chapter_id: 'plane-plane-relation',
      chapter_name: '面面相交求交线',
      page: 'plane-plane-relation',
      knowledge_point_id: 'G08',
      duration,
      metadata: {
        plane_p_type: this.data.planePKind,
        plane_q_type: this.data.planeQKind,
        method_kind: this.data.methodKind,
        completed: this.data.isComplete,
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
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
