// 两直线位置关系 · 单页探索版。
//
// 页面只负责位置状态、判断类型和展示；无限直线关系判定在 model 中完成，
// 固定轴测与第一角三视图映射复用 pages/index/projection.js。
const api = require('../../utils/api.js');
const projection = require('../index/projection.js');
const triangleRender = require('../triangle-method/triangle-render.js');
const model = require('./two-line-position-model.js');
const renderer = require('./two-line-position-render.js');

const CRITERIA = Object.freeze({
  parallel: Object.freeze({
    rule: '若两直线的各同面投影均互相平行，则它们空间平行。',
    general: '若为一般位置直线，由两面投影互相平行即可判断两直线空间平行。',
    special: '若为特殊位置直线，则需要做进一步辅助判断。'
  }),
  intersect: Object.freeze({
    rule: '若两直线的各同面投影均相交，且交点的投影符合点的投影规律，则两直线空间相交。',
    general: '若为一般位置直线，由两面投影满足上述条件，即可判断两直线空间相交。',
    special: '若为特殊位置直线，则需要做进一步辅助判断。'
  })
});

function createJudgementPatch(lines, positionMode, judgementKey) {
  const relation = model.classify(lines);
  const criteria = CRITERIA[judgementKey] || CRITERIA.parallel;
  const isSpecial = positionMode === 'special';
  const judgementTitle = judgementKey === 'intersect'
    ? '相交判断'
    : '平行判断';
  const positionLabel = isSpecial ? '特殊位置直线' : '一般位置直线';
  let criteriaNote = '';
  if (isSpecial && judgementKey === 'parallel') {
    criteriaNote = '当前两条侧平线的正面、水平投影虽然都平行，但侧面投影不平行，不能仅凭这两面判定空间平行。';
  } else if (isSpecial && judgementKey === 'intersect') {
    criteriaNote = '当前水平线与正平线的正面、水平投影虽然都出现交点，但两组交点不在同一投影连线上；侧面投影中的视交点也不能对应同一个空间点。';
  } else if (judgementKey === 'intersect') {
    criteriaNote = '三个视图中的投影交点必须对应同一个空间点 P。';
  }
  return {
    relation,
    relationKind: relation.kind,
    judgementTitle,
    positionLabel,
    criteriaRule: criteria.rule,
    criteriaHighlight: isSpecial ? criteria.special : criteria.general,
    criteriaNote,
    showCoincidentWarning: relation.kind === 'coincident'
  };
}

