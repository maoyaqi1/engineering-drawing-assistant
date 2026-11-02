// 直角投影定理 · 纯数学模型。
//
// 本模块只处理教学模型空间中的点和方向，不读取页面、Canvas 或 wx。
// 核心条件：直线 l 平行于投影面 P 时，若 m ⟂ l，则 m 的正投影 m′ ⟂ l′。

const DOT_EPSILON = 1e-8;
const PROJECTION_ANGLE_TOLERANCE = 1e-6;
const PERPENDICULAR_SNAP_DEGREES = 2;
const PERPENDICULAR_SNAP_SINE = Math.sin(
  PERPENDICULAR_SNAP_DEGREES * Math.PI / 180
);
// 端点距投影面边缘保留 0.8 个教学单位，线段整体不会触碰或越过板面边界。
const MODEL_MIN = 0.8;
const MODEL_MAX = 7.2;
const CENTER = { x: 4, y: 4, z: 4 };
const FIXED_LINE_HALF_LENGTH = 3.6;
const GENERAL_IN_PLANE_COMPONENT = 3;
const GENERAL_NORMAL_OFFSET = 1.6;
const DEFAULT_GENERAL_ARM_LENGTH = 3;
const MIN_GENERAL_ARM_LENGTH = 1.2;
const MAX_GENERAL_ARM_LENGTH = 3.8;

const LINE_TYPE_DEFINITIONS = {
  horizontal: {
    lineType: 'horizontal',
    lineTypeName: '水平线',
    parallelPlane: 'H',
    planeName: '水平投影面 H',
    viewType: 'top',
    viewSuffix: '',
    normal: { x: 0, y: 0, z: 1 },
    direction: { x: 1, y: 0.55, z: 0 }
  },
  frontal: {
    lineType: 'frontal',
    lineTypeName: '正平线',
    parallelPlane: 'V',
    planeName: '正投影面 V',
    viewType: 'front',
    viewSuffix: '′',
    normal: { x: 0, y: 1, z: 0 },
    direction: { x: 1, y: 0, z: 0.55 }
  },
  profile: {
    lineType: 'profile',
    lineTypeName: '侧平线',
    parallelPlane: 'W',
    planeName: '侧投影面 W',
    viewType: 'left',
    viewSuffix: '″',
    normal: { x: 1, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0.55 }
  }
};

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

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= DOT_EPSILON) return null;
  return scale(vector, 1 / length);
}

function projectPoint(point, plane) {
  if (plane === 'H') return { x: point.x, y: point.y, z: 0 };
  if (plane === 'V') return { x: point.x, y: 0, z: point.z };
  if (plane === 'W') return { x: 0, y: point.y, z: point.z };
  return null;
}

function angleDegrees(first, second) {
  const firstLength = Math.hypot(first.x, first.y, first.z);
  const secondLength = Math.hypot(second.x, second.y, second.z);
  if (!Number.isFinite(firstLength) || !Number.isFinite(secondLength)
    || firstLength <= DOT_EPSILON || secondLength <= DOT_EPSILON) {
    return 0;
  }
  const cosine = Math.max(-1, Math.min(1,
    dot(first, second) / (firstLength * secondLength)));
  return Math.acos(Math.abs(cosine)) * 180 / Math.PI;
}

function midpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: (first.z + second.z) / 2
  };
}

function clampModelPoint(point) {
  const clamp = (value) => Math.max(MODEL_MIN, Math.min(MODEL_MAX,
    Number.isFinite(value) ? value : CENTER.x));
  return { x: clamp(point.x), y: clamp(point.y), z: clamp(point.z) };
}

function maxArmLength(origin, direction) {
  let maximum = Infinity;
  ['x', 'y', 'z'].forEach((axis) => {
    if (direction[axis] > DOT_EPSILON) {
      maximum = Math.min(maximum, (MODEL_MAX - origin[axis]) / direction[axis]);
    } else if (direction[axis] < -DOT_EPSILON) {
      maximum = Math.min(maximum, (MODEL_MIN - origin[axis]) / direction[axis]);
    }
  });
  return Number.isFinite(maximum) ? maximum : MAX_GENERAL_ARM_LENGTH;
}

function isInsideModel(point) {
  return ['x', 'y', 'z'].every((axis) => (
    point[axis] >= MODEL_MIN - DOT_EPSILON
    && point[axis] <= MODEL_MAX + DOT_EPSILON
  ));
}

