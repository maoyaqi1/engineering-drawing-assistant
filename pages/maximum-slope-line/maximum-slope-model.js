// 最大斜度线 · 纯几何模型。
//
// 输入是固定平面 ABC、所选投影面和候选线在平面内的方向角。
// 所有计算只返回数据，不读取页面、Canvas 或 wx。

const MODEL_EPSILON = 1e-8;
const SNAP_ANGLE_RADIANS = 2 * Math.PI / 180;
const MODEL_MIN = 0;
const MODEL_MAX = 8;

const DEFAULT_PLANE = {
  // 三点均位于 x + y + z = 8 上。平面与 X/Y/Z 三轴交于
  // (8,0,0)、(0,8,0)、(0,0,8)，在当前 0..8 教学范围内最大。
  a: { x: 4, y: 2, z: 2 },
  b: { x: 1, y: 4, z: 3 },
  c: { x: 2, y: 1, z: 5 }
};

const PROJECTION_DEFINITIONS = {
  H: {
    plane: 'H',
    viewType: 'top',
    name: '水平投影面 H',
    symbol: 'α',
    normal: { x: 0, y: 0, z: 1 }
  },
  V: {
    plane: 'V',
    viewType: 'front',
    name: '正投影面 V',
    symbol: 'β',
    normal: { x: 0, y: 1, z: 0 }
  },
  W: {
    plane: 'W',
    viewType: 'left',
    name: '侧投影面 W',
    symbol: 'γ',
    normal: { x: 1, y: 0, z: 0 }
  }
};

function isFinitePoint(point) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function add(first, second) {
  return {
    x: first.x + second.x,
    y: first.y + second.y,
    z: first.z + second.z
  };
}

function subtract(first, second) {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
    z: first.z - second.z
  };
}

function scale(vector, factor) {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
    z: vector.z * factor
  };
}

function dot(first, second) {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross(first, second) {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x
  };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const length = vectorLength(vector);
  if (!Number.isFinite(length) || length <= MODEL_EPSILON) return null;
  return scale(vector, 1 / length);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapHalfTurn(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI / 2) wrapped -= Math.PI;
  while (wrapped < -Math.PI / 2) wrapped += Math.PI;
  return wrapped;
}

function projectPoint(point, projectionPlane) {
  if (projectionPlane === 'H') return { x: point.x, y: point.y, z: 0 };
  if (projectionPlane === 'V') return { x: point.x, y: 0, z: point.z };
  if (projectionPlane === 'W') return { x: 0, y: point.y, z: point.z };
  return null;
}

function projectDirection(vector, projectionPlane) {
  if (projectionPlane === 'H') return { x: vector.x, y: vector.y, z: 0 };
  if (projectionPlane === 'V') return { x: vector.x, y: 0, z: vector.z };
  if (projectionPlane === 'W') return { x: 0, y: vector.y, z: vector.z };
  return null;
}

function viewVector(vector, projectionPlane) {
  if (projectionPlane === 'H') return { u: vector.x, v: vector.y };
  if (projectionPlane === 'V') return { u: vector.x, v: vector.z };
  if (projectionPlane === 'W') return { u: vector.y, v: vector.z };
  return null;
}

function linePlaneAngle(direction, projectionNormal) {
  const unitDirection = normalize(direction);
  if (!unitDirection) return 0;
  return Math.asin(clamp(
    Math.abs(dot(unitDirection, projectionNormal)),
    0,
    1
  ));
}

function distanceToProjectionPlane(point, projectionPlane) {
  if (projectionPlane === 'H') return Math.abs(point.z);
  if (projectionPlane === 'V') return Math.abs(point.y);
  if (projectionPlane === 'W') return Math.abs(point.x);
  return Infinity;
}

function createPlaneBasis(plane) {
  if (!plane || !isFinitePoint(plane.a)
    || !isFinitePoint(plane.b) || !isFinitePoint(plane.c)) {
    return null;
  }
  const normal = normalize(cross(
    subtract(plane.b, plane.a),
    subtract(plane.c, plane.a)
  ));
  if (!normal) return null;
  const u = normalize(subtract(plane.b, plane.a));
  if (!u) return null;
  const v = normalize(cross(normal, u));
  if (!v) return null;
  return {
    normal,
    u,
    v,
    orientationOf(direction) {
      return Math.atan2(dot(direction, v), dot(direction, u));
    }
  };
}

