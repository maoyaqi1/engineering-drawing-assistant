// 线面、面面平行 · 静态 Canvas 2D 示意图。

const COLORS = {
  plane: '#dff2ff',
  planeStroke: '#4d9bd2',
  secondPlane: '#fff0d7',
  secondPlaneStroke: '#d49335',
  line: '#15956b',
  parallelLine: '#e27a21',
  secondary: '#e3a33a'
};

function projectPoint(point, width, height, verticalScale) {
  const scale = Math.min(width / 7.2, height / 4.4);
  return {
    x: width * 0.5 + (point.x - point.y) * scale * 0.7,
    y: height * 0.61
      + (point.x + point.y) * scale * 0.25
      - point.z * verticalScale
  };
}

function drawPolygon(context, points, fillStyle, strokeStyle) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1.6;
  context.stroke();
}

function drawLine(context, start, end, color, width, dash) {
  context.save();
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash || []);
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawLabel(context, text, point, color, align, size) {
  context.save();
  context.fillStyle = color;
  context.font = `700 ${size || 13}px sans-serif`;
  context.textAlign = align || 'center';
  context.textBaseline = 'middle';
  context.fillText(text, point.x, point.y);
  context.restore();
}

function drawLinePlaneAccumulationFigure(context, left, right, top, bottom) {
  const width = right - left;
  const floorY = bottom - 8;
  const hPlane = [
    { x: left, y: floorY - 20 },
    { x: left + width * 0.52, y: floorY - 50 },
    { x: right, y: floorY - 18 },
    { x: left + width * 0.5, y: floorY + 8 }
  ];
  drawPolygon(context, hPlane, '#eef2f4', '#c8d2d8');

  const planeTop = top + 18;
  const traceStart = { x: left + width * 0.57, y: floorY - 24 };
  const traceEnd = { x: left + width * 0.86, y: floorY - 16 };
  const planeBottom = traceStart.y - 43;
  const lineX = left + width * 0.32;
  drawLine(
    context,
    { x: lineX, y: planeTop + 5 },
    { x: lineX, y: planeBottom - 2 },
    '#263746',
    2.4,
    []
  );
  drawLine(
    context,
    { x: lineX, y: planeBottom - 2 },
    { x: lineX, y: floorY - 8 },
    '#8494a0',
    1,
    []
  );
  context.save();
  context.beginPath();
  context.strokeStyle = '#263746';
  context.lineWidth = 1.4;
  context.arc(lineX, floorY - 8, 3.2, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  const plane = [
    { x: traceStart.x - 3, y: planeTop },
    { x: traceEnd.x + 3, y: planeTop + 8 },
    { x: traceEnd.x, y: planeBottom + 9 },
    { x: traceStart.x, y: planeBottom }
  ];
  drawPolygon(context, plane, 'rgba(232, 236, 239, 0.62)', '#34495a');

  drawLine(
    context,
    traceStart,
    traceEnd,
    COLORS.secondPlaneStroke,
    2.2,
    []
  );
  drawLine(
    context,
    plane[3],
    traceStart,
    '#91a0aa',
    0.9,
    []
  );
  drawLine(
    context,
    plane[2],
    traceEnd,
    '#91a0aa',
    0.9,
    []
  );
  const traceDx = traceEnd.x - traceStart.x;
  const traceDy = traceEnd.y - traceStart.y;
  const cdStart = { x: left + width * 0.46, y: floorY - 12 };
  const cdEnd = {
    x: cdStart.x + traceDx * 0.52,
    y: cdStart.y + traceDy * 0.52
  };
  drawLine(context, cdStart, cdEnd, COLORS.line, 2, []);
  const pointC = { x: cdStart.x, y: planeTop + 18 };
  const pointD = { x: cdEnd.x, y: planeTop + 26 };
  drawLine(context, pointC, pointD, '#34495a', 2.1, []);
  drawLine(context, pointC, cdStart, '#8494a0', 0.9, []);
  drawLine(context, pointD, cdEnd, '#8494a0', 0.9, []);

  drawLabel(context, 'A', { x: lineX, y: planeTop + 1 }, '#263746', 'center', 11);
  drawLabel(context, 'B', { x: lineX, y: planeBottom + 5 }, '#263746', 'center', 11);
  drawLabel(context, 'a(b)', { x: lineX + 3, y: floorY + 5 }, '#263746', 'center', 10);
  drawLabel(context, 'C', { x: pointC.x - 5, y: pointC.y - 5 }, '#34495a', 'right', 9);
  drawLabel(context, 'D', { x: pointD.x + 5, y: pointD.y - 5 }, '#34495a', 'left', 9);
  drawLabel(context, 'c', { x: cdStart.x - 4, y: cdStart.y + 7 }, COLORS.line, 'right', 9);
  drawLabel(context, 'd', { x: cdEnd.x + 5, y: cdEnd.y + 7 }, COLORS.line, 'left', 9);
  drawLabel(context, 'E', { x: plane[0].x - 4, y: plane[0].y }, '#263746', 'right', 9);
  drawLabel(context, 'H', { x: plane[1].x + 5, y: plane[1].y }, '#263746', 'left', 9);
  drawLabel(context, 'F', { x: plane[3].x - 4, y: plane[3].y + 8 }, '#263746', 'right', 9);
  drawLabel(context, 'G', { x: plane[2].x + 5, y: plane[2].y + 4 }, '#263746', 'left', 9);
  drawLabel(
    context,
    'e(f)',
    { x: traceStart.x - 4, y: traceStart.y - 8 },
    COLORS.secondPlaneStroke,
    'right',
    9
  );
  drawLabel(
    context,
    'h(g)',
    { x: traceEnd.x + 4, y: traceEnd.y + 8 },
    COLORS.secondPlaneStroke,
    'left',
    9
  );
  drawLabel(
    context,
    'H',
    { x: left + width * 0.18, y: floorY - 17 },
    '#7a8790',
    'center',
    9
  );
}

function drawPlanePlaneAccumulationFigure(context, left, right, top, bottom) {
  const width = right - left;
  const floorY = bottom - 8;
  const hPlane = [
    { x: left, y: floorY - 20 },
    { x: left + width * 0.52, y: floorY - 50 },
    { x: right, y: floorY - 18 },
    { x: left + width * 0.5, y: floorY + 8 }
  ];
  drawPolygon(context, hPlane, '#eef2f4', '#c8d2d8');

  const planeTop = top + 24;
  const planeBottom = floorY - 42;
  const qStart = { x: left + width * 0.22, y: floorY - 13 };
  const qEnd = { x: left + width * 0.42, y: floorY - 8 };
  const qLeft = { x: qStart.x, y: planeBottom };
  const qRight = { x: qEnd.x, y: planeBottom + 5 };
  const qTop = { x: left + width * 0.29, y: planeTop };
  drawPolygon(
    context,
    [qTop, qRight, qLeft],
    'rgba(255, 240, 215, 0.72)',
    COLORS.secondPlaneStroke
  );
  drawLine(context, qLeft, qStart, '#91a0aa', 0.9, []);
  drawLine(context, qRight, qEnd, '#91a0aa', 0.9, []);
  drawLine(context, qStart, qEnd, COLORS.secondPlaneStroke, 2.2, []);

  const pStart = { x: left + width * 0.56, y: floorY - 23 };
  const pEnd = { x: left + width * 0.83, y: floorY - 16 };
  const pLeftBottom = { x: pStart.x, y: planeBottom };
  const pRightBottom = { x: pEnd.x, y: planeBottom + 7 };
  const pLeftTop = { x: pStart.x + 2, y: planeTop + 3 };
  const pRightTop = { x: pEnd.x + 2, y: planeTop + 10 };
  drawPolygon(
    context,
    [pLeftTop, pRightTop, pRightBottom, pLeftBottom],
    'rgba(223, 242, 255, 0.72)',
    COLORS.planeStroke
  );
  drawLine(context, pLeftBottom, pStart, '#91a0aa', 0.9, []);
  drawLine(context, pRightBottom, pEnd, '#91a0aa', 0.9, []);
  drawLine(context, pStart, pEnd, COLORS.planeStroke, 2.2, []);

  drawLabel(context, 'Q', { x: qTop.x, y: qTop.y - 8 }, COLORS.secondPlaneStroke, 'center', 10);
  drawLabel(context, 'P', { x: pRightTop.x + 7, y: pRightTop.y }, COLORS.planeStroke, 'left', 10);
  drawLabel(context, 'Q_H', { x: qStart.x - 4, y: qStart.y - 8 }, COLORS.secondPlaneStroke, 'right', 9);
  drawLabel(context, 'P_H', { x: pStart.x - 4, y: pStart.y - 8 }, COLORS.planeStroke, 'right', 9);
  drawLabel(
    context,
    'H',
    { x: left + width * 0.45, y: floorY + 2 },
    '#7a8790',
    'center',
    9
  );
}

function drawAccumulationPanel(context, width, height, kind, left) {
  const top = 20;
  const panelWidth = width - left - 8;
  context.save();
  context.fillStyle = '#6e879b';
  context.font = '700 11px sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('积聚性投影', left + 2, top);
  if (kind === 'linePlane') {
    context.restore();
    drawLinePlaneAccumulationFigure(
      context,
      left,
      left + panelWidth,
      top + 12,
      height - 5
    );
    return;
  } else {
    context.restore();
    drawPlanePlaneAccumulationFigure(
      context,
      left,
      left + panelWidth,
      top + 12,
      height - 5
    );
    return;
  }
}

function drawLinePlaneScene(context, width, height, scene) {
  const dividerX = width * 0.48;
  const mainWidth = dividerX - 4;
  const verticalScale = height * 0.16;
  const plane = scene.plane.polygon.map((point) => (
    projectPoint(point, mainWidth, height, verticalScale)
  ));
  const lineInPlaneStart = projectPoint(
    scene.lineInPlane.start,
    mainWidth,
    height,
    verticalScale
  );
  const lineInPlaneEnd = projectPoint(
    scene.lineInPlane.end,
    mainWidth,
    height,
    verticalScale
  );
  const parallelStart = projectPoint(
    scene.parallelLine.start,
    mainWidth,
    height,
    verticalScale
  );
  const parallelEnd = projectPoint(
    scene.parallelLine.end,
    mainWidth,
    height,
    verticalScale
  );
  drawPolygon(context, plane, COLORS.plane, COLORS.planeStroke);
  drawLine(context, lineInPlaneStart, lineInPlaneEnd, COLORS.line, 2.4, []);
  drawLine(
    context,
    parallelStart,
    parallelEnd,
    COLORS.parallelLine,
    2.4,
    []
  );
  drawLabel(
    context,
    'A',
    { x: parallelStart.x - 8, y: parallelStart.y - 7 },
    COLORS.parallelLine,
    'right'
  );
  drawLabel(
    context,
    'B',
    { x: parallelEnd.x + 8, y: parallelEnd.y + 7 },
    COLORS.parallelLine,
    'left'
  );
  drawLabel(
    context,
    'C',
    { x: lineInPlaneStart.x - 7, y: lineInPlaneStart.y + 8 },
    COLORS.line,
    'right'
  );
  drawLabel(
    context,
    'D',
    { x: lineInPlaneEnd.x + 7, y: lineInPlaneEnd.y + 8 },
    COLORS.line,
    'left'
  );
  drawLabel(
    context,
    'AB ∥ CD',
    {
      x: mainWidth * 0.59,
      y: height * 0.26
    },
    '#315a70',
    'left'
  );
  drawLabel(
    context,
    'P',
    {
      x: plane[3].x + 16,
      y: plane[3].y + 7
    },
    COLORS.planeStroke
  );
  drawLine(
    context,
    { x: dividerX, y: 8 },
    { x: dividerX, y: height - 8 },
    '#d5e5ef',
    1,
    []
  );
  drawAccumulationPanel(context, width, height, 'linePlane', dividerX + 8);
}

function drawPlanePlaneScene(context, width, height, scene) {
  const dividerX = width * 0.48;
  const mainWidth = dividerX - 4;
  const verticalScale = height * 0.13;
  const planeP = scene.planeP.polygon.map((point) => (
    projectPoint(point, mainWidth, height, verticalScale)
  ));
  const planeQ = scene.planeQ.polygon.map((point) => (
    projectPoint(point, mainWidth, height, verticalScale)
  ));
  drawPolygon(context, planeP, COLORS.plane, COLORS.planeStroke);
  drawPolygon(
    context,
    planeQ,
    COLORS.secondPlane,
    COLORS.secondPlaneStroke
  );
  scene.planeLines.forEach((line, index) => {
    drawLine(
      context,
      projectPoint(line.start, mainWidth, height, verticalScale),
      projectPoint(line.end, mainWidth, height, verticalScale),
      index === 0 ? COLORS.line : COLORS.secondary,
      2.4,
      []
    );
  });
  scene.parallelLines.forEach((line, index) => {
    drawLine(
      context,
      projectPoint(line.start, mainWidth, height, verticalScale),
      projectPoint(line.end, mainWidth, height, verticalScale),
      index === 0 ? COLORS.line : COLORS.secondary,
      2.4,
      []
    );
  });
  [
    {
      line: scene.parallelLines[0],
      labels: ['A', 'B'],
      color: COLORS.line
    },
    {
      line: scene.parallelLines[1],
      labels: ['C', 'D'],
      color: COLORS.secondary
    },
    {
      line: scene.planeLines[0],
      labels: ['E', 'F'],
      color: COLORS.line
    },
    {
      line: scene.planeLines[1],
      labels: ['G', 'H'],
      color: COLORS.secondary
    }
  ].forEach((entry) => {
    const start = projectPoint(
      entry.line.start,
      mainWidth,
      height,
      verticalScale
    );
    const end = projectPoint(
      entry.line.end,
      mainWidth,
      height,
      verticalScale
    );
    drawLabel(
      context,
      entry.labels[0],
      { x: start.x - 7, y: start.y - 7 },
      entry.color,
      'right'
    );
    drawLabel(
      context,
      entry.labels[1],
      { x: end.x + 7, y: end.y + 7 },
      entry.color,
      'left'
    );
  });
  drawLabel(
    context,
    'P',
    { x: planeP[2].x + 16, y: planeP[2].y + 9 },
    COLORS.planeStroke
  );
  drawLabel(
    context,
    'Q',
    { x: planeQ[2].x + 16, y: planeQ[2].y + 9 },
    COLORS.secondPlaneStroke
  );
  drawLine(
    context,
    { x: dividerX, y: 8 },
    { x: dividerX, y: height - 8 },
    '#e5dac8',
    1,
    []
  );
  drawAccumulationPanel(context, width, height, 'planePlane', dividerX + 8);
}

module.exports = {
  drawLinePlaneScene(context, width, height, scene) {
    context.clearRect(0, 0, width, height);
    drawLinePlaneScene(context, width, height, scene);
  },

  drawPlanePlaneScene(context, width, height, scene) {
    context.clearRect(0, 0, width, height);
    drawPlanePlaneScene(context, width, height, scene);
  }
};
