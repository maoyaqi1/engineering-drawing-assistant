// 直角三角形法叠加层。
// 主画面先调用 pages/index/render-scene.js 的完整直线模式绘制，再在同一画布上
// 叠加所选投影面的空间直角三角形和三视图辅助三角形，不复制三视图绘制逻辑。
const baseRender = require('../index/render-scene.js');

const COLORS = {
  ink: '#26384d',
  blue: '#1769d2',
  purple: '#7a45d1',
  coordinate: '#e6a51f',
  trueLength: '#c62832'
};

// 绕 OZ 轴旋转三维观察方位，Z 保持竖直；X 接近水平，Y 斜向后退，
// 形成适合阅读 H 面直角三角形的斜二等轴测姿态。
const SPATIAL_YAW = -30 * Math.PI / 180;
// 旋转后图形整体偏向左侧，固定右移以保持视觉中心靠近 OZ。
const SPATIAL_CENTERING = 2.8;
// 斜轴测的横向投影比例与纵深压缩比例；只影响画面，不参与几何计算。
const SPATIAL_HORIZONTAL_SCALE = 0.78;
const SPATIAL_DEPTH_SCALE = 0.38;
// 投影面显示跨度略大于模型最大值 8，保证端点与边框之间留白。
const SPATIAL_PLANE_SPAN = 8.8;
const SPATIAL_AXIS_LENGTH = 9;
const SPATIAL_VERTICAL_PADDING = 2;
const SPATIAL_Z_AXIS_UNITS = SPATIAL_AXIS_LENGTH + 1;
const SPATIAL_H_BOTTOM_DEPTH_UNITS = 2 * SPATIAL_PLANE_SPAN
  * Math.cos(SPATIAL_YAW) * SPATIAL_DEPTH_SCALE;
const SPATIAL_VERTICAL_SPAN_UNITS = SPATIAL_Z_AXIS_UNITS
  + SPATIAL_H_BOTTOM_DEPTH_UNITS;
const SCREEN_EPSILON = 1e-6;
const SCREEN_ANGLE_EPSILON = 1e-5;
const DEFAULT_ANGLE_RADIUS = 24;
const HORIZONTAL_ANGLE_RADIUS = 30;

const PLANE_STYLES = {
  H: {
    stroke: '#55c985',
    text: '#6ed59a'
  },
  V: {
    stroke: '#f06b6b',
    text: '#ff9191'
  },
  W: {
    stroke: '#5b91ed',
    text: '#8db9ff'
  }
};

// 三个投影面统一复用首页直线模式的“前红、上绿、侧蓝”语义色。
function projectedPoint(point, plane) {
  // 仅生成投影面上的方法向点，不修改传入点；屏幕映射仍由 projectIsometric 统一完成。
  if (plane === 'H') return { x: point.x, y: point.y, z: 0 };
  if (plane === 'V') return { x: point.x, y: 0, z: point.z };
  return { x: 0, y: point.y, z: point.z };
}

function viewTypeOf(plane) {
  if (plane === 'H') return 'top';
  if (plane === 'V') return 'front';
  return 'left';
}

function angleSymbol(plane) {
  return plane === 'H' ? 'α' : (plane === 'V' ? 'β' : 'γ');
}

