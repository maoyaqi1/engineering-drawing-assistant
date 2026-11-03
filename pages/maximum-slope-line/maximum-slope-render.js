// 最大斜度线 · Canvas 2D 绘制层。
//
// 空间区显示固定平面、所选投影面、候选线和平面内投影面平行线；
// 下方三视图显示同一组几何的投影。绘制层只读取页面实例中的 _geometry。
const {
  projectPoint
} = require('./maximum-slope-model.js');

const COLORS = {
  candidate: '#ff9f1c',
  candidateGlow: 'rgba(255, 159, 28, 0.24)',
  helper: '#000000',
  maximum: '#e53935',
  maximumGlow: 'rgba(229, 57, 53, 0.25)',
  angle: '#a77bff',
  muted: '#8b939d',
  planeFill: 'rgba(53, 195, 200, 0.27)',
  planeStroke: '#67e1e5'
};

const VIEW_STYLES = {
  front: {
    plane: 'V',
    label: '正投影 V',
    color: '#df5757',
    fill: 'rgba(223, 87, 87, 0.13)'
  },
  top: {
    plane: 'H',
    label: '水平投影 H',
    color: '#43a66c',
    fill: 'rgba(67, 166, 108, 0.13)'
  },
  left: {
    plane: 'W',
    label: '侧面投影 W',
    color: '#3779d0',
    fill: 'rgba(55, 121, 208, 0.13)'
  }
};

const WALL_STYLES = {
  H: {
    fill: 'rgba(50, 184, 110, 0.22)',
    selectedFill: 'rgba(50, 184, 110, 0.34)',
    stroke: '#55c985',
    text: '#6ed59a'
  },
  V: {
    fill: 'rgba(52, 132, 246, 0.22)',
    selectedFill: 'rgba(52, 132, 246, 0.34)',
    stroke: '#5b91ed',
    text: '#78b7ff'
  },
  W: {
    fill: 'rgba(245, 196, 55, 0.20)',
    selectedFill: 'rgba(245, 196, 55, 0.32)',
    stroke: '#e5bb38',
    text: '#f2d36c'
  }
};

const SPATIAL_YAW = -30 * Math.PI / 180;
const SPATIAL_CENTERING = 2.8;
const SPATIAL_HORIZONTAL_SCALE = 0.78;
const SPATIAL_DEPTH_SCALE = 0.38;
const SPATIAL_PLANE_SPAN = 8.8;
const SPATIAL_AXIS_LENGTH = 9;
const SPATIAL_VERTICAL_PADDING = 2;
const SPATIAL_Z_AXIS_UNITS = SPATIAL_AXIS_LENGTH + 1;
const SPATIAL_H_BOTTOM_DEPTH_UNITS = 2 * SPATIAL_PLANE_SPAN
  * Math.cos(SPATIAL_YAW) * SPATIAL_DEPTH_SCALE;
const SPATIAL_VERTICAL_SPAN_UNITS = SPATIAL_Z_AXIS_UNITS
  + SPATIAL_H_BOTTOM_DEPTH_UNITS;
const SCREEN_EPSILON = 1e-6;
const PROJECTION_LINE_WIDTH = 3;

function normalizeScreenAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

