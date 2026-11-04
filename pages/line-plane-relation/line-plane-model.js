// 直线与平面 · 纯几何模型。
//
// 所有输入、输出均为教学空间中的三维数据，不读取页面、Canvas 或 wx。
// 直线按无限直线判定，E/F 只是屏幕上的可视线段端点。

const MODEL_MIN = 0;
const MODEL_MAX = 8;
const PLANE_PATCH_MARGIN = 0.65;
const MODEL_EPSILON = 1e-8;
const RELATION_EPSILON = 1e-6;
const PERPENDICULAR_EPSILON = 1e-5;

const DEFAULT_PLANE = {
  // 三点均满足 x + y + z = 8，使平面在第一分角内形成完整的大三角块。
  a: { x: 4, y: 2, z: 2 },
  b: { x: 1, y: 4, z: 3 },
  c: { x: 2, y: 1, z: 5 }
};

const SPECIAL_PLANE = {
  // 正垂面 x + z = 8，其正面投影 x + z = 8 积聚为一条直线。
  a: { x: 2, y: 2, z: 6 },
  b: { x: 6, y: 4, z: 2 },
  c: { x: 3, y: 1, z: 5 }
};

const VERTICAL_PLANE = {
  // 铅垂面 x + y = 8，其水平投影积聚为一条直线。
  a: { x: 2, y: 6, z: 2 },
  b: { x: 6, y: 2, z: 3 },
  c: { x: 2, y: 6, z: 5 }
};

const PROFILE_PROJECTING_PLANE = {
  // 侧垂面 y + z = 8，其侧面投影积聚为一条直线。
  a: { x: 2, y: 1, z: 7 },
  b: { x: 4, y: 3, z: 5 },
  c: { x: 6, y: 2, z: 6 }
};

const PLANE_PRESETS = {
  general: DEFAULT_PLANE,
  vertical: VERTICAL_PLANE,
  frontProjecting: SPECIAL_PLANE,
  profileProjecting: PROFILE_PROJECTING_PLANE
};

const LINE_DIRECTIONS = {
  general: normalize({ x: 1, y: -0.8, z: 1 }),
  vertical: { x: 0, y: 0, z: 1 },
  frontProjecting: { x: 0, y: 1, z: 0 },
  profileProjecting: { x: 1, y: 0, z: 0 }
};

const LINE_PRESETS = {
  inPlane: {
    e: { x: 3, y: 2, z: 3 },
    f: { x: 2, y: 3, z: 3 }
  },
  parallel: {
    e: { x: 3, y: 2, z: 3.8 },
    f: { x: 2, y: 3, z: 3.8 }
  },
  intersect: {
    e: { x: 1.5, y: 1.5, z: 1.5 },
    f: { x: 6.5, y: 2.5, z: 5.5 }
  },
  perpendicular: {
    e: { x: 0.9333333333, y: 0.9333333333, z: 1.9333333333 },
    f: { x: 3.7333333333, y: 3.7333333333, z: 4.7333333333 }
  },
  specialIntersect: {
    e: { x: 1, y: 1, z: 5 },
    f: { x: 6, y: 4, z: 3 }
  },
  projecting: {
    // 铅垂线 x=3、y=2，水平投影积聚为一点。
    e: { x: 3, y: 2, z: 0.7 },
    f: { x: 3, y: 2, z: 6.5 }
  }
};

const RELATION_DEFINITIONS = {
  inPlane: {
    label: '直线在平面内',
    shortLabel: '在面内',
    color: '#e04f54'
  },
  parallel: {
    label: '直线平行于平面',
    shortLabel: '平行',
    color: '#1684ff'
  },
  intersect: {
    label: '直线与平面相交',
    shortLabel: '相交',
    color: '#f59e0b'
  },
  perpendicular: {
    label: '直线垂直于平面',
    shortLabel: '垂直相交',
    color: '#d7322d'
  }
};

function isFinitePoint(point) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function clonePoint(point) {
  return isFinitePoint(point)
    ? { x: point.x, y: point.y, z: point.z }
    : null;
}

