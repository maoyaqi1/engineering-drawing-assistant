// 投影与布局：等轴测投影、第一角三视图投影、视图深度、画布分区布局。
// 这里是「长对正 / 高平齐 / 宽相等」的几何来源，改动必须按 frozen-modules.md F1 做真机回归。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { ISOMETRIC_DEPTH_Z } = require('./constants.js');

  module.exports = {
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

    getProjectionMetrics() {
      const layout = this.getLayout();
      return {
        origin: layout.projectionOrigin,
        unit: Math.min(layout.rightWidth / 21, layout.bottomHeight / 23)
      };
    },

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

    projectPointToView(point, viewType) {
      const metrics = this.getProjectionMetrics();
      const { origin, unit } = metrics;
      if (viewType === 'front') return { x: origin.x - point.x * unit, y: origin.y - point.z * unit };
      if (viewType === 'top') return { x: origin.x - point.x * unit, y: origin.y + point.y * unit };
      return { x: origin.x + point.y * unit, y: origin.y - point.z * unit };
    },

    worldToView(point, viewType) {
      if (viewType === 'front') return { u: point.x, v: point.z };
      if (viewType === 'top') return { u: point.x, v: -point.y };
      return { u: -point.y, v: point.z };
    },

    getIsometricDepth(point) {
      return point.x + point.y + point.z * ISOMETRIC_DEPTH_Z;
    },

    getViewDepth(point, viewType) {
      // 第一分角：正视观察者位于 +Y，俯视观察者位于 +Z，左视观察者位于 +X。
      // 深度值越大表示越靠近观察者。
      if (viewType === 'front') return point.y;
      if (viewType === 'top') return point.z;
      return point.x;
    }
  };
})();