function appendUniquePoint(points, point) {
  const exists = points.some((candidate) => (
    Math.hypot(
      candidate.x - point.x,
      candidate.y - point.y,
      candidate.z - point.z
    ) <= MODEL_EPSILON
  ));
  if (!exists) points.push(point);
}

// 无限平面与 0..8 教学立方体的交线多边形。边界只是显示范围，
// 不改变 plane.normal / plane.d 所表达的无限平面。
function buildPlanePatch(plane, existingBasis) {
  const basis = existingBasis || createPlaneBasis(plane);
  if (!basis) return null;
  const planeConstant = dot(basis.normal, plane.a);
  const vertices = [];
  [MODEL_MIN, MODEL_MAX].forEach((x) => {
    [MODEL_MIN, MODEL_MAX].forEach((y) => {
      [MODEL_MIN, MODEL_MAX].forEach((z) => {
        vertices.push({ x, y, z });
      });
    });
  });
  const edges = [];
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      const differences = ['x', 'y', 'z'].filter(
        (axis) => vertices[first][axis] !== vertices[second][axis]
      );
      if (differences.length === 1) edges.push([first, second]);
    }
  }

  const intersections = [];
  edges.forEach(([firstIndex, secondIndex]) => {
    const first = vertices[firstIndex];
    const second = vertices[secondIndex];
    const firstDistance = dot(basis.normal, first) - planeConstant;
    const secondDistance = dot(basis.normal, second) - planeConstant;
    if (Math.abs(firstDistance) <= MODEL_EPSILON) {
      appendUniquePoint(intersections, first);
    }
    if (Math.abs(secondDistance) <= MODEL_EPSILON) {
      appendUniquePoint(intersections, second);
    }
    if (firstDistance * secondDistance < 0) {
      const parameter = firstDistance / (firstDistance - secondDistance);
      appendUniquePoint(intersections, {
        x: first.x + (second.x - first.x) * parameter,
        y: first.y + (second.y - first.y) * parameter,
        z: first.z + (second.z - first.z) * parameter
      });
    }
  });
  if (intersections.length < 3) return null;
  const center = intersections.reduce((sum, point) => add(sum, point), {
    x: 0,
    y: 0,
    z: 0
  });
  center.x /= intersections.length;
  center.y /= intersections.length;
  center.z /= intersections.length;
  return intersections.sort((first, second) => {
    const firstOffset = subtract(first, center);
    const secondOffset = subtract(second, center);
    return Math.atan2(
      dot(firstOffset, basis.v),
      dot(firstOffset, basis.u)
    ) - Math.atan2(
      dot(secondOffset, basis.v),
      dot(secondOffset, basis.u)
    );
  });
}

function getPolygonCenter(points) {
  if (!points || !points.length) return null;
  const center = points.reduce((sum, point) => add(sum, point), {
    x: 0,
    y: 0,
    z: 0
  });
  return {
    x: center.x / points.length,
    y: center.y / points.length,
    z: center.z / points.length
  };
}

function clipLineToRectangle(origin, direction, minimum, maximum) {
  let start = -Infinity;
  let end = Infinity;
  for (const axis of ['u', 'v']) {
    if (Math.abs(direction[axis]) <= MODEL_EPSILON) {
      if (origin[axis] < minimum - MODEL_EPSILON
        || origin[axis] > maximum + MODEL_EPSILON) {
        return null;
      }
      continue;
    }
    const first = (minimum - origin[axis]) / direction[axis];
    const second = (maximum - origin[axis]) / direction[axis];
    start = Math.max(start, Math.min(first, second));
    end = Math.min(end, Math.max(first, second));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)
    || end - start <= MODEL_EPSILON) {
    return null;
  }
  return { start, end };
}

function tracePointFromView(viewPoint, projectionPlane) {
  if (projectionPlane === 'H') {
    return { x: viewPoint.u, y: viewPoint.v, z: 0 };
  }
  if (projectionPlane === 'V') {
    return { x: viewPoint.u, y: 0, z: viewPoint.v };
  }
  return { x: 0, y: viewPoint.u, z: viewPoint.v };
}