function clonePlane(plane) {
  const source = plane || DEFAULT_PLANE;
  return {
    a: clonePoint(source.a),
    b: clonePoint(source.b),
    c: clonePoint(source.c)
  };
}

function cloneLine(line) {
  const source = line || LINE_PRESETS.intersect;
  return {
    e: clonePoint(source.e),
    f: clonePoint(source.f)
  };
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
  const vectorLength = length(vector);
  if (!Number.isFinite(vectorLength) || vectorLength <= MODEL_EPSILON) {
    return null;
  }
  return scale(vector, 1 / vectorLength);
}

function lerp(first, second, parameter) {
  return add(first, scale(subtract(second, first), parameter));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getTriangleCenter(plane) {
  return {
    x: (plane.a.x + plane.b.x + plane.c.x) / 3,
    y: (plane.a.y + plane.b.y + plane.c.y) / 3,
    z: (plane.a.z + plane.b.z + plane.c.z) / 3
  };
}

function createPlaneGeometry(plane) {
  const source = clonePlane(plane);
  if (!isFinitePoint(source.a)
    || !isFinitePoint(source.b)
    || !isFinitePoint(source.c)) {
    return null;
  }
  const normal = normalize(cross(
    subtract(source.b, source.a),
    subtract(source.c, source.a)
  ));
  if (!normal) return null;
  const u = normalize(subtract(source.b, source.a));
  if (!u) return null;
  const v = normalize(cross(normal, u));
  if (!v) return null;
  const constant = dot(normal, source.a);
  const cubeCenter = { x: 4, y: 4, z: 4 };
  const patchCenter = subtract(
    cubeCenter,
    scale(normal, dot(normal, cubeCenter) - constant)
  );
  const patch = buildPlanePatch(normal, patchCenter, constant);
  const displayPlane = patch.length === 3
    ? { a: patch[0], b: patch[1], c: patch[2] }
    : source;
  const displayU = normalize(subtract(displayPlane.b, displayPlane.a)) || u;
  const displayV = normalize(cross(normal, displayU)) || v;
  return {
    plane: displayPlane,
    vertices: [displayPlane.a, displayPlane.b, displayPlane.c],
    normal,
    constant,
    center: getTriangleCenter(displayPlane),
    basis: { u: displayU, v: displayV },
    patch
  };
}

function appendUniquePoint(points, point) {
  const exists = points.some((candidate) => (
    length(subtract(candidate, point)) <= MODEL_EPSILON
  ));
  if (!exists) points.push(point);
}

function buildCubeSectionPolygon(normal, constant) {
  const patchMin = MODEL_MIN + PLANE_PATCH_MARGIN;
  const patchMax = MODEL_MAX - PLANE_PATCH_MARGIN;
  const vertices = [];
  [patchMin, patchMax].forEach((x) => {
    [patchMin, patchMax].forEach((y) => {
      [patchMin, patchMax].forEach((z) => {
        vertices.push({ x, y, z });
      });
    });
  });
  const intersections = [];
  for (let firstIndex = 0; firstIndex < vertices.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < vertices.length; secondIndex += 1) {
      const first = vertices[firstIndex];
      const second = vertices[secondIndex];
      const differing = ['x', 'y', 'z'].filter(
        (axis) => first[axis] !== second[axis]
      );
      if (differing.length !== 1) continue;
      const firstDistance = dot(normal, first) - constant;
      const secondDistance = dot(normal, second) - constant;
      if (Math.abs(firstDistance) <= MODEL_EPSILON) {
        appendUniquePoint(intersections, first);
      }
      if (Math.abs(secondDistance) <= MODEL_EPSILON) {
        appendUniquePoint(intersections, second);
      }
      if (firstDistance * secondDistance < 0) {
        const parameter = firstDistance / (firstDistance - secondDistance);
        appendUniquePoint(intersections, lerp(first, second, parameter));
      }
    }
  }
  if (intersections.length < 3) return intersections;
  const center = intersections.reduce((sum, point) => add(sum, point), {
    x: 0,
    y: 0,
    z: 0
  });
  center.x /= intersections.length;
  center.y /= intersections.length;
  center.z /= intersections.length;
  const reference = normalize(cross(normal, { x: 0, y: 0, z: 1 }))
    || normalize(cross(normal, { x: 1, y: 0, z: 0 }));
  if (!reference) return intersections;
  const secondReference = normalize(cross(normal, reference));
  return intersections.sort((first, second) => {
    const firstOffset = subtract(first, center);
    const secondOffset = subtract(second, center);
    return Math.atan2(
      dot(firstOffset, secondReference),
      dot(firstOffset, reference)
    ) - Math.atan2(
      dot(secondOffset, secondReference),
      dot(secondOffset, reference)
    );
  });
}

