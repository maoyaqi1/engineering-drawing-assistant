// 两直线位置关系 Canvas 2D 绘制。
//
// 只消费端点真值和纯模型判定结果；空间图与三视图共用现有第一角投影映射。
(function () {
  const helpers = require('../index/draw-helpers.js');
  const model = require('./two-line-position-model.js');

  const COLORS = Object.freeze({
    spaceBackground: '#090a0c',
    axis: '#aeb5be',
    planeV: 'rgba(52, 132, 246, 0.22)',
    planeW: 'rgba(245, 196, 55, 0.20)',
    planeH: 'rgba(50, 184, 110, 0.22)',
    line1: '#ff9d2e',
    line2: '#4f82e8',
    intersection: '#48c774',
    ray: '#737b86',
    text: '#26384d',
    muted: '#718196',
    panel: '#ffffff',
    guide: '#c4cad1'
  });

  const VIEW_LABELS = Object.freeze({
    front: 'V',
    top: 'H',
    left: 'W'
  });

  const VIEW_SUFFIXES = Object.freeze({
    front: '′',
    top: '',
    left: '″'
  });

  function drawLine(context, start, end, color, width, dash) {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width || 1;
    context.setLineDash(dash || []);
    helpers.drawLine(context, start, end);
    context.restore();
  }

  function drawPoint(context, screen, color, label, radius) {
    helpers.drawPoint(context, screen, color, radius || 4.2, label || '');
  }

  function drawProjectionPoint(
    context,
    screen,
    color,
    label,
    radius,
    offset,
    layout
  ) {
    drawPoint(context, screen, color, '', radius);
    const labelOffset = offset || { x: 6, y: -8 };
    const minX = layout.projectionLeft + 5;
    const maxX = layout.projectionLeft + layout.projectionWidth - 30;
    const minY = layout.projectionTop + 32;
    const maxY = layout.projectionTop + layout.projectionHeight - 5;
    const labelX = Math.max(minX, Math.min(maxX, screen.x + labelOffset.x));
    const labelY = Math.max(minY, Math.min(maxY, screen.y + labelOffset.y));
    context.save();
    context.font = '700 10px sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    context.lineWidth = 3;
    if (context.strokeText) context.strokeText(label, labelX, labelY);
    context.fillStyle = COLORS.text;
    context.fillText(label, labelX, labelY);
    context.restore();
  }

  function drawText(context, value, x, y, color, size, weight) {
    helpers.drawText(context, value, x, y, color, size, weight);
  }

  function drawAlignedText(context, value, x, y, color, size, align) {
    context.save();
    context.fillStyle = color;
    context.font = `700 ${size}px sans-serif`;
    context.textAlign = align || 'left';
    context.textBaseline = 'middle';
    context.fillText(value, x, y);
    context.restore();
  }

  function drawCornerLabel(context, value, point, color, offset, align) {
    context.save();
    context.fillStyle = color;
    context.font = '800 10px sans-serif';
    context.textAlign = align || 'left';
    context.textBaseline = 'middle';
    context.fillText(value, point.x + offset.x, point.y + offset.y);
    context.restore();
  }

  function drawHollowPoint(context, point, color, radius) {
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, radius || 4, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  function drawIsoPlanes(context, page, layout) {
    const span = 8.8;
    const origin = page.projectIsometric({ x: 0, y: 0, z: 0 });
    const xPoint = page.projectIsometric({ x: span, y: 0, z: 0 });
    const yPoint = page.projectIsometric({ x: 0, y: span, z: 0 });
    const zPoint = page.projectIsometric({ x: 0, y: 0, z: span });
    const xyPoint = page.projectIsometric({ x: span, y: span, z: 0 });
    const xzPoint = page.projectIsometric({ x: span, y: 0, z: span });
    const yzPoint = page.projectIsometric({ x: 0, y: span, z: span });

    helpers.drawPolygon(
      context,
      [origin, xPoint, xyPoint, yPoint],
      COLORS.planeH,
      '#37b974',
      1.1
    );
    helpers.drawPolygon(
      context,
      [origin, xPoint, xzPoint, zPoint],
      COLORS.planeV,
      '#347ff0',
      1.1
    );
    helpers.drawPolygon(
      context,
      [origin, yPoint, yzPoint, zPoint],
      COLORS.planeW,
      '#e5bb38',
      1.1
    );

    [
      { point: { x: 9, y: 0, z: 0 }, label: 'X' },
      { point: { x: 0, y: 9, z: 0 }, label: 'Y' },
      { point: { x: 0, y: 0, z: 10 }, label: 'Z' }
    ].forEach((axis) => {
      const end = page.projectIsometric(axis.point);
      helpers.drawArrow(context, origin, end, COLORS.axis);
      drawText(
        context,
        axis.label,
        end.x + (axis.label === 'Z' ? 9 : 3),
        end.y + (axis.label === 'Z' ? 9 : -4),
        '#e3e5e8',
        10,
        '600'
      );
    });
    drawText(context, '空间两直线及三面投影', 12, 22, '#d9dde4', 11, '600');
    // 面名贴在三块投影面各自的外角，偏移方向朝向面内，避开边框和图形。
    drawCornerLabel(context, 'V', xzPoint, '#78b7ff', { x: 8, y: 12 }, 'left');
    drawCornerLabel(context, 'W', yzPoint, '#f2d36c', { x: -8, y: 12 }, 'right');
    drawCornerLabel(context, 'H', yPoint, '#6ed59a', { x: -8, y: -8 }, 'right');
  }

  function projectToPlane(point, viewType) {
    if (viewType === 'front') return { x: point.x, y: 0, z: point.z };
    if (viewType === 'top') return { x: point.x, y: point.y, z: 0 };
    return { x: 0, y: point.y, z: point.z };
  }

  function drawSpaceLines(context, page, layout, relation) {
    const lines = page.data.lines;
    const lineEntries = [
      { line: lines.line1, color: COLORS.line1, startLabel: 'A', endLabel: 'B' },
      { line: lines.line2, color: COLORS.line2, startLabel: 'C', endLabel: 'D' }
    ];
    ['front', 'top', 'left'].forEach((viewType) => {
      lineEntries.forEach((entry) => {
        const start = page.projectIsometric(projectToPlane(entry.line.start, viewType));
        const end = page.projectIsometric(projectToPlane(entry.line.end, viewType));
        context.save();
        context.globalAlpha = 0.92;
        drawLine(context, start, end, entry.color, 1.6);
        context.restore();
      });
    });

    lineEntries.forEach((entry) => {
      const start = page.projectIsometric(entry.line.start);
      const end = page.projectIsometric(entry.line.end);
      drawLine(context, start, end, entry.color, 3);
      if (relation.kind === 'parallel') {
        const sx = start.x + (end.x - start.x) * 0.78;
        const sy = start.y + (end.y - start.y) * 0.78;
        helpers.drawArrow(context, { x: sx, y: sy }, end, entry.color);
      }
      drawPoint(context, start, entry.color, '', 4.2);
      drawPoint(context, end, entry.color, '', 4.2);
    });

    if (relation.intersection) {
      const point = page.projectIsometric(relation.intersection);
      drawPoint(context, point, COLORS.intersection, 'P', 4.5);
    }

    const judgementLabel = page.data.judgementTitle || '平行判断';
    let positionLabel = '一般位置直线';
    if (page.data.positionMode === 'special') {
      positionLabel = page.data.selectedJudgement === 'intersect'
        ? '特殊位置 · 水平线与正平线'
        : '特殊位置 · 侧平线';
    }
    drawText(
      context,
      `${judgementLabel} · ${positionLabel}`,
      12,
      layout.topHeight - 12,
      '#dfe4ea',
      9.5,
      '650'
    );
  }

  function viewPointLabel(label, viewType) {
    return `${String(label).toLowerCase()}${VIEW_SUFFIXES[viewType]}`;
  }

  function viewCoordinateToScreen(page, point) {
    const metrics = page.getProjectionMetrics();
    return {
      x: metrics.origin.x - point.x * metrics.unit,
      y: metrics.origin.y - point.y * metrics.unit
    };
  }

  function drawProjectionConnections(context, page, relation) {
    const metrics = page.getProjectionMetrics();
    const points = [
      page.data.lines.line1.start,
      page.data.lines.line1.end,
      page.data.lines.line2.start,
      page.data.lines.line2.end
    ];
    if (relation.intersection) points.push(relation.intersection);
    points.forEach((point) => {
      const views = page.getProjectionScreenPoints(point);
      drawLine(context, views.front, views.top, COLORS.guide, 0.65);
      drawLine(context, views.front, views.left, COLORS.guide, 0.65);
      drawLine(
        context,
        views.top,
        { x: metrics.origin.x, y: views.top.y },
        COLORS.guide,
        0.65
      );
      drawLine(
        context,
        { x: views.left.x, y: metrics.origin.y },
        views.left,
        COLORS.guide,
        0.65
      );
      helpers.drawQuarterTurnForY(
        context,
        point.y,
        metrics.origin,
        metrics.unit
      );
    });
  }

  function drawProjectionLines(context, page, layout, relation) {
    const metrics = page.getProjectionMetrics();
    const views = ['front', 'top', 'left'];
    const projectedRelations = relation.projectedRelations
      || model.projectedRelationLines(page.data.lines);
    const lineEntries = [
      {
        line: page.data.lines.line1,
        color: COLORS.line1,
        labels: ['A', 'B'],
        offsets: [{ x: -13, y: -8 }, { x: 6, y: 10 }]
      },
      {
        line: page.data.lines.line2,
        color: COLORS.line2,
        labels: ['C', 'D'],
        offsets: [{ x: 6, y: -8 }, { x: -13, y: 10 }]
      }
    ];

    drawProjectionConnections(context, page, relation);

    views.forEach((viewType) => {
      const isCoincident = projectedRelations[viewType]
        && projectedRelations[viewType].kind === 'coincident';
      lineEntries.forEach((entry, index) => {
        const start = page.getProjectionScreenPoints(entry.line.start)[viewType];
        const end = page.getProjectionScreenPoints(entry.line.end)[viewType];
        drawLine(
          context,
          start,
          end,
          entry.color,
          isCoincident ? (index === 0 ? 3 : 2) : 2.4,
          isCoincident && index === 1 ? [7, 4] : []
        );
        drawProjectionPoint(
          context,
          start,
          entry.color,
          viewPointLabel(entry.labels[0], viewType),
          3.8,
          entry.offsets[0],
          layout
        );
        drawProjectionPoint(
          context,
          end,
          entry.color,
          viewPointLabel(entry.labels[1], viewType),
          3.8,
          entry.offsets[1],
          layout
        );
      });
      if (relation.intersection) {
        const projected = page.getProjectionScreenPoints(relation.intersection)[viewType];
        drawProjectionPoint(
          context,
          projected,
          COLORS.intersection,
          viewPointLabel('P', viewType),
          3.7,
          { x: 7, y: -8 },
          layout
        );
      }
      if (relation.kind === 'skew') {
        const projected = projectedRelations[viewType];
        if (projected && projected.kind === 'intersect' && projected.intersection) {
          drawHollowPoint(
            context,
            viewCoordinateToScreen(page, projected.intersection),
            '#d18a49',
            3.8
          );
        }
      }
    });

    const projectionRight = layout.projectionLeft + layout.projectionWidth;
    const projectionBottom = layout.projectionTop + layout.projectionHeight;
    const viewPositions = {
      front: {
        x: layout.projectionLeft + 14,
        y: layout.projectionTop + 44,
        align: 'left'
      },
      top: {
        x: layout.projectionLeft + 14,
        y: projectionBottom - 12,
        align: 'left'
      },
      left: {
        x: projectionRight - 14,
        y: layout.projectionTop + 44,
        align: 'right'
      }
    };
    views.forEach((viewType) => {
      const projectedKind = projectedRelations[viewType]
        && projectedRelations[viewType].kind;
      const isParallel = projectedKind === 'parallel';
      const isCoincident = projectedKind === 'coincident';
      const isApparentIntersection = relation.kind === 'skew'
        && projectedKind === 'intersect';
      const position = viewPositions[viewType];
      drawAlignedText(
        context,
        VIEW_LABELS[viewType],
        position.x,
        position.y,
        isParallel
          ? '#2d7d51'
          : (isCoincident
            ? '#b66e32'
            : (isApparentIntersection ? '#b66e32' : COLORS.muted)),
        8.8,
        position.align
      );
    });
  }

  function drawProjectionFrame(context, page, layout) {
    const origin = layout.projectionOrigin;
    const judgementLabel = page.data.judgementTitle || '平行判断';
    drawText(
      context,
      `第一角三视图 · ${judgementLabel}`,
      layout.projectionLeft + 12,
      layout.projectionTop + 22,
      COLORS.text,
      11,
      '650'
    );
    drawLine(
      context,
      { x: layout.projectionLeft + 10, y: origin.y },
      { x: layout.projectionLeft + layout.projectionWidth - 10, y: origin.y },
      '#777d85',
      1
    );
    drawLine(
      context,
      { x: origin.x, y: layout.projectionTop },
      { x: origin.x, y: layout.projectionTop + layout.projectionHeight - 18 },
      '#777d85',
      1
    );
    drawText(context, 'Z', origin.x + 8, layout.projectionTop + 8,
      '#525861', 10, '600');
    drawText(context, 'X', layout.projectionLeft + 8, origin.y - 5,
      '#525861', 10, '600');
    drawText(context, 'Y_H', origin.x + 5,
      layout.projectionTop + layout.projectionHeight - 10,
      '#525861', 10, '600');
    drawText(context, 'Y_W', layout.projectionLeft + layout.projectionWidth - 25,
      origin.y - 5, '#525861', 9, '600');
  }

  function drawScene(context, page) {
    const layout = page.getLayout();
    const relation = page._relation || model.classify(page.data.lines);
    context.clearRect(0, 0, page.canvasWidth, page.canvasHeight);

    context.save();
    context.beginPath();
    context.rect(0, 0, layout.leftWidth, layout.topHeight);
    context.fillStyle = COLORS.spaceBackground;
    context.fill();
    context.clip();
    drawIsoPlanes(context, page, layout);
    drawSpaceLines(context, page, layout, relation);
    context.restore();

    context.save();
    context.fillStyle = COLORS.panel;
    context.fillRect(
      layout.projectionLeft,
      layout.projectionTop,
      layout.projectionWidth,
      layout.projectionHeight
    );
    if (layout.split) {
      drawLine(
        context,
        { x: layout.leftWidth, y: 0 },
        { x: layout.leftWidth, y: page.canvasHeight },
        '#31343a',
        1.5
      );
    } else {
      drawLine(
        context,
        { x: 0, y: layout.dividerY },
        { x: page.canvasWidth, y: layout.dividerY },
        '#31343a',
        1.5
      );
    }
    drawProjectionFrame(context, page, layout);
    drawProjectionLines(context, page, layout, relation);
    context.restore();
  }

  module.exports = {
    COLORS,
    VIEW_LABELS,
    VIEW_SUFFIXES,
    drawScene
  };
})();