function buildTrace(normal, planeConstant, projectionPlane, label) {
  const definition = PROJECTION_DEFINITIONS[projectionPlane];
  const viewNormal = viewVector(normal, projectionPlane);
  const viewDirection = {
    u: -viewNormal.v,
    v: viewNormal.u
  };
  let origin;
  if (Math.abs(viewNormal.u) > MODEL_EPSILON) {
    origin = {
      u: planeConstant / viewNormal.u,
      v: 0
    };
  } else if (Math.abs(viewNormal.v) > MODEL_EPSILON) {
    origin = {
      u: 0,
      v: planeConstant / viewNormal.v
    };
  } else {
    return null;
  }
  const parameters = clipLineToRectangle(
    origin,
    viewDirection,
    MODEL_MIN,
    MODEL_MAX
  );
  if (!parameters) return null;
  return {
    projectionPlane,
    label,
    viewType: definition.viewType,
    start: tracePointFromView({
      u: origin.u + viewDirection.u * parameters.start,
      v: origin.v + viewDirection.v * parameters.start
    }, projectionPlane),
    end: tracePointFromView({
      u: origin.u + viewDirection.u * parameters.end,
      v: origin.v + viewDirection.v * parameters.end
    }, projectionPlane)
  };
}

function buildPlaneTraces(normal, planeConstant) {
  return [
    buildTrace(normal, planeConstant, 'H', 'P_H'),
    buildTrace(normal, planeConstant, 'V', 'P_V'),
    buildTrace(normal, planeConstant, 'W', 'P_W')
  ].filter(Boolean);
}

function directionAtOrientation(basis, orientation) {
  return normalize(add(
    scale(basis.u, Math.cos(orientation)),
    scale(basis.v, Math.sin(orientation))
  ));
}

function getPlaneAnchor(plane) {
  return {
    x: (plane.a.x + plane.b.x + plane.c.x) / 3,
    y: (plane.a.y + plane.b.y + plane.c.y) / 3,
    z: (plane.a.z + plane.b.z + plane.c.z) / 3
  };
}

function toPlaneCoordinates(point, basis, origin) {
  const offset = subtract(point, origin);
  return { u: dot(offset, basis.u), v: dot(offset, basis.v) };
}

function cross2D(first, second) {
  return first.u * second.v - first.v * second.u;
}

// 求过平面内一点的无限直线与该平面三角边界的有符号参数区间。
function getLineParametersInsideTriangle(vertices, origin, direction) {
  let minimum = Infinity;
  let maximum = -Infinity;
  const parameters = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const edge = { u: end.u - start.u, v: end.v - start.v };
    const offset = { u: start.u - origin.u, v: start.v - origin.v };
    const denominator = cross2D(direction, edge);
    if (Math.abs(denominator) <= MODEL_EPSILON) continue;
    const lineParameter = cross2D(offset, edge) / denominator;
    const edgeParameter = cross2D(offset, direction) / denominator;
    if (edgeParameter >= -MODEL_EPSILON
      && edgeParameter <= 1 + MODEL_EPSILON) {
      parameters.push(lineParameter);
    }
  }
  parameters.forEach((parameter) => {
    if (parameter < minimum) minimum = parameter;
    if (parameter > maximum) maximum = parameter;
  });
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)
    || maximum - minimum <= MODEL_EPSILON) {
    return null;
  }
  return { minimum, maximum };
}

function createClippedLine(polygon, anchor, direction, basis) {
  const vertices = polygon
    .map((point) => toPlaneCoordinates(point, basis, anchor));
  const direction2D = {
    u: dot(direction, basis.u),
    v: dot(direction, basis.v)
  };
  const parameters = getLineParametersInsideTriangle(
    vertices,
    { u: 0, v: 0 },
    direction2D
  );
  if (!parameters) return null;
  return {
    start: add(anchor, scale(direction, parameters.minimum)),
    end: add(anchor, scale(direction, parameters.maximum)),
    positiveEnd: add(anchor, scale(direction, parameters.maximum))
  };
}

function orientationFromViewVector(basis, projectionPlane, vector) {
  if (!vector || !Number.isFinite(vector.u) || !Number.isFinite(vector.v)) {
    return null;
  }
  if (Math.hypot(vector.u, vector.v) <= MODEL_EPSILON) return null;
  const projectedU = viewVector(basis.u, projectionPlane);
  const projectedV = viewVector(basis.v, projectionPlane);
  const determinant = projectedU.u * projectedV.v
    - projectedU.v * projectedV.u;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= MODEL_EPSILON) {
    return null;
  }
  const coefficientU = (
    vector.u * projectedV.v - vector.v * projectedV.u
  ) / determinant;
  const coefficientV = (
    projectedU.u * vector.v - projectedU.v * vector.u
  ) / determinant;
  if (Math.hypot(coefficientU, coefficientV) <= MODEL_EPSILON) return null;
  return Math.atan2(coefficientV, coefficientU);
}