function hasObliqueEdges(points) {
  return points.every((point, index) => {
    const edge = subtract(points[(index + 1) % points.length], point);
    return Math.abs(edge.x) > MODEL_EPSILON
      && Math.abs(edge.y) > MODEL_EPSILON
      && Math.abs(edge.z) > MODEL_EPSILON;
  });
}

function buildLargestTriangle(polygon) {
  let best = null;
  let bestArea = -1;
  for (let first = 0; first < polygon.length - 2; first += 1) {
    for (let second = first + 1; second < polygon.length - 1; second += 1) {
      for (let third = second + 1; third < polygon.length; third += 1) {
        const triangle = [polygon[first], polygon[second], polygon[third]];
        const area = length(cross(
          subtract(triangle[1], triangle[0]),
          subtract(triangle[2], triangle[0])
        )) / 2;
        if (area > bestArea) {
          bestArea = area;
          best = triangle;
        }
      }
    }
  }
  return best;
}

function buildObliqueInnerTriangle(outer) {
  if (!outer) return null;
  const steps = [0.06, 0.1, 0.14, 0.18];
  let best = null;
  let bestArea = -1;
  steps.forEach((firstRatio) => {
    steps.forEach((secondRatio) => {
      steps.forEach((thirdRatio) => {
        const triangle = [
          lerp(outer[0], outer[1], firstRatio),
          lerp(outer[1], outer[2], secondRatio),
          lerp(outer[2], outer[0], thirdRatio)
        ];
        if (!hasObliqueEdges(triangle)) return;
        const area = length(cross(
          subtract(triangle[1], triangle[0]),
          subtract(triangle[2], triangle[0])
        )) / 2;
        if (area > bestArea) {
          bestArea = area;
          best = triangle;
        }
      });
    });
  });
  return best;
}

function buildPlanePatch(normal, center, constant) {
  const cubeSection = buildCubeSectionPolygon(normal, constant);
  const triangle = buildObliqueInnerTriangle(
    buildLargestTriangle(cubeSection)
  );
  if (triangle) return triangle;
  const seeds = [
    { x: 1, y: 0.72, z: 0.34 },
    { x: 0.31, y: 1, z: 0.63 },
    { x: 0.58, y: 0.22, z: 1 }
  ];
  const score = (vector) => Math.min(
    Math.abs(vector.x),
    Math.abs(vector.y),
    Math.abs(vector.z)
  );
  const candidates = seeds.map((seed) => normalize(cross(normal, seed)))
    .filter(Boolean)
    .sort((first, second) => score(second) - score(first));
  const u = candidates[0];
  if (!u) return [];
  let v = normalize(cross(normal, u));
  if (!v) return [];
  if (score(v) <= MODEL_EPSILON) {
    const alternative = candidates.find((candidate) => {
      const projected = subtract(candidate, scale(u, dot(candidate, u)));
      const unit = normalize(projected);
      return unit && score(unit) > MODEL_EPSILON;
    });
    if (alternative) {
      v = normalize(subtract(alternative, scale(u, dot(alternative, u))));
    }
  }
  if (!v) return [];
  const patchMin = MODEL_MIN + PLANE_PATCH_MARGIN;
  const patchMax = MODEL_MAX - PLANE_PATCH_MARGIN;
  let halfSize = 3;
  ['x', 'y', 'z'].forEach((axis) => {
    const offset = Math.abs(u[axis]) + Math.abs(v[axis]);
    if (offset > MODEL_EPSILON) {
      halfSize = Math.min(
        halfSize,
        (patchMax - center[axis]) / offset,
        (center[axis] - patchMin) / offset
      );
    }
  });
  halfSize = Math.max(0.6, halfSize);
  return [
    add(center, scale(add(u, v), halfSize)),
    add(center, scale(add(scale(u, -1), v), halfSize)),
    add(center, scale(add(scale(u, -1), scale(v, -1)), halfSize)),
    add(center, scale(add(u, scale(v, -1)), halfSize))
  ];
}