module.exports = {
  projectIsometric(sourcePoint) {
    const layout = this.getLayout();
    const point = sourcePoint || { x: 0, y: 0, z: 0 };
    const cos = Math.cos(SPATIAL_YAW);
    const sin = Math.sin(SPATIAL_YAW);
    const rotatedX = point.x * cos - point.y * sin;
    const rotatedY = point.x * sin + point.y * cos;
    const spatialUnit = (layout.topHeight - SPATIAL_VERTICAL_PADDING * 2)
      / SPATIAL_VERTICAL_SPAN_UNITS;
    const originY = layout.topHeight - SPATIAL_VERTICAL_PADDING
      - SPATIAL_H_BOTTOM_DEPTH_UNITS * spatialUnit;
    return {
      x: layout.isoOrigin.x + SPATIAL_CENTERING * spatialUnit
        + (rotatedY - rotatedX) * SPATIAL_HORIZONTAL_SCALE * spatialUnit,
      y: originY
        + (rotatedX + rotatedY) * SPATIAL_DEPTH_SCALE * spatialUnit
        - point.z * spatialUnit
    };
  },

  drawScene() {
    if (!this.context || !this.canvasWidth || !this._geometry) return;
    this.context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    const layout = this.getLayout();
    this.drawIsometricPanel(this.context, layout);
    this.drawSpatialPlane(this.context, layout);
    this.drawSpatialLines(this.context, layout);
    this.drawProjectionPanel(this.context, layout);
  },

  drawIsometricPanel(context, layout) {
    context.save();
    context.beginPath();
    context.rect(0, 0, layout.leftWidth, layout.topHeight);
    context.fillStyle = '#090a0c';
    context.fill();
    context.clip();

    const span = SPATIAL_PLANE_SPAN;
    const origin = this.projectIsometric({ x: 0, y: 0, z: 0 });
    const xPoint = this.projectIsometric({ x: span, y: 0, z: 0 });
    const yPoint = this.projectIsometric({ x: 0, y: span, z: 0 });
    const zPoint = this.projectIsometric({ x: 0, y: 0, z: span });
    const xyPoint = this.projectIsometric({ x: span, y: span, z: 0 });
    const xzPoint = this.projectIsometric({ x: span, y: 0, z: span });
    const yzPoint = this.projectIsometric({ x: 0, y: span, z: span });
    const selectedPlane = this._geometry.projectionPlane;
    const styleOf = (plane) => {
      const style = WALL_STYLES[plane];
      return plane === selectedPlane
        ? { fill: style.selectedFill, stroke: style.stroke, width: 2.4 }
        : { fill: style.fill, stroke: style.stroke, width: 1 };
    };
    const hStyle = styleOf('H');
    const vStyle = styleOf('V');
    const wStyle = styleOf('W');

    this.drawPolygon(context, [origin, xPoint, xyPoint, yPoint],
      hStyle.fill, hStyle.stroke, hStyle.width);
    this.drawPolygon(context, [origin, xPoint, xzPoint, zPoint],
      vStyle.fill, vStyle.stroke, vStyle.width);
    this.drawPolygon(context, [origin, yPoint, yzPoint, zPoint],
      wStyle.fill, wStyle.stroke, wStyle.width);

    [
      { end: this.projectIsometric({ x: SPATIAL_AXIS_LENGTH, y: 0, z: 0 }), label: 'X', dx: -4, dy: 13 },
      { end: this.projectIsometric({ x: 0, y: SPATIAL_AXIS_LENGTH, z: 0 }), label: 'Y', dx: 7, dy: 8 },
      { end: this.projectIsometric({ x: 0, y: 0, z: SPATIAL_Z_AXIS_UNITS }), label: 'Z', dx: 10, dy: 10 }
    ].forEach((axis) => {
      this.drawArrow(context, origin, axis.end, '#b4b8bf');
      this.drawText(context, axis.label, axis.end.x + axis.dx,
        axis.end.y + axis.dy, '#e3e5e8', 10, '600');
    });

    const vLabel = {
      x: origin.x + (xPoint.x - origin.x) * 0.78
        + (zPoint.x - origin.x) * 0.68,
      y: origin.y + (xPoint.y - origin.y) * 0.78
        + (zPoint.y - origin.y) * 0.68
    };
    const wLabel = {
      x: origin.x + (yPoint.x - origin.x) * 0.90
        + (zPoint.x - origin.x) * 0.72,
      y: origin.y + (yPoint.y - origin.y) * 0.90
        + (zPoint.y - origin.y) * 0.72
    };
    const hLabel = {
      x: origin.x + (xPoint.x - origin.x) * 0.88
        + (yPoint.x - origin.x) * 0.18,
      y: origin.y + (xPoint.y - origin.y) * 0.88
        + (yPoint.y - origin.y) * 0.18
    };
    this.drawLabel(context, 'V', vLabel.x, vLabel.y,
      WALL_STYLES.V.text, 'center', 9);
    this.drawLabel(context, 'W', wLabel.x, wLabel.y,
      WALL_STYLES.W.text, 'right', 9);
    this.drawLabel(context, 'H', hLabel.x, hLabel.y,
      WALL_STYLES.H.text, 'left', 9);
    this.drawText(context, '最大斜度线', 12, 22, '#d9dde4', 11, '600');
    context.restore();
  },

  drawSpatialPlane(context) {
    const geometry = this._geometry;
    const screens = geometry.patch.map(
      (point) => this.projectIsometric(point)
    );
    context.save();
    this.drawPolygon(
      context,
      screens,
      COLORS.planeFill,
      COLORS.planeStroke,
      1.8
    );
    geometry.traces.forEach((trace) => {
      const selected = trace.projectionPlane === geometry.projectionPlane;
      const start = this.projectIsometric(trace.start);
      const end = this.projectIsometric(trace.end);
      if (selected) {
        context.strokeStyle = 'rgba(103, 225, 229, 0.22)';
        context.lineWidth = 9;
        this.drawLine(context, start, end);
      }
      context.strokeStyle = selected ? '#9bf7f8' : '#56c9cc';
      context.lineWidth = PROJECTION_LINE_WIDTH;
      this.drawLine(context, start, end);
      const labelParameter = {
        P_H: 0.72,
        P_V: 0.34,
        P_W: 0.64
      }[trace.label] || 0.5;
      const labelOffset = {
        P_H: { x: 0, y: 11 },
        P_V: { x: -8, y: -8 },
        P_W: { x: 8, y: -8 }
      }[trace.label] || { x: 0, y: 0 };
      this.drawLabel(
        context,
        trace.label,
        start.x + (end.x - start.x) * labelParameter + labelOffset.x,
        start.y + (end.y - start.y) * labelParameter + labelOffset.y,
        selected ? '#c5ffff' : '#8be5e7',
        trace.label === 'P_V' ? 'right' : 'left',
        10
      );
    });
    context.restore();
  },

  drawSpatialLines(context, layout) {
    const geometry = this._geometry;
    const anchor = this.projectIsometric(geometry.anchor);
    const candidateEnd = this.projectIsometric(
      geometry.candidate.positiveEnd
    );
    const helperEnd = this.projectIsometric(geometry.helper.positiveEnd);
    const angleVertex = this.projectIsometric(geometry.angleVertex);
    const lineOtherPoint = this.projectIsometric(geometry.lineOtherPoint);
    const projectedLineOtherPoint = this.projectIsometric(
      geometry.projectedLineOtherPoint
    );
    const viewColor = VIEW_STYLES[geometry.viewType].color;

    context.save();
    context.beginPath();
    context.rect(0, 0, layout.leftWidth, layout.topHeight);
    context.clip();

    context.strokeStyle = '#7d838c';
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    this.drawLine(context, lineOtherPoint, projectedLineOtherPoint);
    context.setLineDash([]);

    context.strokeStyle = viewColor;
    context.lineWidth = 1.4;
    context.setLineDash([]);
    this.drawLine(context, angleVertex, projectedLineOtherPoint);

    // 深色空间区用白色衬底保证黑色实线可见；真正表达的线仍为黑色。
    context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    context.lineWidth = geometry.isMaximum ? 6.5 : 5.5;
    this.drawLine(
      context,
      this.projectIsometric(geometry.helper.start),
      this.projectIsometric(geometry.helper.end)
    );
    context.strokeStyle = COLORS.helper;
    context.lineWidth = geometry.isMaximum ? 2.8 : 2.2;
    context.setLineDash([]);
    this.drawLine(
      context,
      this.projectIsometric(geometry.helper.start),
      this.projectIsometric(geometry.helper.end)
    );
    context.setLineDash([]);

    if (geometry.isMaximum) {
      this.drawPlaneRightAngle(
        context,
        geometry,
        anchor,
        COLORS.maximum
      );
    }
    context.strokeStyle = geometry.isMaximum
      ? COLORS.maximum
      : COLORS.candidate;
    context.lineWidth = 1.5;
    context.setLineDash([]);
    this.drawLine(
      context,
      this.projectIsometric(geometry.candidate.start),
      this.projectIsometric(geometry.candidate.end)
    );

    this.drawAngleArc(
      context,
      angleVertex,
      lineOtherPoint,
      projectedLineOtherPoint,
      COLORS.angle,
      geometry.isMaximum ? 30 : 25
    );
    this.drawLabel(
      context,
      geometry.isMaximum
        ? `${geometry.projectionSymbol}max=${geometry.angleDegrees.toFixed(1)}°`
        : `${geometry.projectionSymbol}=${geometry.angleDegrees.toFixed(1)}°`,
      layout.leftWidth - 12,
      layout.topHeight * 0.68,
      '#ffffff',
      'right',
      10
    );
    this.drawLabel(
      context,
      geometry.isMaximum ? '已达最大值' : '拖动方向点',
      12,
      40,
      geometry.isMaximum ? COLORS.maximum : '#9aa3ae',
      'left',
      10
    );
    this.drawPoint(context, candidateEnd, geometry.isMaximum
      ? COLORS.maximum
      : COLORS.candidate, 5, '');
    this.drawLabel(context, 'Q', candidateEnd.x + 8,
      candidateEnd.y - 8,
      geometry.isMaximum ? COLORS.maximum : COLORS.candidate, 'left', 9);
    this.drawLabel(context, 'h', helperEnd.x + 7, helperEnd.y - 7,
      '#e2e8ef', 'left', 9);
    context.restore();
  },

  drawPlaneRightAngle(context, geometry, anchorScreen, color) {
    const step = 0.55;
    const helperCorner = this.projectIsometric({
      x: geometry.anchor.x + geometry.helperDirection.x * step,
      y: geometry.anchor.y + geometry.helperDirection.y * step,
      z: geometry.anchor.z + geometry.helperDirection.z * step
    });
    const farCorner = this.projectIsometric({
      x: geometry.anchor.x
        + (geometry.helperDirection.x + geometry.candidateDirection.x) * step,
      y: geometry.anchor.y
        + (geometry.helperDirection.y + geometry.candidateDirection.y) * step,
      z: geometry.anchor.z
        + (geometry.helperDirection.z + geometry.candidateDirection.z) * step
    });
    const candidateCorner = this.projectIsometric({
      x: geometry.anchor.x + geometry.candidateDirection.x * step,
      y: geometry.anchor.y + geometry.candidateDirection.y * step,
      z: geometry.anchor.z + geometry.candidateDirection.z * step
    });
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(helperCorner.x, helperCorner.y);
    context.lineTo(farCorner.x, farCorner.y);
    context.lineTo(candidateCorner.x, candidateCorner.y);
    context.stroke();
    context.restore();
  },

  drawProjectionPanel(context, layout) {
    const geometry = this._geometry;
    const metrics = this.getProjectionMetrics();
    const origin = metrics.origin;
    const left = layout.projectionLeft;
    const top = layout.projectionTop;
    const width = layout.projectionWidth;
    const height = layout.projectionHeight;

    context.save();
    context.beginPath();
    context.rect(left, top, width, height);
    context.clip();
    context.fillStyle = '#ffffff';
    context.fillRect(left, top, width, height);
    context.strokeStyle = '#777d85';
    context.lineWidth = 1;
    this.drawLine(context, { x: left + 10, y: origin.y },
      { x: left + width - 10, y: origin.y });
    this.drawLine(context, { x: origin.x, y: top + 34 },
      { x: origin.x, y: top + height - 18 });
    this.drawText(context, 'Z', origin.x + 5, top + 34,
      '#525861', 10, '600');
    this.drawText(context, 'X', left + 8, origin.y - 5,
      '#525861', 10, '600');
    this.drawText(context, 'Y', origin.x + 5, top + height - 10,
      '#525861', 10, '600');
    this.drawText(context, '三面投影',
      left + 12, top + 23, '#3b4654', 11, '600');

    const patchPointViews = geometry.patch.map((point) => (
      this.getProjectionScreenPoints(point)
    ));
    this.drawProjectionCorrespondence(
      context,
      this.getProjectionScreenPoints(geometry.anchor),
      geometry.anchor.y,
      origin,
      metrics.unit,
      '#d4d9df'
    );
    this.drawProjectionCorrespondence(
      context,
      this.getProjectionScreenPoints(geometry.candidate.positiveEnd),
      geometry.candidate.positiveEnd.y,
      origin,
      metrics.unit,
      '#dfe2e6'
    );

    ['front', 'top', 'left'].forEach((viewType) => {
      const style = VIEW_STYLES[viewType];
      const active = viewType === geometry.viewType;
      const patchView = patchPointViews.map((views) => views[viewType]);
      this.drawPolygon(
        context,
        patchView,
        active ? style.fill.replace('0.13', '0.24') : style.fill,
        active ? style.color : '#aeb8c3',
        active ? 2 : 1
      );

      const helperStart = this.getProjectionScreenPoints(
        geometry.helper.start
      )[viewType];
      const helperEnd = this.getProjectionScreenPoints(
        geometry.helper.positiveEnd
      )[viewType];
      const candidateStart = this.getProjectionScreenPoints(
        geometry.candidate.start
      )[viewType];
      const candidateEnd = this.getProjectionScreenPoints(
        geometry.candidate.positiveEnd
      )[viewType];
      const anchor = this.getProjectionScreenPoints(
        geometry.anchor
      )[viewType];

      context.strokeStyle = COLORS.helper;
      context.lineWidth = PROJECTION_LINE_WIDTH;
      context.setLineDash([]);
      this.drawLine(context, helperStart, helperEnd);

      if (active && geometry.isMaximum) {
        context.strokeStyle = COLORS.maximumGlow;
        context.lineWidth = 8;
        this.drawLine(context, candidateStart, candidateEnd);
      }
      context.strokeStyle = geometry.isMaximum
        ? COLORS.maximum
        : COLORS.candidate;
      context.lineWidth = PROJECTION_LINE_WIDTH;
      this.drawLine(context, candidateStart, candidateEnd);

      if (active) {
        if (geometry.isMaximum) {
          this.drawRightAngle(
            context,
            anchor,
            helperEnd,
            candidateEnd,
            COLORS.maximum,
            14
          );
        }
        this.drawAngleArc(
          context,
          anchor,
          candidateEnd,
          this.getProjectionScreenPoints(projectPoint(
            geometry.candidate.positiveEnd,
            geometry.projectionPlane
          ))[viewType],
          COLORS.angle,
          24
        );
        this.drawLabel(
          context,
          geometry.isMaximum
            ? `${geometry.projectionSymbol}max=${geometry.angleDegrees.toFixed(1)}°`
            : `${geometry.projectionSymbol}=${geometry.angleDegrees.toFixed(1)}°`,
          left + width - 16,
          top + height - 36,
          geometry.isMaximum ? COLORS.maximum : '#202124',
          'right',
          11
        );
        context.strokeStyle = geometry.isMaximum
          ? COLORS.maximum
          : COLORS.candidate;
        context.lineWidth = 1.6;
        context.setLineDash([]);
        context.beginPath();
        context.arc(candidateEnd.x, candidateEnd.y, 7, 0, Math.PI * 2);
        context.stroke();
        if (!geometry.isMaximum) {
          this.drawLabel(
            context,
            '拖动',
            candidateEnd.x + 10,
            candidateEnd.y + 11,
            COLORS.candidate,
            'left',
            9
          );
        }
      }
    });
    // 三个投影面名称固定在各自区域的角落，不随三角形尺寸和角度移动。
    this.drawLabel(context, 'V', left + 17, top + 52,
      VIEW_STYLES.front.color, 'left', 13);
    this.drawLabel(context, 'W', left + width - 17, top + 52,
      VIEW_STYLES.left.color, 'right', 13);
    this.drawLabel(context, 'H', left + 17, top + height - 25,
      VIEW_STYLES.top.color, 'left', 13);
    context.restore();
  },

  drawLabel(context, text, x, y, color, align, size) {
    context.save();
    context.fillStyle = color;
    context.font = `700 ${size || 10}px sans-serif`;
    context.textAlign = align || 'left';
    context.textBaseline = 'middle';
    context.fillText(text, x, y);
    context.restore();
  },

  drawAngleArc(context, corner, firstPoint, secondPoint, color, radius) {
    const firstLength = Math.hypot(
      firstPoint.x - corner.x,
      firstPoint.y - corner.y
    );
    const secondLength = Math.hypot(
      secondPoint.x - corner.x,
      secondPoint.y - corner.y
    );
    if (firstLength <= SCREEN_EPSILON || secondLength <= SCREEN_EPSILON) return;
    const firstAngle = Math.atan2(
      firstPoint.y - corner.y,
      firstPoint.x - corner.x
    );
    const secondAngle = Math.atan2(
      secondPoint.y - corner.y,
      secondPoint.x - corner.x
    );
    const delta = normalizeScreenAngle(secondAngle - firstAngle);
    if (Math.abs(delta) <= 0.03) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1.4;
    context.setLineDash([]);
    context.beginPath();
    context.arc(
      corner.x,
      corner.y,
      radius,
      firstAngle,
      firstAngle + delta,
      delta < 0
    );
    context.stroke();
    context.restore();
  },

  drawRightAngle(context, corner, firstPoint, secondPoint, color, size) {
    const firstLength = Math.hypot(
      firstPoint.x - corner.x,
      firstPoint.y - corner.y
    );
    const secondLength = Math.hypot(
      secondPoint.x - corner.x,
      secondPoint.y - corner.y
    );
    if (firstLength <= SCREEN_EPSILON
      || secondLength <= SCREEN_EPSILON) return;
    const firstUnit = {
      x: (firstPoint.x - corner.x) / firstLength,
      y: (firstPoint.y - corner.y) / firstLength
    };
    const secondUnit = {
      x: (secondPoint.x - corner.x) / secondLength,
      y: (secondPoint.y - corner.y) / secondLength
    };
    const markSize = size || 9;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1.3;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(
      corner.x + firstUnit.x * markSize,
      corner.y + firstUnit.y * markSize
    );
    context.lineTo(
      corner.x + firstUnit.x * markSize + secondUnit.x * markSize,
      corner.y + firstUnit.y * markSize + secondUnit.y * markSize
    );
    context.lineTo(
      corner.x + secondUnit.x * markSize,
      corner.y + secondUnit.y * markSize
    );
    context.stroke();
    context.restore();
  }
};
