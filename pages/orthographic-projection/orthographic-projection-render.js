// 正投影 Canvas 2D 绘制。
//
// 本文件只把 orthographic-projection-model.js 返回的空间点和投影点映射到
// 画布，不保存几何真值，也不自行推断真实性、积聚性或相似性。
(function () {
  const model = require('./orthographic-projection-model.js');
  const HORIZONTAL_FACTOR = 0.72;
  const DEPTH_FACTOR = 0.38;
  const RELATION_PLANE_BOUNDS = Object.freeze({
    minX: 0.2,
    maxX: 6.8,
    minY: 0.2,
    maxY: 5.8
  });

  const COLORS = Object.freeze({
    background: '#f7fbff',
    grid: 'rgba(92, 168, 224, 0.2)',
    planeFill: 'rgba(128, 205, 246, 0.42)',
    planeStroke: '#58a9df',
    planeLabel: '#17628f',
    objectFill: 'rgba(35, 112, 210, 0.2)',
    objectStroke: '#1f6fc6',
    objectLabel: '#0e4f91',
    projectionFill: 'rgba(238, 82, 96, 0.22)',
    projectionStroke: '#e95560',
    projectionLabel: '#b52837',
    ray: '#e6a13d',
    rayLabel: '#a56614',
    text: '#183e63',
    muted: '#647e95',
    panel: '#fbfdff',
    panelStroke: '#d7e9f7'
  });

  function getDrawHelpers() {
    return require('../index/draw-helpers.js');
  }

  function rawToCanvas(point) {
    return {
      x: (point.y - point.x) * HORIZONTAL_FACTOR,
      y: (point.x + point.y) * DEPTH_FACTOR - point.z
    };
  }

  function createViewport(points, rect) {
    const source = Array.isArray(points) && points.length
      ? points
      : [{ x: 0, y: 0, z: 0 }];
    const raw = source.map(rawToCanvas);
    const minX = Math.min.apply(null, raw.map((point) => point.x));
    const maxX = Math.max.apply(null, raw.map((point) => point.x));
    const minY = Math.min.apply(null, raw.map((point) => point.y));
    const maxY = Math.max.apply(null, raw.map((point) => point.y));
    const innerWidth = Math.max(1, rect.width - 18);
    const innerHeight = Math.max(1, rect.height - 18);
    const unit = Math.max(0.1, Math.min(
      innerWidth / Math.max(1, maxX - minX),
      innerHeight / Math.max(1, maxY - minY)
    ));
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      unit,
      origin: {
        x: rect.x + rect.width * 0.5 - (minX + maxX) * unit * 0.5,
        y: rect.y + rect.height * 0.5 - (minY + maxY) * unit * 0.5
      }
    };
  }

  function worldToCanvas(point, viewport) {
    const raw = rawToCanvas(point);
    return {
      x: viewport.origin.x + raw.x * viewport.unit,
      y: viewport.origin.y + raw.y * viewport.unit
    };
  }

  function getRelationPlane() {
    const bounds = RELATION_PLANE_BOUNDS;
    return [
      { x: bounds.minX, y: bounds.minY, z: 0 },
      { x: bounds.maxX, y: bounds.minY, z: 0 },
      { x: bounds.maxX, y: bounds.maxY, z: 0 },
      { x: bounds.minX, y: bounds.maxY, z: 0 }
    ];
  }

  function createRelationViewport(rect) {
    const points = [];
    model.RELATION_OPTIONS.forEach((option) => {
      const scene = model.createRelationScene(option.key);
      points.push(
        scene.line.source.start,
        scene.line.source.end,
        scene.line.projected.start,
        scene.line.projected.end,
        ...scene.plane.source,
        ...scene.plane.projected
      );
    });
    return createViewport(points.concat(getRelationPlane()), rect);
  }

  function line(context, start, end, color, width, dash) {
    if (!start || !end) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width || 1;
    context.setLineDash(dash || []);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.restore();
  }

  function polygon(context, points, fill, stroke, width) {
    if (!points || points.length < 3) return;
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = width || 1.4;
      context.stroke();
    }
    context.restore();
  }

  function point(context, screen, color, radius) {
    context.save();
    context.beginPath();
    context.arc(screen.x, screen.y, radius + 3, 0, Math.PI * 2);
    context.fillStyle = `${color}24`;
    context.fill();
    context.beginPath();
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  function text(context, value, x, y, color, size, weight) {
    if (!value) return;
    getDrawHelpers().drawText(
      context,
      value,
      x,
      y,
      color,
      Number(size) || 10,
      weight || '500'
    );
  }

  function outlinedText(context, value, x, y, color, size, weight) {
    if (!value) return;
    const halo = '#ffffff';
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach((offset) => {
      text(context, value, x + offset[0], y + offset[1], halo, size, weight);
    });
    text(context, value, x, y, color, size, weight);
  }

  function drawPanelFrame(context, rect, title, subtitle) {
    const helpers = getDrawHelpers();
    helpers.roundRect(context, rect.x, rect.y, rect.width, rect.height, 8);
    context.fillStyle = COLORS.panel;
    context.fill();
    context.strokeStyle = COLORS.panelStroke;
    context.lineWidth = 0.8;
    context.stroke();
    text(context, title, rect.x + 8, rect.y + 14, COLORS.text, 10.5, '750');
    if (subtitle) {
      text(context, subtitle, rect.x + 8, rect.y + 27, COLORS.muted, 8.8, '500');
    }
  }

  function drawPlane(context, viewport, plane, withGrid) {
    const screen = plane.map((item) => worldToCanvas(item, viewport));
    polygon(context, screen, COLORS.planeFill, COLORS.planeStroke, 1.15);
    if (withGrid) {
      const bounds = model.getPlaneDisplayBounds(plane, 0);
      for (let x = Math.ceil(bounds.minX); x <= Math.floor(bounds.maxX); x += 1) {
        if (x <= bounds.minX || x >= bounds.maxX) continue;
        line(
          context,
          worldToCanvas({ x, y: bounds.minY, z: 0 }, viewport),
          worldToCanvas({ x, y: bounds.maxY, z: 0 }, viewport),
          COLORS.grid,
          0.65,
          [2, 4]
        );
      }
      for (let y = Math.ceil(bounds.minY); y <= Math.floor(bounds.maxY); y += 1) {
        if (y <= bounds.minY || y >= bounds.maxY) continue;
        line(
          context,
          worldToCanvas({ x: bounds.minX, y, z: 0 }, viewport),
          worldToCanvas({ x: bounds.maxX, y, z: 0 }, viewport),
          COLORS.grid,
          0.65,
          [2, 4]
        );
      }
    }
    const label = worldToCanvas({ x: plane[0].x, y: plane[0].y, z: 0 }, viewport);
    outlinedText(context, 'P', label.x + 4, label.y - 5, COLORS.planeLabel, 11, '800');
  }

  function interpolateScreen(start, end, ratio) {
    const t = model.clamp(ratio, 0, 1);
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    };
  }

  function drawRays(context, viewport, rays, progress) {
    const t = model.clamp(progress, 0, 1);
    if (t <= 0) return;
    rays.forEach((ray) => {
      const start = worldToCanvas(ray.start, viewport);
      const end = worldToCanvas(ray.end, viewport);
      const visibleEnd = interpolateScreen(start, end, t);
      line(context, start, visibleEnd, COLORS.ray, 0.85);
      if (t > 0.08) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const magnitude = Math.hypot(dx, dy);
        if (magnitude > 8) {
          const arrowLength = 4;
          const ux = dx / magnitude;
          const uy = dy / magnitude;
          const tip = visibleEnd;
          const left = {
            x: tip.x - ux * arrowLength - uy * 2.2,
            y: tip.y - uy * arrowLength + ux * 2.2
          };
          const right = {
            x: tip.x - ux * arrowLength + uy * 2.2,
            y: tip.y - uy * arrowLength - ux * 2.2
          };
          context.save();
          context.fillStyle = COLORS.ray;
          context.beginPath();
          context.moveTo(tip.x, tip.y);
          context.lineTo(left.x, left.y);
          context.lineTo(right.x, right.y);
          context.closePath();
          context.fill();
          context.restore();
        }
      }
    });
  }

  function drawLineCase(context, rect, lineCase, progress, title) {
    drawPanelFrame(context, rect, title, `${lineCase.metrics.projectedLength.toFixed(2)} / ${lineCase.metrics.trueLength.toFixed(2)}（投影 / 实长）`);
    const plane = getRelationPlane();
    const viewport = createRelationViewport({
      x: rect.x + 3,
      y: rect.y + 31,
      width: rect.width - 6,
      height: rect.height - 34
    });
    drawPlane(context, viewport, plane, false);
    drawRays(context, viewport, [lineCase.rays.start, lineCase.rays.end], progress);

    const sourceStart = worldToCanvas(lineCase.source.start, viewport);
    const sourceEnd = worldToCanvas(lineCase.source.end, viewport);
    const projectedStart = worldToCanvas(lineCase.projected.start, viewport);
    const projectedEnd = worldToCanvas(lineCase.projected.end, viewport);
    line(context, sourceStart, sourceEnd, COLORS.objectStroke, 2.2);
    point(context, sourceStart, COLORS.objectStroke, 2.8);
    point(context, sourceEnd, COLORS.objectStroke, 2.8);
    outlinedText(context, 'E', sourceStart.x - 10, sourceStart.y - 5,
      COLORS.objectLabel, 8.5, '800');
    outlinedText(context, 'F', sourceEnd.x + 4, sourceEnd.y - 5,
      COLORS.objectLabel, 8.5, '800');

    const projectionAlpha = model.clamp((progress - 0.38) / 0.62, 0, 1);
    if (projectionAlpha > 0) {
      context.save();
      context.globalAlpha = projectionAlpha;
      if (lineCase.metrics.projectedLength <= model.EPSILON) {
        point(context, projectedStart, COLORS.projectionStroke, 3.4);
        outlinedText(context, 'e(f)', projectedStart.x + 5, projectedStart.y + 12,
          COLORS.projectionLabel, 8.5, '800');
      } else {
        line(context, projectedStart, projectedEnd, COLORS.projectionStroke, 2.2);
        point(context, projectedStart, COLORS.projectionStroke, 2.8);
        point(context, projectedEnd, COLORS.projectionStroke, 2.8);
        outlinedText(context, 'e', projectedStart.x - 9, projectedStart.y + 12,
          COLORS.projectionLabel, 8.5, '800');
        outlinedText(context, 'f', projectedEnd.x + 4, projectedEnd.y + 12,
          COLORS.projectionLabel, 8.5, '800');
      }
      context.restore();
    }
  }

  function drawPlaneCase(context, rect, planeCase, progress, title) {
    const subtitle = planeCase.metrics.isProjectionCollinear
      ? '空间三角形 / 投影积聚线'
      : `${planeCase.metrics.projectedArea.toFixed(2)} / ${planeCase.metrics.trueArea.toFixed(2)}（投影 / 实形面积）`;
    drawPanelFrame(context, rect, title, subtitle);
    const plane = getRelationPlane();
    const viewport = createRelationViewport({
      x: rect.x + 3,
      y: rect.y + 31,
      width: rect.width - 6,
      height: rect.height - 34
    });
    drawPlane(context, viewport, plane, false);
    drawRays(context, viewport, planeCase.rays, progress);

    const source = planeCase.source.map((item) => worldToCanvas(item, viewport));
    const projected = planeCase.projected.map((item) => worldToCanvas(item, viewport));
    polygon(context, source, COLORS.objectFill, COLORS.objectStroke, 1.9);
    const sourceLabels = ['A', 'B', 'C'];
    const offsets = [
      { x: -10, y: -4 },
      { x: 4, y: -4 },
      { x: -10, y: 12 }
    ];
    source.forEach((screen, index) => {
      point(context, screen, COLORS.objectStroke, 2.7);
      outlinedText(context, sourceLabels[index], screen.x + offsets[index].x,
        screen.y + offsets[index].y, COLORS.objectLabel, 8.5, '800');
    });

    const projectionAlpha = model.clamp((progress - 0.38) / 0.62, 0, 1);
    if (projectionAlpha > 0) {
      context.save();
      context.globalAlpha = projectionAlpha;
      if (planeCase.metrics.isProjectionCollinear) {
        line(context, projected[0], projected[2], COLORS.projectionStroke, 2.8);
        line(context, projected[1], projected[2], COLORS.projectionStroke, 2.8);
      } else {
        polygon(context, projected, COLORS.projectionFill,
          COLORS.projectionStroke, 2);
      }
      const projectedLabels = ['a', 'b', 'c'];
      projected.forEach((screen, index) => {
        point(context, screen, COLORS.projectionStroke, 2.7);
        outlinedText(context, projectedLabels[index],
          screen.x + offsets[index].x,
          screen.y + offsets[index].y + 10,
          COLORS.projectionLabel, 8.5, '800');
      });
      context.restore();
    }
  }

  function drawSceneCaption(context, title, subtitle, color) {
    text(context, title, 10, 18, COLORS.text, 11.5, '750');
    text(context, subtitle, 10, 33, color || COLORS.muted, 9.2, '500');
  }

  function getPanelRects(width, height) {
    const margin = 8;
    const top = 42;
    const gap = 7;
    const usableWidth = width - margin * 2;
    const usableHeight = height - top - margin;
    if (width >= 520) {
      return [
        {
          x: margin,
          y: top,
          width: (usableWidth - gap) / 2,
          height: usableHeight
        },
        {
          x: margin + (usableWidth + gap) / 2,
          y: top,
          width: (usableWidth - gap) / 2,
          height: usableHeight
        }
      ];
    }
    return [
      {
        x: margin,
        y: top,
        width: usableWidth,
        height: (usableHeight - gap) / 2
      },
      {
        x: margin,
        y: top + (usableHeight + gap) / 2,
        width: usableWidth,
        height: (usableHeight - gap) / 2
      }
    ];
  }

  function drawRelation(context, width, height, stageState) {
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, width, height);
    const scene = model.createRelationScene(stageState.relationKey);
    drawSceneCaption(
      context,
      `${scene.definition.symbol} · ${scene.definition.property}`,
      scene.definition.caption,
      scene.definition.key === 'perpendicular'
        ? COLORS.projectionStroke
        : COLORS.text
    );
    const rects = getPanelRects(width, height);
    drawLineCase(
      context,
      rects[0],
      scene.line,
      stageState.progress,
      scene.definition.lineType
    );
    drawPlaneCase(
      context,
      rects[1],
      scene.plane,
      stageState.progress,
      scene.definition.planeType
    );
  }

  function drawStage(context, width, height, stageKey, stageState) {
    if (!context || !Number.isFinite(width) || !Number.isFinite(height)) return;
    if (stageKey === 'relation') {
      drawRelation(context, width, height, stageState || {});
    }
  }

  module.exports = {
    COLORS,
    RELATION_PLANE_BOUNDS,
    rawToCanvas,
    createViewport,
    getRelationPlane,
    createRelationViewport,
    worldToCanvas,
    drawStage
  };
})();