function signedDistance(planeGeometry, point) {
  return dot(planeGeometry.normal, point) - planeGeometry.constant;
}

function projectPointToPlane(point, projectionPlane) {
  if (projectionPlane === 'H') return { x: point.x, y: point.y, z: 0 };
  if (projectionPlane === 'V') return { x: point.x, y: 0, z: point.z };
  if (projectionPlane === 'W') return { x: 0, y: point.y, z: point.z };
  return null;
}

function projectDirectionToPlane(direction, projectionPlane) {
  if (projectionPlane === 'H') return { x: direction.x, y: direction.y, z: 0 };
  if (projectionPlane === 'V') return { x: direction.x, y: 0, z: direction.z };
  if (projectionPlane === 'W') return { x: 0, y: direction.y, z: direction.z };
  return null;
}

function linePlaneAngle(direction, planeNormal) {
  const unitDirection = normalize(direction);
  if (!unitDirection) return 0;
  return Math.asin(clamp(Math.abs(dot(unitDirection, planeNormal)), 0, 1));
}

function intersectInfiniteLineWithPlane(planeGeometry, line) {
  const signedE = signedDistance(planeGeometry, line.e);
  const signedF = signedDistance(planeGeometry, line.f);
  const denominator = signedE - signedF;
  if (Math.abs(denominator) <= RELATION_EPSILON) return null;
  const parameter = signedE / denominator;
  return {
    point: lerp(line.e, line.f, parameter),
    parameter,
    isOnSegment: parameter >= -RELATION_EPSILON
      && parameter <= 1 + RELATION_EPSILON,
    signedE,
    signedF
  };
}

function classifyLinePlane(planeGeometry, line) {
  if (!planeGeometry || !line || !isFinitePoint(line.e)
    || !isFinitePoint(line.f)) {
    return null;
  }
  const direction = subtract(line.f, line.e);
  const unitDirection = normalize(direction);
  if (!unitDirection) {
    return {
      valid: false,
      kind: 'degenerate',
      label: '线段退化',
      shortLabel: '无效',
      color: '#8b96a5',
      angleDegrees: 0,
      signedE: 0,
      signedF: 0
    };
  }

  const signedE = signedDistance(planeGeometry, line.e);
  const signedF = signedDistance(planeGeometry, line.f);
  const sameDistance = Math.abs(signedE - signedF) <= RELATION_EPSILON;
  let kind = 'intersect';
  let intersection = null;
  if (sameDistance && Math.abs(signedE) <= RELATION_EPSILON) {
    kind = 'inPlane';
  } else if (sameDistance) {
    kind = 'parallel';
  } else {
    intersection = intersectInfiniteLineWithPlane(planeGeometry, line);
  }

  const lineAngle = linePlaneAngle(direction, planeGeometry.normal);
  const isPerpendicular = kind === 'intersect'
    && Math.abs(1 - Math.abs(dot(unitDirection, planeGeometry.normal)))
      <= PERPENDICULAR_EPSILON;
  if (isPerpendicular) kind = 'perpendicular';
  const definition = RELATION_DEFINITIONS[kind];

  return {
    valid: true,
    kind,
    label: definition.label,
    shortLabel: definition.shortLabel,
    color: definition.color,
    direction,
    unitDirection,
    signedE,
    signedF,
    angleRadians: lineAngle,
    angleDegrees: lineAngle * 180 / Math.PI,
    intersection,
    isPerpendicular
  };
}

function toPlaneCoordinates(point, planeGeometry, origin) {
  const offset = subtract(point, origin);
  return {
    u: dot(offset, planeGeometry.basis.u),
    v: dot(offset, planeGeometry.basis.v)
  };
}

function cross2D(first, second) {
  return first.u * second.v - first.v * second.u;
}

