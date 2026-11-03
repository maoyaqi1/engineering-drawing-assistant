// 投影与布局：等轴测投影、第一角三视图投影、视图深度、画布分区布局。
// 这里是「长对正 / 高平齐 / 宽相等」的几何来源，改动必须按 frozen-modules.md F1 做真机回归。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { ISOMETRIC_DEPTH_Z } = require('./constants.js');

  module.exports = {
    // 依据画布宽高比选择上下/左右布局。所有面板位置和统一单位都从这一处返回，
    // 绘制函数不得自行估算边距，否则空间图和三视图会失配。
    getLayout() {
      const width = this.canvasWidth;
      const height = this.canvasHeight;
      // 宽画布（PAD 横屏 / 折叠屏展开 / 手机横屏）改为左右布局：左侧空间视图，右侧三面投影。
      // 判定只看画布自身宽高比，手机竖屏（约 0.6）永远不会进入此分支，原有上下布局数值保持不变。
      const WIDE_RATIO = 1.25;
      if (width >= height * WIDE_RATIO) {
        // 与参考版式一致：左右各半（空间视图 / 三面投影各占 50%）
        const leftWidth = Math.round(width * 0.5);
        const rightWidth = width - leftWidth;
        return {
          split: true,
          dividerY: 0,
          topHeight: height,      // 空间视图占满左列
          bottomHeight: height,   // 三面投影占满右列
          leftWidth,
          rightWidth,
          projectionLeft: leftWidth,
          projectionTop: 0,
          projectionWidth: rightWidth,
          projectionHeight: height,
          unit: Math.min(leftWidth / 27, height / 24),
          isoOrigin: { x: leftWidth * 0.5, y: height * 0.52 },
          projectionOrigin: { x: leftWidth + rightWidth * 0.5, y: height * 0.5 }
        };
      }
      const dividerY = height * 0.46;
      const topHeight = dividerY;
      const bottomHeight = height - dividerY;
      return {
        split: false,
        dividerY,
        topHeight,
        bottomHeight,
        leftWidth: width,
        rightWidth: width,
        projectionLeft: 0,
        projectionTop: dividerY,
        projectionWidth: width,
        projectionHeight: bottomHeight,
        // X/Y 取相反极值时横向跨度最大，预留完整的 ±8 坐标显示范围。
        unit: Math.min(width / 27, topHeight / 24),
        isoOrigin: { x: width * 0.5, y: topHeight * 0.58 },
        projectionOrigin: { x: width * 0.5, y: dividerY + bottomHeight * 0.5 }
      };
    },

    // 三视图专用的原点与单位长度。它只影响屏幕映射，不改变模型坐标。
    getProjectionMetrics() {
      const layout = this.getLayout();
      return {
        origin: layout.projectionOrigin,
        unit: Math.min(layout.rightWidth / 21, layout.bottomHeight / 23)
      };
    },

    // 同一空间点的 front/top/left 三个屏幕点。第一角关系分别为：
    // front=(x,z)、top=(x,-y)、left=(-y,z)，再乘统一单位并翻转屏幕 Y。
    getProjectionScreenPoints(sourcePoint) {
      const metrics = this.getProjectionMetrics();
      const { origin, unit } = metrics;
      const point = sourcePoint || this.getPrimaryPoint();
      return {
        front: { x: origin.x - point.x * unit, y: origin.y - point.z * unit },
        top: { x: origin.x - point.x * unit, y: origin.y + point.y * unit },
        left: { x: origin.x + point.y * unit, y: origin.y - point.z * unit }
      };
    },

    // 空间视图的“主点”：点模式取点，直线/平面取首控制点。
    // 该选择只影响空间场景中的投射线，不影响三视图完整对象。
    getPrimaryPoint() {
      if (this.data.mode === 'plane') return this.data.plane.a;
      return this.data.mode === 'line' ? this.data.line.a : this.data.point;
    },

    projectIsometric(point) {
      const layout = this.getLayout();
      // 统一的斜轴测基底：X 向左下、Y 向右下、Z 向上。
      // H: z=0，V: y=0，W: x=0；空间点和三个投影点必须共用此映射。
      const horizontalFactor = 0.78;
      const depthFactor = 0.38;
      return {
        x: layout.isoOrigin.x + (point.y - point.x) * horizontalFactor * layout.unit,
        y: layout.isoOrigin.y + (point.x + point.y) * depthFactor * layout.unit - point.z * layout.unit
      };
    },

    // 单点版三视图映射，供立体与截交模块使用；必须与 getProjectionScreenPoints
    // 保持完全一致，避免点模式和其他模式产生不同投影。
    projectPointToView(point, viewType) {
      const metrics = this.getProjectionMetrics();
      const { origin, unit } = metrics;
      if (viewType === 'front') return { x: origin.x - point.x * unit, y: origin.y - point.z * unit };
      if (viewType === 'top') return { x: origin.x - point.x * unit, y: origin.y + point.y * unit };
      return { x: origin.x + point.y * unit, y: origin.y - point.z * unit };
    },

    // 返回未缩放、未平移、未翻转屏幕 Y 的模型视图坐标 (u,v)。
    // 该函数用于数学层与测试，不作为最终 Canvas 像素坐标。
    worldToView(point, viewType) {
      if (viewType === 'front') return { u: point.x, v: point.z };
      if (viewType === 'top') return { u: point.x, v: -point.y };
      return { u: -point.y, v: point.z };
    },

    // 固定等轴测观察方向的深度标量：值越大越靠近观察者。
    // 只用于可见性排序，不写回点坐标。
    getIsometricDepth(point) {
      return point.x + point.y + point.z * ISOMETRIC_DEPTH_Z;
    },

    // 正交三视图各自保留的朝向轴；这三条映射决定“谁遮挡谁”，
    // 不能与屏幕坐标轴交换混用。
    getViewDepth(point, viewType) {
      // 第一分角：正视观察者位于 +Y，俯视观察者位于 +Z，左视观察者位于 +X。
      // 深度值越大表示越靠近观察者。
      if (viewType === 'front') return point.y;
      if (viewType === 'top') return point.z;
      return point.x;
    }
  };
})();
