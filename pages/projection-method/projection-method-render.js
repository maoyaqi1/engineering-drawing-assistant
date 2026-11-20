// 投影法基础 Canvas 2D 绘制。
//
// 所有几何点都来自 projection-method-model.js；本文件只做三维教学坐标到
// 页面画布的映射、颜色编码和文字标注。
(function () {
  const model = require('./projection-method-model.js');
  const HORIZONTAL_FACTOR = 1.2;

  const COLORS = Object.freeze({
    background: '#f7fbff',
    grid: '#d9eaf8',
    planeFill: 'rgba(151, 216, 250, 0.62)',
    planeStroke: '#58a9df',
    planeLabel: '#17628f',
    objectFill: 'rgba(45, 119, 221, 0.18)',
    objectStroke: '#1f6fc6',
    objectLabel: '#0e4f91',
    projectionFill: 'rgba(255, 111, 119, 0.18)',
    projectionStroke: '#e95560',
    projectionLabel: '#b52837',
    centerRay: '#ef9e35',
    parallelRay: '#3694e8',
    vertex: '#ef9e35',
    text: '#183e63',
    muted: '#647e95'
  });

  function getDrawHelpers() {
    return require('../index/draw-helpers.js');
  }

  function createViewport(width, height, options) {
    const config = options || {};
    const x = Number(config.x) || 0;
    const y = Number(config.y) || 0;
    const viewportWidth = Number(config.width) || width;
    const viewportHeight = Number(config.height) || height;
    // 预留上方投射中心 S 和下方投影面的标注空间；对比模式的小面板尤其需要
    // 竖向收缩，否则 S 会被画布顶边裁掉。
    const unit = Math.min(viewportWidth / 14.5, viewportHeight / 17.2);
    return {
      x,
      y,
      width: viewportWidth,
      height: viewportHeight,
      unit,
      origin: {
        x: x + viewportWidth * 0.51,
        y: y + viewportHeight * 0.61
      }
    };
  }

  function worldToCanvas(point, viewport) {
    return {
      // 投影法基础以横向可读性优先：保持竖向比例不变，单独放大横轴投影，
      // 让空间三角形和投影面充分利用手机画布宽度。
      x: viewport.origin.x + (point.y - point.x) * HORIZONTAL_FACTOR * viewport.unit,
      y: viewport.origin.y
        + (point.x + point.y) * 0.38 * viewport.unit
        - point.z * viewport.unit
    };
  }

  function createPanelViewport(points, rect) {
    const projected = points.map((point) => ({
      x: (point.y - point.x) * HORIZONTAL_FACTOR,
      y: (point.x + point.y) * 0.38 - point.z
    }));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);
    const unit = Math.min(
      (rect.width - 18) / Math.max(1, maxX - minX),
      (rect.height - 18) / Math.max(1, maxY - minY)
    );
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

  function drawPanelFrame(context, rect, title, subtitle) {
    const helpers = getDrawHelpers();
    helpers.roundRect(context, rect.x, rect.y, rect.width, rect.height, 8);
    context.fillStyle = '#fbfdff';
    context.fill();
    context.strokeStyle = '#d7e9f7';
    context.lineWidth = 0.8;
    context.stroke();
    helpers.drawText(context, title, rect.x + 8, rect.y + 14,
      COLORS.text, 10.5, '750');
    if (subtitle) {
      helpers.drawText(context, subtitle, rect.x + 8, rect.y + 27,
        COLORS.muted, 9.1, '500');
    }
  }

  function drawLocalPlane(context, viewport, points) {
    path(
      context,
      points.map((point) => worldToCanvas(point, viewport)),
      COLORS.planeFill,
      COLORS.planeStroke,
      1,
      true
    );
  }

  function getPlaneAround(points, padding) {
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const pad = Number.isFinite(padding) ? padding : 0.45;
    const minX = Math.max(0, Math.min.apply(null, xValues) - pad);
    const maxX = Math.min(model.PLANE_DISPLAY_EXTENT, Math.max.apply(null, xValues) + pad);
    const minY = Math.max(0, Math.min.apply(null, yValues) - pad);
    const maxY = Math.min(model.PLANE_DISPLAY_EXTENT, Math.max.apply(null, yValues) + pad);
    return [
      { x: minX, y: minY, z: 0 },
      { x: maxX, y: minY, z: 0 },
      { x: maxX, y: maxY, z: 0 },
      { x: minX, y: maxY, z: 0 }
    ];
  }

  function centerViewportOnProjection(width, height, projectedPoints) {
    const viewport = createViewport(width, height);
    const screenPoints = ['a', 'b', 'c'].map((key) => (
      worldToCanvas(projectedPoints[key], viewport)
    ));
    const centroidX = screenPoints.reduce((sum, point) => sum + point.x, 0) / screenPoints.length;
    const limitedShift = model.clamp(
      width * 0.5 - centroidX,
      -width * 0.06,
      width * 0.06
    );
    return Object.assign({}, viewport, {
      origin: {
        x: viewport.origin.x + limitedShift,
        y: viewport.origin.y
      }
    });
  }

  function createMethodViewport(width, height) {
    // 视口只按默认 90°正投影确定一次横向中心；滑杆改变角度时不重算视口，
    // 因而投影面 P 和空间形体保持固定，只有投射线与投影位置变化。
    const referenceDirection = model.getRayDirectionFromPlaneAngle(90, model.MODEL_PLANE);
    const referenceProjection = model.projectTriangleParallel(
      model.DEFAULT_TRIANGLE,
      referenceDirection,
      model.MODEL_PLANE
    );
    return centerViewportOnProjection(width, height, referenceProjection.projected);
  }

  function line(context, start, end, color, width, dash) {
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

  function path(context, points, fill, stroke, width, close) {
    if (!points || points.length === 0) return;
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    if (close) context.closePath();
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = width || 1.5;
      context.stroke();
    }
    context.restore();
  }

  function dot(context, point, color, radius) {
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
    context.fillStyle = `${color}24`;
    context.fill();
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  function outlinedText(context, text, x, y, color, size, weight) {
    if (!text) return;
    const helpers = getDrawHelpers();
    const halo = '#ffffff';
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach((offset) => {
      helpers.drawText(context, text, x + offset[0], y + offset[1], halo, size, weight);
    });
    helpers.drawText(context, text, x, y, color, size, weight);
  }

  function drawPlane(context, viewport) {
    // 覆盖中心投影的三个落点，使 a、b、c 明确落在 P 面的可见边界内。
    const extent = model.PLANE_DISPLAY_EXTENT;
    const corners = [
      { x: 0, y: 0, z: 0 },
      { x: extent, y: 0, z: 0 },
      { x: extent, y: extent, z: 0 },
      { x: 0, y: extent, z: 0 }
    ].map((point) => worldToCanvas(point, viewport));
    path(context, corners, COLORS.planeFill, COLORS.planeStroke, 1.5, true);
    for (let value = 1; value < extent; value += 1) {
      line(
        context,
        worldToCanvas({ x: value, y: 0, z: 0 }, viewport),
        worldToCanvas({ x: value, y: extent, z: 0 }, viewport),
        COLORS.grid,
        0.7,
        [2, 4]
      );
      line(
        context,
        worldToCanvas({ x: 0, y: value, z: 0 }, viewport),
        worldToCanvas({ x: extent, y: value, z: 0 }, viewport),
        COLORS.grid,
        0.7,
        [2, 4]
      );
    }
    const labelPoint = worldToCanvas({ x: 0.32, y: 0.32, z: 0 }, viewport);
    outlinedText(context, 'P', labelPoint.x - 13, labelPoint.y + 4,
      COLORS.planeLabel, 13, '800');
  }

  function drawObjectTriangle(context, viewport, source, labels) {
    const points = [source.a, source.b, source.c].map((point) => worldToCanvas(point, viewport));
    path(context, points, COLORS.objectFill, COLORS.objectStroke, 2.2, true);
    if (!labels) return;
    ['a', 'b', 'c'].forEach((key, index) => {
      const point = points[index];
      dot(context, point, COLORS.objectStroke, 3.2);
      outlinedText(context, key.toUpperCase(), point.x + 7, point.y - 6,
        COLORS.objectLabel, 12, '800');
    });
  }

  function drawProjectionTriangle(context, viewport, points, alpha, labels) {
    if (!points || alpha <= 0) return;
    context.save();
    context.globalAlpha = alpha;
    const screen = ['a', 'b', 'c'].map((key) => worldToCanvas(points[key], viewport));
    path(context, screen, COLORS.projectionFill, COLORS.projectionStroke, 2.2, true);
    if (labels) {
      ['a', 'b', 'c'].forEach((key, index) => {
        dot(context, screen[index], COLORS.projectionStroke, 3.2);
        outlinedText(context, key, screen[index].x + 7, screen[index].y - 6,
          COLORS.projectionLabel, 12, '800');
      });
    }
    context.restore();
  }

  function drawRays(context, viewport, rays, color, options) {
    const config = options || {};
    const progress = model.clamp(config.progress == null ? 1 : config.progress, 0, 1);
    const show = config.show !== false;
    if (!show || progress <= 0) return;
    ['a', 'b', 'c'].forEach((key) => {
      const ray = rays[key];
      if (!ray) return;
      const start = worldToCanvas(ray.start, viewport);
      const through = worldToCanvas(config.throughPoints ? config.throughPoints[key] : ray.end, viewport);
      const end = worldToCanvas(ray.end, viewport);
      const objectProgress = model.clamp(
        config.objectProgress == null ? 1 : config.objectProgress,
        0,
        1
      );
      if (objectProgress > 0) {
        const objectEnd = {
          x: start.x + (through.x - start.x) * objectProgress,
          y: start.y + (through.y - start.y) * objectProgress
        };
        line(context, start, objectEnd, color, 1.35);
      }
      if (progress > 0) {
        const planeEnd = {
          x: through.x + (end.x - through.x) * progress,
          y: through.y + (end.y - through.y) * progress
        };
        line(context, through, planeEnd, color, 1.05);
      }
    });
  }

  function drawCenter(context, viewport, center, labels) {
    const screen = worldToCanvas(center, viewport);
    dot(context, screen, COLORS.vertex, 4);
    if (labels) {
      outlinedText(context, 'S', screen.x + 8, screen.y - 8,
        '#b36c13', 13, '800');
    }
  }

  function drawSceneCaption(context, viewport, title, subtitle, subtitleColor) {
    const helpers = getDrawHelpers();
    helpers.drawText(context, title, viewport.x + 10, viewport.y + 18,
      COLORS.text, 11.5, '750');
    if (subtitle) {
      helpers.drawText(context, subtitle, viewport.x + 10, viewport.y + 33,
        subtitleColor || COLORS.muted, 9.5, '500');
    }
  }

  function drawMethodPanel(context, viewport, mode, progress, showLabels, projected) {
    drawPlane(context, viewport);
    const centerMode = mode === 'center';
    drawRays(context, viewport, projected.rays, centerMode ? COLORS.centerRay : COLORS.parallelRay, {
      progress,
      objectProgress: Math.min(1, progress / 0.55),
      throughPoints: projected.source
    });
    drawObjectTriangle(context, viewport, projected.source, showLabels);
    if (centerMode) drawCenter(context, viewport, model.DEFAULT_CENTER, showLabels);
    drawProjectionTriangle(
      context,
      viewport,
      projected.projected,
      model.clamp((progress - 0.55) / 0.45, 0, 1),
      showLabels
    );
  }

  function drawMethods(context, width, height, stageState) {
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, width, height);
    const centerMode = stageState.mode === 'center';
    const parallelAngle = model.clamp(
      Number(stageState.parallelAngleDeg) || 45,
      15,
      90
    );
    const direction = model.getRayDirectionFromPlaneAngle(
      centerMode ? 60 : parallelAngle,
      model.MODEL_PLANE,
      centerMode ? 1 : stageState.parallelDirectionSign
    );
    const projected = centerMode
      ? model.projectTriangleFromCenter(
        model.DEFAULT_TRIANGLE,
        model.DEFAULT_CENTER,
        model.MODEL_PLANE
      )
      : model.projectTriangleParallel(
        model.DEFAULT_TRIANGLE,
        direction,
        model.MODEL_PLANE
      );
    const viewport = createMethodViewport(width, height);
    drawSceneCaption(
      context,
      viewport,
      centerMode ? '中心投影法' : '平行投影法',
      centerMode
        ? '投射线均发自投射中心 S'
        : `${parallelAngle === 90 ? '正投影' : '斜投影'} · 投射线与 P 面成 ${parallelAngle}°`,
      centerMode
        ? COLORS.muted
        : (parallelAngle === 90 ? COLORS.projectionStroke : COLORS.muted)
    );
    drawMethodPanel(
      context,
      viewport,
      stageState.mode,
      stageState.progress,
      stageState.showLabels,
      projected
    );
  }

  function drawProjectedSegment(context, viewport, start, end, labels, prefix) {
    const screenStart = worldToCanvas(start, viewport);
    const screenEnd = worldToCanvas(end, viewport);
    line(context, screenStart, screenEnd, COLORS.projectionStroke, 2.2);
    if (labels) {
      outlinedText(context, prefix[0], screenStart.x - 13, screenStart.y + 5,
        COLORS.projectionLabel, 12, '800');
      outlinedText(context, prefix[1], screenEnd.x + 4, screenEnd.y + 5,
        COLORS.projectionLabel, 12, '800');
    }
  }

  function drawInvariance(context, width, height, scene) {
    const invariance = scene.invariance;
    const gap = 6;
    const margin = 8;
    const topY = 40;
    const panelWidth = (width - margin * 2 - gap) / 2;
    const panelHeight = (height - topY - 8 - gap) / 2;
    const lineRect = {
      x: margin,
      y: topY,
      width: panelWidth,
      height: panelHeight
    };
    const triangleRect = {
      x: margin + panelWidth + gap,
      y: topY,
      width: panelWidth,
      height: panelHeight
    };
    const parallelRect = {
      x: margin,
      y: topY + panelHeight + gap,
      width: panelWidth,
      height: panelHeight
    };
    const circleRect = {
      x: margin + panelWidth + gap,
      y: topY + panelHeight + gap,
      width: panelWidth,
      height: panelHeight
    };

    drawPanelFrame(context, lineRect, '1. 直线 → 直线');
    const lineScene = invariance.line;
    const linePoints = [
      lineScene.source.start,
      lineScene.source.end,
      lineScene.projected.start,
      lineScene.projected.end
    ];
    const linePlane = getPlaneAround(linePoints, 0.3);
    const lineViewport = createPanelViewport(linePoints.concat(linePlane), {
      x: lineRect.x + 4,
      y: lineRect.y + 30,
      width: lineRect.width - 8,
      height: lineRect.height - 34
    });
    drawLocalPlane(context, lineViewport, linePlane);
    const lineA = worldToCanvas(lineScene.source.start, lineViewport);
    const lineB = worldToCanvas(lineScene.source.end, lineViewport);
    const projectedA = worldToCanvas(lineScene.projected.start, lineViewport);
    const projectedB = worldToCanvas(lineScene.projected.end, lineViewport);
    line(context, lineA, lineB, COLORS.objectStroke, 2.4);
    line(context, projectedA, projectedB, COLORS.projectionStroke, 2.2);
    line(context, lineA, projectedA, COLORS.parallelRay, 0.75);
    line(context, lineB, projectedB, COLORS.parallelRay, 0.75);

    drawPanelFrame(context, triangleRect, '2. 三角形 → 三角形');
    const triangle = invariance.triangle;
    const triangleSource = [triangle.source.a, triangle.source.b, triangle.source.c];
    const triangleProjected = [
      triangle.projected.a,
      triangle.projected.b,
      triangle.projected.c
    ];
    const trianglePlane = getPlaneAround(
      triangleSource.concat(triangleProjected),
      0.3
    );
    const triangleViewport = createPanelViewport(
      triangleSource.concat(triangleProjected, trianglePlane),
      {
        x: triangleRect.x + 4,
        y: triangleRect.y + 30,
        width: triangleRect.width - 8,
        height: triangleRect.height - 34
      }
    );
    drawLocalPlane(context, triangleViewport, trianglePlane);
    const triangleSourceScreen = triangleSource.map(
      (point) => worldToCanvas(point, triangleViewport)
    );
    const triangleProjectedScreen = triangleProjected.map(
      (point) => worldToCanvas(point, triangleViewport)
    );
    path(context, triangleSourceScreen, 'rgba(43, 123, 226, 0.16)',
      COLORS.objectStroke, 1.8, true);
    path(context, triangleProjectedScreen, 'rgba(234, 86, 99, 0.18)',
      COLORS.projectionStroke, 1.8, true);
    for (let index = 0; index < triangleSourceScreen.length; index += 1) {
      line(context, triangleSourceScreen[index], triangleProjectedScreen[index],
        COLORS.parallelRay, 0.7);
    }

    drawPanelFrame(context, parallelRect, '3. 平行线 → 平行线');
    const parallelLines = invariance.parallelLines;
    const parallelPoints = [
      parallelLines.first.start, parallelLines.first.end,
      parallelLines.second.start, parallelLines.second.end,
      parallelLines.projectedFirst.start, parallelLines.projectedFirst.end,
      parallelLines.projectedSecond.start, parallelLines.projectedSecond.end
    ];
    const parallelPlane = getPlaneAround(parallelPoints, 0.3);
    const parallelViewport = createPanelViewport(
      parallelPoints.concat(parallelPlane),
      {
        x: parallelRect.x + 4,
        y: parallelRect.y + 30,
        width: parallelRect.width - 8,
        height: parallelRect.height - 34
      }
    );
    drawLocalPlane(context, parallelViewport, parallelPlane);
    [
      {
        source: parallelLines.first,
        projected: parallelLines.projectedFirst,
        labels: ['A', 'B', 'a', 'b']
      },
      {
        source: parallelLines.second,
        projected: parallelLines.projectedSecond,
        labels: ['C', 'D', 'c', 'd']
      }
    ].forEach((item) => {
      const start = worldToCanvas(item.source.start, parallelViewport);
      const end = worldToCanvas(item.source.end, parallelViewport);
      const projectedStart = worldToCanvas(item.projected.start, parallelViewport);
      const projectedEnd = worldToCanvas(item.projected.end, parallelViewport);
      line(context, start, end, COLORS.objectStroke, 2.1);
      line(context, projectedStart, projectedEnd, COLORS.projectionStroke, 2);
      line(context, start, projectedStart, COLORS.parallelRay, 0.7);
      line(context, end, projectedEnd, COLORS.parallelRay, 0.7);
    });

    drawPanelFrame(context, circleRect, '4. 正投影：实形', '形体 ∥ P 时，投影与实际图形一致');
    const rectangle = invariance.rectangle;
    const rectanglePlane = getPlaneAround(
      rectangle.source.concat(rectangle.projected),
      0.35
    );
    const rectangleViewport = createPanelViewport(
      rectangle.source.concat(rectangle.projected, rectanglePlane),
      {
        x: circleRect.x + 4,
        y: circleRect.y + 30,
        width: circleRect.width - 8,
        height: circleRect.height - 34
      }
    );
    drawLocalPlane(context, rectangleViewport, rectanglePlane);
    const sourceRectangle = rectangle.source.map(
      (point) => worldToCanvas(point, rectangleViewport)
    );
    const projectedRectangle = rectangle.projected.map(
      (point) => worldToCanvas(point, rectangleViewport)
    );
    path(context, sourceRectangle, 'rgba(43, 123, 226, 0.16)',
      COLORS.objectStroke, 2, true);
    path(context, projectedRectangle, 'rgba(234, 86, 99, 0.2)',
      COLORS.projectionStroke, 2.2, true);
    for (let index = 0; index < sourceRectangle.length; index += 1) {
      line(context, sourceRectangle[index], projectedRectangle[index],
        COLORS.parallelRay, 0.8);
    }
    outlinedText(context, '空间矩形', sourceRectangle[0].x - 5,
      sourceRectangle[0].y - 7, COLORS.objectLabel, 8, '700');
    outlinedText(context, '实形（同形等大）', projectedRectangle[0].x - 12,
      projectedRectangle[0].y + 17, COLORS.projectionLabel, 8, '700');
  }

  function drawAccumulation(context, viewport, scene) {
    const accumulation = scene.accumulation;
    const lineStart = worldToCanvas(accumulation.line.start, viewport);
    const lineEnd = worldToCanvas(accumulation.line.end, viewport);
    const lineProjection = worldToCanvas(accumulation.lineProjection, viewport);
    line(context, lineStart, lineEnd, COLORS.objectStroke, 2.5);
    line(context, lineEnd, lineProjection, COLORS.parallelRay, 1);
    dot(context, lineProjection, COLORS.projectionStroke, 4);

    const source = accumulation.plane.map((point) => worldToCanvas(point, viewport));
    const projected = accumulation.planeProjection.map((point) => worldToCanvas(point, viewport));
    path(context, source, 'rgba(43, 123, 226, 0.16)', COLORS.objectStroke, 2, true);
    for (let index = 0; index < source.length; index += 1) {
      line(context, source[index], projected[index], COLORS.parallelRay, 0.85);
    }
    line(
      context,
      projected[0],
      projected[1],
      COLORS.projectionStroke,
      3.2
    );
  }

  function drawIncidence(context, viewport, scene) {
    const lineCase = scene.incidence.line;
    const lineStart = worldToCanvas(lineCase.start, viewport);
    const lineEnd = worldToCanvas(lineCase.end, viewport);
    const linePoint = worldToCanvas(lineCase.point, viewport);
    const projectedStart = worldToCanvas(lineCase.projectedStart, viewport);
    const projectedEnd = worldToCanvas(lineCase.projectedEnd, viewport);
    const projectedPoint = worldToCanvas(lineCase.projectedPoint, viewport);
    line(context, lineStart, lineEnd, COLORS.objectStroke, 2.4);
    drawProjectedSegment(context, viewport, lineCase.projectedStart,
      lineCase.projectedEnd, false, ['e', 'f']);
    line(context, lineStart, projectedStart, COLORS.parallelRay, 0.85);
    line(context, lineEnd, projectedEnd, COLORS.parallelRay, 0.85);
    line(context, linePoint, projectedPoint, COLORS.centerRay, 0.9);
    dot(context, linePoint, COLORS.vertex, 3.5);
    dot(context, projectedPoint, COLORS.projectionStroke, 3.2);
    outlinedText(context, 'E', lineStart.x - 12, lineStart.y - 5,
      COLORS.objectLabel, 9, '800');
    outlinedText(context, 'F', lineEnd.x + 4, lineEnd.y - 5,
      COLORS.objectLabel, 9, '800');
    outlinedText(context, 'H', linePoint.x + 5, linePoint.y - 5,
      '#b36c13', 9, '800');
    outlinedText(context, 'e', projectedStart.x - 10, projectedStart.y + 12,
      COLORS.projectionLabel, 9, '800');
    outlinedText(context, 'f', projectedEnd.x + 4, projectedEnd.y + 12,
      COLORS.projectionLabel, 9, '800');
    outlinedText(context, 'h', projectedPoint.x + 5, projectedPoint.y + 12,
      COLORS.projectionLabel, 9, '800');

    const planeCase = scene.incidence.plane;
    const source = planeCase.source.map((point) => worldToCanvas(point, viewport));
    const projected = planeCase.projected.map((point) => worldToCanvas(point, viewport));
    const planePoint = worldToCanvas(planeCase.point, viewport);
    const projectedPlanePoint = worldToCanvas(planeCase.projectedPoint, viewport);
    path(context, source, 'rgba(43, 123, 226, 0.16)', COLORS.objectStroke, 1.8, true);
    path(context, projected, 'rgba(234, 86, 99, 0.16)', COLORS.projectionStroke, 1.8, true);
    for (let index = 0; index < source.length; index += 1) {
      line(context, source[index], projected[index], COLORS.parallelRay, 0.8);
    }
    line(context, planePoint, projectedPlanePoint, COLORS.centerRay, 0.9);
    dot(context, planePoint, COLORS.vertex, 3.4);
    dot(context, projectedPlanePoint, COLORS.projectionStroke, 3.1);
    const sourceLabels = ['A', 'B', 'C'];
    const projectedLabels = ['a', 'b', 'c'];
    const offsets = [
      { x: -10, y: -4 },
      { x: 4, y: -4 },
      { x: -10, y: 12 }
    ];
    source.forEach((point, index) => {
      outlinedText(context, sourceLabels[index], point.x + offsets[index].x,
        point.y + offsets[index].y, COLORS.objectLabel, 8.5, '800');
      outlinedText(context, projectedLabels[index], projected[index].x + offsets[index].x,
        projected[index].y + offsets[index].y + 10,
        COLORS.projectionLabel, 8.5, '800');
    });
    outlinedText(context, 'J', planePoint.x + 5, planePoint.y - 5,
      '#b36c13', 9, '800');
    outlinedText(context, 'j', projectedPlanePoint.x + 5, projectedPlanePoint.y + 12,
      COLORS.projectionLabel, 9, '800');
  }

  function drawRatio(context, viewport, scene) {
    const data = scene.ratio;
    const e = worldToCanvas(data.start, viewport);
    const f = worldToCanvas(data.end, viewport);
    const h = worldToCanvas(data.point, viewport);
    const pe = worldToCanvas(data.projectedStart, viewport);
    const pf = worldToCanvas(data.projectedEnd, viewport);
    const ph = worldToCanvas(data.projectedPoint, viewport);
    line(context, e, f, COLORS.objectStroke, 2.5);
    line(context, pe, pf, COLORS.projectionStroke, 2.3);
    line(context, e, pe, COLORS.parallelRay, 0.9);
    line(context, f, pf, COLORS.parallelRay, 0.9);
    line(context, h, ph, COLORS.centerRay, 0.95);
    dot(context, h, COLORS.vertex, 4);
    dot(context, ph, COLORS.projectionStroke, 3.5);
    outlinedText(context, 'E', e.x - 12, e.y - 5, COLORS.objectLabel, 9, '800');
    outlinedText(context, 'F', f.x + 4, f.y - 5, COLORS.objectLabel, 9, '800');
    outlinedText(context, 'H', h.x + 5, h.y - 5, '#b36c13', 9, '800');
    outlinedText(context, 'e', pe.x - 10, pe.y + 12,
      COLORS.projectionLabel, 9, '800');
    outlinedText(context, 'f', pf.x + 4, pf.y + 12,
      COLORS.projectionLabel, 9, '800');
    outlinedText(context, 'h', ph.x + 5, ph.y + 12,
      COLORS.projectionLabel, 9, '800');
  }

  function drawProperty(context, width, height, stageState) {
    const captionViewport = createViewport(width, height);
    const scene = model.createPropertyScene(stageState.key, stageState.parameter);
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, width, height);
    drawSceneCaption(
      context,
      captionViewport,
      `${scene.definition.group} · ${scene.definition.title}`,
      scene.definition.formula
    );
    if (stageState.key === 'invariance') {
      drawInvariance(context, width, height, scene);
      return;
    }
    let scenePoints = [];
    if (stageState.key === 'accumulation') {
      scenePoints = [
        scene.accumulation.line.start,
        scene.accumulation.line.end,
        scene.accumulation.lineProjection
      ].concat(scene.accumulation.plane, scene.accumulation.planeProjection);
    } else if (stageState.key === 'incidence') {
      const incidence = scene.incidence;
      scenePoints = [
        incidence.line.start,
        incidence.line.end,
        incidence.line.projectedStart,
        incidence.line.projectedEnd,
        incidence.line.projectedPoint,
        incidence.plane.point,
        incidence.plane.projectedPoint
      ].concat(incidence.plane.source, incidence.plane.projected);
    } else if (stageState.key === 'ratio') {
      scenePoints = [
        scene.ratio.start,
        scene.ratio.end,
        scene.ratio.point,
        scene.ratio.projectedStart,
        scene.ratio.projectedEnd,
        scene.ratio.projectedPoint
      ];
    }
    const plane = getPlaneAround(scenePoints, 0.4);
    const viewport = createPanelViewport(scenePoints.concat(plane), {
      x: 8,
      y: 39,
      width: width - 16,
      height: height - 47
    });
    drawLocalPlane(context, viewport, plane);
    if (stageState.key === 'accumulation') {
      drawAccumulation(context, viewport, scene);
    } else if (stageState.key === 'ratio') {
      drawRatio(context, viewport, scene);
    } else {
      drawIncidence(context, viewport, scene);
    }
  }

  function drawStage(context, width, height, stageKey, stageState) {
    if (!context || !Number.isFinite(width) || !Number.isFinite(height)) return;
    if (stageKey === 'methods') {
      drawMethods(context, width, height, stageState);
    } else if (stageKey === 'property') {
      drawProperty(context, width, height, stageState);
    }
  }

  module.exports = {
    COLORS,
    createViewport,
    createMethodViewport,
    centerViewportOnProjection,
    worldToCanvas,
    drawStage
  };
})();