function clipLineToTriangle(planeGeometry, origin, direction) {
  if (!planeGeometry || !origin || !direction) return null;
  const viewOrigin = toPlaneCoordinates(
    origin,
    planeGeometry,
    planeGeometry.plane.a
  );
  const viewDirection = {
    u: dot(direction, planeGeometry.basis.u),
    v: dot(direction, planeGeometry.basis.v)
  };
  if (Math.hypot(viewDirection.u, viewDirection.v) <= MODEL_EPSILON) {
    return null;
  }
  const vertices = planeGeometry.vertices.map((point) => (
    toPlaneCoordinates(point, planeGeometry, planeGeometry.plane.a)
  ));
  const parameters = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const edge = { u: end.u - start.u, v: end.v - start.v };
    const offset = { u: start.u - viewOrigin.u, v: start.v - viewOrigin.v };
    const denominator = cross2D(viewDirection, edge);
    if (Math.abs(denominator) <= MODEL_EPSILON) continue;
    const lineParameter = cross2D(offset, edge) / denominator;
    const edgeParameter = cross2D(offset, viewDirection) / denominator;
    if (edgeParameter >= -RELATION_EPSILON
      && edgeParameter <= 1 + RELATION_EPSILON) {
      if (!parameters.some((value) => (
        Math.abs(value - lineParameter) <= RELATION_EPSILON
      ))) {
        parameters.push(lineParameter);
      }
    }
  }
  if (parameters.length < 2) return null;
  const minimum = Math.min(...parameters);
  const maximum = Math.max(...parameters);
  if (maximum - minimum <= MODEL_EPSILON) return null;
  return {
    start: add(origin, scale(direction, minimum)),
    end: add(origin, scale(direction, maximum)),
    minimum,
    maximum
  };
}

function chooseReferenceDirection(planeNormal, projectionNormal) {
  const direction = normalize(cross(planeNormal, projectionNormal));
  if (direction) return direction;
  return normalize(cross(planeNormal, { x: 1, y: 0, z: 0 }));
}

function buildInPlaneReferences(planeGeometry) {
  if (!planeGeometry) return null;
  const horizontalDirection = chooseReferenceDirection(
    planeGeometry.normal,
    { x: 0, y: 0, z: 1 }
  );
  const frontalDirection = chooseReferenceDirection(
    planeGeometry.normal,
    { x: 0, y: 1, z: 0 }
  );
  const horizontalLine = horizontalDirection
    ? clipLineToTriangle(
      planeGeometry,
      planeGeometry.center,
      horizontalDirection
    )
    : null;
  const frontalLine = frontalDirection
    ? clipLineToTriangle(
      planeGeometry,
      planeGeometry.center,
      frontalDirection
    )
    : null;
  return {
    horizontalDirection,
    frontalDirection,
    horizontalLine,
    frontalLine
  };
}

function chooseAuxiliaryProjection(line) {
  const direction = subtract(line.f, line.e);
  if (Math.hypot(direction.x, direction.y) > RELATION_EPSILON) return 'H';
  if (Math.hypot(direction.x, direction.z) > RELATION_EPSILON) return 'V';
  return 'W';
}

function getLineAccumulationPlane(line) {
  if (!line) return null;
  const direction = subtract(line.f, line.e);
  if (Math.abs(direction.x) <= MODEL_EPSILON
    && Math.abs(direction.y) <= MODEL_EPSILON) {
    return 'H';
  }
  if (Math.abs(direction.x) <= MODEL_EPSILON
    && Math.abs(direction.z) <= MODEL_EPSILON) {
    return 'V';
  }
  if (Math.abs(direction.y) <= MODEL_EPSILON
    && Math.abs(direction.z) <= MODEL_EPSILON) {
    return 'W';
  }
  return null;
}

function getPlaneAccumulationPlane(planeGeometry) {
  if (!planeGeometry) return null;
  const normal = planeGeometry.normal;
  if (Math.abs(normal.z) <= MODEL_EPSILON) return 'H';
  if (Math.abs(normal.y) <= MODEL_EPSILON) return 'V';
  if (Math.abs(normal.x) <= MODEL_EPSILON) return 'W';
  return null;
}

