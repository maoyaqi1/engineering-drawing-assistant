// 直角投影定理 · Canvas 2D 绘制层。
//
// 空间区沿用首页直线页的深色 V/H/W 画风；下方同时绘制三个投影面，
// 用同一组 A/B/C/D/P 点说明空间直角与投影后的直角关系。

const {
  projectPoint
} = require('./right-angle-model.js');

const COLORS = {
  lineL: '#a8adb5',
  lineLGlow: 'rgba(116, 229, 157, 0.20)',
  lineM: '#ffb347',
  lineMGlow: 'rgba(255, 179, 71, 0.20)',
  spatialRightAngle: '#ffd166',
  mutedSpatial: '#7e858e',
  mutedProjection: '#969ca5'
};

// 与首页直线模式一致：正投影红、水平投影绿、侧面投影蓝。
const VIEW_COLORS = {
  front: '#df5757',
  top: '#43a66c',
  left: '#3779d0'
};
const VIEW_GLOW_COLORS = {
  front: 'rgba(223, 87, 87, 0.16)',
  top: 'rgba(67, 166, 108, 0.16)',
  left: 'rgba(55, 121, 208, 0.16)'
};

const PROJECTION_VIEWS = [
  { plane: 'V', viewType: 'front', suffix: '′' },
  { plane: 'H', viewType: 'top', suffix: '' },
  { plane: 'W', viewType: 'left', suffix: '″' }
];

const PLANE_STYLES = {
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
function screenLineIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDirection = {
    x: firstEnd.x - firstStart.x,
    y: firstEnd.y - firstStart.y
  };
  const secondDirection = {
    x: secondEnd.x - secondStart.x,
    y: secondEnd.y - secondStart.y
  };
  const denominator = firstDirection.x * secondDirection.y
    - firstDirection.y * secondDirection.x;
  if (Math.abs(denominator) <= SCREEN_EPSILON) return null;
  const offset = {
    x: secondStart.x - firstStart.x,
    y: secondStart.y - firstStart.y
  };
  const firstParameter = (offset.x * secondDirection.y
    - offset.y * secondDirection.x) / denominator;
  return {
    x: firstStart.x + firstDirection.x * firstParameter,
    y: firstStart.y + firstDirection.y * firstParameter
  };
}