const pageDefinition = Object.assign({
  data: {
    positionOptions: model.POSITION_OPTIONS,
    judgementOptions: model.JUDGEMENT_OPTIONS,
    positionMode: 'general',
    selectedJudgement: 'parallel',
    lines: model.createPreset('general', 'parallel'),
    ...createJudgementPatch(
      model.createPreset('general', 'parallel'),
      'general',
      'parallel'
    )
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
    this._relation = this.data.relation;
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
    this._relation = null;
    this.canvas = null;
    this.context = null;
  },

  onShareAppMessage() {
    return {
      title: '两直线位置关系 · 平行与相交判断',
      path: '/pages/two-line-position/two-line-position'
    };
  },

  initializeCanvas() {
    const init = (retry) => {
      const query = this.createSelectorQuery();
      query.select('#geometryCanvas').fields({ node: true, size: true }).exec((results) => {
        const info = results && results[0];
        if (!info || !info.node || info.width < 50) {
          if (retry > 0) setTimeout(() => init(retry - 1), 300);
          return;
        }
        const pixelRatio = Math.min(
          (wx.getWindowInfo && wx.getWindowInfo().pixelRatio)
            || (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio)
            || 1,
          3
        );
        this.canvas = info.node;
        this.context = this.canvas.getContext('2d');
        this.canvasWidth = info.width;
        this.canvasHeight = info.height;
        this.canvas.width = Math.round(info.width * pixelRatio);
        this.canvas.height = Math.round(info.height * pixelRatio);
        this.context.scale(pixelRatio, pixelRatio);
        this.drawScene();
      });
    };
    init(4);
  },

  drawScene() {
    if (!this.context || !this.canvasWidth) return;
    renderer.drawScene(this.context, this);
  },

  scheduleCanvasDraw() {
    if (this._drawScheduled) return;
    this._drawScheduled = true;
    const run = () => {
      this._drawScheduled = false;
      this.drawScene();
    };
    if (this.canvas && this.canvas.requestAnimationFrame) {
      this.canvas.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  },

  selectJudgement(event) {
    const judgementKey = event.currentTarget.dataset.key;
    if (!model.JUDGEMENT_OPTIONS.some((item) => item.key === judgementKey)
      || judgementKey === this.data.selectedJudgement) return;
    this.recordInteraction();
    const lines = model.createPreset(this.data.positionMode, judgementKey);
    const patch = createJudgementPatch(
      lines,
      this.data.positionMode,
      judgementKey
    );
    this._relation = patch.relation;
    this.setData(Object.assign({}, patch, {
      selectedJudgement: judgementKey,
      lines
    }), () => this.scheduleCanvasDraw());
  },

  selectPosition(event) {
    const positionMode = event.currentTarget.dataset.position;
    if (!model.POSITION_OPTIONS.some((item) => item.key === positionMode)
      || positionMode === this.data.positionMode) return;
    this.recordInteraction();
    const lines = model.createPreset(positionMode, this.data.selectedJudgement);
    const patch = createJudgementPatch(
      lines,
      positionMode,
      this.data.selectedJudgement
    );
    this._relation = patch.relation;
    this.setData(Object.assign({}, patch, {
      positionMode,
      lines
    }), () => this.scheduleCanvasDraw());
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
    api.startSession('two-line-position').then((res) => {
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
        session_id: sessionId,
        chapter_id: 'two-line-position',
        chapter_name: '两直线位置关系',
        page: 'two-line-position',
        knowledge_point_id: 'two-line-position',
        metadata: {
          judgement: this.data.selectedJudgement,
          position_mode: this.data.positionMode
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
      session_id: this._sessionId,
      chapter_id: 'two-line-position',
      chapter_name: '两直线位置关系',
      page: 'two-line-position',
      knowledge_point_id: 'two-line-position',
      duration,
      metadata: {
        relation: this.data.relationKind,
        judgement: this.data.selectedJudgement,
        position_mode: this.data.positionMode,
        interaction_count: this._interactionCount || 0
      }
    });
    api.endSession(this._sessionId, duration, this._interactionCount || 0);
    this._sessionId = null;
  }
}, projection);

// 空间视图固定采用直角三角形法的 OZ 轴右旋观察方位；左右分栏时只缩放画面以适配左栏。
pageDefinition.projectIsometric = function projectIsometric(point) {
  const layout = this.getLayout();
  if (!layout.split) {
    return triangleRender.projectIsometric.call(this, point);
  }
  const source = point || { x: 0, y: 0, z: 0 };
  const yaw = -30 * Math.PI / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const rotatedX = source.x * cos - source.y * sin;
  const rotatedY = source.x * sin + source.y * cos;
  const planeSpan = 8.8;
  const verticalPadding = 2;
  const horizontalScale = 0.78;
  const depthScale = 0.38;
  const hBottomDepth = 2 * planeSpan * cos * depthScale;
  const verticalSpan = 11 + hBottomDepth;
  let spatialUnit = (layout.topHeight - verticalPadding * 2) / verticalSpan;
  let horizontalOffset = 2.8;
  if (layout.split) {
    // 左右分栏时按左栏宽度重新定尺度，三组观察角度都不得越过分栏线。
    const corners = [
      [0, 0],
      [planeSpan, 0],
      [0, planeSpan],
      [planeSpan, planeSpan]
    ];
    const horizontalFactors = corners.map(([x, y]) => {
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;
      return (rotatedY - rotatedX) * horizontalScale;
    });
    const minFactor = Math.min(...horizontalFactors);
    const maxFactor = Math.max(...horizontalFactors);
    const factorSpan = Math.max(maxFactor - minFactor, 1);
    spatialUnit = Math.min(
      spatialUnit,
      (layout.leftWidth - 20) / factorSpan
    );
    horizontalOffset = -(minFactor + maxFactor) / 2;
  }
  const originY = layout.topHeight - verticalPadding - hBottomDepth * spatialUnit;
  return {
    x: layout.isoOrigin.x + horizontalOffset * spatialUnit
      + (rotatedY - rotatedX) * horizontalScale * spatialUnit,
    y: originY + (rotatedX + rotatedY) * depthScale * spatialUnit
      - source.z * spatialUnit
  };
};

Page(pageDefinition);