function getIntersectionMethodKind(lineAccumulationPlane, planeAccumulationPlane) {
  if (lineAccumulationPlane && planeAccumulationPlane) return 'both';
  if (lineAccumulationPlane) return 'line';
  if (planeAccumulationPlane) return 'plane';
  return 'auxiliary';
}

function getProjectionNormal(projectionPlane) {
  if (projectionPlane === 'H') return { x: 0, y: 0, z: 1 };
  if (projectionPlane === 'V') return { x: 0, y: 1, z: 0 };
  return { x: 1, y: 0, z: 0 };
}

function makeCurtainCorners(first, second, projectionPlane) {
  const minimum = projectPointToPlane(first, projectionPlane);
  const maximum = projectPointToPlane(second, projectionPlane);
  const lowFirst = { ...minimum };
  const lowSecond = { ...maximum };
  const highFirst = { ...minimum };
  const highSecond = { ...maximum };
  if (projectionPlane === 'H') {
    lowFirst.z = MODEL_MIN;
    lowSecond.z = MODEL_MIN;
    highFirst.z = MODEL_MAX;
    highSecond.z = MODEL_MAX;
  } else if (projectionPlane === 'V') {
    lowFirst.y = MODEL_MIN;
    lowSecond.y = MODEL_MIN;
    highFirst.y = MODEL_MAX;
    highSecond.y = MODEL_MAX;
  } else {
    lowFirst.x = MODEL_MIN;
    lowSecond.x = MODEL_MIN;
    highFirst.x = MODEL_MAX;
    highSecond.x = MODEL_MAX;
  }
  return [lowFirst, lowSecond, highSecond, highFirst];
}

function pointOnTwoPlanes(firstPlane, firstConstant, secondPlane, secondConstant) {
  const direction = cross(firstPlane, secondPlane);
  const denominator = dot(direction, direction);
  if (denominator <= MODEL_EPSILON) return null;
  return scale(add(
    scale(cross(secondPlane, direction), firstConstant),
    scale(cross(direction, firstPlane), secondConstant)
  ), 1 / denominator);
}

function clipProjectionLineToSquare(origin, direction) {
  let minimum = -Infinity;
  let maximum = Infinity;
  ['x', 'y'].forEach((axis) => {
    if (Math.abs(direction[axis]) <= MODEL_EPSILON) {
      if (origin[axis] < MODEL_MIN - MODEL_EPSILON
        || origin[axis] > MODEL_MAX + MODEL_EPSILON) {
        minimum = Infinity;
        maximum = -Infinity;
      }
      return;
    }
    const first = (MODEL_MIN - origin[axis]) / direction[axis];
    const second = (MODEL_MAX - origin[axis]) / direction[axis];
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  });
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)
    || maximum - minimum <= MODEL_EPSILON) {
    return null;
  }
  return { minimum, maximum };
}

function buildProjectionTrace(auxiliaryPlane, projectionPlane) {
  const projectorNormal = projectionPlane === 'H'
    ? { x: 0, y: 0, z: 1 }
    : (projectionPlane === 'V'
      ? { x: 0, y: 1, z: 0 }
      : { x: 1, y: 0, z: 0 });
  const direction = normalize(cross(auxiliaryPlane.normal, projectorNormal));
  if (!direction) return null;
  const origin = pointOnTwoPlanes(
    auxiliaryPlane.normal,
    auxiliaryPlane.constant,
    projectorNormal,
    0
  );
  if (!origin) return null;
  const viewDirection = projectionPlane === 'H'
    ? { x: direction.x, y: direction.y }
    : (projectionPlane === 'V'
      ? { x: direction.x, y: direction.z }
      : { x: direction.y, y: direction.z });
  const viewOrigin = projectionPlane === 'H'
    ? { x: origin.x, y: origin.y }
    : (projectionPlane === 'V'
      ? { x: origin.x, y: origin.z }
      : { x: origin.y, y: origin.z });
  const clipped = clipProjectionLineToSquare(viewOrigin, viewDirection);
  if (!clipped) return null;
  const toWorld = (parameter) => {
    const point = add(origin, scale(direction, parameter));
    if (projectionPlane === 'H') point.z = 0;
    if (projectionPlane === 'V') point.y = 0;
    if (projectionPlane === 'W') point.x = 0;
    return point;
  };
  return {
    projectionPlane,
    label: `Q_${projectionPlane}`,
    start: toWorld(clipped.minimum),
    end: toWorld(clipped.maximum)
  };
}

