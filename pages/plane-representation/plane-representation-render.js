// 平面的表示方法 · Canvas 2D 渲染。
//
// 单画布上下分区：上方显示空间关系，下方显示第一角三面投影。
// 所有几何数据来自 plane-representation-model.js，渲染层不反推模型状态。

const model = require('./plane-representation-model.js');

const COLORS = Object.freeze({
  spatialBackground: '#10233d',
  spatialGrid: 'rgba(177, 205, 232, 0.18)',
  spatialAxis: '#aebfd0',
  spatialText: '#edf5fc',
  spatialMuted: '#9eb3c8',
  planeFill: 'rgba(46, 190, 198, 0.18)',
  planeStroke: '#62d8dd',
  planeProjectionFill: 'rgba(78, 175, 193, 0.08)',
  planeProjectionStroke: 'rgba(36, 123, 153, 0.46)',
  pointA: '#e53935',
  pointB: '#1769c2',
  pointC: '#c98a00',
  pointK: '#d9363e',
  pointS: '#20b26b',
  pointTrace: '#e0a300',
  lineFirst: '#dc8b12',
  lineSecond: '#1769c2',
  figureFill: 'rgba(98, 217, 137, 0.22)',
  figureStroke: '#79df9d',
  projectionText: '#33485f',
  projectionMuted: '#75879b',
  projectionAxis: '#657587',
  viewVFill: 'rgba(236, 104, 104, 0.045)',
  viewHFill: 'rgba(77, 172, 112, 0.05)',
  viewWFill: 'rgba(70, 132, 219, 0.045)',
  spatialVFill: 'rgba(48, 111, 214, 0.22)',
  spatialVStroke: '#5b91ed',
  spatialHFill: 'rgba(36, 132, 88, 0.22)',
  spatialHStroke: '#4fd08c',
  spatialWFill: 'rgba(191, 139, 48, 0.20)',
  spatialWStroke: '#e7b85a',
  projectionLink: '#93a6b8',
  traceH: '#34b979',
  traceV: '#e05a5a',
  traceW: '#397dd3'
});

const VIEW_DEFINITIONS = Object.freeze({
  front: Object.freeze({
    key: 'front',
    label: 'V',
    title: '正面投影',
    color: '#d95656',
    fill: COLORS.viewVFill
  }),
  top: Object.freeze({
    key: 'top',
    label: 'H',
    title: '水平投影',
    color: '#39a76b',
    fill: COLORS.viewHFill
  }),
  left: Object.freeze({
    key: 'left',
    label: 'W',
    title: '侧面投影',
    color: '#397dd3',
    fill: COLORS.viewWFill
  })
});

const TRACE_COLORS = Object.freeze({
  H: COLORS.traceH,
  V: COLORS.traceV,
  W: COLORS.traceW
});

const SPATIAL_FRAME_SPAN = 9.2;