// 由固定线方向与 m 的两个实际端点生成完整状态。
// C/D 是几何真值；拖动时只替换当前端点，另一端点保持原坐标。
function createGeometry(definition, unitL, cPoint, dPoint) {
  const c = clampModelPoint(cPoint);
  const d = clampModelPoint(dPoint);
  const radial = normalize(subtract(c, d));
  if (!radial) return null;
  const movableCenter = midpoint(c, d);
  const cLength = Math.hypot(c.x - movableCenter.x,
    c.y - movableCenter.y, c.z - movableCenter.z);
  const dLength = Math.hypot(d.x - movableCenter.x,
    d.y - movableCenter.y, d.z - movableCenter.z);
  const a = add(CENTER, scale(unitL, -FIXED_LINE_HALF_LENGTH));
  const b = add(CENTER, scale(unitL, FIXED_LINE_HALF_LENGTH));
  const fromFixedToMovable = subtract(movableCenter, a);
  const crossDirections = cross(unitL, radial);
  const crossLength = Math.hypot(
    crossDirections.x,
    crossDirections.y,
    crossDirections.z
  );
  const lineDistance = crossLength <= DOT_EPSILON
    ? Math.hypot(
      fromFixedToMovable.x - unitL.x * dot(fromFixedToMovable, unitL),
      fromFixedToMovable.y - unitL.y * dot(fromFixedToMovable, unitL),
      fromFixedToMovable.z - unitL.z * dot(fromFixedToMovable, unitL)
    )
    : Math.abs(dot(fromFixedToMovable, crossDirections)) / crossLength;
  const linesIntersect = crossLength > DOT_EPSILON
    && lineDistance <= DOT_EPSILON;
  const p = linesIntersect
    ? add(a, scale(unitL, dot(fromFixedToMovable, unitL)))
    : null;
  const projectedA = projectPoint(a, definition.parallelPlane);
  const projectedB = projectPoint(b, definition.parallelPlane);
  const projectedC = projectPoint(c, definition.parallelPlane);
  const projectedD = projectPoint(d, definition.parallelPlane);
  const projectedP = p ? projectPoint(p, definition.parallelPlane) : null;
  const projectedL = subtract(projectedB, projectedA);
  const projectedM = subtract(projectedC, projectedD);
  const projectionAngle = angleDegrees(projectedL, projectedM);
  const spatialAngle = angleDegrees(unitL, radial);
  const lineParallelToPlane = Math.abs(dot(unitL, definition.normal)) <= DOT_EPSILON;
  const spatialPerpendicular = Math.abs(dot(unitL, radial)) <= DOT_EPSILON;
  const planeAngle = Math.asin(
    Math.min(1, Math.abs(dot(radial, definition.normal)))
  ) * 180 / Math.PI;
  const otherLineIsGeneral = Math.abs(radial.x) > DOT_EPSILON
    && Math.abs(radial.y) > DOT_EPSILON
    && Math.abs(radial.z) > DOT_EPSILON;
  const projectionPerpendicular = Math.abs(
    dot(projectedL, projectedM)
  ) <= PROJECTION_ANGLE_TOLERANCE
    * Math.max(1, Math.hypot(projectedL.x, projectedL.y, projectedL.z))
    * Math.max(1, Math.hypot(projectedM.x, projectedM.y, projectedM.z));

  return {
    ...definition,
    armLengths: { c: cLength, d: dLength },
    points: { a, b, c, d, p },
    projectedPoints: {
      a: projectedA,
      b: projectedB,
      c: projectedC,
      d: projectedD,
      p: projectedP
    },
    directions: { l: unitL, m: radial },
    centerOffsetAlongL: dot(subtract(movableCenter, CENTER), unitL),
    lineDistance,
    linesIntersect,
    projectedDirections: { l: projectedL, m: projectedM },
    spatialAngle,
    projectionAngle,
    planeAngle,
    lineParallelToPlane,
    spatialPerpendicular,
    otherLineIsGeneral,
    projectionPerpendicular,
    validationPassed: lineParallelToPlane && spatialPerpendicular
      && projectionPerpendicular
  };
}