module.exports = {
  // 与直角三角形页使用同一观察方位，但所有几何均来自 right-angle-model。
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
    this.drawSpatialRelation(this.context, layout);
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
    const selectedPlane = this._geometry.parallelPlane;
    const styleOf = (plane) => {
      const style = PLANE_STYLES[plane];
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
      this.drawText(context, axis.label, axis.end.x + axis.dx, axis.end.y + axis.dy,
        '#e3e5e8', 10, '600');
    });

    // 面名贴近外围边角，避免与直角边、投影点和角度符号重叠。
    const vLabel = {
      x: origin.x + (xPoint.x - origin.x) * 0.78 + (zPoint.x - origin.x) * 0.68,
      y: origin.y + (xPoint.y - origin.y) * 0.78 + (zPoint.y - origin.y) * 0.68
    };
    const wLabel = {
      x: origin.x + (yPoint.x - origin.x) * 0.90 + (zPoint.x - origin.x) * 0.72,
      y: origin.y + (yPoint.y - origin.y) * 0.90 + (zPoint.y - origin.y) * 0.72
    };
    const hLabel = {
      x: origin.x + (xPoint.x - origin.x) * 0.88 + (yPoint.x - origin.x) * 0.18,
      y: origin.y + (xPoint.y - origin.y) * 0.88 + (yPoint.y - origin.y) * 0.18
    };
    this.drawLabel(context, 'V 面', vLabel.x, vLabel.y, PLANE_STYLES.V.text, 'center', 9);
    this.drawLabel(context, 'W 面', wLabel.x, wLabel.y, PLANE_STYLES.W.text, 'right', 9);
    this.drawLabel(context, 'H 面', hLabel.x, hLabel.y, PLANE_STYLES.H.text, 'left', 9);
    this.drawText(
      context,
      this._geometry.validationPassed
        ? '空间垂直 → 投影出现直角'
        : '空间尚未垂直',
      12,
      22,
      this._geometry.validationPassed ? '#ffd166' : '#9aa0a8',
      11,
      '600'
    );
    context.restore();
  },

  drawSpatialRelation(context, layout) {
    const geometry = this._geometry;
    const mColor = geometry.validationPassed ? COLORS.lineM : COLORS.mutedSpatial;
    const { a, b, c, d, p } = geometry.points;
    const aScreen = this.projectIsometric(a);
    const bScreen = this.projectIsometric(b);
    const cScreen = this.projectIsometric(c);
    const dScreen = this.projectIsometric(d);
    const pScreen = p ? this.projectIsometric(p) : null;

    context.save();
    context.beginPath();
    context.rect(0, 0, layout.leftWidth, layout.topHeight);
    context.clip();

    PROJECTION_VIEWS.forEach((viewDefinition) => {
      const active = viewDefinition.plane === geometry.parallelPlane;
      const projectedScreens = {};
      ['a', 'b', 'c', 'd'].forEach((key) => {
        projectedScreens[key] = this.projectIsometric(
          projectPoint(geometry.points[key], viewDefinition.plane)
        );
      });
      if (p) {
        projectedScreens.p = this.projectIsometric(projectPoint(p, viewDefinition.plane));
      }
      if (active) {
        ['a', 'b', 'c', 'd'].forEach((key) => {
          const spatialScreen = {
            a: aScreen,
            b: bScreen,
            c: cScreen,
            d: dScreen
          }[key];
          this.drawProjectionLine(
            context,
            spatialScreen,
            projectedScreens[key],
            '#77828f'
          );
        });
        if (p) this.drawProjectionLine(context, pScreen, projectedScreens.p, '#77828f');
      }
      this.drawProjectionOnPlane(
        context,
        viewDefinition,
        projectedScreens,
        active
      );
    });

    context.strokeStyle = COLORS.lineL;
    if (geometry.validationPassed) {
      context.strokeStyle = COLORS.lineLGlow;
      context.lineWidth = 10;
      this.drawLine(context, aScreen, bScreen);
    }
    context.strokeStyle = COLORS.lineL;
    context.lineWidth = 2;
    context.setLineDash([]);
    this.drawLine(context, aScreen, bScreen);
    if (geometry.validationPassed) {
      context.strokeStyle = COLORS.lineMGlow;
      context.lineWidth = 10;
      this.drawLine(context, cScreen, dScreen);
    }
    context.strokeStyle = mColor;
    context.lineWidth = 3.6;
    context.setLineDash([]);
    this.drawLine(context, cScreen, dScreen);
    if (geometry.validationPassed && pScreen) {
      this.drawRightAngle(context, pScreen, aScreen, cScreen,
        COLORS.spatialRightAngle, 10);
      this.drawLabel(context, '90°', pScreen.x + 15, pScreen.y - 15,
        COLORS.spatialRightAngle, 'left', 10);
    }

    context.restore();

    this.drawPoint(context, aScreen, COLORS.lineL, 4.5, '');
    this.drawPoint(context, bScreen, COLORS.lineL, 4.5, '');
    this.drawLabel(context, 'A', aScreen.x - 8, aScreen.y - 8,
      COLORS.lineL, 'right', 10);
    this.drawLabel(context, 'B', bScreen.x + 8, bScreen.y - 8,
      COLORS.lineL, 'left', 10);
    if (pScreen) {
      this.drawPoint(context, pScreen, '#dfe7f2', 4.5, '');
      this.drawLabel(context, 'P', pScreen.x + 8, pScreen.y + 8,
        '#dfe7f2', 'left', 10);
    }
    this.drawPoint(context, cScreen, mColor, 4.5, '');
    this.drawPoint(context, dScreen, mColor, 4.5, '');
    this.drawLabel(context, 'C', cScreen.x + 8, cScreen.y - 8,
      mColor, 'left', 10);
    this.drawLabel(context, 'D', dScreen.x - 8, dScreen.y + 10,
      mColor, 'right', 10);
  },

  // 三维图中三个投影面都绘制两条线的投影；当前平行面保留投影点标签。
  drawProjectionOnPlane(context, viewDefinition, projectedScreens, active) {
    const color = VIEW_COLORS[viewDefinition.viewType];
    const theoremActive = this._geometry.validationPassed;
    const mColor = theoremActive ? color : COLORS.mutedProjection;
    context.save();
    context.setLineDash([]);
    context.strokeStyle = COLORS.lineL;
    context.lineWidth = active ? 1.3 : 1;
    this.drawLine(context, projectedScreens.a, projectedScreens.b);
    if (active && theoremActive) {
      context.strokeStyle = VIEW_GLOW_COLORS[viewDefinition.viewType];
      context.lineWidth = 8;
      this.drawLine(context, projectedScreens.c, projectedScreens.d);
    }
    context.strokeStyle = mColor;
    context.lineWidth = active && theoremActive ? 3 : 1.8;
    this.drawLine(context, projectedScreens.c, projectedScreens.d);

    const markerRadius = active ? 4 : 2.8;
    this.drawPoint(context, projectedScreens.a, COLORS.lineL, markerRadius, '');
    this.drawPoint(context, projectedScreens.b, COLORS.lineL, markerRadius, '');
    this.drawPoint(context, projectedScreens.c, mColor, markerRadius, '');
    this.drawPoint(context, projectedScreens.d, mColor, markerRadius, '');
    if (projectedScreens.p) {
      this.drawPoint(context, projectedScreens.p, '#dfe7f2', markerRadius, '');
    }
    if (active) {
      this.drawLabel(context, `a${viewDefinition.suffix}`,
        projectedScreens.a.x - 7, projectedScreens.a.y + 10,
        COLORS.lineL, 'right', 9);
      this.drawLabel(context, `b${viewDefinition.suffix}`,
        projectedScreens.b.x + 7, projectedScreens.b.y + 10,
        COLORS.lineL, 'left', 9);
      this.drawLabel(context, `c${viewDefinition.suffix}`,
        projectedScreens.c.x + 7, projectedScreens.c.y - 7,
        mColor, 'left', 9);
      this.drawLabel(context, `d${viewDefinition.suffix}`,
        projectedScreens.d.x - 7, projectedScreens.d.y + 10,
        mColor, 'right', 9);
      if (projectedScreens.p) {
        this.drawLabel(context, `p${viewDefinition.suffix}`,
          projectedScreens.p.x + 7, projectedScreens.p.y - 7,
          '#dfe7f2', 'left', 9);
      }
    }
    if (active && theoremActive) {
      const intersection = screenLineIntersection(
        projectedScreens.a,
        projectedScreens.b,
        projectedScreens.c,
        projectedScreens.d
      );
      if (intersection) {
        this.drawRightAngle(context, intersection, projectedScreens.a,
          projectedScreens.c, color, 9);
        this.drawLabel(context, '90°', intersection.x + 16,
          intersection.y - 16, color, 'left', 11);
      }
    }
    context.restore();
  },

  drawProjectionPanel(context, layout) {
    const geometry = this._geometry;
    const origin = this.getProjectionMetrics().origin;
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
    this.drawText(context, 'Z', origin.x + 5, top + 34, '#525861', 10, '600');
    this.drawText(context, 'X', left + 8, origin.y - 5, '#525861', 10, '600');
    this.drawText(context, 'Y', origin.x + 5, top + height - 10, '#525861', 10, '600');
    this.drawText(context, '三面投影 · 拖动 C / D 点', left + 12, top + 23,
      '#3b4654', 11, '600');

    const theoremActive = geometry.validationPassed;
    const pointViews = {};
    ['a', 'b', 'c', 'd'].forEach((key) => {
      pointViews[key] = this.getProjectionScreenPoints(geometry.points[key]);
      this.drawProjectionCorrespondence(
        context,
        pointViews[key],
        geometry.points[key].y,
        origin,
        this.getProjectionMetrics().unit,
        '#c4cad1'
      );
    });
    if (geometry.points.p) {
      pointViews.p = this.getProjectionScreenPoints(geometry.points.p);
      this.drawProjectionCorrespondence(
        context,
        pointViews.p,
        geometry.points.p.y,
        origin,
        this.getProjectionMetrics().unit,
        '#c4cad1'
      );
    }

    const viewDefinitions = [
      { type: 'front', suffix: '′', label: '正投影 V' },
      { type: 'top', suffix: '', label: '水平投影 H' },
      { type: 'left', suffix: '″', label: '侧面投影 W' }
    ];
    viewDefinitions.forEach((viewDefinition) => {
      const active = viewDefinition.type === geometry.viewType;
      const viewColor = VIEW_COLORS[viewDefinition.type];
      const mColor = theoremActive ? viewColor : COLORS.mutedProjection;
      const views = {};
      ['a', 'b', 'c', 'd'].forEach((key) => {
        views[key] = pointViews[key][viewDefinition.type];
      });
      views.p = pointViews.p ? pointViews.p[viewDefinition.type] : null;
      context.lineWidth = active ? 1.3 : 1;
      context.setLineDash([]);
      context.strokeStyle = COLORS.lineL;
      this.drawLine(context, views.a, views.b);
      if (active && theoremActive) {
        context.strokeStyle = VIEW_GLOW_COLORS[viewDefinition.type];
        context.lineWidth = 8;
        context.setLineDash([]);
        this.drawLine(context, views.c, views.d);
      }
      context.strokeStyle = mColor;
      context.lineWidth = active && theoremActive ? 3 : 1.8;
      context.setLineDash([]);
      this.drawLine(context, views.c, views.d);

      this.drawLabel(context, `a${viewDefinition.suffix}`,
        views.a.x - 7, views.a.y - 7, COLORS.lineL, 'right', 9);
      this.drawLabel(context, `b${viewDefinition.suffix}`,
        views.b.x + 7, views.b.y - 7, COLORS.lineL, 'left', 9);
      this.drawLabel(context, `c${viewDefinition.suffix}`,
        views.c.x + 7, views.c.y + 8, mColor, 'left', 9);
      this.drawLabel(context, `d${viewDefinition.suffix}`,
        views.d.x - 7, views.d.y + 8, mColor, 'right', 9);
      if (views.p) {
        this.drawLabel(context, `p${viewDefinition.suffix}`,
          views.p.x + 7, views.p.y - 7, '#526374', 'left', 9);
      }

      ['c', 'd'].forEach((endpointKey) => {
        const isActiveHandle = this._draggingView === viewDefinition.type
          && this._draggingEndpoint === endpointKey;
        context.strokeStyle = isActiveHandle
          ? '#ffffff'
          : mColor;
        context.lineWidth = isActiveHandle ? 2.2 : 1.2;
        context.setLineDash([]);
        context.beginPath();
        context.arc(views[endpointKey].x, views[endpointKey].y,
          active ? 6 : 5, 0, Math.PI * 2);
        context.stroke();
      });

      if (active) {
        const projectedIntersection = screenLineIntersection(
          views.a, views.b, views.c, views.d
        );
        if (projectedIntersection && theoremActive) {
          this.drawRightAngle(context, projectedIntersection, views.a, views.c,
            viewColor, 11);
          this.drawLabel(context, '90°', projectedIntersection.x + 18,
            projectedIntersection.y - 20, viewColor, 'left', 12);
        }
      }
      const center = {
        x: (views.a.x + views.b.x + views.c.x + views.d.x) / 4,
        y: Math.min(views.a.y, views.b.y, views.c.y, views.d.y,
          views.p ? views.p.y : Infinity) - 16
      };
      this.drawLabel(context, viewDefinition.label, center.x, center.y,
        active ? '#1f64b3' : '#7b8794', 'center', 10);
    });
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

  drawRightAngle(context, corner, firstPoint, secondPoint, color, size) {
    const firstLength = Math.hypot(firstPoint.x - corner.x, firstPoint.y - corner.y);
    const secondLength = Math.hypot(secondPoint.x - corner.x, secondPoint.y - corner.y);
    if (firstLength <= SCREEN_EPSILON || secondLength <= SCREEN_EPSILON) return;
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
    context.moveTo(corner.x + firstUnit.x * markSize, corner.y + firstUnit.y * markSize);
    context.lineTo(
      corner.x + firstUnit.x * markSize + secondUnit.x * markSize,
      corner.y + firstUnit.y * markSize + secondUnit.y * markSize
    );
    context.lineTo(corner.x + secondUnit.x * markSize, corner.y + secondUnit.y * markSize);
    context.stroke();
    context.restore();
  }
};
