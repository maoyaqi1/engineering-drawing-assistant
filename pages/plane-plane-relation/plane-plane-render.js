// 两平面相交求交线 · Canvas 2D 绘制。
//
// 沿用线面求交点页的空间图 + 第一角三面投影布局，只将求交对象
// 从一个平面与一条直线改成两个平面及其公共交线。
const baseRenderer = require('../line-plane-relation/line-plane-render.js');

const COLORS = {
  background: '#090a0c',
  planeP: 'rgba(53, 195, 200, 0.24)',
  strokeP: '#67e1e5',
  planeQ: 'rgba(245, 171, 55, 0.22)',
  strokeQ: '#f3b74d',
  sectionP: '#33b5bb',
  sectionQ: '#d99725',
  accumulationP: '#ff5c62',
  accumulationQ: '#ffcc5b',
  point: '#e7332f',
  line: '#ff6b57'
};

function getConstructionColor(index) {
  return index === 1 ? '#bda7ff' : '#2f80ed';
}

function getConstructionTraceColor(index) {
  return index === 1 ? '#6d28d9' : '#1769aa';
}

function getConstructionFill(index) {
  return index === 1
    ? 'rgba(140, 102, 232, 0.12)'
    : 'rgba(47, 128, 237, 0.12)';
}

const VIEW_SUFFIX = {
  front: '′',
  top: '',
  left: '″'
};