/**
 * 生成一组满足直角投影定理的教学线组。
 * l 为所选类型的投影面平行线；m 初始由“面内垂直方向 + 法向分量”组成，
 * 因此为一般位置直线且与 l 垂直。拖动后允许 m 偏离垂直方向，
 * 页面据此切换“灰显 / 高亮 + 直角”状态。
 */
function buildGeometry(lineType, cArmLength, dArmLength) {
  const definition = LINE_TYPE_DEFINITIONS[lineType];
  if (!definition) return null;
  const clampArm = (value) => (
    Number.isFinite(value)
      ? Math.max(MIN_GENERAL_ARM_LENGTH, Math.min(MAX_GENERAL_ARM_LENGTH, value))
      : DEFAULT_GENERAL_ARM_LENGTH
  );
  const cLength = clampArm(cArmLength);
  const dLength = clampArm(dArmLength);
  const lineLDirection = normalize(definition.direction);
  const inPlanePerpendicular = normalize(
    cross(definition.normal, lineLDirection)
  );
  if (!inPlanePerpendicular) return null;
  const lineMDirection = normalize(add(
    scale(inPlanePerpendicular, GENERAL_IN_PLANE_COMPONENT),
    scale(definition.normal, GENERAL_NORMAL_OFFSET)
  ));
  if (!lineMDirection) return null;

  const unitM = normalize(lineMDirection);
  if (!unitM) return null;
  const c = add(CENTER, scale(unitM, cLength));
  const d = add(CENTER, scale(unitM, -dLength));
  return createGeometry(definition, lineLDirection, c, d);
}

// 拖动某一端点时固定另一端。当方向距垂直位置不足 2° 时吸附到精确垂直，
// 让教学高亮可稳定触发；离开吸附区后保留真实方向，用于展示反例。
function buildGeometryFromEndpoint(lineType, endpointKey, endpoint, currentGeometry) {
  const definition = LINE_TYPE_DEFINITIONS[lineType];
  if (!definition || !['c', 'd'].includes(endpointKey)) return null;
  const unitL = normalize(definition.direction);
  if (!unitL) return null;
  const target = clampModelPoint(endpoint);
  const otherKey = endpointKey === 'c' ? 'd' : 'c';
  const otherPoint = currentGeometry && currentGeometry.points
    ? currentGeometry.points[otherKey]
    : add(CENTER, scale(
      normalize(cross(definition.normal, unitL)),
      endpointKey === 'c' ? -DEFAULT_GENERAL_ARM_LENGTH : DEFAULT_GENERAL_ARM_LENGTH
    ));
  const rawDirection = subtract(target, otherPoint);
  const rawLength = Math.hypot(rawDirection.x, rawDirection.y, rawDirection.z);
  if (rawLength <= DOT_EPSILON) return null;
  const perpendicularDirection = subtract(
    rawDirection,
    scale(unitL, dot(rawDirection, unitL))
  );
  const perpendicularUnit = normalize(perpendicularDirection);
  const normalizedProjection = Math.abs(dot(rawDirection, unitL)) / rawLength;
  if (perpendicularUnit && normalizedProjection <= PERPENDICULAR_SNAP_SINE) {
    const snapped = add(otherPoint, scale(perpendicularUnit, rawLength));
    if (isInsideModel(snapped)) {
      return createGeometry(
        definition,
        unitL,
        endpointKey === 'c' ? snapped : otherPoint,
        endpointKey === 'd' ? snapped : otherPoint
      );
    }
  }
  const c = endpointKey === 'c' ? target : otherPoint;
  const d = endpointKey === 'd' ? target : otherPoint;
  return createGeometry(definition, unitL, c, d);
}

module.exports = {
  DOT_EPSILON,
  MODEL_MIN,
  MODEL_MAX,
  LINE_TYPE_DEFINITIONS,
  CENTER,
  FIXED_LINE_HALF_LENGTH,
  GENERAL_IN_PLANE_COMPONENT,
  GENERAL_NORMAL_OFFSET,
  DEFAULT_GENERAL_ARM_LENGTH,
  MIN_GENERAL_ARM_LENGTH,
  MAX_GENERAL_ARM_LENGTH,
  PERPENDICULAR_SNAP_DEGREES,
  add,
  subtract,
  scale,
  dot,
  cross,
  normalize,
  projectPoint,
  angleDegrees,
  buildGeometry,
  buildGeometryFromEndpoint
};
