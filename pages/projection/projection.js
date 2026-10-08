// 投影体系页面（独立新增页面，2026-10-08）——三投影面体系 + 投影面展开。
//
// 本页只**复用** pages/index 的既有模块（布局 / 等轴测 / 三视图映射 / 绘图原语 / 画布生命周期 / 学习埋点），
// 不修改其中任何一行；本页特有的展开数学与绘制全部在 ./unfold.js。
// 挂载顺序即覆盖顺序：unfold 放最后，覆盖 render-scene.js 的三个绘制入口与 session.js 的埋点章节名。
//
// 外层 IIFE：与 pages/index 各模块保持一致的模块写法，避免顶层 const 泄漏到全局。
(function () {
  const projection = require('../index/projection.js');
  const drawHelpers = require('../index/draw-helpers.js');
  const renderScene = require('../index/render-scene.js');
  const session = require('../index/session.js');
  const unfold = require('./unfold.js');

  Page(Object.assign({
    data: {
      // 章节标识（学习埋点用）：详见 unfold.js 的 trackEvent 覆盖
      mode: 'system',
      unfold: { angle: 0 },
      viewAngle: 0,          // 观察方位角（绕 OZ 轴，空间视图左右拖动改变）
      canvasDragging: false,  // 拖动旋转期间锁定页面滚动
      scope: 'first',        // 默认第一分角：只保留第一分角内的三块板；'octants' = 三块面各向两侧延伸（八分角）
      // 空间点固定取第一分角的一般位置（不再提供位置预设）
      point: { x: 4, y: 3, z: 5 }
    },

    onLoad() {
      // 展开角先只放实例属性：动画每帧改它并请求重绘，data.unfold.angle 只按 10Hz 节流同步（§30）
      this.unfoldAngle = 0;
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
        title: '工程制图学习助手 · 三投影面体系与投影面展开',
        path: '/pages/projection/projection'
      };
    },

    onUnload() {
      // 停掉可能还在跑的展开动画，再解绑画布与上下文（§28）
      this._unfoldAnimating = false;
      this.endSession();
      this.canvas = null;
      this.context = null;
    }
  }, session, projection, drawHelpers, renderScene, unfold));
})();
