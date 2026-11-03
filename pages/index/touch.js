// 触摸交互：点 / 直线 / 平面三种模式在展开投影图上的拖动。
// 高频路径只改 this.data 不 setData（见 setLivePath），重绘节流由 scheduleCanvasDraw 负责；
// 节流时序与拖动锁定策略属 F8 真机调优结果，不得以「优化」为名改动。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {


  module.exports = {
    // 触摸开始只做“锁定拖动主体”，不写几何真值；30px 是逻辑像素命中阈值，
    // 不随 DPR 缩放。截面/立体模式没有投影拖动入口。
    handleTouchStart(event) {
      this.recordInteraction();
      const touch = event.touches && event.touches[0];
      if (!touch || !this.canvasWidth) return;
      if (this.data.mode === 'section' || this.data.mode === 'solid') return;
      if (this.data.mode === 'plane') {
        this.handlePlaneTouchStart(touch);
        this.setDragLock(this.draggingPlaneProjection != null);
        return;
      }
      if (this.data.mode === 'line') {
        this.handleLineTouchStart(touch);
        this.setDragLock(this.draggingLineProjection != null);
        return;
      }
      const projections = this.getProjectionScreenPoints();
      const hitRadius = 30;
      this.draggingProjection = null;
      ['front', 'top', 'left'].some((viewType) => {
        const screenPoint = projections[viewType];
        if (Math.hypot(touch.x - screenPoint.x, touch.y - screenPoint.y) <= hitRadius) {
          this.draggingProjection = viewType;
          return true;
        }
        return false;
      });
      this.setDragLock(this.draggingProjection != null);
    },

    // 点模式每次移动都从触摸位置重新换算两个模型坐标，第三个坐标保持原值。
    // 因而屏幕偏移不会累积成漂移，且拖动视图只改变该投影面拥有的两轴。
    handleTouchMove(event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      if (this.data.mode === 'section' || this.data.mode === 'solid') return;
      if (this.data.mode === 'plane') {
        this.handlePlaneTouchMove(touch);
        return;
      }
      if (this.data.mode === 'line') {
        this.handleLineTouchMove(touch);
        return;
      }
      if (!this.draggingProjection) return;

      const metrics = this.getProjectionMetrics();
      const nextPoint = { ...this.data.point };
      if (this.draggingProjection === 'front') {
        nextPoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
        nextPoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
      } else if (this.draggingProjection === 'top') {
        nextPoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
        nextPoint.y = this.screenToModel(touch.y - metrics.origin.y, metrics.unit);
      } else {
        nextPoint.y = this.screenToModel(touch.x - metrics.origin.x, metrics.unit);
        nextPoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
      }
      this.setLivePath('point', nextPoint);
      this.setLivePath('pointType', 'general');
      this.scheduleCanvasDraw();
    },

    // 松手时把拖动期间直接写入 this.data 的热路径数据一次性 setData 提交，
    // 同时统一释放拖动锁和三种互斥的 dragging 引用。
    handleTouchEnd() {
      const wasDragging = this.draggingProjection != null || this.draggingLineProjection != null || this.draggingPlaneProjection != null;
      if (wasDragging) {
        if (this.data.mode === 'point') {
          this.setData({ point: this.data.point, pointType: this.data.pointType, canvasDragging: false }, () => this.scheduleCanvasDraw());
        } else if (this.data.mode === 'plane') {
          this.setData({ plane: this.data.plane, planeType: this.data.planeType, canvasDragging: false }, () => this.scheduleCanvasDraw());
        } else if (this.data.mode === 'line') {
          this.setData({ line: this.data.line, lineType: this.data.lineType, canvasDragging: false }, () => this.scheduleCanvasDraw());
        } else {
          this.setData({ canvasDragging: false });
        }
      } else {
        this.setDragLock(false);
      }
      this.draggingProjection = null;
      this.draggingLineProjection = null;
      this.draggingPlaneProjection = null;
    },

    // 平面拖动主体包含“哪个顶点 + 哪个投影视图”，命中顺序固定 a→b→c、
    // front→top→left，避免重叠点时结果依赖遍历顺序。
    handlePlaneTouchStart(touch) {
      const hitRadius = 30;
      this.draggingPlaneProjection = null;
      ['a', 'b', 'c'].some((pointKey) => {
        const projections = this.getProjectionScreenPoints(this.data.plane[pointKey]);
        return ['front', 'top', 'left'].some((viewType) => {
          const screenPoint = projections[viewType];
          if (Math.hypot(touch.x - screenPoint.x, touch.y - screenPoint.y) <= hitRadius) {
            this.draggingPlaneProjection = { pointKey, viewType };
            return true;
          }
          return false;
        });
      });
    },

    // 平面顶点更新后先做共线校验；不满足三点定平面时直接放弃本次移动，
    // 不触发重绘，也不修改 planeType。
    handlePlaneTouchMove(touch) {
      if (!this.draggingPlaneProjection) return;
      const { pointKey, viewType } = this.draggingPlaneProjection;
      const metrics = this.getProjectionMetrics();
      const point = { ...this.data.plane[pointKey] };
      if (viewType === 'front') {
        point.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
        point.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
      } else if (viewType === 'top') {
        point.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
        point.y = this.screenToModel(touch.y - metrics.origin.y, metrics.unit);
      } else {
        point.y = this.screenToModel(touch.x - metrics.origin.x, metrics.unit);
        point.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
      }
      const nextPlane = { ...this.data.plane, [pointKey]: point };
      if (!this.isPlaneNonCollinear(nextPlane)) return;
      this.setLivePath(`plane.${pointKey}`, point);
      this.setLivePath('planeType', 'general');
      this.scheduleCanvasDraw();
    },

    // 平面有效性使用 AB×AC 的平方模长与 1e-8 阈值比较，避免开方；
    // 该判定只回答“是否可定平面”，不代表当前平面与投影面的特殊位置类型。
    isPlaneNonCollinear(plane) {
      const ab = {
        x: plane.b.x - plane.a.x,
        y: plane.b.y - plane.a.y,
        z: plane.b.z - plane.a.z
      };
      const ac = {
        x: plane.c.x - plane.a.x,
        y: plane.c.y - plane.a.y,
        z: plane.c.z - plane.a.z
      };
      const cross = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x
      };
      return cross.x * cross.x + cross.y * cross.y + cross.z * cross.z > 1e-8;
    },

    // 直线端点命中的状态结构与平面一致，只允许当前端点的 front/top/left
    // 三个投影控制柄之一成为拖动主体。
    handleLineTouchStart(touch) {
      const hitRadius = 30;
      this.draggingLineProjection = null;
      ['a', 'b'].some((endpointKey) => {
        const projections = this.getProjectionScreenPoints(this.data.line[endpointKey]);
        return ['front', 'top', 'left'].some((viewType) => {
          const screenPoint = projections[viewType];
          if (Math.hypot(touch.x - screenPoint.x, touch.y - screenPoint.y) <= hitRadius) {
            this.draggingLineProjection = { endpointKey, viewType };
            return true;
          }
          return false;
        });
      });
    },

    // 直线端点移动同样只改当前视图对应的两轴，并将 lineType 回退为 general，
    // 防止已拖动离开特殊位置后仍显示旧的预设名称。
    handleLineTouchMove(touch) {
      if (!this.draggingLineProjection) return;
      const { endpointKey, viewType } = this.draggingLineProjection;
      const metrics = this.getProjectionMetrics();
      const endpoint = { ...this.data.line[endpointKey] };
      if (viewType === 'front') {
        endpoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
        endpoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
      } else if (viewType === 'top') {
        endpoint.x = this.screenToModel(metrics.origin.x - touch.x, metrics.unit);
        endpoint.y = this.screenToModel(touch.y - metrics.origin.y, metrics.unit);
      } else {
        endpoint.y = this.screenToModel(touch.x - metrics.origin.x, metrics.unit);
        endpoint.z = this.screenToModel(metrics.origin.y - touch.y, metrics.unit);
      }
      this.setLivePath(`line.${endpointKey}`, endpoint);
      this.setLivePath('lineType', 'general');
      this.scheduleCanvasDraw();
    },

    // canvasDragging 同时驱动 WXML 滚动锁定；仅在布尔状态改变时 setData，
    // 避免触摸开始/移动高频调用视图层。
    setDragLock(active) {
      if (this.data.canvasDragging !== active) this.setData({ canvasDragging: active });
    }
  };
})();