function buildGeometryFromOrientation(plane, projectionPlane, orientation) {
  if (!plane || !projectionPlane) return null;
  const definition = PROJECTION_DEFINITIONS[projectionPlane];
  const basis = createPlaneBasis(plane);
  if (!definition || !basis) return null;

  const patch = buildPlanePatch(plane, basis);
  const anchor = getPolygonCenter(patch);
  if (!patch || !anchor) return null;
  const projectionNormal = definition.normal;
  const planeConstant = dot(basis.normal, plane.a);
  const traces = buildPlaneTraces(basis.normal, planeConstant);
  const projectedNormal = subtract(
    projectionNormal,
    scale(basis.normal, dot(projectionNormal, basis.normal))
  );
  const projectedNormalLength = vectorLength(projectedNormal);
  const hasUniqueMaximum = projectedNormalLength > MODEL_EPSILON;
  const maximumDirection = hasUniqueMaximum
    ? normalize(projectedNormal)
    : basis.u;
  if (!maximumDirection) return null;
  const helperDirection = normalize(cross(basis.normal, maximumDirection));
  if (!helperDirection) return null;

  const maximumOrientation = basis.orientationOf(maximumDirection);
  let candidateOrientation = Number.isFinite(orientation)
    ? orientation
    : maximumOrientation;
  let orientationDifference = wrapHalfTurn(
    candidateOrientation - maximumOrientation
  );
  const withinSnap = hasUniqueMaximum
    && Math.abs(orientationDifference) <= SNAP_ANGLE_RADIANS;
  if (withinSnap) {
    candidateOrientation = maximumOrientation;
    orientationDifference = 0;
  }

  const candidateDirection = directionAtOrientation(
    basis,
    candidateOrientation
  );
  if (!candidateDirection) return null;
  const candidate = createClippedLine(
    patch,
    anchor,
    candidateDirection,
    basis
  );
  const helper = createClippedLine(
    patch,
    anchor,
    helperDirection,
    basis
  );
  const maximumLine = createClippedLine(
    patch,
    anchor,
    maximumDirection,
    basis
  );
  if (!candidate || !helper || !maximumLine) return null;

  const angle = linePlaneAngle(candidateDirection, projectionNormal);
  const maximumAngle = linePlaneAngle(
    maximumDirection,
    projectionNormal
  );
  const candidateStartDistance = distanceToProjectionPlane(
    candidate.start,
    projectionPlane
  );
  const candidateEndDistance = distanceToProjectionPlane(
    candidate.end,
    projectionPlane
  );
  const hasStartOnProjectionPlane = candidateStartDistance
    <= candidateEndDistance;
  const angleVertex = hasStartOnProjectionPlane
    ? candidate.start
    : candidate.end;
  const lineOtherPoint = hasStartOnProjectionPlane
    ? candidate.end
    : candidate.start;
  const projectedLineOtherPoint = projectPoint(
    lineOtherPoint,
    projectionPlane
  );
  return {
    plane,
    projectionPlane,
    viewType: definition.viewType,
    projectionName: definition.name,
    projectionSymbol: definition.symbol,
    basis,
    normal: basis.normal,
    patch,
    traces,
    anchor,
    candidateDirection,
    helperDirection,
    maximumDirection,
    candidate,
    helper,
    maximumLine,
    angleVertex,
    lineOtherPoint,
    projectedLineOtherPoint,
    candidateOrientation,
    maximumOrientation,
    orientationDifference,
    isMaximum: withinSnap || !hasUniqueMaximum,
    hasUniqueMaximum,
    angle,
    angleDegrees: angle * 180 / Math.PI,
    maximumAngle,
    maximumAngleDegrees: maximumAngle * 180 / Math.PI
  };
}

function clonePlane(plane) {
  const source = plane || DEFAULT_PLANE;
  return {
    a: { ...source.a },
    b: { ...source.b },
    c: { ...source.c }
  };
}

module.exports = {
  DEFAULT_PLANE,
  MODEL_EPSILON,
  SNAP_ANGLE_RADIANS,
  PROJECTION_DEFINITIONS,
  add,
  subtract,
  scale,
  dot,
  cross,
  normalize,
  vectorLength,
  projectPoint,
  projectDirection,
  viewVector,
  clonePlane,
  createPlaneBasis,
  buildPlanePatch,
  buildPlaneTraces,
  orientationFromViewVector,
  buildGeometryFromOrientation
};