function buildAuxiliaryPlane(line, requestedProjectionPlane) {
  if (!line) return null;
  const recommendedProjectionPlane = chooseAuxiliaryProjection(line);
  const requestedDirection = requestedProjectionPlane
    ? projectDirectionToPlane(
      subtract(line.f, line.e),
      requestedProjectionPlane
    )
    : null;
  const projectionPlane = requestedProjectionPlane
    && requestedDirection
    && length(requestedDirection) > MODEL_EPSILON
    ? requestedProjectionPlane
    : recommendedProjectionPlane;
  const projectionNormal = getProjectionNormal(projectionPlane);
  const projectedDirection = projectDirectionToPlane(
    subtract(line.f, line.e),
    projectionPlane
  );
  const normal = normalize(cross(projectionNormal, projectedDirection));
  if (!normal) return null;
  return {
    projectionPlane,
    recommendedProjectionPlane,
    normal,
    constant: dot(normal, line.e),
    curtainCorners: makeCurtainCorners(line.e, line.f, projectionPlane),
    trace: buildProjectionTrace({
      normal,
      constant: dot(normal, line.e)
    }, projectionPlane)
  };
}

function buildSectionLine(planeGeometry, auxiliaryPlane) {
  if (!planeGeometry || !auxiliaryPlane) return null;
  const direction = normalize(cross(
    planeGeometry.normal,
    auxiliaryPlane.normal
  ));
  if (!direction) return null;
  const origin = pointOnTwoPlanes(
    planeGeometry.normal,
    planeGeometry.constant,
    auxiliaryPlane.normal,
    auxiliaryPlane.constant
  );
  if (!origin) return null;
  const clipped = clipLineToTriangle(planeGeometry, origin, direction);
  if (!clipped) return null;
  let start = clipped.start;
  let end = clipped.end;
  // 固定点 1 位于水平投影左侧，点 2 位于右侧，保证各视图中的编号一致。
  if (start.x < end.x) {
    const temporary = start;
    start = end;
    end = temporary;
  }
  return {
    origin,
    direction,
    start,
    end
  };
}

function toProjection2D(point, projectionPlane) {
  if (projectionPlane === 'H') return { u: point.x, v: point.y };
  if (projectionPlane === 'V') return { u: point.x, v: point.z };
  return { u: point.y, v: point.z };
}

function intersectLineWithSegment2D(lineStart, lineEnd, segmentStart, segmentEnd) {
  const lineDirection = { u: lineEnd.u - lineStart.u, v: lineEnd.v - lineStart.v };
  const segmentDirection = {
    u: segmentEnd.u - segmentStart.u,
    v: segmentEnd.v - segmentStart.v
  };
  const denominator = cross2D(lineDirection, segmentDirection);
  if (Math.abs(denominator) <= MODEL_EPSILON) return null;
  const offset = { u: segmentStart.u - lineStart.u, v: segmentStart.v - lineStart.v };
  const lineParameter = cross2D(offset, segmentDirection) / denominator;
  const segmentParameter = cross2D(offset, lineDirection) / denominator;
  if (segmentParameter < -RELATION_EPSILON
    || segmentParameter > 1 + RELATION_EPSILON) {
    return null;
  }
  return {
    lineParameter,
    segmentParameter,
    point: {
      u: lineStart.u + lineDirection.u * lineParameter,
      v: lineStart.v + lineDirection.v * lineParameter
    }
  };
}