module.exports = Object.assign({}, baseRenderer, {
  drawScene() {
    if (!this.context || !this.canvasWidth || !this._geometry) return;
    const context = this.context;
    const layout = this.getLayout();
    this._labelBoxes = [];
    context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawPlanePlaneSpatialPanel(context, layout);
    this.drawPlanePlaneProjectionPanels(context, layout);
  },

  drawPlanePlaneSpatialPanel(context, layout) {
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
    this.drawSpatialPlanes(context);
    this.drawSpatialPlaneAccumulations(context);
    this.drawSpatialTwoLinePlaneConstructions(context);
    this.drawSpatialIntersectionPoints(context);
    this.drawSpatialIntersectionLine(context);
    this.drawText(context, '面面相交求交线', 12, 22, '#d9dde4', 11, '700');
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

  drawSpatialPlanes(context) {
    [
      {
        geometry: this._geometry.planeP,
        fill: COLORS.planeP,
        stroke: COLORS.strokeP,
        labels: ['A', 'B', 'C'],
        colors: ['#ff8b8e', '#75a9ff', '#ffd166']
      },
      {
        geometry: this._geometry.planeQ,
        fill: COLORS.planeQ,
        stroke: COLORS.strokeQ,
        labels: ['E', 'F', 'G'],
        colors: ['#f7a2bd', '#e786eb', '#d6adff']
      }
    ].forEach((entry) => {
      const screenPoints = entry.geometry.patch.map(
        (point) => this.projectIsometric(point)
      );
      this.drawPolygon(context, screenPoints, entry.fill, entry.stroke, 2.2);
      const center = this.projectIsometric(entry.geometry.center);
      entry.geometry.vertices.forEach((point, index) => {
        this.drawPointWithAwayLabel(
          context,
          this.projectIsometric(point),
          entry.labels[index],
          entry.colors[index],
          2.3,
          center
        );
      });
    });
  },

  drawSpatialPlaneAccumulations(context) {
    if (this.data.appliedStep < 1) return;
    const geometry = this._geometry;
    [
      {
        plane: geometry.planeP,
        view: geometry.accumulationP,
        label: 'ABC 积聚',
        color: COLORS.accumulationP
      },
      {
        plane: geometry.planeQ,
        view: geometry.accumulationQ,
        label: 'EFG 积聚',
        color: COLORS.accumulationQ
      }
    ].forEach((entry) => {
      if (!entry.view) return;
      const points = entry.plane.vertices.map((point) => (
        this.projectIsometric({
          x: entry.view === 'W' ? 0 : point.x,
          y: entry.view === 'H' ? point.y : 0,
          z: entry.view === 'V' ? point.z : 0
        })
      ));
      const extremes = this.getExtremePair(points);
      context.save();
      context.strokeStyle = entry.color;
      context.lineWidth = 2.8;
      context.setLineDash([]);
      this.drawLine(context, extremes.first, extremes.second);
      context.restore();
      this.drawSmartLabel(
        context,
        entry.label,
        extremes.second,
        entry.color,
        9,
        '700',
        { x: 1, y: -1 }
      );
    });
  },

  drawSpatialIntersectionPoints(context) {
    if (this.data.methodKind === 'twoLinePlane') return;
    if (this.data.appliedStep < 2 || this._geometry.commonPoints.length < 2) {
      return;
    }
    const points = this._geometry.commonPoints;
    points.forEach((point, index) => {
      const screen = this.projectIsometric(point);
      this.drawResultHalo(context, screen, false);
      this.drawSmartLabel(
        context,
        String(index + 1),
        screen,
        COLORS.point,
        10,
        '800',
        { x: index === 0 ? -1 : 1, y: -1 }
      );
    });
  },

  drawSpatialTwoLinePlaneConstructions(context) {
    if (this.data.methodKind !== 'twoLinePlane'
      || this.data.appliedStep < 1) {
      return;
    }
    this._geometry.lineIntersections.forEach((construction) => {
      if (construction.index > this.data.appliedStep) return;
      const isActive = construction.index === this.data.appliedStep;
      const isFinal = this.data.appliedStep >= 3;
      const alpha = isFinal ? 0.34 : (isActive ? 1 : 0.5);
      const constructionColor = getConstructionColor(construction.index);
      const corners = construction.auxiliaryPlane.curtainCorners.map(
        (point) => this.projectIsometric(point)
      );
      context.save();
      context.globalAlpha = alpha;
      this.drawPolygon(
        context,
        corners,
        getConstructionFill(construction.index),
        constructionColor,
        1.3
      );
      const topCorner = corners.reduce(
        (top, point) => (point.y < top.y ? point : top),
        corners[0]
      );
      this.drawSmartLabel(
        context,
        construction.auxiliaryPlane.label,
        topCorner,
        constructionColor,
        9,
        '800',
        { x: construction.index === 1 ? -1 : 1, y: -1 }
      );
      context.restore();
      const sectionStart = this.projectIsometric(
        construction.sectionLine.start
      );
      const sectionEnd = this.projectIsometric(
        construction.sectionLine.end
      );
      context.save();
      context.globalAlpha = alpha;
      context.strokeStyle = 'rgba(255,255,255,0.78)';
      context.lineWidth = 3.6;
      context.setLineDash([]);
      this.drawLine(context, sectionStart, sectionEnd);
      context.strokeStyle = constructionColor;
      context.lineWidth = 2;
      this.drawLine(context, sectionStart, sectionEnd);
      this.drawPoint(
        context,
        sectionStart,
        constructionColor,
        1.8,
        ''
      );
      this.drawPoint(
        context,
        sectionEnd,
        constructionColor,
        1.8,
        ''
      );
      context.restore();
      const start = this.projectIsometric(construction.line.e);
      const end = this.projectIsometric(construction.line.f);
      context.save();
      context.globalAlpha = alpha;
      context.strokeStyle = 'rgba(255,255,255,0.86)';
      context.lineWidth = 4.2;
      context.setLineDash([]);
      this.drawLine(context, start, end);
      context.strokeStyle = construction.ownerName === 'P'
        ? COLORS.sectionP
        : COLORS.sectionQ;
      context.lineWidth = 2.8;
      this.drawLine(context, start, end);
      context.restore();
      context.save();
      const screen = this.projectIsometric(construction.point);
      this.drawResultHalo(context, screen, false);
      this.drawSmartLabel(
        context,
        construction.index === 1 ? 'K' : 'E',
        screen,
        COLORS.point,
        10,
        '800',
        {
          x: construction.point.x < this._geometry.planeP.center.x ? -1 : 1,
          y: -1
        }
      );
      context.restore();
    });
  },

  drawSpatialIntersectionLine(context) {
    if (this.data.appliedStep < 3 || this._geometry.commonPoints.length < 2) {
      return;
    }
    const start = this.projectIsometric(this._geometry.commonPoints[0]);
    const end = this.projectIsometric(this._geometry.commonPoints[1]);
    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.lineWidth = 5;
    context.setLineDash([]);
    this.drawLine(context, start, end);
    context.strokeStyle = COLORS.line;
    context.lineWidth = 3.2;
    this.drawLine(context, start, end);
    context.restore();
    this.drawSmartLabel(
      context,
      'L',
      { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      COLORS.line,
      11,
      '800',
      { x: 1, y: -1 }
    );
  },

  drawPlanePlaneProjectionPanels(context, layout) {
    this._projectionAccumulationLabels = [];
    this.resetLabelLayout({
      left: layout.projectionLeft + 4,
      right: layout.projectionLeft + layout.projectionWidth - 4,
      top: layout.projectionTop + 28,
      bottom: layout.projectionTop + layout.projectionHeight - 4
    });
    const metrics = this.getProjectionMetrics();
    const origin = metrics.origin;
    this.reserveProjectionAxisAreas(layout, origin);
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
    this.drawText(context, '三面投影 · 两平面交线',
      layout.projectionLeft + 12, layout.projectionTop + 20,
      '#3b4654', 11, '700');

    const planeViews = {
      P: this.projectPlaneViews(this._geometry.planeP),
      Q: this.projectPlaneViews(this._geometry.planeQ)
    };
    ['front', 'top', 'left'].forEach((viewType) => {
      this.drawPolygon(
        context,
        planeViews.P[viewType],
        viewType === 'front'
          ? 'rgba(223, 87, 87, 0.08)'
          : (viewType === 'top'
            ? 'rgba(67, 166, 108, 0.08)'
            : 'rgba(55, 121, 208, 0.08)'),
        COLORS.strokeP,
        1.4
      );
      this.drawPolygon(
        context,
        planeViews.Q[viewType],
        viewType === 'front'
          ? 'rgba(223, 87, 87, 0.06)'
          : (viewType === 'top'
            ? 'rgba(67, 166, 108, 0.06)'
            : 'rgba(55, 121, 208, 0.06)'),
        COLORS.strokeQ,
        1.4
      );
      this.drawTriangleProjectionLabels(
        context,
        viewType,
        this._geometry.planeP.vertices,
        ['a', 'b', 'c'],
        ['#d94d51', '#3b72b7', '#ca851d']
      );
      this.drawTriangleProjectionLabels(
        context,
        viewType,
        this._geometry.planeQ.vertices,
        ['e', 'f', 'g'],
        ['#c4547c', '#a65ab6', '#8064bd']
      );
    });
    this.drawProjectionAccumulations(context, planeViews);
    this.drawProjectionTwoLinePlaneConstructions(context);
    this.drawProjectionIntersection(context);
    this.drawDeferredLabels(context);
    this._projectionAccumulationLabels.forEach((label) => {
      this.drawSmartLabel(
        context,
        label.text,
        label.point,
        label.color,
        9,
        '700',
        label.preferred,
        label.bounds
      );
    });
    this.drawText(context, 'V', layout.projectionLeft + 17,
      layout.projectionTop + 47, '#df5757', 13, '700');
    this.drawText(context, 'W',
      layout.projectionLeft + layout.projectionWidth - 17,
      layout.projectionTop + 47, '#3779d0', 13, '700');
    this.drawText(context, 'H', layout.projectionLeft + 17,
      layout.projectionTop + layout.projectionHeight - 20,
      '#43a66c', 13, '700');
    context.restore();
  },

  projectPlaneViews(plane) {
    return {
      front: plane.patch.map(
        (point) => this.getProjectionScreenPoints(point).front
      ),
      top: plane.patch.map(
        (point) => this.getProjectionScreenPoints(point).top
      ),
      left: plane.patch.map(
        (point) => this.getProjectionScreenPoints(point).left
      )
    };
  },

  drawTriangleProjectionLabels(
    context,
    viewType,
    vertices,
    labels,
    colors
  ) {
    const points = vertices.map(
      (point) => this.getProjectionScreenPoints(point)[viewType]
    );
    const center = this.getPointCenter(points);
    points.forEach((point, index) => {
      this.reservePointBox(point, 3);
      context.save();
      context.fillStyle = colors[index];
      context.beginPath();
      context.arc(point.x, point.y, 1.9, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
    points.forEach((point, index) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const distance = Math.hypot(dx, dy);
      const preferred = {
        x: distance > 1e-6 ? dx / distance : 1,
        y: distance > 1e-6 ? dy / distance : -1
      };
      if (labels[index] === 'a' && viewType === 'top') {
        preferred.x = 0;
        preferred.y = -1;
      }
      const beforeCount = this._labelBoxes.length;
      this.drawSmartLabel(
        context,
        `${labels[index]}${VIEW_SUFFIX[viewType]}`,
        point,
        colors[index],
        9,
        '800',
        preferred,
        this.getProjectionLabelBounds(viewType)
      );
      const labelBox = this._labelBoxes[this._labelBoxes.length - 1];
      if (labelBox && this._labelBoxes.length > beforeCount) {
        this.drawProjectionLabelLeader(
          context,
          point,
          labelBox,
          colors[index]
        );
      }
    });
  },

  reserveProjectionAxisAreas(layout, origin) {
    this._labelBoxes.push({
      left: origin.x - 2,
      right: origin.x + 2,
      top: layout.projectionTop + 24,
      bottom: layout.projectionTop + layout.projectionHeight - 4
    });
    this._labelBoxes.push({
      left: layout.projectionLeft + 4,
      right: layout.projectionLeft + layout.projectionWidth - 4,
      top: origin.y - 2,
      bottom: origin.y + 2
    });
  },

  drawProjectionLabelLeader(context, point, box, color) {
    const target = {
      x: Math.max(box.left, Math.min(box.right, point.x)),
      y: Math.max(box.top, Math.min(box.bottom, point.y))
    };
    if (Math.hypot(target.x - point.x, target.y - point.y) <= 2.5) {
      return;
    }
    context.save();
    context.globalAlpha = 0.58;
    context.strokeStyle = color;
    context.lineWidth = 0.65;
    context.setLineDash([]);
    this.drawLine(context, point, target);
    context.restore();
  },

  drawProjectionPointLinks(context, point, color, index, total) {
    const views = this.getProjectionScreenPoints(point);
    const metrics = this.getProjectionMetrics();
    const origin = metrics.origin;
    const rankOffset = (index - (total - 1) / 2) * 2.4;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.setLineDash([]);
    this.drawLine(context, views.front, views.top);
    this.drawLine(context, views.front, views.left);
    this.drawLine(context, views.top, {
      x: origin.x,
      y: views.top.y + rankOffset
    });
    this.drawLine(context, {
      x: views.left.x,
      y: origin.y + rankOffset
    }, views.left);
    const radius = Math.max(8, Math.abs(point.y * metrics.unit))
      + rankOffset;
    context.beginPath();
    context.arc(origin.x, origin.y, Math.max(5, radius), 0, Math.PI / 2);
    context.stroke();
    context.restore();
  },

  drawProjectionAccumulations(context, planeViews) {
    if (this.data.appliedStep < 1) return;
    [
      {
        view: this._geometry.accumulationP,
        views: planeViews.P,
        label: 'ABC 积聚',
        color: COLORS.accumulationP
      },
      {
        view: this._geometry.accumulationQ,
        views: planeViews.Q,
        label: 'EFG 积聚',
        color: COLORS.accumulationQ
      }
    ].forEach((entry) => {
      if (!entry.view) return;
      const viewType = this.viewTypeOfPlane(entry.view);
      const extremes = this.getExtremePair(entry.views[viewType]);
      context.save();
      context.strokeStyle = entry.color;
      context.lineWidth = 2.8;
      context.setLineDash([]);
      this.drawLine(context, extremes.first, extremes.second);
      context.restore();
      const commonViews = this._geometry.commonPoints.map(
        (point) => this.getProjectionScreenPoints(point)[viewType]
      );
      const distanceFromPoints = (point) => Math.min(
        ...commonViews.map((common) => Math.hypot(
          point.x - common.x,
          point.y - common.y
        ))
      );
      const anchor = distanceFromPoints(extremes.first)
        >= distanceFromPoints(extremes.second)
        ? extremes.first
        : extremes.second;
      const center = this.getPointCenter([extremes.first, extremes.second]);
      this._projectionAccumulationLabels.push({
        text: entry.label,
        point: anchor,
        color: entry.color,
        preferred: {
          x: anchor.x >= center.x ? 1 : -1,
          y: anchor.y >= center.y ? 1 : -1
        },
        bounds: this.getProjectionLabelBounds(viewType)
      });
    });
  },

  drawProjectionTwoLinePlaneConstructions(context) {
    if (this.data.methodKind !== 'twoLinePlane'
      || this.data.appliedStep < 1) {
      return;
    }
    const allViews = ['front', 'top', 'left'];
    this._geometry.lineIntersections.forEach((construction) => {
      if (construction.index > this.data.appliedStep) return;
      const isActive = construction.index === this.data.appliedStep;
      const isFinal = this.data.appliedStep >= 3;
      const alpha = isFinal ? 0.34 : (isActive ? 1 : 0.5);
      const constructionColor = getConstructionColor(construction.index);
      const traceColor = getConstructionTraceColor(construction.index);
      const trace = construction.auxiliaryPlane.trace;
      if (trace) {
        const traceView = this.viewTypeOfPlane(trace.projectionPlane);
        const traceStart = this.getProjectionScreenPoints(
          trace.start
        )[traceView];
        const traceEnd = this.getProjectionScreenPoints(
          trace.end
        )[traceView];
        context.save();
        context.globalAlpha = Math.max(alpha, 0.55);
        context.strokeStyle = traceColor;
        context.lineWidth = 2.2;
        context.setLineDash([]);
        this.drawLine(context, traceStart, traceEnd);
        this.drawTraceEndCaps(
          context,
          traceStart,
          traceEnd,
          traceColor,
          11,
          4
        );
        context.restore();
        this.drawSmartLabel(
          context,
          trace.label,
          traceStart,
          traceColor,
          8.5,
          '800',
          { x: -1, y: -1 },
          this.getProjectionLabelBounds(traceView)
        );
      }
      const sectionStartViews = this.getProjectionScreenPoints(
        construction.sectionLine.start
      );
      const sectionEndViews = this.getProjectionScreenPoints(
        construction.sectionLine.end
      );
      allViews.forEach((viewType) => {
        context.save();
        context.globalAlpha = Math.max(alpha, 0.5);
        context.strokeStyle = constructionColor;
        context.lineWidth = 1.6;
        context.setLineDash([]);
        this.drawLine(
          context,
          sectionStartViews[viewType],
          sectionEndViews[viewType]
        );
        context.restore();
      });
      const sectionPoints = [
        construction.sectionLine.start,
        construction.sectionLine.end
      ];
      sectionPoints.forEach((point, pointIndex) => {
        const color = constructionColor;
        allViews.forEach((viewType) => {
          this.drawPoint(
            context,
            this.getProjectionScreenPoints(point)[viewType],
            color,
            1.8,
            ''
          );
        });
        context.save();
        context.globalAlpha = Math.max(alpha, 0.58);
        this.drawProjectionPointLinks(
          context,
          point,
          color,
          pointIndex,
          2
        );
        context.restore();
      });
      const startViews = this.getProjectionScreenPoints(construction.line.e);
      const endViews = this.getProjectionScreenPoints(construction.line.f);
      allViews.forEach((viewType) => {
        context.save();
        context.globalAlpha = alpha;
        context.strokeStyle = construction.ownerName === 'P'
          ? '#238e94'
          : '#b97706';
        context.lineWidth = 2.4;
        context.setLineDash([]);
        this.drawLine(
          context,
          startViews[viewType],
          endViews[viewType]
        );
        context.restore();
      });
      const pointViews = this.getProjectionScreenPoints(construction.point);
      context.save();
      allViews.forEach((viewType) => {
        const viewCenter = this.getProjectionScreenPoints(
          this._geometry.planeP.center
        )[viewType];
        this.drawProjectionResult(
          context,
          pointViews[viewType],
          `${construction.index === 1 ? 'k' : 'e'}${VIEW_SUFFIX[viewType]}`,
          false,
          viewCenter,
          this.getProjectionLabelBounds(viewType)
        );
      });
      context.restore();
      this.drawProjectionPointLinks(
        context,
        construction.point,
        construction.index === 1 ? '#a27b36' : '#c06b62',
        construction.index - 1,
        2
      );
    });
  },

  drawProjectionIntersection(context) {
    const points = this._geometry.commonPoints;
    if (points.length < 2 || this.data.appliedStep < 2) return;
    const startViews = this.getProjectionScreenPoints(points[0]);
    const endViews = this.getProjectionScreenPoints(points[1]);
    const allViews = ['front', 'top', 'left'];
    if (this.data.methodKind !== 'twoLinePlane') {
      const correspondenceColors = ['#a27b36', '#c06b62'];
      points.forEach((point, index) => {
        this.drawProjectionPointLinks(
          context,
          point,
          correspondenceColors[index],
          index,
          points.length
        );
      });
    }
    allViews.forEach((viewType) => {
      const suffix = VIEW_SUFFIX[viewType];
      if (this.data.methodKind !== 'twoLinePlane') {
        this.drawProjectionResult(
          context,
          startViews[viewType],
          `1${suffix}`,
          this.data.isComplete,
          this.getProjectionMetrics().origin,
          this.getProjectionLabelBounds(viewType)
        );
        this.drawProjectionResult(
          context,
          endViews[viewType],
          `2${suffix}`,
          this.data.isComplete,
          this.getProjectionMetrics().origin,
          this.getProjectionLabelBounds(viewType)
        );
      }
      if (this.data.appliedStep >= 3) {
        context.save();
        context.strokeStyle = COLORS.line;
        context.lineWidth = 2.7;
        context.setLineDash([]);
        this.drawLine(context, startViews[viewType], endViews[viewType]);
        context.restore();
        const middle = {
          x: (startViews[viewType].x + endViews[viewType].x) / 2,
          y: (startViews[viewType].y + endViews[viewType].y) / 2
        };
        this.drawSmartLabel(
          context,
          `l${suffix}`,
          middle,
          COLORS.line,
          10,
          '800',
          { x: 1, y: -1 },
          this.getProjectionLabelBounds(viewType)
        );
      }
    });
  }
});