module.exports = {
  // 先绕竖直 OZ 轴旋转世界坐标，再使用固定比例的斜轴测映射。
  // 三点旋转得到的非对称 X/Y 方向构成斜二等轴测；附加居中量只影响画面，
  // 不改变任何模型坐标或长度、角度真值。
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

  // 与首页直线模式保持同一套深色 V/H/W 视觉，但三块投影面随 OZ 轴旋转，
  // 不再使用首页固定的对称等轴测墙面轮廓。
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

    // H 面：OX 与 OY 张成的底面。
    this.drawPolygon(context, [origin, xPoint, xyPoint, yPoint],
      'rgba(50, 184, 110, 0.24)', '#37b974', 1.1);
    // V 面：OX 与 OZ 张成的正立面。
    this.drawPolygon(context, [origin, xPoint, xzPoint, zPoint],
      'rgba(52, 132, 246, 0.24)', '#347ff0', 1.1);
    // W 面：OY 与 OZ 张成的侧立面。
    this.drawPolygon(context, [origin, yPoint, yzPoint, zPoint],
      'rgba(245, 196, 55, 0.22)', '#e5bb38', 1.1);

    const axes = [
      { end: this.projectIsometric({ x: SPATIAL_AXIS_LENGTH, y: 0, z: 0 }), label: 'X', dx: -4, dy: 13 },
      { end: this.projectIsometric({ x: 0, y: SPATIAL_AXIS_LENGTH, z: 0 }), label: 'Y', dx: 7, dy: 8 },
      { end: this.projectIsometric({ x: 0, y: 0, z: SPATIAL_Z_AXIS_UNITS }), label: 'Z', dx: 10, dy: 10 }
    ];
    axes.forEach((axis) => {
      this.drawArrow(context, origin, axis.end, '#b4b8bf');
      this.drawText(context, axis.label, axis.end.x + axis.dx, axis.end.y + axis.dy,
        '#e3e5e8', 10, '600');
    });

    // 面名贴近各自投影面的外围边角，避开 OZ、投射线与端点标签。
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
    this.drawSpatialLabel(context, 'V 面', vLabel.x, vLabel.y, '#78b7ff', 'center');
    this.drawSpatialLabel(context, 'W 面', wLabel.x, wLabel.y, '#f2d36c', 'right');
    this.drawSpatialLabel(context, 'H 面', hLabel.x, hLabel.y, '#6ed59a', 'left');
    this.drawText(context, '空间直线及投影', 12, 22, '#d9dde4', 11, '600');

    // A 点的三条投射线沿用首页语义；B 点及三面投影线由 render-scene 的
    // drawLineIsometricOverlay 继续绘制，避免本页复制直线绘制逻辑。
    const primaryPoint = this.getPrimaryPoint();
    const pointScreen = this.projectIsometric(primaryPoint);
    const groundPoint = this.projectIsometric({ ...primaryPoint, z: 0 });
    const frontPoint = this.projectIsometric({ x: primaryPoint.x, y: 0, z: primaryPoint.z });
    const sidePoint = this.projectIsometric({ x: 0, y: primaryPoint.y, z: primaryPoint.z });
    this.drawProjectionLine(context, pointScreen, groundPoint, '#7d838c');
    this.drawProjectionLine(context, pointScreen, frontPoint, '#7d838c');
    this.drawProjectionLine(context, pointScreen, sidePoint, '#7d838c');
    this.drawSpatialPoint(context, groundPoint, 'a', '#ff4f53', 5,
      { x: 8, y: 13 }, 'left');
    this.drawSpatialPoint(context, frontPoint, "a′", '#ff4f53', 5,
      { x: -8, y: -8 }, 'right');
    this.drawSpatialPoint(context, sidePoint, 'a″', '#ff4f53', 5,
      { x: 8, y: -8 }, 'left');
    this.drawPoint(context, pointScreen, '#ff4f53', 5, '');
    context.restore();
  },

  // 本页重绘直线空间叠加层，只为端点与三面投影标签指定互不重叠的偏移；
  // 线段颜色、投射关系和首页直线模式保持一致。
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
    context.strokeStyle = PLANE_STYLES.V.stroke;
    this.drawLine(context, aViews.front, bViews.front);
    context.strokeStyle = PLANE_STYLES.H.stroke;
    this.drawLine(context, aViews.top, bViews.top);
    context.strokeStyle = PLANE_STYLES.W.stroke;
    this.drawLine(context, aViews.left, bViews.left);
    this.drawProjectionLine(context, bSpace, bViews.front, '#737b86');
    this.drawProjectionLine(context, bSpace, bViews.top, '#737b86');
    this.drawProjectionLine(context, bSpace, bViews.left, '#737b86');

    // B 的三个投影分布在左中、下中、右侧，分别朝远离 AB 的方向偏移。
    this.drawSpatialPoint(context, bViews.front, "b′", PLANE_STYLES.W.stroke, 5,
      { x: -8, y: -8 }, 'right');
    this.drawSpatialPoint(context, bViews.top, 'b', PLANE_STYLES.W.stroke, 5,
      { x: -8, y: 14 }, 'right');
    this.drawSpatialPoint(context, bViews.left, 'b″', PLANE_STYLES.W.stroke, 5,
      { x: 8, y: 9 }, 'left');
    this.drawSpatialPoint(context, bSpace, 'B', PLANE_STYLES.W.stroke, 5,
      { x: -9, y: 10 }, 'right');
    this.drawSpatialPoint(context, aSpace, 'A', '#ff4f53', 5,
      { x: 8, y: -9 }, 'left');
    context.restore();
  },

  drawScene() {
    if (!this.context || !this.canvasWidth) return;
    this.syncLiveMetrics(this.data.selectedPlane);
    // 先复用首页完整场景，再叠加本页专用三角形；不复制三视图投影公式。
    baseRender.drawScene.call(this);
    const layout = this.getLayout();
    this.drawSpatialTriangle(this.context, layout);
    this.drawProjectionTriangle(this.context, layout);
    this.drawCoordinateDifferenceGuide(this.context, layout);
  },

  drawSpatialLabel(context, text, x, y, color, align) {
    // 空间标签保持无底板样式，与首页深色画布中的点标签一致。
    context.save();
    context.textAlign = ['left', 'center', 'right'].includes(align) ? align : 'left';
    context.textBaseline = 'middle';
    context.fillStyle = color;
    context.font = '700 11px sans-serif';
    context.fillText(text, x, y);
    context.restore();
  },

  // 绘制空间点并单独放置文字，避免 drawPoint 固定的右上标签在密集投影区重叠。
  drawSpatialPoint(context, point, label, color, radius, offset, align) {
    this.drawPoint(context, point, color, radius, '');
    this.drawSpatialLabel(context, label, point.x + offset.x, point.y + offset.y,
      color, align);
  },

  // 线段名称沿法向偏移，避免直接压在实长斜边或投影边上。
  drawSegmentLabel(context, start, end, text, color, offset, align) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < SCREEN_EPSILON) return;
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
    const normal = { x: -dy / length, y: dx / length };
    this.drawSpatialLabel(
      context,
      text,
      midpoint.x + normal.x * offset,
      midpoint.y + normal.y * offset,
      color,
      align
    );
  },

  // 空间图叠加：H 面构造 B-q-A，V/W 面构造 A-B₀-B；
  // 两套三角形都只读同一组 A/B 和 target，不建立第二套几何真值。
  drawSpatialTriangle(context, layout) {
    const metrics = this._metrics;
    const target = this._target;
    if (!metrics || !metrics.valid || !target) return;
    const a = this.data.line.a;
    const b = this.data.line.b;
    const aScreen = this.projectIsometric(a);
    const bScreen = this.projectIsometric(b);
    const isHorizontal = target.projection === 'H';

    context.save();
    if (isHorizontal) {
      this.drawHorizontalRightTriangle(context, a, b, aScreen, bScreen, layout);
      context.restore();
      return;
    }

    // V/W：把投影长度从 A 平移到 B 的法向位置，得到 A-B₀-B。
    const pa = projectedPoint(a, target.projection);
    const pb = projectedPoint(b, target.projection);
    const projectionVector = { x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z };
    const p = {
      x: a.x + projectionVector.x,
      y: a.y + projectionVector.y,
      z: a.z + projectionVector.z
    };
    const pScreen = this.projectIsometric(p);
    const selectedColor = PLANE_STYLES[target.projection].stroke;
    this.fillTriangle(context, [aScreen, pScreen, bScreen], 'rgba(198, 40, 50, 0.08)');
    context.strokeStyle = selectedColor;
    context.lineWidth = 3;
    context.setLineDash([]);
    this.drawLine(context, aScreen, pScreen);
    context.strokeStyle = COLORS.coordinate;
    context.lineWidth = 3;
    this.drawLine(context, pScreen, bScreen);
    context.strokeStyle = COLORS.trueLength;
    context.lineWidth = 4.5;
    this.drawLine(context, aScreen, bScreen);
    this.drawSpatialRightAngle(context, pScreen, aScreen, bScreen, COLORS.coordinate);
    this.drawScreenAngle(context, aScreen, pScreen, bScreen, COLORS.purple,
      angleSymbol(target.projection));
    this.drawMeasuredSegment(
      context,
      pScreen,
      bScreen,
      target.deltaLabel,
      COLORS.coordinate,
      18,
      aScreen
    );
    this.drawSpatialLabel(context, 'B₀', pScreen.x + 8, pScreen.y + 17,
      COLORS.coordinate, 'left');
    this.drawSegmentLabel(context, aScreen, bScreen, 'L', COLORS.trueLength, 14, 'center');
    context.restore();
  },

  // H 面参照 W 面构造明确画出 B-q-A 直角三角形：
  // B-q 为水平投影方向，q-A 为 Δz，B-A 为实长；α 在 B，直角在 q。
  drawHorizontalRightTriangle(context, a, b, aScreen, bScreen, layout) {
    // q 与 B 同高，与 A 同 x/y：
    // B-q 长度 = H 投影长；q-A 长度 = |Δz|；B-A 长度 = 实长。
    const q = { x: a.x, y: a.y, z: b.z };
    const qScreen = this.projectIsometric(q);
    if (Math.hypot(qScreen.x - bScreen.x, qScreen.y - bScreen.y) <= SCREEN_EPSILON) {
      // 铅垂线的 H 投影积聚为点，不存在普通直角三角形；只保留实长线。
      context.strokeStyle = COLORS.trueLength;
      context.lineWidth = 4.5;
      context.setLineDash([]);
      this.drawLine(context, bScreen, aScreen);
      return;
    }
    this.fillTriangle(context, [bScreen, qScreen, aScreen], 'rgba(198, 40, 50, 0.08)');

    context.strokeStyle = PLANE_STYLES.H.stroke;
    context.lineWidth = 3;
    context.setLineDash([]);
    this.drawLine(context, bScreen, qScreen);
    context.strokeStyle = COLORS.coordinate;
    context.lineWidth = 3;
    this.drawLine(context, qScreen, aScreen);
    context.strokeStyle = COLORS.trueLength;
    context.lineWidth = 4.5;
    this.drawLine(context, bScreen, aScreen);

    this.drawSpatialRightAngle(context, qScreen, bScreen, aScreen, COLORS.coordinate);
    const preferredLabel = {
      x: Math.min(layout.leftWidth - 24, bScreen.x + 24),
      y: Math.max(28, bScreen.y - 30)
    };
    this.drawScreenAngle(context, bScreen, aScreen, qScreen,
      COLORS.purple, 'α', preferredLabel, 16, HORIZONTAL_ANGLE_RADIUS);
    this.drawMeasuredSegment(
      context,
      qScreen,
      aScreen,
      'Δz',
      COLORS.coordinate,
      10,
      { x: qScreen.x - 100, y: qScreen.y }
    );
    this.drawSegmentLabel(context, aScreen, bScreen, 'L', COLORS.trueLength, -14, 'center');
  },

  // 下方三视图叠加：以当前投影线段为底边，在包围盒内选择较空的一侧
  // 构造坐标差边和实长斜边。候选点选择只影响排版，不影响几何长度。
  drawProjectionTriangle(context, layout) {
    const metrics = this._metrics;
    const target = this._target;
    if (!metrics || !metrics.valid || !target) return;
    const viewType = viewTypeOf(target.projection);
    const aScreen = this.getProjectionScreenPoints(this.data.line.a)[viewType];
    const bScreen = this.getProjectionScreenPoints(this.data.line.b)[viewType];
    const dx = bScreen.x - aScreen.x;
    const dy = bScreen.y - aScreen.y;
    const baseLengthPx = Math.hypot(dx, dy);
    if (baseLengthPx < SCREEN_EPSILON) return;

    const unit = this.getProjectionMetrics().unit;
    const heightPx = target.orthogonalLength * unit;
    if (heightPx < SCREEN_EPSILON) return;
    const normals = [
      { x: -dy / baseLengthPx, y: dx / baseLengthPx },
      { x: dy / baseLengthPx, y: -dx / baseLengthPx }
    ];
    const candidates = normals.map((normal) => ({
      normal,
      point: {
        x: bScreen.x + normal.x * heightPx,
        y: bScreen.y + normal.y * heightPx
      }
    }));
    const inProjection = (point) => point.x >= layout.projectionLeft + 8
      && point.x <= layout.projectionLeft + layout.projectionWidth - 8
      && point.y >= layout.projectionTop + 8
      && point.y <= layout.projectionTop + layout.projectionHeight - 8;
    // 投影作图区优先把坐标差边放在左侧，远离中间 OZ 轴和右侧 W 面投影。
    const available = candidates.filter((candidate) => inProjection(candidate.point));
    const chosen = (available.length ? available : candidates)
      .sort((first, second) => first.point.x - second.point.x)[0];
    const topScreen = chosen.point;
    const selectedColor = PLANE_STYLES[target.projection].stroke;

    context.save();
    context.beginPath();
    context.rect(layout.projectionLeft, layout.projectionTop, layout.projectionWidth, layout.projectionHeight);
    context.clip();
    context.strokeStyle = selectedColor;
    context.lineWidth = 2.6;
    context.setLineDash([]);
    this.drawLine(context, aScreen, bScreen);
    context.strokeStyle = COLORS.ink;
    context.lineWidth = 2;
    this.drawLine(context, bScreen, topScreen);
    this.drawSpatialRightAngle(context, bScreen, aScreen, topScreen, COLORS.ink);
    context.strokeStyle = COLORS.blue;
    context.lineWidth = 2.8;
    this.drawLine(context, aScreen, topScreen);
    this.drawLineLabel(context, `l${target.projection}`,
      (aScreen.x + bScreen.x) / 2 - 8, (aScreen.y + bScreen.y) / 2 + 18, selectedColor);
    this.drawLineLabel(context, target.deltaLabel,
      bScreen.x + 8, (bScreen.y + topScreen.y) / 2, COLORS.ink);
    this.drawLineLabel(context, 'L',
      (aScreen.x + topScreen.x) / 2 - 22, (aScreen.y + topScreen.y) / 2 - 7, COLORS.blue);
    this.drawScreenAngle(context, aScreen, bScreen, topScreen, COLORS.purple,
      angleSymbol(target.projection));
    context.restore();
  },

  drawSpatialRightAngle(context, corner, alongPoint, verticalPoint, color) {
    const len1 = Math.hypot(alongPoint.x - corner.x, alongPoint.y - corner.y);
    const len2 = Math.hypot(verticalPoint.x - corner.x, verticalPoint.y - corner.y);
    if (len1 < SCREEN_EPSILON || len2 < SCREEN_EPSILON) return;
    const u1 = { x: (alongPoint.x - corner.x) / len1, y: (alongPoint.y - corner.y) / len1 };
    const u2 = { x: (verticalPoint.x - corner.x) / len2, y: (verticalPoint.y - corner.y) / len2 };
    const size = 9;
    context.save();
    context.strokeStyle = color || COLORS.ink;
    context.lineWidth = 1;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(corner.x + u1.x * size, corner.y + u1.y * size);
    context.lineTo(corner.x + u1.x * size + u2.x * size, corner.y + u1.y * size + u2.y * size);
    context.lineTo(corner.x + u2.x * size, corner.y + u2.y * size);
    context.stroke();
    context.restore();
  },

  // 屏幕角度弧只表达空间构造的教学关系，其屏幕张角会受投影压缩，
  // 不能作为 α/β/γ 的数值来源；角度真值始终来自 triangle-metrics.js。
  drawScreenAngle(context, origin, basePoint, topPoint, color, symbol, labelPoint, labelSize, arcRadius) {
    const start = Math.atan2(basePoint.y - origin.y, basePoint.x - origin.x);
    const end = Math.atan2(topPoint.y - origin.y, topPoint.x - origin.x);
    let delta = end - start;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < SCREEN_ANGLE_EPSILON) return;
    const radius = arcRadius || DEFAULT_ANGLE_RADIUS;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1.4;
    context.setLineDash([]);
    context.beginPath();
    context.arc(origin.x, origin.y, radius, start, start + delta, delta < 0);
    context.stroke();
    context.restore();
    const middle = start + delta / 2;
    const labelX = labelPoint
      ? labelPoint.x
      : origin.x + Math.cos(middle) * (radius + 14) - 5;
    const labelY = labelPoint
      ? labelPoint.y
      : origin.y + Math.sin(middle) * (radius + 10);
    if (labelSize) {
      this.drawText(context, symbol, labelX, labelY, color, labelSize, '800');
    } else {
      this.drawLineLabel(context, symbol, labelX, labelY, color);
    }
  },

  // 在“坐标差实际所在的投影视图”标出量取位置：
  //   Δz 在 V 视图竖向量取；
  //   Δy 在 H 视图竖向量取；
  //   Δx 在 V 视图横向量取。
  drawCoordinateDifferenceGuide(context, layout) {
    const target = this._target;
    if (!target) return;
    const axis = target.deltaAxis;
    const viewType = axis === 'y' ? 'top' : 'front';
    const a = this.getProjectionScreenPoints(this.data.line.a)[viewType];
    const b = this.getProjectionScreenPoints(this.data.line.b)[viewType];
    const left = layout.projectionLeft;
    const top = layout.projectionTop;
    const right = left + layout.projectionWidth;
    const bottom = top + layout.projectionHeight;
    context.save();
    context.beginPath();
    context.rect(left, top, layout.projectionWidth, layout.projectionHeight);
    context.clip();
    context.strokeStyle = COLORS.ink;
    context.lineWidth = 1;
    context.setLineDash([]);

    if (axis === 'z' || axis === 'y') {
      const dimX = Math.max(left + 58, Math.min(a.x, b.x) - 34);
      this.drawLine(context, a, { x: dimX, y: a.y });
      this.drawLine(context, b, { x: dimX, y: b.y });
      this.drawLine(context, { x: dimX, y: a.y }, { x: dimX, y: b.y });
      this.drawLine(context, { x: dimX - 4, y: a.y }, { x: dimX + 4, y: a.y });
      this.drawLine(context, { x: dimX - 4, y: b.y }, { x: dimX + 4, y: b.y });
      this.drawLineLabel(context, target.deltaLabel,
        Math.max(left + 8, dimX - 88), (a.y + b.y) / 2, COLORS.ink);
    } else {
      const dimY = Math.min(bottom - 42, Math.max(a.y, b.y) + 28);
      this.drawLine(context, a, { x: a.x, y: dimY });
      this.drawLine(context, b, { x: b.x, y: dimY });
      this.drawLine(context, { x: a.x, y: dimY }, { x: b.x, y: dimY });
      this.drawLine(context, { x: a.x, y: dimY - 4 }, { x: a.x, y: dimY + 4 });
      this.drawLine(context, { x: b.x, y: dimY - 4 }, { x: b.x, y: dimY + 4 });
      this.drawLineLabel(context, target.deltaLabel,
        (a.x + b.x) / 2 - 28, dimY + 14, COLORS.ink);
    }
    context.restore();
  },

  // 在空间图中画尺寸线。尺寸线沿 start-end 平行偏移，extensionOffset 表示
  // 偏离原线段的像素距离；awayFrom 用来把尺寸线放在三角形外侧，避免穿过作图边。
  // 标签直接绘制在画布上，不加白色底板，以保持首页深色画布的标签风格。
  drawMeasuredSegment(context, start, end, label, color, extensionOffset, awayFrom) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < SCREEN_EPSILON) return;

    const tangent = { x: dx / length, y: dy / length };
    let normal = { x: -tangent.y, y: tangent.x };
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
    if (awayFrom) {
      const away = {
        x: midpoint.x - awayFrom.x,
        y: midpoint.y - awayFrom.y
      };
      if (normal.x * away.x + normal.y * away.y < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
    }

    const offset = Number.isFinite(extensionOffset) ? extensionOffset : 12;
    const dimensionStart = {
      x: start.x + normal.x * offset,
      y: start.y + normal.y * offset
    };
    const dimensionEnd = {
      x: end.x + normal.x * offset,
      y: end.y + normal.y * offset
    };
    const dimensionMidpoint = {
      x: (dimensionStart.x + dimensionEnd.x) / 2,
      y: (dimensionStart.y + dimensionEnd.y) / 2
    };

    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1.2;
    context.setLineDash([]);
    this.drawLine(context, start, dimensionStart);
    this.drawLine(context, end, dimensionEnd);
    this.drawLine(context, dimensionStart, dimensionEnd);

    // 两端短刻度垂直于尺寸线，保持与工程制图尺寸界线一致的读图习惯。
    const tick = 4;
    this.drawLine(
      context,
      { x: dimensionStart.x - normal.x * tick, y: dimensionStart.y - normal.y * tick },
      { x: dimensionStart.x + normal.x * tick, y: dimensionStart.y + normal.y * tick }
    );
    this.drawLine(
      context,
      { x: dimensionEnd.x - normal.x * tick, y: dimensionEnd.y - normal.y * tick },
      { x: dimensionEnd.x + normal.x * tick, y: dimensionEnd.y + normal.y * tick }
    );
    context.restore();

    // 竖向尺寸的文字保持水平，符合教材插图；横向尺寸居中放在尺寸线一侧。
    const isVertical = Math.abs(tangent.x) < Math.abs(tangent.y);
    const labelX = isVertical
      ? dimensionMidpoint.x + normal.x * 6
      : dimensionMidpoint.x;
    const labelY = isVertical
      ? dimensionMidpoint.y
      : dimensionMidpoint.y + (normal.y < 0 ? -6 : 12);
    context.save();
    context.fillStyle = color;
    context.font = '700 10px sans-serif';
    context.textAlign = isVertical ? (normal.x < 0 ? 'right' : 'left') : 'center';
    context.textBaseline = 'middle';
    context.fillText(label, labelX, labelY);
    context.restore();
  },

  drawLineLabel(context, text, x, y, color) {
    // 叠加层的小标签统一使用这一字号，避免各构造线自行散落字体配置。
    this.drawText(context, text, x, y, color, 10, '700');
  },
};
