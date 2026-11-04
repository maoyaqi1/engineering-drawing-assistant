// 直线与平面求交点 · Canvas 2D 绘制。
//
// 画布沿用项目的“上方空间图 + 下方第一角三视图”结构。
// 引导步骤只决定叠加哪些构造，不改变任何几何真值。

const COLORS = {
  background: '#090a0c',
  planeFill: 'rgba(53, 195, 200, 0.26)',
  planeStroke: '#67e1e5',
  line: '#ffb02e',
  front: '#df5757',
  top: '#43a66c',
  left: '#3779d0',
  auxiliary: '#8b5cf6',
  auxiliaryTrace: '#6d28d9',
  construction: '#d99a00',
  accumulation: '#ff4f53',
  planeAccumulation: '#ffb62e',
  result: '#e7332f',
  guide: '#8b929c'
};

const VIEW_SUFFIX = {
  front: '′',
  top: '',
  left: '″'
};

module.exports = {
  drawScene() {
    if (!this.context || !this.canvasWidth || !this._geometry) return;
    const context = this.context;
    const layout = this.getLayout();
    this._labelBoxes = [];
    context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawSpatialPanel(context, layout);
    this.drawProjectionPanels(context, layout);
  },

  drawSpatialPanel(context, layout) {
    this.resetLabelLayout({
      left: 2,
      right: layout.leftWidth - 2,
      top: 28,
      bottom: layout.topHeight - 2
    });
    context.save();
    context.beginPath();
    context.rect(0, 0, layout.leftWidth, layout.topHeight);
    context.fillStyle = COLORS.background;
    context.fill();
    context.clip();
    this.drawSpatialAxes(context);
    this.drawSpatialAuxiliaryPlane(context);
    this.drawSpatialPlane(context);
    this.drawSpatialAccumulation(context);
    this.drawSpatialMainLine(context);
    this.drawSpatialConstruction(context);
    this.drawText(context, '线面相交求交点', 12, 22, '#d9dde4', 11, '700');
    this.drawAlignedText(
      context,
      `引导 ${this.data.currentStep}/${this.data.steps.length}`,
      layout.leftWidth - 12,
      22,
      '#ffd687',
      9,
      '700',
      'right'
    );
    context.restore();
  },

  drawSpatialAxes(context) {
    const origin = this.projectIsometric({ x: 0, y: 0, z: 0 });
    const xEnd = this.projectIsometric({ x: 9, y: 0, z: 0 });
    const yEnd = this.projectIsometric({ x: 0, y: 9, z: 0 });
    const zEnd = this.projectIsometric({ x: 0, y: 0, z: 9.5 });
    const xWall = this.projectIsometric({ x: 8.8, y: 0, z: 0 });
    const yWall = this.projectIsometric({ x: 0, y: 8.8, z: 0 });
    const xyCorner = this.projectIsometric({ x: 8.8, y: 8.8, z: 0 });
    const xzCorner = this.projectIsometric({ x: 8.8, y: 0, z: 8 });
    const yzCorner = this.projectIsometric({ x: 0, y: 8.8, z: 8 });
    const zTop = this.projectIsometric({ x: 0, y: 0, z: 8 });
    this.drawPolygon(context, [origin, xWall, xyCorner, yWall],
      'rgba(50, 184, 110, 0.19)', 'rgba(95, 221, 151, 0.28)', 1);
    this.drawPolygon(context, [origin, xWall, xzCorner, zTop],
      'rgba(52, 132, 246, 0.18)', 'rgba(92, 160, 255, 0.28)', 1);
    this.drawPolygon(context, [origin, yWall, yzCorner, zTop],
      'rgba(245, 196, 55, 0.16)', 'rgba(245, 215, 105, 0.28)', 1);
    this.drawArrow(context, origin, xEnd, '#aeb5bf');
    this.drawArrow(context, origin, yEnd, '#aeb5bf');
    this.drawArrow(context, origin, zEnd, '#aeb5bf');
    this.drawText(context, 'X', xEnd.x + 5, xEnd.y + 13, '#e3e5e8', 10, '600');
    this.drawText(context, 'Y', yEnd.x + 7, yEnd.y + 9, '#e3e5e8', 10, '600');
    this.drawText(context, 'Z', zEnd.x + 9, zEnd.y + 10, '#e3e5e8', 10, '600');
    const vPoint = this.projectIsometric({ x: 8.1, y: 0, z: 7.3 });
    const wPoint = this.projectIsometric({ x: 0, y: 8.1, z: 7.3 });
    const hPoint = this.projectIsometric({ x: 7.8, y: 7.8, z: 0 });
    this.drawText(context, 'V', vPoint.x, vPoint.y, '#78b7ff', 10, '700');
    this.drawText(context, 'W', wPoint.x, wPoint.y, '#f2d36c', 10, '700');
    this.drawText(context, 'H', hPoint.x, hPoint.y, '#6ed59a', 10, '700');
  },

  drawSpatialPlane(context) {
    const displayPoints = (
      this._geometry.plane.patch
      || this._geometry.plane.vertices
    );
    const vertices = displayPoints.map(
      (point) => this.projectIsometric(point)
    );
    this.drawPolygon(context, vertices,
      COLORS.planeFill, COLORS.planeStroke, 2.2);
    const center = this.projectIsometric(this._geometry.plane.center);
    this._geometry.plane.vertices.forEach((point, index) => {
      this.drawPointWithAwayLabel(
        context,
        this.projectIsometric(point),
        ['A', 'B', 'C'][index],
        ['#ff8b8e', '#75a9ff', '#ffd166'][index],
        2.6,
        center
      );
    });
  },

  drawSpatialAuxiliaryPlane(context) {
    if (this.data.methodKind !== 'auxiliary'
      || this.data.appliedStep < 1
      || !this._geometry.auxiliaryPlane) {
      return;
    }
    const corners = this._geometry.auxiliaryPlane.curtainCorners.map(
      (point) => this.projectIsometric(point)
    );
    this.drawPolygon(context, corners,
      'rgba(139, 92, 246, 0.26)', 'rgba(196, 181, 253, 0.96)', 2.2);
    const labelAnchor = corners.reduce(
      (top, point) => (point.y < top.y ? point : top),
      corners[0]
    );
    this.drawText(context, '辅助面 Q',
      labelAnchor.x + 7, labelAnchor.y + 12, '#ddd6fe', 10, '700');
  },

  drawSpatialAccumulation(context) {
    if (this.data.appliedStep < 1) return;
    const geometry = this._geometry;
    if ((this.data.methodKind === 'line' || this.data.methodKind === 'both')
      && geometry.lineAccumulationPlane) {
      const point = geometry.line.e;
      const projected = this.projectIsometric({
        x: geometry.lineAccumulationPlane === 'W' ? 0 : point.x,
        y: geometry.lineAccumulationPlane === 'H' ? point.y : 0,
        z: geometry.lineAccumulationPlane === 'V' ? point.z : 0
      });
      this.drawAccumulationRing(context, projected, 'EF 积聚', '#ffb3af');
    }
    if ((this.data.methodKind === 'plane' || this.data.methodKind === 'both')
      && geometry.planeAccumulationPlane) {
      const planePoints = geometry.plane.vertices.map((point) => (
        this.projectIsometric({
          x: geometry.planeAccumulationPlane === 'W' ? 0 : point.x,
          y: geometry.planeAccumulationPlane === 'H' ? point.y : 0,
          z: geometry.planeAccumulationPlane === 'V' ? point.z : 0
        })
      ));
      const extremes = this.getExtremePair(planePoints);
      context.save();
      context.strokeStyle = COLORS.planeAccumulation;
      context.lineWidth = 2.6;
      context.setLineDash([]);
      this.drawLine(context, extremes.first, extremes.second);
      context.restore();
      this.drawText(context, 'ABC 积聚',
        extremes.second.x + 6, extremes.second.y - 7,
        '#ffd687', 9, '700');
    }
  },

  drawSpatialMainLine(context) {
    const line = this._geometry.line;
    context.save();
    context.strokeStyle = COLORS.line;
    context.lineWidth = 3.4;
    context.setLineDash([]);
    this.drawLine(
      context,
      this.projectIsometric(line.e),
      this.projectIsometric(line.f)
    );
    const center = this.projectIsometric(this._geometry.plane.center);
    this.drawLineEndpointLabel(
      context,
      this.projectIsometric(line.e),
      this.projectIsometric(line.f),
      'E',
      '#ff777b',
      2.8,
      center
    );
    this.drawLineEndpointLabel(
      context,
      this.projectIsometric(line.f),
      this.projectIsometric(line.e),
      'F',
      '#6ea6ff',
      2.8,
      center
    );
    context.restore();
  },

  drawSpatialConstruction(context) {
    const step = this.data.appliedStep;
    if (step >= 3 && this._geometry.relation.intersection) {
      this.drawSpatialResult(
        context,
        this.projectIsometric(this._geometry.relation.intersection.point)
      );
    }
  },

  drawProjectionPanels(context, layout) {
    this.resetLabelLayout({
      left: layout.projectionLeft + 4,
      right: layout.projectionLeft + layout.projectionWidth - 4,
      top: layout.projectionTop + 28,
      bottom: layout.projectionTop + layout.projectionHeight - 4
    });
    const metrics = this.getProjectionMetrics();
    const origin = metrics.origin;
    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(
      layout.projectionLeft,
      layout.projectionTop,
      layout.projectionWidth,
      layout.projectionHeight
    );
    context.strokeStyle = '#31343a';
    context.lineWidth = 1.5;
    if (layout.split) {
      this.drawLine(context,
        { x: layout.leftWidth, y: 0 },
        { x: layout.leftWidth, y: this.canvasHeight });
    } else {
      this.drawLine(context,
        { x: 0, y: layout.dividerY },
        { x: this.canvasWidth, y: layout.dividerY });
    }
    context.strokeStyle = '#777d85';
    context.lineWidth = 1;
    this.drawLine(context,
      { x: layout.projectionLeft + 10, y: origin.y },
      { x: layout.projectionLeft + layout.projectionWidth - 10, y: origin.y });
    this.drawLine(context,
      { x: origin.x, y: layout.projectionTop },
      { x: origin.x, y: layout.projectionTop + layout.projectionHeight - 18 });
    this.drawText(context, 'Z', origin.x + 6, layout.projectionTop + 8,
      '#525861', 10, '700');
    this.drawText(context, 'X', layout.projectionLeft + 8, origin.y - 5,
      '#525861', 10, '700');
    this.drawText(context, 'Y', origin.x + 6,
      layout.projectionTop + layout.projectionHeight - 9,
      '#525861', 10, '700');
    this.drawText(context, '三面投影',
      layout.projectionLeft + 12, layout.projectionTop + 20,
      '#3b4654', 11, '700');

    const planeViews = {
      front: (this._geometry.plane.patch || this._geometry.plane.vertices).map((point) => (
        this.getProjectionScreenPoints(point).front
      )),
      top: (this._geometry.plane.patch || this._geometry.plane.vertices).map((point) => (
        this.getProjectionScreenPoints(point).top
      )),
      left: (this._geometry.plane.patch || this._geometry.plane.vertices).map((point) => (
        this.getProjectionScreenPoints(point).left
      ))
    };
    this.drawPolygon(context, planeViews.front,
      'rgba(223, 87, 87, 0.10)', COLORS.front, 1.6);
    this.drawPolygon(context, planeViews.top,
      'rgba(67, 166, 108, 0.10)', COLORS.top, 1.6);
    this.drawPolygon(context, planeViews.left,
      'rgba(55, 121, 208, 0.10)', COLORS.left, 1.6);

    const triangleViews = {
      front: this._geometry.plane.vertices.map((point) => (
        this.getProjectionScreenPoints(point).front
      )),
      top: this._geometry.plane.vertices.map((point) => (
        this.getProjectionScreenPoints(point).top
      )),
      left: this._geometry.plane.vertices.map((point) => (
        this.getProjectionScreenPoints(point).left
      ))
    };
    ['front', 'top', 'left'].forEach((viewType) => {
      const center = this.getPointCenter(triangleViews[viewType]);
      ['a', 'b', 'c'].forEach((label, index) => {
        this.drawProjectionVertexLabel(
          context,
          `${label}${VIEW_SUFFIX[viewType]}`,
          triangleViews[viewType][index],
          ['#d94d51', '#3b72b7', '#ca851d'][index],
          center,
          this.getProjectionLabelBounds(viewType),
          viewType
        );
      });
    });
    this.drawProjectionBodyLine(context);
    this.drawAuxiliaryTracesInProjection(context);
    this.drawProjectionAccumulation(context, planeViews);
    this.drawProjectionConstruction(context);

    this.drawText(context, 'V', layout.projectionLeft + 17,
      layout.projectionTop + 47, COLORS.front, 13, '700');
    this.drawText(context, 'W',
      layout.projectionLeft + layout.projectionWidth - 17,
      layout.projectionTop + 47, COLORS.left, 13, '700');
    this.drawText(context, 'H', layout.projectionLeft + 17,
      layout.projectionTop + layout.projectionHeight - 20,
      COLORS.top, 13, '700');
    this.drawDeferredLabels(context);
    context.restore();
  },

  drawProjectionBodyLine(context) {
    const line = this._geometry.line;
    const eViews = this.getProjectionScreenPoints(line.e);
    const fViews = this.getProjectionScreenPoints(line.f);
    ['front', 'top', 'left'].forEach((viewType) => {
      context.save();
      context.strokeStyle = COLORS.line;
      context.lineWidth = 2.2;
      context.setLineDash([]);
      this.drawLine(context, eViews[viewType], fViews[viewType]);
      context.restore();
      const isAccumulatingView = (
        this._geometry.lineAccumulationPlane === this.planeOfViewType(viewType)
      );
      if (isAccumulatingView) {
        const label = this.data.appliedStep >= 3 ? '' : 'e(f)';
        this.reservePointBox(eViews[viewType], 5);
        this.drawPoint(context, eViews[viewType], COLORS.accumulation, 2.8, '');
        if (label) {
          const labelBounds = this.getProjectionLabelBounds(viewType);
          this.queuePinnedLabel(
            label,
            labelBounds.right,
            Math.max(labelBounds.top + 7, eViews[viewType].y - 8),
            '#a33131',
            9,
            '800',
            'right'
          );
        }
        return;
      }
      const center = this.getProjectionScreenPoints(
        this._geometry.plane.center
      )[viewType];
      this.drawLineEndpointLabel(
        context,
        eViews[viewType],
        fViews[viewType],
        `e${VIEW_SUFFIX[viewType]}`,
        '#ff777b',
        2.6,
        center,
        this.getProjectionLabelBounds(viewType),
        viewType,
        '#b83232'
      );
      this.drawLineEndpointLabel(
        context,
        fViews[viewType],
        eViews[viewType],
        `f${VIEW_SUFFIX[viewType]}`,
        '#6ea6ff',
        2.6,
        center,
        this.getProjectionLabelBounds(viewType),
        viewType,
        '#2f63ad'
      );
    });
  },

  drawAuxiliaryTracesInProjection(context) {
    if (this.data.methodKind !== 'auxiliary'
      || this.data.appliedStep < 1
      || !this._geometry.auxiliaryPlane) {
      return;
    }
    const trace = this._geometry.auxiliaryPlane.trace;
    if (!trace) return;
    const viewType = this.viewTypeOfPlane(trace.projectionPlane);
    const start = this.getProjectionScreenPoints(trace.start)[viewType];
    const end = this.getProjectionScreenPoints(trace.end)[viewType];
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 5.4;
    context.setLineDash([]);
    this.drawLine(context, start, end);
    context.strokeStyle = COLORS.auxiliaryTrace;
    context.lineWidth = 3.2;
    context.setLineDash([]);
    this.drawLine(context, start, end);
    context.restore();
    this.drawTraceEndCaps(context, start, end, COLORS.auxiliaryTrace, 14, 5);
    const bounds = this.getProjectionLabelBounds(viewType);
    const leftPoint = start.x <= end.x ? start : end;
    const labelWidth = Math.max(10, trace.label.length * 6.1);
    let align = 'right';
    let labelX = leftPoint.x - 6;
    if (labelX - labelWidth < bounds.left) {
      align = 'left';
      labelX = Math.min(leftPoint.x + 6, bounds.right - labelWidth);
    }
    const labelY = Math.max(
      bounds.top + 7,
      Math.min(bounds.bottom - 7, leftPoint.y + 12)
    );
    this.queuePinnedLabel(
      trace.label,
      labelX,
      labelY,
      COLORS.auxiliaryTrace,
      10,
      '800',
      align
    );
  },

  drawTraceEndCaps(context, start, end, color, capLength, capWidth) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    [start, end].forEach((point) => {
      context.save();
      context.translate(point.x, point.y);
      context.rotate(angle);
      context.fillStyle = color;
      context.fillRect(
        -capLength / 2,
        -capWidth / 2,
        capLength,
        capWidth
      );
      context.restore();
    });
  },

  drawProjectionAccumulation(context, planeViews) {
    if (this.data.appliedStep < 1) return;
    const geometry = this._geometry;
    if ((this.data.methodKind === 'plane' || this.data.methodKind === 'both')
      && geometry.planeAccumulationPlane) {
      const viewType = this.viewTypeOfPlane(geometry.planeAccumulationPlane);
      const extremes = this.getExtremePair(planeViews[viewType]);
      context.save();
      context.strokeStyle = COLORS.planeAccumulation;
      context.lineWidth = 3;
      context.setLineDash([]);
      this.drawLine(context, extremes.first, extremes.second);
      context.restore();
      this.drawSmartLabel(
        context,
        'ABC 积聚',
        extremes.second,
        COLORS.planeAccumulation,
        9,
        '700',
        { x: 1, y: -1 },
        this.getProjectionLabelBounds(viewType)
      );
    }
    if ((this.data.methodKind === 'line' || this.data.methodKind === 'both')
      && geometry.lineAccumulationPlane) {
      const viewType = this.viewTypeOfPlane(geometry.lineAccumulationPlane);
      const point = this.getProjectionScreenPoints(geometry.line.e)[viewType];
      this.drawAccumulationRing(context, point, '', COLORS.accumulation);
    }
  },

  drawProjectionConstruction(context) {
    const geometry = this._geometry;
    const intersection = geometry.relation.intersection;
    if (!intersection || this.data.appliedStep < 1) return;
    const method = this.data.methodKind;
    const allViews = ['front', 'top', 'left'];
    if (method === 'line' && geometry.lineAccumulationSection) {
      const section = geometry.lineAccumulationSection;
      const accumulationView = this.viewTypeOfPlane(
        geometry.lineAccumulationPlane
      );
      const sectionViews = this.data.appliedStep >= 2
        ? allViews
        : [accumulationView];
      const startViews = this.getProjectionScreenPoints(section.start);
      const endViews = this.getProjectionScreenPoints(section.end);
      sectionViews.forEach((viewType) => {
        context.save();
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = 5;
        context.setLineDash([]);
        this.drawLine(context, startViews[viewType], endViews[viewType]);
        context.strokeStyle = COLORS.construction;
        context.lineWidth = 2.6;
        this.drawLine(context, startViews[viewType], endViews[viewType]);
        context.restore();
        const viewCenter = this.getProjectionScreenPoints(
          this._geometry.plane.center
        )[viewType];
        this.drawConstructionPoint(
          context,
          endViews[viewType],
          `1${VIEW_SUFFIX[viewType]}`,
          startViews[viewType],
          endViews[viewType],
          viewCenter,
          this.getProjectionLabelBounds(viewType),
          viewType
        );
      });
      if (this.data.appliedStep >= 2) {
        this.drawProjectionCorrespondence(
          context,
          endViews,
          section.end.y,
          this.getProjectionMetrics().origin,
          this.getProjectionMetrics().unit,
          '#a27b36'
        );
      }
      if (this.data.appliedStep >= 3) {
        const pointViews = this.getProjectionScreenPoints(intersection.point);
        this.drawProjectionCorrespondence(
          context,
          pointViews,
          intersection.point.y,
          this.getProjectionMetrics().origin,
          this.getProjectionMetrics().unit,
          '#d06c66'
        );
        allViews.forEach((viewType) => {
          const viewCenter = this.getProjectionScreenPoints(
            this._geometry.plane.center
          )[viewType];
          const label = this.planeOfViewType(viewType)
            === geometry.lineAccumulationPlane
            ? 'k(e,f)'
            : `k${VIEW_SUFFIX[viewType]}`;
          this.drawProjectionResult(
            context,
            pointViews[viewType],
            label,
            this.data.isComplete,
            viewCenter,
            this.getProjectionLabelBounds(viewType)
          );
        });
      }
      return;
    }
    if (method === 'auxiliary' && geometry.sectionLine
      && geometry.auxiliaryPlane) {
      const auxiliaryView = this.viewTypeOfPlane(
        geometry.auxiliaryPlane.projectionPlane
      );
      const startViews = this.getProjectionScreenPoints(geometry.sectionLine.start);
      const endViews = this.getProjectionScreenPoints(geometry.sectionLine.end);
      const sectionViews = this.data.appliedStep >= 2
        ? allViews
        : [auxiliaryView];
      sectionViews.forEach((viewType) => {
        context.save();
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = 5;
        context.setLineDash([]);
        this.drawLine(context, startViews[viewType], endViews[viewType]);
        context.strokeStyle = COLORS.construction;
        context.lineWidth = 2.6;
        context.setLineDash([]);
        this.drawLine(context, startViews[viewType], endViews[viewType]);
        context.restore();
        const viewCenter = this.getProjectionScreenPoints(
          this._geometry.plane.center
        )[viewType];
        this.drawConstructionPoint(
          context,
          startViews[viewType],
          `1${VIEW_SUFFIX[viewType]}`,
          startViews[viewType],
          endViews[viewType],
          viewCenter,
          this.getProjectionLabelBounds(viewType),
          viewType
        );
        this.drawConstructionPoint(
          context,
          endViews[viewType],
          `2${VIEW_SUFFIX[viewType]}`,
          startViews[viewType],
          endViews[viewType],
          viewCenter,
          this.getProjectionLabelBounds(viewType),
          viewType
        );
      });
      if (this.data.appliedStep >= 2) {
        [geometry.sectionLine.start, geometry.sectionLine.end].forEach((point) => {
          this.drawProjectionCorrespondence(
            context,
            this.getProjectionScreenPoints(point),
            point.y,
            this.getProjectionMetrics().origin,
            this.getProjectionMetrics().unit,
            '#a27b36'
          );
        });
      }
      if (this.data.appliedStep >= 3) {
        const pointViews = this.getProjectionScreenPoints(intersection.point);
        this.drawProjectionCorrespondence(
          context,
          pointViews,
          intersection.point.y,
          this.getProjectionMetrics().origin,
          this.getProjectionMetrics().unit,
          '#d06c66'
        );
        allViews.forEach((viewType) => {
          const viewCenter = this.getProjectionScreenPoints(
            this._geometry.plane.center
          )[viewType];
          this.drawProjectionResult(
            context,
            pointViews[viewType],
            `k${VIEW_SUFFIX[viewType]}`,
            this.data.isComplete,
            viewCenter,
            this.getProjectionLabelBounds(viewType)
          );
        });
      }
      return;
    }
    if (this.data.appliedStep < 2) return;
    const pointViews = this.getProjectionScreenPoints(intersection.point);
    const partialViews = [];
    if (method === 'plane') {
      partialViews.push(this.viewTypeOfPlane(geometry.planeAccumulationPlane));
    } else if (method === 'line') {
      partialViews.push(this.viewTypeOfPlane(geometry.lineAccumulationPlane));
    } else if (method === 'both') {
      partialViews.push(this.viewTypeOfPlane(geometry.lineAccumulationPlane));
      const planeView = this.viewTypeOfPlane(geometry.planeAccumulationPlane);
      if (!partialViews.includes(planeView)) partialViews.push(planeView);
    }
    const visibleViews = this.data.appliedStep >= 3
      ? allViews
      : partialViews;
    if (this.data.appliedStep >= 3) {
      this.drawProjectionCorrespondence(
        context,
        pointViews,
        intersection.point.y,
        this.getProjectionMetrics().origin,
        this.getProjectionMetrics().unit,
        '#d06c66'
      );
    }
    visibleViews.forEach((viewType) => {
      const viewCenter = this.getProjectionScreenPoints(
        this._geometry.plane.center
      )[viewType];
      const isCoincident = (
        method === 'line' || method === 'both'
      ) && this.planeOfViewType(viewType) === geometry.lineAccumulationPlane;
      this.drawProjectionResult(
        context,
        pointViews[viewType],
        isCoincident ? 'k(e,f)' : `k${VIEW_SUFFIX[viewType]}`,
        this.data.isComplete,
        viewCenter,
        this.getProjectionLabelBounds(viewType)
      );
    });
  },

  drawSpatialResult(context, screen) {
    this.drawResultHalo(context, screen, this.data.isComplete);
    this.reservePointBox(screen, 6);
    const offset = this.getAwayLabelOffset(
      screen,
      this.projectIsometric(this._geometry.plane.center),
      12
    );
    this.drawSmartLabel(
      context,
      'K',
      screen,
      COLORS.result,
      11,
      '800',
      offset
    );
  },

  drawProjectionResult(context, screen, label, highlight, center, labelBounds) {
    this.drawResultHalo(context, screen, highlight);
    this.reservePointBox(screen, 6);
    const offset = this.getAwayLabelOffset(screen, center, 13);
    this.drawSmartLabel(
      context,
      label,
      screen,
      COLORS.result,
      10,
      '800',
      offset,
      labelBounds
    );
  },

  drawResultHalo(context, point, strong) {
    context.save();
    if (strong) {
      context.fillStyle = 'rgba(231, 51, 47, 0.18)';
      context.beginPath();
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#ffffff';
    context.strokeStyle = COLORS.result;
    context.lineWidth = strong ? 3 : 2.2;
    context.beginPath();
    context.arc(point.x, point.y, strong ? 3.5 : 3, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  },

  drawProjectionCorrespondence(context, views, y, origin, unit, color) {
    context.save();
    context.globalAlpha = 1;
    context.strokeStyle = color;
    context.lineWidth = 0.75;
    context.setLineDash([]);
    this.drawLine(context, views.front, views.top);
    this.drawLine(context, views.front, views.left);
    this.drawLine(context, views.top, { x: origin.x, y: views.top.y });
    this.drawLine(context, { x: views.left.x, y: origin.y }, views.left);
    this.drawQuarterTurnForY(context, y, origin, unit);
    context.restore();
  },

  drawAccumulationRing(context, point, label, color) {
    context.save();
    context.strokeStyle = color;
    context.fillStyle = 'rgba(255, 79, 83, 0.16)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
    if (label) {
      this.drawText(context, label, point.x + 10, point.y + 10,
        color, 9, '700');
    }
  },

  drawConstructionPoint(
    context,
    point,
    label,
    lineStart,
    lineEnd,
    center,
    labelBounds,
    viewType,
    labelColor
  ) {
    const lineDx = lineEnd.x - lineStart.x;
    const lineDy = lineEnd.y - lineStart.y;
    const lineLength = Math.hypot(lineDx, lineDy);
    let normalX = lineLength > 1e-6 ? -lineDy / lineLength : 0;
    let normalY = lineLength > 1e-6 ? lineDx / lineLength : -1;
    const outwardX = point.x - center.x;
    const outwardY = point.y - center.y;
    if (normalX * outwardX + normalY * outwardY < 0) {
      normalX *= -1;
      normalY *= -1;
    }
    this.reservePointBox(point, 4);
    context.save();
    context.fillStyle = COLORS.planeAccumulation;
    context.beginPath();
    context.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (viewType === 'top' && (label === '1' || label === '2')) {
      let labelX;
      let align;
      if (label === '1') {
        align = 'right';
        labelX = Math.max(labelBounds.left + 8, point.x - 9);
      } else {
        align = 'left';
        labelX = Math.min(labelBounds.right - 8, point.x + 14);
        if (labelX + 8 > labelBounds.right) align = 'right';
      }
      this.queuePinnedLabel(
        label,
        labelX,
        Math.max(labelBounds.top + 7, point.y - 10),
        COLORS.planeAccumulation,
        10,
        '800',
        align
      );
      return;
    }
    this.drawSmartLabel(
      context,
      label,
      point,
      COLORS.planeAccumulation,
      10,
      '800',
      { x: normalX, y: normalY },
      labelBounds
    );
  },

  viewTypeOfPlane(plane) {
    if (plane === 'V') return 'front';
    if (plane === 'H') return 'top';
    return 'left';
  },

  planeOfViewType(viewType) {
    if (viewType === 'front') return 'V';
    if (viewType === 'top') return 'H';
    return 'W';
  },

  getExtremePair(points) {
    let first = points[0];
    let second = points[1];
    let maximum = -1;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(
          points[i].x - points[j].x,
          points[i].y - points[j].y
        );
        if (distance > maximum) {
          maximum = distance;
          first = points[i];
          second = points[j];
        }
      }
    }
    return { first, second };
  },

  getPointCenter(points) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
  },

  getProjectionLabelBounds(viewType) {
    const layout = this.getLayout();
    const origin = this.getProjectionMetrics().origin;
    const margin = 2;
    if (viewType === 'front') {
      return {
        left: layout.projectionLeft + margin,
        right: origin.x - margin,
        top: layout.projectionTop + 30,
        bottom: origin.y - margin
      };
    }
    if (viewType === 'left') {
      return {
        left: origin.x + margin,
        right: layout.projectionLeft + layout.projectionWidth - margin,
        top: layout.projectionTop + 30,
        bottom: origin.y - margin
      };
    }
    return {
      left: layout.projectionLeft + margin,
      right: origin.x - margin,
      top: origin.y + margin,
      bottom: layout.projectionTop + layout.projectionHeight - margin
    };
  },

  getAwayLabelOffset(point, center, distance) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude <= 1e-6) return { x: distance, y: -distance };
    return {
      x: dx / magnitude * distance,
      y: dy / magnitude * distance
    };
  },

  resetLabelLayout(bounds) {
    this._labelBounds = bounds;
    this._labelBoxes = [];
    this._deferredLabels = [];
  },

  queuePinnedLabel(text, x, y, color, size, weight, align) {
    this._deferredLabels.push({
      text, x, y, color, size, weight, align
    });
  },

  drawDeferredLabels(context) {
    this._deferredLabels.forEach((label) => {
      this.drawPinnedLabel(
        context,
        label.text,
        label.x,
        label.y,
        label.color,
        label.size,
        label.weight,
        label.align
      );
    });
  },

  reservePointBox(point, radius) {
    if (!this._labelBoxes) this._labelBoxes = [];
    const size = Math.max(5, radius || 4);
    this._labelBoxes.push({
      left: point.x - size,
      right: point.x + size,
      top: point.y - size,
      bottom: point.y + size
    });
  },

  drawPinnedLabel(context, text, x, y, color, size, weight, align) {
    const width = Math.max(10, text.length * 6.1);
    const height = size + 3;
    const box = {
      left: align === 'right' ? x - width : x,
      right: align === 'right' ? x : x + width,
      top: y - height / 2,
      bottom: y + height / 2
    };
    this._labelBoxes.push(box);
    this.drawAlignedText(
      context,
      text,
      x,
      y,
      color,
      size,
      weight,
      align
    );
  },

  drawSmartLabel(context, text, point, color, size, weight, preferred, labelBounds) {
    const baseX = preferred && Number.isFinite(preferred.x) ? preferred.x : 1;
    const baseY = preferred && Number.isFinite(preferred.y) ? preferred.y : 0;
    const baseLength = Math.hypot(baseX, baseY) || 1;
    const directions = [];
    [0, 45, -45, 90, -90, 135, -135, 180].forEach((degrees) => {
      const angle = degrees * Math.PI / 180;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      directions.push({
        x: baseX / baseLength * cosine - baseY / baseLength * sine,
        y: baseX / baseLength * sine + baseY / baseLength * cosine
      });
    });
    const distances = [14, 20, 26, 32];
    const width = Math.max(10, text.length * 6.1);
    const height = size + 3;
    const bounds = labelBounds || this._labelBounds || {
      left: 2,
      right: this.canvasWidth - 2,
      top: 2,
      bottom: this.canvasHeight - 2
    };
    let chosen = null;
    directions.some((direction) => distances.some((distance) => {
      const x = point.x + direction.x * distance;
      const y = point.y + direction.y * distance;
      const align = direction.x < -0.15 ? 'right' : 'left';
      const box = {
        left: align === 'right' ? x - width : x,
        right: align === 'right' ? x : x + width,
        top: y - height / 2,
        bottom: y + height / 2
      };
      if (box.left < bounds.left || box.right > bounds.right
        || box.top < bounds.top || box.bottom > bounds.bottom) {
        return false;
      }
      const overlaps = this._labelBoxes.some((occupied) => (
        box.left < occupied.right + 2
        && box.right + 2 > occupied.left
        && box.top < occupied.bottom + 2
        && box.bottom + 2 > occupied.top
      ));
      if (overlaps) return false;
      chosen = { x, y, align, box };
      return true;
    }));
    if (!chosen) {
      const distance = distances[0];
      let align = directions[0].x < -0.15 ? 'right' : 'left';
      let x = point.x + directions[0].x * distance;
      let y = point.y + directions[0].y * distance;
      y = Math.max(bounds.top + height / 2,
        Math.min(bounds.bottom - height / 2, y));
      if (align === 'right' && x - width < bounds.left) {
        align = 'left';
      }
      if (align === 'left' && x + width > bounds.right) {
        align = 'right';
      }
      x = align === 'right'
        ? Math.max(bounds.left + width, Math.min(bounds.right, x))
        : Math.max(bounds.left, Math.min(bounds.right - width, x));
      chosen = {
        x,
        y,
        align,
        box: {
          left: x - width,
          right: x + width,
          top: y - height / 2,
          bottom: y + height / 2
        }
      };
    }
    this._labelBoxes.push(chosen.box);
    this.drawAlignedText(
      context,
      text,
      chosen.x,
      chosen.y,
      color,
      size,
      weight,
      chosen.align
    );
  },

  drawProjectionVertexLabel(context, text, point, color, center, labelBounds, viewType) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy);
    const unitX = distance > 1e-6 ? dx / distance : 0;
    const unitY = distance > 1e-6 ? dy / distance : -1;
    this.reservePointBox(point, 4);
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (viewType === 'front' && text === 'c′') {
      this.queuePinnedLabel(
        text,
        labelBounds.right,
        Math.max(labelBounds.top + 7, point.y - 16),
        color,
        9,
        '800',
        'right'
      );
      return;
    }
    this.drawSmartLabel(
      context,
      text,
      point,
      color,
      9,
      '800',
      { x: unitX, y: unitY },
      labelBounds
    );
  },

  drawPointWithAwayLabel(context, point, label, color, radius, center, labelColor) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy);
    const unitX = distance > 1e-6 ? dx / distance : 1;
    const unitY = distance > 1e-6 ? dy / distance : 0;
    this.reservePointBox(point, radius + 2);
    context.save();
    context.fillStyle = `${color}26`;
    context.beginPath();
    context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    this.drawSmartLabel(
      context,
      label,
      point,
      labelColor || color,
      10,
      '800',
      { x: unitX, y: unitY }
    );
  },

  drawLineEndpointLabel(
    context,
    point,
    otherPoint,
    label,
    color,
    radius,
    center,
    labelBounds,
    viewType,
    labelColor
  ) {
    const lineDx = point.x - otherPoint.x;
    const lineDy = point.y - otherPoint.y;
    const lineLength = Math.hypot(lineDx, lineDy);
    let unitX;
    let unitY;
    if (lineLength > 1e-6) {
      unitX = -lineDy / lineLength;
      unitY = lineDx / lineLength;
      if (unitX * (point.x - center.x) + unitY * (point.y - center.y) < 0) {
        unitX *= -1;
        unitY *= -1;
      }
    } else {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const distance = Math.hypot(dx, dy);
      unitX = distance > 1e-6 ? dx / distance : 1;
      unitY = distance > 1e-6 ? dy / distance : 0;
    }
    this.reservePointBox(point, radius + 2);
    context.save();
    context.fillStyle = `${color}26`;
    context.beginPath();
    context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (viewType === 'front' && label === 'e′') {
      const origin = this.getProjectionMetrics().origin;
      this.queuePinnedLabel(
        label,
        origin.x - 7,
        origin.y - 11,
        labelColor || color,
        10,
        '800',
        'right'
      );
      return;
    }
    if (viewType === 'top' && label === 'e') {
      this.queuePinnedLabel(
        label,
        labelBounds.right,
        Math.max(labelBounds.top + 7, point.y - 8),
        labelColor || color,
        10,
        '800',
        'right'
      );
      return;
    }
    this.drawSmartLabel(
      context,
      label,
      point,
      color,
      10,
      '800',
      { x: unitX, y: unitY },
      labelBounds
    );
  },

  drawSmallLabel(context, text, point, color) {
    context.save();
    context.fillStyle = color;
    context.font = '700 9px sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(text, point.x + 4, point.y - 5);
    context.restore();
  },

  drawAlignedText(context, text, x, y, color, size, weight, align) {
    context.save();
    context.fillStyle = color;
    context.font = `${weight || '400'} ${size || 10}px sans-serif`;
    context.textAlign = align || 'left';
    context.textBaseline = 'middle';
    context.fillText(text, x, y);
    context.restore();
  }
};