const SPATIAL_PROJECTION_PLANES = Object.freeze([
  Object.freeze({
    key: 'V',
    fill: COLORS.spatialVFill,
    stroke: COLORS.spatialVStroke,
    points: Object.freeze([
      Object.freeze({ x: 0, y: 0, z: 0 }),
      Object.freeze({ x: SPATIAL_FRAME_SPAN, y: 0, z: 0 }),
      Object.freeze({ x: SPATIAL_FRAME_SPAN, y: 0, z: SPATIAL_FRAME_SPAN }),
      Object.freeze({ x: 0, y: 0, z: SPATIAL_FRAME_SPAN })
    ]),
    labelPoint: Object.freeze({ x: SPATIAL_FRAME_SPAN, y: 0, z: SPATIAL_FRAME_SPAN }),
    labelAlign: 'left'
  }),
  Object.freeze({
    key: 'H',
    fill: COLORS.spatialHFill,
    stroke: COLORS.spatialHStroke,
    points: Object.freeze([
      Object.freeze({ x: 0, y: 0, z: 0 }),
      Object.freeze({ x: SPATIAL_FRAME_SPAN, y: 0, z: 0 }),
      Object.freeze({ x: SPATIAL_FRAME_SPAN, y: SPATIAL_FRAME_SPAN, z: 0 }),
      Object.freeze({ x: 0, y: SPATIAL_FRAME_SPAN, z: 0 })
    ]),
    labelPoint: Object.freeze({ x: SPATIAL_FRAME_SPAN, y: SPATIAL_FRAME_SPAN, z: 0 }),
    labelAlign: 'right'
  }),
  Object.freeze({
    key: 'W',
    fill: COLORS.spatialWFill,
    stroke: COLORS.spatialWStroke,
    points: Object.freeze([
      Object.freeze({ x: 0, y: 0, z: 0 }),
      Object.freeze({ x: 0, y: SPATIAL_FRAME_SPAN, z: 0 }),
      Object.freeze({ x: 0, y: SPATIAL_FRAME_SPAN, z: SPATIAL_FRAME_SPAN }),
      Object.freeze({ x: 0, y: 0, z: SPATIAL_FRAME_SPAN })
    ]),
    labelPoint: Object.freeze({ x: 0, y: SPATIAL_FRAME_SPAN, z: SPATIAL_FRAME_SPAN }),
    labelAlign: 'right'
  })
]);

function getPointColor(key) {
  if (key === 'B') return COLORS.pointB;
  if (key === 'C') return COLORS.pointC;
  if (key === 'K') return COLORS.pointK;
  if (key === 'S') return COLORS.pointS;
  if (key === 'X' || key === 'Y' || key === 'Z') return COLORS.pointTrace;
  return COLORS.pointA;
}

function getLineColor(line, index) {
  if (line.projectionPlane) return TRACE_COLORS[line.projectionPlane];
  return index === 0 ? COLORS.lineFirst : COLORS.lineSecond;
}

function getProjectionLabel(key, viewType) {
  const lower = String(key || '').toLowerCase();
  if (viewType === 'front') return `${lower}′`;
  if (viewType === 'left') return `${lower}″`;
  return lower;
}