function buildLineAccumulationSection(planeGeometry, line, projectionPlane) {
  if (!planeGeometry || !line || !projectionPlane) return null;
  const pointA = planeGeometry.vertices[0];
  const pointB = planeGeometry.vertices[1];
  const pointC = planeGeometry.vertices[2];
  const intersection = intersectLineWithSegment2D(
    toProjection2D(pointC, projectionPlane),
    toProjection2D(line.e, projectionPlane),
    toProjection2D(pointA, projectionPlane),
    toProjection2D(pointB, projectionPlane)
  );
  if (!intersection) return null;
  return {
    projectionPlane,
    point1: lerp(pointA, pointB, intersection.segmentParameter),
    start: pointC,
    end: lerp(pointA, pointB, intersection.segmentParameter),
    lineParameter: intersection.lineParameter,
    segmentParameter: intersection.segmentParameter
  };
}

function buildGeometry(plane, line, options) {
  const planeGeometry = createPlaneGeometry(plane);
  if (!planeGeometry) return null;
  const sourceLine = cloneLine(line);
  const relation = classifyLinePlane(planeGeometry, sourceLine);
  if (!relation) return null;
  const lineAccumulationPlane = getLineAccumulationPlane(sourceLine);
  const planeAccumulationPlane = getPlaneAccumulationPlane(planeGeometry);
  const references = buildInPlaneReferences(planeGeometry);
  const methodKind = getIntersectionMethodKind(
    lineAccumulationPlane,
    planeAccumulationPlane
  );
  const auxiliaryPlane = relation.kind === 'intersect'
    && methodKind === 'auxiliary'
    ? buildAuxiliaryPlane(sourceLine, options && options.auxiliaryProjectionPlane)
    : null;
  const sectionLine = auxiliaryPlane
    ? buildSectionLine(planeGeometry, auxiliaryPlane)
    : null;
  const lineAccumulationSection = lineAccumulationPlane
    && planeAccumulationPlane === null
    ? buildLineAccumulationSection(
      planeGeometry,
      sourceLine,
      lineAccumulationPlane
    )
    : null;
  return {
    plane: planeGeometry,
    line: sourceLine,
    relation,
    references,
    lineAccumulationPlane,
    planeAccumulationPlane,
    methodKind,
    auxiliaryPlane,
    sectionLine,
    lineAccumulationSection
  };
}

function getPresetLine(kind) {
  return cloneLine(LINE_PRESETS[kind] || LINE_PRESETS.intersect);
}

function buildLineForCombination(plane, lineKind) {
  const planeGeometry = createPlaneGeometry(plane);
  const direction = LINE_DIRECTIONS[lineKind];
  if (!planeGeometry || !direction) return null;
  const center = planeGeometry.center;
  let halfLength = 3.5;
  ['x', 'y', 'z'].forEach((axis) => {
    const amount = Math.abs(direction[axis]);
    if (amount > MODEL_EPSILON) {
      halfLength = Math.min(
        halfLength,
        (7.5 - center[axis]) / amount,
        (center[axis] - 0.5) / amount
      );
    }
  });
  halfLength = Math.max(1.2, halfLength);
  return {
    e: add(center, scale(direction, -halfLength)),
    f: add(center, scale(direction, halfLength))
  };
}

module.exports = {
  MODEL_MIN,
  MODEL_MAX,
  PLANE_PATCH_MARGIN,
  MODEL_EPSILON,
  RELATION_EPSILON,
  PERPENDICULAR_EPSILON,
  DEFAULT_PLANE,
  SPECIAL_PLANE,
  VERTICAL_PLANE,
  PROFILE_PROJECTING_PLANE,
  PLANE_PRESETS,
  LINE_DIRECTIONS,
  LINE_PRESETS,
  RELATION_DEFINITIONS,
  isFinitePoint,
  clonePoint,
  clonePlane,
  cloneLine,
  add,
  subtract,
  scale,
  dot,
  cross,
  length,
  normalize,
  lerp,
  clamp,
  createPlaneGeometry,
  signedDistance,
  projectPointToPlane,
  projectDirectionToPlane,
  classifyLinePlane,
  clipLineToTriangle,
  buildInPlaneReferences,
  chooseAuxiliaryProjection,
  getLineAccumulationPlane,
  getPlaneAccumulationPlane,
  getIntersectionMethodKind,
  buildAuxiliaryPlane,
  buildSectionLine,
  buildLineAccumulationSection,
  buildGeometry,
  getPresetLine,
  buildLineForCombination
};
