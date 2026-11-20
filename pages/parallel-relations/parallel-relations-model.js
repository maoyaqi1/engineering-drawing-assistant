// 线面、面面平行 · 静态教学几何。
//
// 输入输出均为三维教学坐标，不依赖页面或 Canvas。示意图用最简单的
// 水平平面表达平行条件，渲染层只负责投影和标注。

const EPSILON = 1e-8;

function subtract(first, second) {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
    z: first.z - second.z
  };
}

function dot(first, second) {
  return first.x * second.x
    + first.y * second.y
    + first.z * second.z;
}

function cross(first, second) {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x
  };
}

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const magnitude = length(vector);
  if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return null;
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude
  };
}

function signedPlaneDistance(plane, point) {
  return dot(plane.normal, subtract(point, plane.origin));
}

function buildLinePlaneScene() {
  const plane = {
    key: 'P',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    polygon: [
      { x: -2.7, y: -1.7, z: 0 },
      { x: 2.7, y: -1.7, z: 0 },
      { x: 2.7, y: 1.7, z: 0 },
      { x: -2.7, y: 1.7, z: 0 }
    ]
  };
  const lineInPlane = {
    key: 'CD',
    start: { x: -2.2, y: -1.1, z: 0 },
    end: { x: 1.8, y: 0.7, z: 0 }
  };
  const parallelLine = {
    key: 'AB',
    start: { x: -2.3, y: 0.15, z: 1.55 },
    end: { x: 1.7, y: 1.95, z: 1.55 }
  };
  const pointA = { x: -2.3, y: 0.15, z: 1.55 };
  const pointFoot = { x: pointA.x, y: pointA.y, z: 0 };
  const lineDirection = normalize(subtract(
    parallelLine.end,
    parallelLine.start
  ));
  const planeLineDirection = normalize(subtract(
    lineInPlane.end,
    lineInPlane.start
  ));
  return {
    plane,
    lineInPlane,
    parallelLine,
    pointA,
    pointFoot,
    checks: {
      lineInPlane: Math.abs(signedPlaneDistance(
        plane,
        lineInPlane.start
      )) <= EPSILON,
      parallelDirections: Math.abs(
        dot(lineDirection, planeLineDirection)
      ) >= 1 - EPSILON,
      notParallelToPlaneEdge: Math.abs(lineDirection.x) > EPSILON
        && Math.abs(lineDirection.y) > EPSILON,
      lineOutsidePlane: Math.abs(signedPlaneDistance(
        plane,
        parallelLine.start
      )) > EPSILON
    }
  };
}

function buildPlanePlaneScene() {
  const planeP = {
    key: 'P',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    polygon: [
      { x: -2.7, y: -1.7, z: 0 },
      { x: 2.7, y: -1.7, z: 0 },
      { x: 2.7, y: 1.7, z: 0 },
      { x: -2.7, y: 1.7, z: 0 }
    ]
  };
  const planeQ = {
    key: 'Q',
    origin: { x: 0, y: 0, z: 2.1 },
    normal: { x: 0, y: 0, z: 1 },
    polygon: [
      { x: -2.7, y: -1.7, z: 2.1 },
      { x: 2.7, y: -1.7, z: 2.1 },
      { x: 2.7, y: 1.7, z: 2.1 },
      { x: -2.7, y: 1.7, z: 2.1 }
    ]
  };
  const planeLines = [
    {
      key: 'EF',
      start: { x: -1.8, y: -0.9, z: 0 },
      end: { x: 1.8, y: 0.9, z: 0 }
    },
    {
      key: 'GH',
      start: { x: -1.5, y: 1.1, z: 0 },
      end: { x: 1.5, y: -1.1, z: 0 }
    }
  ];
  const parallelLines = [
    {
      key: 'AB',
      start: { x: -1.8, y: -0.9, z: 2.1 },
      end: { x: 1.8, y: 0.9, z: 2.1 }
    },
    {
      key: 'CD',
      start: { x: -1.5, y: 1.1, z: 2.1 },
      end: { x: 1.5, y: -1.1, z: 2.1 }
    }
  ];
  const direction = (line) => normalize(subtract(line.end, line.start));
  return {
    planeP,
    planeQ,
    planeLines,
    parallelLines,
    checks: {
      planeNormalsParallel: Math.abs(dot(
        planeP.normal,
        planeQ.normal
      )) >= 1 - EPSILON,
      firstPairParallel: Math.abs(dot(
        direction(planeLines[0]),
        direction(parallelLines[0])
      )) >= 1 - EPSILON,
      secondPairParallel: Math.abs(dot(
        direction(planeLines[1]),
        direction(parallelLines[1])
      )) >= 1 - EPSILON,
      internalLinesIntersect: Math.abs(cross(
        subtract(planeLines[0].end, planeLines[0].start),
        subtract(planeLines[1].end, planeLines[1].start)
      ).z) > EPSILON
    }
  };
}

module.exports = {
  EPSILON,
  signedPlaneDistance,
  buildLinePlaneScene,
  buildPlanePlaneScene
};