module.exports = {
  // 竖屏上下分区；宽屏自动改为左右分区。没有固定 Canvas 高度，尺寸完全取自
  // flex 布局后的真实像素，保证手机页面不出现纵向滚动。
  getLayout() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    if (width >= height * 1.25) {
      const leftWidth = Math.round(width * 0.5);
      return {
        split: true,
        width,
        height,
        leftWidth,
        rightWidth: width - leftWidth,
        topHeight: height,
        bottomHeight: height,
        projectionLeft: leftWidth,
        projectionTop: 0,
        projectionWidth: width - leftWidth,
        projectionHeight: height
      };
    }
    const topHeight = Math.round(height * 0.44);
    return {
      split: false,
      width,
      height,
      leftWidth: width,
      rightWidth: width,
      topHeight,
      bottomHeight: height - topHeight,
      projectionLeft: 0,
      projectionTop: topHeight,
      projectionWidth: width,
      projectionHeight: height - topHeight
    };
  },

  getProjectionMetrics() {
    const layout = this.getLayout();
    const unit = Math.min(
      layout.projectionWidth / 19,
      layout.projectionHeight / 20
    );
    return {
      origin: {
        x: layout.projectionLeft + layout.projectionWidth * 0.5,
        y: layout.projectionTop + layout.projectionHeight * 0.53
      },
      unit
    };
  },

  drawScene() {
    if (!this.context || !this.canvasWidth || !this.canvasHeight) return;
    const context = this.context;
    const layout = this.getLayout();
    context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    context.fillStyle = COLORS.spatialBackground;
    context.fillRect(0, 0, layout.leftWidth, layout.topHeight);
    context.fillStyle = '#ffffff';
    context.fillRect(
      layout.projectionLeft,
      layout.projectionTop,
      layout.projectionWidth,
      layout.projectionHeight
    );

    const definition = model.getModeDefinition(this.data.selectedMode);
    this.drawSpatialPanel(context, layout, definition);
    this.drawProjectionPanel(context, layout, definition);
  },

  drawSpatialPanel(context, layout, definition) {
    const area = layout.split
      ? { x: 0, y: 0, width: layout.leftWidth, height: layout.height }
      : { x: 0, y: 0, width: layout.leftWidth, height: layout.topHeight };
    const projector = this.createSpatialProjector(layout, definition);
    const planeGeometry = model.getPlaneGeometry();
    const patch = planeGeometry.patch.map(projector.project);

    context.save();
    context.beginPath();
    context.rect(area.x, area.y, area.width, area.height);
    context.clip();

    this.drawSpatialProjectionPlanes(context, projector);
    this.drawAxes(context, planeGeometry.axes, projector, true);

    this.drawPolygon(
      context,
      patch,
      definition.key === 'traces'
        ? 'rgba(46, 190, 198, 0.08)'
        : COLORS.planeFill,
      definition.key === 'traces' ? 'rgba(98, 216, 221, 0.38)' : COLORS.planeStroke,
      definition.key === 'traces' ? 1.2 : 1.8
    );

    const patchCenter = projector.project({
      x: (8 + 0 + 0) / 3,
      y: (0 + 8 + 0) / 3,
      z: (0 + 0 + 8) / 3
    });
    this.drawCanvasLabel(
      context,
      'P',
      patchCenter.x + 5,
      patchCenter.y - 5,
      COLORS.planeStroke,
      12,
      'left',
      '800'
    );

    this.drawSpatialElements(context, projector, definition);
    this.drawSpatialHeading(context, area, definition);
    context.restore();
  },

  createSpatialProjector(layout, definition) {
    const area = layout.split
      ? { width: layout.leftWidth, height: layout.height }
      : { width: layout.leftWidth, height: layout.topHeight };
    const points = [];
    model.AXES.forEach((axis) => {
      points.push(axis.start, axis.end);
    });
    SPATIAL_PROJECTION_PLANES.forEach((plane) => {
      points.push(...plane.points);
    });
    points.push(...model.PLANE_PATCH);
    points.push(...definition.points.map((item) => item.point));
    definition.lines.forEach((line) => points.push(line.start, line.end));
    definition.polygons.forEach((polygon) => points.push(...polygon.points));

    const rawPoint = (point) => ({
      x: (point.y - point.x) * 0.86,
      y: (point.x + point.y) * 0.36 - point.z
    });
    const projected = points.map(rawPoint);
    const minimumX = Math.min(...projected.map((point) => point.x));
    const maximumX = Math.max(...projected.map((point) => point.x));
    const minimumY = Math.min(...projected.map((point) => point.y));
    const maximumY = Math.max(...projected.map((point) => point.y));
    const horizontalPadding = 22;
    const topPadding = 42;
    const bottomPadding = 20;
    const scale = Math.min(
      (area.width - horizontalPadding * 2) / Math.max(maximumX - minimumX, 1),
      (area.height - topPadding - bottomPadding) / Math.max(maximumY - minimumY, 1)
    );
    const centerX = (minimumX + maximumX) * 0.5;
    const centerY = (minimumY + maximumY) * 0.5;
    const screenCenterX = area.width * 0.5;
    const screenCenterY = topPadding
      + (area.height - topPadding - bottomPadding) * 0.5;
    return {
      project(point) {
        const raw = rawPoint(point);
        return {
          x: screenCenterX + (raw.x - centerX) * scale,
          y: screenCenterY + (raw.y - centerY) * scale
        };
      },
      scale
    };
  },

  drawSpatialGrid(context, area, projector) {
    const origin = projector.project({ x: 0, y: 0, z: 0 });
    context.save();
    context.strokeStyle = COLORS.spatialGrid;
    context.lineWidth = 0.7;
    [-4, -2, 0, 2, 4, 6, 8].forEach((value) => {
      const xStart = projector.project({ x: value, y: -1, z: 0 });
      const xEnd = projector.project({ x: value, y: 9, z: 0 });
      const yStart = projector.project({ x: -1, y: value, z: 0 });
      const yEnd = projector.project({ x: 9, y: value, z: 0 });
      this.drawLine(context, xStart, xEnd);
      this.drawLine(context, yStart, yEnd);
    });
    context.strokeStyle = 'rgba(167, 197, 225, 0.25)';
    const zTop = projector.project({ x: 0, y: 0, z: 8 });
    this.drawLine(context, origin, zTop);
    context.restore();
  },

  drawSpatialProjectionPlanes(context, projector) {
    SPATIAL_PROJECTION_PLANES.forEach((plane) => {
      const points = plane.points.map(projector.project);
      this.drawPolygon(
        context,
        points,
        plane.fill,
        plane.stroke,
        1.2
      );
      const label = projector.project(plane.labelPoint);
      this.drawCanvasLabel(
        context,
        plane.key,
        label.x + (plane.labelAlign === 'right' ? -7 : 7),
        label.y + 9,
        plane.stroke,
        12,
        plane.labelAlign,
        '800'
      );
    });
  },

  drawAxes(context, axes, projector, isSpatial) {
    context.save();
    context.strokeStyle = isSpatial ? COLORS.spatialAxis : COLORS.projectionAxis;
    context.lineWidth = isSpatial ? 1.3 : 1;
    context.setLineDash([]);
    axes.forEach((axis) => {
      const start = projector.project(axis.start);
      const endPoint = isSpatial
        ? Object.assign({}, axis.end, { [axis.key]: SPATIAL_FRAME_SPAN })
        : axis.end;
      const end = projector.project(endPoint);
      this.drawLine(context, start, end);
      this.drawCanvasLabel(
        context,
        axis.label,
        end.x + (axis.key === 'x' ? -10 : 6),
        end.y + (axis.key === 'z' ? -8 : 10),
        isSpatial ? COLORS.spatialMuted : COLORS.projectionMuted,
        isSpatial ? 10 : 9,
        'left',
        '700'
      );
    });
    context.restore();
  },

  drawSpatialElements(context, projector, definition) {
    definition.polygons.forEach((polygon) => {
      const points = polygon.points.map(projector.project);
      this.drawPolygon(
        context,
        points,
        COLORS.figureFill,
        COLORS.figureStroke,
        2.3
      );
    });

    definition.lines.forEach((line, index) => {
      const start = projector.project(line.start);
      const end = projector.project(line.end);
      const color = getLineColor(line, index);
      context.save();
      context.strokeStyle = color;
      context.lineWidth = definition.key === 'traces' ? 2.6 : 2.3;
      context.setLineDash([]);
      this.drawLine(context, start, end);
      context.restore();
      const labelParameter = 0.5 + (index % 2 === 0 ? -0.12 : 0.12);
      const lineLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      const normal = {
        x: -(end.y - start.y) / lineLength,
        y: (end.x - start.x) / lineLength
      };
      this.drawCanvasLabel(
        context,
        line.label,
        start.x + (end.x - start.x) * labelParameter + normal.x * 9,
        start.y + (end.y - start.y) * labelParameter + normal.y * 9,
        color,
        9,
        normal.x < -0.1 ? 'right' : (normal.x > 0.1 ? 'left' : 'center'),
        '800'
      );
      if (line.startLabel) {
        this.drawLineEndpoint(
          context,
          start,
          line.startLabel,
          color,
          this.getAwayOffset(start, projector.project({
            x: 8 / 3,
            y: 8 / 3,
            z: 8 / 3
          }), 9)
        );
      }
      if (line.endLabel) {
        this.drawLineEndpoint(
          context,
          end,
          line.endLabel,
          color,
          this.getAwayOffset(end, projector.project({
            x: 8 / 3,
            y: 8 / 3,
            z: 8 / 3
          }), 9)
        );
      }
    });

    definition.points.forEach((item) => {
      const screen = projector.project(item.point);
      const color = getPointColor(item.key);
      this.drawPoint(
        context,
        screen,
        color,
        item.key === 'S' ? 5.2 : 4.3,
        item.key
      );
    });
  },

  drawSpatialHeading(context, area, definition) {
    this.drawCanvasLabel(
      context,
      '空间关系',
      14,
      21,
      COLORS.spatialText,
      12,
      'left',
      '800'
    );
    this.drawCanvasLabel(
      context,
      definition.label,
      area.width - 14,
      20,
      COLORS.planeStroke,
      10,
      'right',
      '700'
    );
  },

  drawProjectionPanel(context, layout, definition) {
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

    const viewTop = top + 27;
    const viewBottom = top + height - 8;
    context.fillStyle = VIEW_DEFINITIONS.front.fill;
    context.fillRect(left + 8, viewTop, origin.x - left - 8, origin.y - viewTop);
    context.fillStyle = VIEW_DEFINITIONS.top.fill;
    context.fillRect(left + 8, origin.y, origin.x - left - 8, viewBottom - origin.y);
    context.fillStyle = VIEW_DEFINITIONS.left.fill;
    context.fillRect(origin.x, viewTop, left + width - origin.x - 8, origin.y - viewTop);

    context.strokeStyle = COLORS.projectionAxis;
    context.lineWidth = 1;
    context.setLineDash([]);
    this.drawLine(
      context,
      { x: left + 8, y: origin.y },
      { x: left + width - 8, y: origin.y }
    );
    this.drawLine(
      context,
      { x: origin.x, y: viewTop },
      { x: origin.x, y: viewBottom }
    );

    this.drawCanvasLabel(context, 'V', left + 14, top + 18,
      VIEW_DEFINITIONS.front.color, 12, 'left', '800');
    this.drawCanvasLabel(context, 'W', left + width - 14, top + 18,
      VIEW_DEFINITIONS.left.color, 12, 'right', '800');
    this.drawCanvasLabel(context, 'H', left + 14, top + height - 10,
      VIEW_DEFINITIONS.top.color, 12, 'left', '800');
    this.drawCanvasLabel(context, '第一角三面投影', origin.x, top + 18,
      COLORS.projectionText, 11, 'center', '800');

    const projector = {
      project: (point) => this.getProjectionScreenPoints(point)
    };
    this.drawProjectionPlane(context, projector);
    this.drawProjectionConnections(
      context,
      projector,
      definition,
      origin,
      metrics.unit,
      {
        right: left + width - 8,
        bottom: viewBottom
      }
    );
    this.drawProjectionElements(context, projector, definition);
    context.restore();
  },

  drawProjectionPlane(context, projector) {
    ['front', 'top', 'left'].forEach((viewType) => {
      const points = model.PLANE_PATCH.map((point) => (
        projector.project(point)[viewType]
      ));
      this.drawPolygon(
        context,
        points,
        COLORS.planeProjectionFill,
        COLORS.planeProjectionStroke,
        1
      );
    });
  },

  drawProjectionConnections(context, projector, definition, origin, unit, bounds) {
    const anchors = [];
    const append = (point) => {
      if (!point) return;
      const duplicate = anchors.some((item) => (
        Math.abs(item.x - point.x) <= 1e-8
        && Math.abs(item.y - point.y) <= 1e-8
        && Math.abs(item.z - point.z) <= 1e-8
      ));
      if (!duplicate) anchors.push(point);
    };
    definition.points.forEach((item) => append(item.point));
    definition.lines.forEach((line) => {
      append(line.start);
      append(line.end);
    });
    definition.polygons.forEach((polygon) => {
      polygon.points.forEach(append);
    });

    context.save();
    context.strokeStyle = COLORS.projectionLink;
    context.lineWidth = 0.85;
    context.setLineDash([]);
    anchors.forEach((point) => {
      const views = projector.project(point);
      const miterPoint = {
        x: origin.x + Math.abs(point.y) * unit,
        y: origin.y + Math.abs(point.y) * unit
      };
      this.drawLine(context, views.front, views.top);
      this.drawLine(context, views.front, views.left);
      this.drawLine(context, views.top, miterPoint);
      this.drawLine(context, miterPoint, views.left);
    });
    if (anchors.length) {
      const maximumWidth = anchors.reduce((maximum, point) => (
        Math.max(maximum, Math.abs(point.y) * unit)
      ), 0);
      const axisLimitedLength = Math.min(
        bounds.right - origin.x,
        bounds.bottom - origin.y
      );
      const miterLength = Math.max(maximumWidth, axisLimitedLength);
      if (miterLength > 0.5) {
        this.drawLine(
          context,
          origin,
          {
            x: origin.x + miterLength,
            y: origin.y + miterLength
          }
        );
      }
    }
    context.restore();
  },

  drawProjectionElements(context, projector, definition) {
    const origin = this.getProjectionMetrics().origin;
    definition.polygons.forEach((polygon) => {
      ['front', 'top', 'left'].forEach((viewType) => {
        const points = polygon.points.map((point) => (
          projector.project(point)[viewType]
        ));
        this.drawPolygon(
          context,
          points,
          COLORS.figureFill,
          VIEW_DEFINITIONS[viewType].color,
          1.8
        );
      });
    });

    definition.lines.forEach((line, index) => {
      const projected = projector.project(line.start);
      const projectedEnd = projector.project(line.end);
      const baseColor = getLineColor(line, index);
      ['front', 'top', 'left'].forEach((viewType) => {
        const ownTrace = definition.key === 'traces'
          && line.projectionPlane === this.planeOfViewType(viewType);
        const color = definition.key === 'traces'
          ? baseColor
          : baseColor;
        context.save();
        context.strokeStyle = color;
        context.lineWidth = ownTrace ? 2.8 : 1.45;
        context.setLineDash([]);
        this.drawLine(
          context,
          projected[viewType],
          projectedEnd[viewType]
        );
        context.restore();
        if (line.startLabel) {
          const screen = projected[viewType];
          this.drawProjectionEndpoint(
            context,
            screen,
            getProjectionLabel(line.startLabel, viewType),
            baseColor,
            viewType,
            projectedEnd[viewType],
            origin
          );
        }
        if (line.endLabel) {
          const screen = projectedEnd[viewType];
          this.drawProjectionEndpoint(
            context,
            screen,
            getProjectionLabel(line.endLabel, viewType),
            baseColor,
            viewType,
            projected[viewType],
            origin
          );
        }
      });

      const labelParameter = 0.5 + (index % 2 === 0 ? -0.12 : 0.12);
      const midpoint = {
        x: projected.front.x
          + (projectedEnd.front.x - projected.front.x) * labelParameter,
        y: projected.front.y
          + (projectedEnd.front.y - projected.front.y) * labelParameter
      };
      if (definition.key !== 'traces') {
        const normalOffset = this.getProjectionLineLabelOffset(
          projected.front,
          projectedEnd.front,
          origin,
          8
        );
        this.drawCanvasLabel(
          context,
          line.label,
          midpoint.x + normalOffset.x,
          midpoint.y + normalOffset.y,
          baseColor,
          8,
          'center',
          '800',
          '#ffffff'
        );
      }
    });

    if (definition.key === 'traces') {
      ['H', 'V', 'W'].forEach((plane) => {
        const trace = definition.lines.find((line) => line.projectionPlane === plane);
        if (!trace) return;
        const viewType = plane === 'H' ? 'top' : (plane === 'V' ? 'front' : 'left');
        const start = projector.project(trace.start)[viewType];
        const end = projector.project(trace.end)[viewType];
        const normalOffset = this.getProjectionLineLabelOffset(
          start,
          end,
          origin,
          12
        );
        this.drawCanvasLabel(
          context,
          trace.label,
          start.x + (end.x - start.x) * 0.62 + normalOffset.x,
          start.y + (end.y - start.y) * 0.62 + normalOffset.y,
          TRACE_COLORS[plane],
          9,
          normalOffset.x < -0.1 ? 'right' : (normalOffset.x > 0.1 ? 'left' : 'center'),
          '800',
          '#ffffff'
        );
      });
      return;
    }

    definition.points.forEach((item) => {
      const projected = projector.project(item.point);
      const color = getPointColor(item.key);
      ['front', 'top', 'left'].forEach((viewType) => {
        const screen = projected[viewType];
        const radius = item.key === 'S' ? 4.6 : 3.8;
        context.save();
        context.fillStyle = color;
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1.1;
        context.beginPath();
        context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.restore();
        const label = getProjectionLabel(item.key, viewType);
        const offset = viewType === 'front'
          ? { x: -6, y: -6 }
          : { x: 6, y: viewType === 'top' ? 7 : -6 };
        this.drawCanvasLabel(
          context,
          label,
          screen.x + offset.x,
          screen.y + offset.y,
          color,
          8,
          offset.x < 0 ? 'right' : 'left',
          '800',
          '#ffffff'
        );
      });
    });
  },

  planeOfViewType(viewType) {
    if (viewType === 'front') return 'V';
    if (viewType === 'top') return 'H';
    return 'W';
  },

  drawCanvasLabel(context, text, x, y, color, size, align, weight, haloColor) {
    context.save();
    context.font = `${weight || '600'} ${size || 9}px sans-serif`;
    context.textAlign = align || 'left';
    context.textBaseline = 'middle';
    if (haloColor && typeof context.strokeText === 'function') {
      context.strokeStyle = haloColor;
      context.lineWidth = 2.6;
      context.lineJoin = 'round';
      context.strokeText(text, x, y);
    }
    context.fillStyle = color;
    context.fillText(text, x, y);
    context.restore();
  },

  drawLineEndpoint(context, point, label, color, offset) {
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 2.7, 0, Math.PI * 2);
    context.fill();
    context.restore();
    this.drawCanvasLabel(
      context,
      label,
      point.x + offset.x,
      point.y + offset.y,
      color,
      8,
      offset.x < 0 ? 'right' : 'left',
      '800',
      '#ffffff'
    );
  },

  drawProjectionEndpoint(context, point, label, color, viewType, otherPoint, origin) {
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 2.55, 0, Math.PI * 2);
    context.fill();
    context.restore();
    const dx = point.x - (otherPoint || point).x;
    const dy = point.y - (otherPoint || point).y;
    const magnitude = Math.hypot(dx, dy);
    const outward = magnitude > 1e-6
      ? { x: dx / magnitude * 8, y: dy / magnitude * 8 }
      : (viewType === 'front'
        ? { x: -6, y: -6 }
        : { x: 6, y: viewType === 'top' ? 7 : -6 });
    const normal = this.getProjectionLineLabelOffset(
      point,
      otherPoint || point,
      origin,
      3
    );
    const offset = {
      x: outward.x + normal.x,
      y: outward.y + normal.y
    };
    this.drawCanvasLabel(
      context,
      label,
      point.x + offset.x,
      point.y + offset.y,
      color,
      8,
      offset.x < 0 ? 'right' : 'left',
      '800',
      '#ffffff'
    );
  },

  getProjectionLineLabelOffset(start, end, origin, distance) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude <= 1e-6) return { x: 0, y: -distance };
    let normal = {
      x: -dy / magnitude,
      y: dx / magnitude
    };
    const midpoint = {
      x: (start.x + end.x) * 0.5,
      y: (start.y + end.y) * 0.5
    };
    const outward = {
      x: midpoint.x - origin.x,
      y: midpoint.y - origin.y
    };
    if (normal.x * outward.x + normal.y * outward.y < 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    return {
      x: normal.x * distance,
      y: normal.y * distance
    };
  },

  getAwayOffset(point, center, distance) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude <= 1e-6) return { x: distance, y: -distance };
    return {
      x: dx / magnitude * distance,
      y: dy / magnitude * distance
    };
  }
};
