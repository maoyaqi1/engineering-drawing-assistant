// Canvas 2D 基础绘制原语：直线、虚线、点、文字、多边形、箭头、圆角矩形、四分之一圈。
// 只使用传入的 context 与参数，不读取页面状态。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {


  module.exports = {
    drawLine(context, start, end) {
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    },

    drawDashedLine(context, start, end, color) {
      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = color;
      context.lineWidth = 1;
      this.drawLine(context, start, end);
      context.restore();
    },

    drawDot(context, point, color) {
      context.save();
      context.beginPath();
      context.arc(point.x, point.y, 3, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.restore();
    },

    drawPoint(context, point, color, radius, label) {
      context.save();
      context.beginPath();
      context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
      context.fillStyle = `${color}26`;
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      this.drawText(context, label, point.x + radius + 5, point.y - radius, '#26384d', 11, '700');
      context.restore();
    },

    drawText(context, text, x, y, color, size, weight) {
      context.save();
      context.fillStyle = color;
      context.font = `${weight} ${size}px sans-serif`;
      context.fillText(text, x, y);
      context.restore();
    },

    drawPolygon(context, points, fillStyle, strokeStyle, lineWidth) {
      if (!points || points.length < 3) return;
      context.save();
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        context.lineTo(points[index].x, points[index].y);
      }
      context.closePath();
      context.fillStyle = fillStyle;
      context.fill();
      context.strokeStyle = strokeStyle;
      context.lineWidth = lineWidth;
      context.stroke();
      context.restore();
    },

    drawArrow(context, start, end, color) {
      context.save();
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1.8;
      this.drawLine(context, start, end);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      context.beginPath();
      context.moveTo(end.x, end.y);
      context.lineTo(end.x - 7 * Math.cos(angle - 0.45), end.y - 7 * Math.sin(angle - 0.45));
      context.lineTo(end.x - 7 * Math.cos(angle + 0.45), end.y - 7 * Math.sin(angle + 0.45));
      context.closePath();
      context.fill();
      context.restore();
    },

    fillTriangle(context, triangle, fillStyle) {
      context.beginPath();
      context.moveTo(triangle[0].x, triangle[0].y);
      context.lineTo(triangle[1].x, triangle[1].y);
      context.lineTo(triangle[2].x, triangle[2].y);
      context.closePath();
      context.fillStyle = fillStyle;
      context.fill();
    },

    roundRect(context, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + width, y, x + width, y + height, r);
      context.arcTo(x + width, y + height, x, y + height, r);
      context.arcTo(x, y + height, x, y, r);
      context.arcTo(x, y, x + width, y, r);
      context.closePath();
    },

    drawQuarterTurnForY(context, y, origin, unit) {
      const radius = Math.max(8, Math.abs(y * unit));
      context.save();
      context.strokeStyle = '#d4d8dd';
      context.setLineDash([]);
      context.lineWidth = 0.75;
      context.beginPath();
      context.arc(origin.x, origin.y, radius, 0, Math.PI / 2);
      context.stroke();
      context.restore();
    },

    drawProjectionCorrespondence(context, views, y, origin, unit, color) {
      const topAxisPoint = { x: origin.x, y: views.top.y };
      const leftAxisPoint = { x: views.left.x, y: origin.y };
      this.drawProjectionLine(context, views.front, views.top, color);
      this.drawProjectionLine(context, views.front, views.left, color);
      this.drawProjectionLine(context, views.top, topAxisPoint, color);
      this.drawProjectionLine(context, leftAxisPoint, views.left, color);
      this.drawQuarterTurnForY(context, y, origin, unit);
    },

    drawQuarterTurn(context, top, left, origin, unit) {
      this.drawQuarterTurnForY(context, this.getPrimaryPoint().y, origin, unit);
    },

    drawSingleProjection(context, panel) {
      context.save();
      this.roundRect(context, panel.x, panel.y, panel.width, panel.height, 10);
      context.fillStyle = '#ffffff';
      context.fill();
      context.strokeStyle = '#dce4ec';
      context.stroke();
      context.clip();

      const center = { x: panel.x + panel.width / 2, y: panel.y + panel.height * 0.57 };
      const unit = Math.min(panel.width / 20, panel.height / 22);
      context.strokeStyle = '#d9e0e8';
      context.lineWidth = 1;
      this.drawLine(context, { x: panel.x + 8, y: center.y }, { x: panel.x + panel.width - 8, y: center.y });
      this.drawLine(context, { x: center.x, y: panel.y + 30 }, { x: center.x, y: panel.y + panel.height - 8 });

      const viewPoint = this.worldToView(this.data.point, panel.type);
      const projected = { x: center.x + viewPoint.u * unit, y: center.y - viewPoint.v * unit };
      this.drawProjectionLine(context, projected, { x: projected.x, y: center.y }, '#aab8c6');
      this.drawProjectionLine(context, projected, { x: center.x, y: projected.y }, '#aab8c6');
      this.drawPoint(context, projected, '#286a86', 5, panel.label);
      this.drawText(context, panel.title, panel.x + 10, panel.y + 18, '#41546c', 10, '600');
      context.restore();
    },

    drawProjectionLine(context, start, end, color) {
      context.save();
      context.setLineDash([]);
      context.strokeStyle = color;
      context.lineWidth = 0.75;
      this.drawLine(context, start, end);
      context.restore();
    }
  };
})();
