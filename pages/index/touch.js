// 触摸交互：点 / 直线 / 平面三种模式在展开投影图上的拖动。
// 高频路径只改 this.data 不 setData（见 setLivePath），重绘节流由 scheduleCanvasDraw 负责；
// 节流时序与拖动锁定策略属 F8 真机调优结果，不得以「优化」为名改动。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {


  module.exports = {
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

    setDragLock(active) {
      if (this.data.canvasDragging !== active) this.setData({ canvasDragging: active });
    }
  };
})();
