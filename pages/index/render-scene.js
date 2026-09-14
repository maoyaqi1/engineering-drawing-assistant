// 画布初始化、绘制调度，以及空间图 / 三视图三大面板的绘制。
// initializeCanvas 负责 canvas 2d 节点与尺寸，scheduleCanvasDraw 负责合并重绘。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const BasicSolid = require('./basic-solid.js');

  module.exports = {
    initializeCanvas() {
      const init = (retry) => {
        const query = this.createSelectorQuery();
        query.select('#geometryCanvas').fields({ node: true, size: true }).exec((results) => {
          const canvasInfo = results && results[0];
          if (!canvasInfo || !canvasInfo.node || canvasInfo.width < 50) {
            if (retry > 0) setTimeout(() => init(retry - 1), 300);
            return;
          }
          const pixelRatio = Math.min(wx.getWindowInfo().pixelRatio || 1, 3);
          this.canvas = canvasInfo.node;
          this.context = this.canvas.getContext('2d');
          this.canvasWidth = canvasInfo.width;
          this.canvasHeight = canvasInfo.height;
          this.canvas.width = canvasInfo.width * pixelRatio;
          this.canvas.height = canvasInfo.height * pixelRatio;
          this.context.scale(pixelRatio, pixelRatio);
          this.drawScene();
        });
      };
      init(4);
    },

    scheduleCanvasDraw() {
      if (this._drawScheduled) return;
      this._drawScheduled = true;
      const canvasRaf = this.canvas && this.canvas.requestAnimationFrame;
      const run = () => {
        this._drawScheduled = false;
        if (this.context) this.drawScene();
      };
      if (canvasRaf) {
        canvasRaf.call(this.canvas, run);
      } else {
        setTimeout(run, 16);
      }
    },

    setLivePath(path, value) {
      const parts = String(path).split('.');
      let cur = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null) return;
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    },

    drawScene() {
      if (!this.context || !this.canvasWidth) return;
      const context = this.context;
      const layout = this.getLayout();
      context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.drawIsometricPanel(context, layout);
      if (this.data.mode === 'line') this.drawLineIsometricOverlay(context);
      if (this.data.mode === 'plane') this.drawPlaneIsometricOverlay(context);
      if (this.data.mode === 'section') this.drawSectionIsometricOverlay(context);
      if (this.data.mode === 'solid') BasicSolid.drawIso(context, this);
      this.drawProjectionPanels(context, layout);
      if (this.data.mode === 'line') this.drawLineProjectionOverlay(context, layout);
      if (this.data.mode === 'plane') this.drawPlaneProjectionOverlay(context);
      if (this.data.mode === 'section') this.drawSectionProjectionOverlay(context);
      if (this.data.mode === 'solid') BasicSolid.drawViews(context, this);
    },

    drawIsometricPanel(context, layout) {
      context.save();
      context.beginPath();
      context.rect(0, 0, layout.leftWidth, layout.topHeight);
      context.fillStyle = '#090a0c';
      context.fill();
      context.clip();

      const origin = layout.isoOrigin;
      const edge = layout.unit * 9;
      context.fillStyle = 'rgba(50, 184, 110, 0.24)';
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(origin.x - edge * 1.2, origin.y + edge * 0.6);
      context.lineTo(origin.x, origin.y + edge * 1.08);
      context.lineTo(origin.x + edge * 1.2, origin.y + edge * 0.6);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(52, 132, 246, 0.24)';
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(origin.x - edge * 1.2, origin.y + edge * 0.6);
      context.lineTo(origin.x - edge * 1.2, origin.y - edge * 1.15);
      context.lineTo(origin.x, origin.y - edge * 0.92);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(245, 196, 55, 0.22)';
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(origin.x + edge * 1.2, origin.y + edge * 0.6);
      context.lineTo(origin.x + edge * 1.2, origin.y - edge * 1.15);
      context.lineTo(origin.x, origin.y - edge * 0.92);
      context.closePath();
      context.fill();

      const axes = [
        { end: this.projectIsometric({ x: 9, y: 0, z: 0 }), color: '#b4b8bf', label: 'X' },
        { end: this.projectIsometric({ x: 0, y: 9, z: 0 }), color: '#b4b8bf', label: 'Y' },
        { end: this.projectIsometric({ x: 0, y: 0, z: 10 }), color: '#b4b8bf', label: 'Z' }
      ];
      axes.forEach((axis) => {
        this.drawArrow(context, origin, axis.end, axis.color);
        this.drawText(context, axis.label, axis.end.x + 3, axis.end.y - 5, '#e3e5e8', 10, '600');
      });
      const spaceTitle = this.data.mode === 'line' ? '空间直线及投影' : (this.data.mode === 'plane' ? '空间平面及投影' : (this.data.mode === 'section' ? '空间截切及截交线' : (this.data.mode === 'solid' ? '空间立体' : '空间投影面')));
      this.drawText(context, spaceTitle, 12, 22, '#d9dde4', 11, '600');
      this.drawText(context, 'V 面', origin.x - edge * 0.72, origin.y - edge * 0.42, '#78b7ff', 9, '600');
      this.drawText(context, 'W 面', origin.x + edge * 0.58, origin.y - edge * 0.42, '#f2d36c', 9, '600');
      this.drawText(context, 'H 面', origin.x - 10, origin.y + edge * 0.74, '#6ed59a', 9, '600');

      if (this.data.mode === 'section' || this.data.mode === 'solid') {
        context.restore();
        return;
      }

      const primaryPoint = this.getPrimaryPoint();
      const pointScreen = this.projectIsometric(primaryPoint);
      const groundPoint = this.projectIsometric({ ...primaryPoint, z: 0 });
      const frontPoint = this.projectIsometric({ x: primaryPoint.x, y: 0, z: primaryPoint.z });
      const sidePoint = this.projectIsometric({ x: 0, y: primaryPoint.y, z: primaryPoint.z });
      this.drawProjectionLine(context, pointScreen, groundPoint, '#7d838c');
      this.drawProjectionLine(context, pointScreen, frontPoint, '#7d838c');
      this.drawProjectionLine(context, pointScreen, sidePoint, '#7d838c');
      this.drawPoint(context, groundPoint, '#ff4f53', 5, 'a');
      this.drawPoint(context, frontPoint, '#ff4f53', 5, "a′");
      this.drawPoint(context, sidePoint, '#ff4f53', 5, 'a″');
      this.drawPoint(context, pointScreen, '#ff4f53', 5, 'A');
      context.restore();
    },

    drawLineIsometricOverlay(context) {
      const a = this.data.line.a;
      const b = this.data.line.b;
      const aSpace = this.projectIsometric(a);
      const bSpace = this.projectIsometric(b);
      const projections = (point) => ({
        front: this.projectIsometric({ x: point.x, y: 0, z: point.z }),
        top: this.projectIsometric({ x: point.x, y: point.y, z: 0 }),
        left: this.projectIsometric({ x: 0, y: point.y, z: point.z })
      });
      const aViews = projections(a);
      const bViews = projections(b);

      context.save();
      context.lineWidth = 2.2;
      context.strokeStyle = '#ffb347';
      this.drawLine(context, aSpace, bSpace);
      context.lineWidth = 1.8;
      context.strokeStyle = '#f06b6b';
      this.drawLine(context, aViews.front, bViews.front);
      context.strokeStyle = '#55c985';
      this.drawLine(context, aViews.top, bViews.top);
      context.strokeStyle = '#5b91ed';
      this.drawLine(context, aViews.left, bViews.left);
      this.drawProjectionLine(context, bSpace, bViews.front, '#737b86');
      this.drawProjectionLine(context, bSpace, bViews.top, '#737b86');
      this.drawProjectionLine(context, bSpace, bViews.left, '#737b86');
      this.drawPoint(context, bViews.front, '#5b91ed', 5, "b′");
      this.drawPoint(context, bViews.top, '#5b91ed', 5, 'b');
      this.drawPoint(context, bViews.left, '#5b91ed', 5, 'b″');
      this.drawPoint(context, bSpace, '#5b91ed', 5, 'B');
      this.drawPoint(context, aSpace, '#ff4f53', 5, 'A');
      context.restore();
    },

    drawPlaneIsometricOverlay(context) {
      const points = ['a', 'b', 'c'].map((key) => this.data.plane[key]);
      const spacePoints = points.map((point) => this.projectIsometric(point));
      const viewPoints = (viewName) => points.map((point) => {
        if (viewName === 'front') return this.projectIsometric({ x: point.x, y: 0, z: point.z });
        if (viewName === 'top') return this.projectIsometric({ x: point.x, y: point.y, z: 0 });
        return this.projectIsometric({ x: 0, y: point.y, z: point.z });
      });
      const front = viewPoints('front');
      const top = viewPoints('top');
      const left = viewPoints('left');

      context.save();
      this.drawPolygon(context, spacePoints, 'rgba(53, 195, 200, 0.30)', '#67e1e5', 2.2);
      this.drawPolygon(context, front, 'rgba(223, 87, 87, 0.13)', '#df5757', 1.5);
      this.drawPolygon(context, top, 'rgba(67, 166, 108, 0.13)', '#43a66c', 1.5);
      this.drawPolygon(context, left, 'rgba(55, 121, 208, 0.13)', '#3779d0', 1.5);
      ['b', 'c'].forEach((key, index) => {
        const point = this.data.plane[key];
        const space = this.projectIsometric(point);
        const views = [front[index + 1], top[index + 1], left[index + 1]];
        views.forEach((viewPoint) => this.drawProjectionLine(context, space, viewPoint, '#737b86'));
      });
      const colors = ['#ff4f53', '#3779d0', '#f0a62e'];
      const labels = ['A', 'B', 'C'];
      spacePoints.forEach((point, index) => this.drawPoint(context, point, colors[index], 5, labels[index]));
      this.drawPoint(context, front[1], colors[1], 5, "b′");
      this.drawPoint(context, top[1], colors[1], 5, 'b');
      this.drawPoint(context, left[1], colors[1], 5, 'b″');
      this.drawPoint(context, front[2], colors[2], 5, "c′");
      this.drawPoint(context, top[2], colors[2], 5, 'c');
      this.drawPoint(context, left[2], colors[2], 5, 'c″');
      context.restore();
    },

    drawProjectionPanels(context, layout) {
      const contextWidth = this.canvasWidth;
      const height = this.canvasHeight;
      const origin = layout.projectionOrigin;
      const metrics = this.getProjectionMetrics();
      const unit = metrics.unit;
      context.save();
      context.fillStyle = '#ffffff';
      context.fillRect(layout.projectionLeft, layout.projectionTop, layout.projectionWidth, layout.projectionHeight);
      context.strokeStyle = '#31343a';
      context.lineWidth = 1.5;
      if (layout.split) {
        // 左右布局：分隔线改为左列与右列之间的竖线
        this.drawLine(context, { x: layout.leftWidth, y: 0 }, { x: layout.leftWidth, y: height });
      } else {
        this.drawLine(context, { x: 0, y: layout.dividerY }, { x: contextWidth, y: layout.dividerY });
      }
      context.strokeStyle = '#777d85';
      context.lineWidth = 1;
      this.drawLine(context, { x: layout.projectionLeft + 10, y: origin.y },
        { x: layout.projectionLeft + layout.projectionWidth - 10, y: origin.y });
      this.drawLine(context, { x: origin.x, y: layout.projectionTop + 34 },
        { x: origin.x, y: layout.projectionTop + layout.projectionHeight - 18 });
      this.drawText(context, 'Z', origin.x + 5, layout.projectionTop + 34, '#525861', 10, '600');
      this.drawText(context, 'X', layout.projectionLeft + 8, origin.y - 5, '#525861', 10, '600');
      this.drawText(context, 'Y', origin.x + 5, layout.projectionTop + layout.projectionHeight - 10, '#525861', 10, '600');

      if (this.data.mode === 'section') {
        this.drawText(context, '立体三视图与截交线', layout.projectionLeft + 12, layout.projectionTop + 23, '#3b4654', 11, '600');
        context.restore();
        return;
      }

      const projectionTitle = this.data.mode === 'line' ? '直线三面投影 · 拖动端点' : (this.data.mode === 'plane' ? '平面三面投影 · 拖动顶点' : (this.data.mode === 'solid' ? '基本立体三视图' : '三面投影展开 · 拖动红点'));
      this.drawText(context, projectionTitle, layout.projectionLeft + 12, layout.projectionTop + 23, '#3b4654', 11, '600');
      if (this.data.mode !== 'point') {
        context.restore();
        return;
      }

      const { front, top, left } = this.getProjectionScreenPoints();
      this.drawProjectionCorrespondence(context, { front, top, left }, this.getPrimaryPoint().y, origin, unit, '#c8cdd3');
      this.drawPoint(context, front, '#ff4f53', 5, "a′");
      this.drawPoint(context, top, '#ff4f53', 5, 'a');
      this.drawPoint(context, left, '#ff4f53', 5, 'a″');
      context.restore();
    },

    drawLineProjectionOverlay(context) {
      const aViews = this.getProjectionScreenPoints(this.data.line.a);
      const bViews = this.getProjectionScreenPoints(this.data.line.b);
      const origin = this.getProjectionMetrics().origin;
      const unit = this.getProjectionMetrics().unit;

      context.save();
      [
        { point: this.data.line.a, views: aViews },
        { point: this.data.line.b, views: bViews }
      ].forEach((entry) => {
        this.drawProjectionCorrespondence(context, entry.views, entry.point.y, origin, unit, '#c4cad1');
      });
      context.lineWidth = 2.2;
      context.strokeStyle = '#df5757';
      this.drawLine(context, aViews.front, bViews.front);
      context.strokeStyle = '#43a66c';
      this.drawLine(context, aViews.top, bViews.top);
      context.strokeStyle = '#3779d0';
      this.drawLine(context, aViews.left, bViews.left);
      this.drawPoint(context, aViews.front, '#ff4f53', 5, "a′");
      this.drawPoint(context, aViews.top, '#ff4f53', 5, 'a');
      this.drawPoint(context, aViews.left, '#ff4f53', 5, 'a″');
      this.drawPoint(context, bViews.front, '#3779d0', 5, "b′");
      this.drawPoint(context, bViews.top, '#3779d0', 5, 'b');
      this.drawPoint(context, bViews.left, '#3779d0', 5, 'b″');
      context.restore();
    },

    drawPlaneProjectionOverlay(context) {
      const keys = ['a', 'b', 'c'];
      const projections = keys.map((key) => this.getProjectionScreenPoints(this.data.plane[key]));
      const front = projections.map((views) => views.front);
      const top = projections.map((views) => views.top);
      const left = projections.map((views) => views.left);
      const metrics = this.getProjectionMetrics();

      context.save();
      this.drawPolygon(context, front, 'rgba(223, 87, 87, 0.12)', '#df5757', 2.2);
      this.drawPolygon(context, top, 'rgba(67, 166, 108, 0.12)', '#43a66c', 2.2);
      this.drawPolygon(context, left, 'rgba(55, 121, 208, 0.12)', '#3779d0', 2.2);
      [0, 1, 2].forEach((index) => {
        this.drawProjectionCorrespondence(
          context,
          { front: front[index], top: top[index], left: left[index] },
          this.data.plane[keys[index]].y,
          metrics.origin,
          metrics.unit,
          '#c4cad1'
        );
      });
      const redrawOutline = (points, color) => {
        context.strokeStyle = color;
        context.lineWidth = 2.2;
        context.setLineDash([]);
        for (let index = 0; index < points.length; index += 1) {
          this.drawLine(context, points[index], points[(index + 1) % points.length]);
        }
      };
      redrawOutline(front, '#df5757');
      redrawOutline(top, '#43a66c');
      redrawOutline(left, '#3779d0');
      const colors = ['#ff4f53', '#3779d0', '#f0a62e'];
      const suffixes = [
        ["a′", 'a', 'a″'], ["b′", 'b', 'b″'], ["c′", 'c', 'c″']
      ];
      projections.forEach((views, index) => {
        this.drawPoint(context, views.front, colors[index], 5, suffixes[index][0]);
        this.drawPoint(context, views.top, colors[index], 5, suffixes[index][1]);
        this.drawPoint(context, views.left, colors[index], 5, suffixes[index][2]);
      });
      context.restore();
    }
  };
})();
