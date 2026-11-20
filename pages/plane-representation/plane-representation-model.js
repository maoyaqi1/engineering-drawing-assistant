// 平面的表示方法 · 纯几何模型。
//
// 五种几何元素表示方式和迹线表示法都描述同一个一般位置平面 P：
// x + y + z = 8。本模块只返回三维点、线和多边形，不读取页面或 Canvas。

const MODEL_EPSILON = 1e-8;

const PLANE = Object.freeze({
  name: 'P',
  point: Object.freeze({ x: 4, y: 2, z: 2 }),
  normal: Object.freeze({
    x: 1 / Math.sqrt(3),
    y: 1 / Math.sqrt(3),
    z: 1 / Math.sqrt(3)
  }),
  constant: 8 / Math.sqrt(3)
});

const PLANE_PATCH = Object.freeze([
  Object.freeze({ x: 8, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 8, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: 8 })
]);

const AXES = Object.freeze([
  Object.freeze({
    key: 'x',
    label: 'X',
    start: Object.freeze({ x: 0, y: 0, z: 0 }),
    end: Object.freeze({ x: 8, y: 0, z: 0 })
  }),
  Object.freeze({
    key: 'y',
    label: 'Y',
    start: Object.freeze({ x: 0, y: 0, z: 0 }),
    end: Object.freeze({ x: 0, y: 8, z: 0 })
  }),
  Object.freeze({
    key: 'z',
    label: 'Z',
    start: Object.freeze({ x: 0, y: 0, z: 0 }),
    end: Object.freeze({ x: 0, y: 0, z: 8 })
  })
]);

const MODE_OPTIONS = Object.freeze([
  Object.freeze({
    key: 'threePoints',
    shortLabel: '三点定面',
    symbol: 'A B C'
  }),
  Object.freeze({
    key: 'pointLine',
    shortLabel: '点与直线',
    symbol: 'K + l'
  }),
  Object.freeze({
    key: 'intersectLines',
    shortLabel: '相交两线',
    symbol: 'l₁ × l₂'
  }),
  Object.freeze({
    key: 'parallelLines',
    shortLabel: '平行两线',
    symbol: 'l₁ ∥ l₂'
  }),
  Object.freeze({
    key: 'planeFigure',
    shortLabel: '平面图形',
    symbol: '△ABC'
  }),
  Object.freeze({
    key: 'traces',
    shortLabel: '迹线表示',
    symbol: 'P_H P_V P_W'
  })
]);

const MODE_DEFINITIONS = Object.freeze({
  threePoints: Object.freeze({
    key: 'threePoints',
    label: '三点定面',
    ruleTitle: '不在同一直线上的三点',
    rule: 'A、B、C 三点不共线，确定唯一平面 P。',
    projectionNote: '三个点按同一组空间坐标分别投影为 a、a′、a″ 等。',
    points: Object.freeze([
      Object.freeze({ key: 'A', point: Object.freeze({ x: 4, y: 2, z: 2 }) }),
      Object.freeze({ key: 'B', point: Object.freeze({ x: 1, y: 4, z: 3 }) }),
      Object.freeze({ key: 'C', point: Object.freeze({ x: 2, y: 1, z: 5 }) })
    ]),
    lines: Object.freeze([]),
    polygons: Object.freeze([])
  }),
  pointLine: Object.freeze({
    key: 'pointLine',
    label: '一直线和直线外一点',
    ruleTitle: '点与直线',
    rule: '点 K 不在直线 l 上，K 与 l 确定唯一平面 P。',
    projectionNote: '点 K 和直线 l 的投影必须来自同一组空间位置。',
    points: Object.freeze([
      Object.freeze({ key: 'K', point: Object.freeze({ x: 4, y: 2, z: 2 }) })
    ]),
    lines: Object.freeze([
      Object.freeze({
        key: 'l',
        label: 'l',
        startLabel: 'E',
        endLabel: 'F',
        start: Object.freeze({ x: 1, y: 4, z: 3 }),
        end: Object.freeze({ x: 2, y: 1, z: 5 })
      })
    ]),
    polygons: Object.freeze([])
  }),
  intersectLines: Object.freeze({
    key: 'intersectLines',
    label: '相交两直线',
    ruleTitle: '两条相交直线',
    rule: '直线 l₁ 与 l₂ 相交，两直线确定唯一平面 P。',
    projectionNote: '三条投影中的交点 s、s′、s″ 必须对应同一个空间点 S。',
    points: Object.freeze([
      Object.freeze({ key: 'S', point: Object.freeze({ x: 3, y: 2, z: 3 }) })
    ]),
    lines: Object.freeze([
      Object.freeze({
        key: 'l1',
        label: 'l₁',
        startLabel: 'A',
        endLabel: 'B',
        start: Object.freeze({ x: 1, y: 4, z: 3 }),
        end: Object.freeze({ x: 5, y: 0, z: 3 })
      }),
      Object.freeze({
        key: 'l2',
        label: 'l₂',
        startLabel: 'C',
        endLabel: 'D',
        start: Object.freeze({ x: 2, y: 1, z: 5 }),
        end: Object.freeze({ x: 4, y: 3, z: 1 })
      })
    ]),
    polygons: Object.freeze([])
  }),
  parallelLines: Object.freeze({
    key: 'parallelLines',
    label: '平行两直线',
    ruleTitle: '两条平行直线',
    rule: '直线 l₁ 与 l₂ 平行，两平行直线确定唯一平面 P。',
    projectionNote: '平行直线在同一投影面上的同面投影仍保持平行。',
    points: Object.freeze([]),
    lines: Object.freeze([
      Object.freeze({
        key: 'l1',
        label: 'l₁',
        startLabel: 'A',
        endLabel: 'B',
        start: Object.freeze({ x: 2, y: 3, z: 3 }),
        end: Object.freeze({ x: 4, y: 1, z: 3 })
      }),
      Object.freeze({
        key: 'l2',
        label: 'l₂',
        startLabel: 'C',
        endLabel: 'D',
        start: Object.freeze({ x: 2, y: 2, z: 4 }),
        end: Object.freeze({ x: 3.5, y: 0.5, z: 4 })
      })
    ]),
    polygons: Object.freeze([])
  }),
  planeFigure: Object.freeze({
    key: 'planeFigure',
    label: '平面图形',
    ruleTitle: '任意平面图形',
    rule: '三角形 ABC 所在平面就是平面 P。',
    projectionNote: '一般位置平面图形在三个投影面上的投影不反映实形。',
    points: Object.freeze([
      Object.freeze({ key: 'A', point: Object.freeze({ x: 4, y: 2, z: 2 }) }),
      Object.freeze({ key: 'B', point: Object.freeze({ x: 1, y: 4, z: 3 }) }),
      Object.freeze({ key: 'C', point: Object.freeze({ x: 2, y: 1, z: 5 }) })
    ]),
    lines: Object.freeze([]),
    polygons: Object.freeze([
      Object.freeze({
        key: 'triangle',
        label: '△ABC',
        points: Object.freeze([
          Object.freeze({ x: 4, y: 2, z: 2 }),
          Object.freeze({ x: 1, y: 4, z: 3 }),
          Object.freeze({ x: 2, y: 1, z: 5 })
        ])
      })
    ])
  }),
  traces: Object.freeze({
    key: 'traces',
    label: '迹线表示法',
    ruleTitle: '平面与投影面的交线',
    rule: 'P_H=P∩H，P_V=P∩V，P_W=P∩W。',
    projectionNote: '迹线本面投影与自身重合；另两面投影落在相应投影轴上。',
    points: Object.freeze([
      Object.freeze({ key: 'X', point: Object.freeze({ x: 8, y: 0, z: 0 }) }),
      Object.freeze({ key: 'Y', point: Object.freeze({ x: 0, y: 8, z: 0 }) }),
      Object.freeze({ key: 'Z', point: Object.freeze({ x: 0, y: 0, z: 8 }) })
    ]),
    lines: Object.freeze([
      Object.freeze({
        key: 'PH',
        label: 'P_H',
        projectionPlane: 'H',
        start: Object.freeze({ x: 8, y: 0, z: 0 }),
        end: Object.freeze({ x: 0, y: 8, z: 0 })
      }),
      Object.freeze({
        key: 'PV',
        label: 'P_V',
        projectionPlane: 'V',
        start: Object.freeze({ x: 8, y: 0, z: 0 }),
        end: Object.freeze({ x: 0, y: 0, z: 8 })
      }),
      Object.freeze({
        key: 'PW',
        label: 'P_W',
        projectionPlane: 'W',
        start: Object.freeze({ x: 0, y: 8, z: 0 }),
        end: Object.freeze({ x: 0, y: 0, z: 8 })
      })
    ]),
    polygons: Object.freeze([])
  })
});

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
  const magnitude = length(vector);
  if (!Number.isFinite(magnitude) || magnitude <= MODEL_EPSILON) return null;
  return scale(vector, 1 / magnitude);
}

function signedDistance(point) {
  return dot(PLANE.normal, point) - PLANE.constant;
}

function isPointOnPlane(point) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
    && Math.abs(signedDistance(point)) <= MODEL_EPSILON;
}

function projectPointToView(point, viewType) {
  if (!point) return null;
  if (viewType === 'front') return { u: point.x, v: point.z };
  if (viewType === 'top') return { u: point.x, v: -point.y };
  if (viewType === 'left') return { u: -point.y, v: point.z };
  return null;
}

function projectLineToView(line, viewType) {
  return {
    ...line,
    start: projectPointToView(line.start, viewType),
    end: projectPointToView(line.end, viewType)
  };
}

function projectPolygonToView(polygon, viewType) {
  return {
    ...polygon,
    points: polygon.points.map((point) => projectPointToView(point, viewType))
  };
}

function getModeDefinition(modeKey) {
  return MODE_DEFINITIONS[modeKey] || MODE_DEFINITIONS.threePoints;
}

function getPlaneGeometry() {
  return {
    plane: PLANE,
    patch: PLANE_PATCH.slice(),
    axes: AXES.slice()
  };
}

function getLineIntersection(first, second) {
  const firstDirection = normalize(subtract(first.end, first.start));
  const secondDirection = normalize(subtract(second.end, second.start));
  if (!firstDirection || !secondDirection) return null;
  const normal = cross(firstDirection, secondDirection);
  if (length(normal) <= MODEL_EPSILON) return null;
  const offset = subtract(second.start, first.start);
  const denominator = dot(firstDirection, firstDirection);
  const parameter = dot(offset, firstDirection) / denominator;
  const point = add(first.start, scale(firstDirection, parameter));
  const onSecond = Math.abs(dot(
    subtract(point, second.start),
    normalize(cross(secondDirection, normal))
  ));
  return onSecond <= 1e-7 ? point : null;
}

module.exports = {
  MODEL_EPSILON,
  PLANE,
  PLANE_PATCH,
  AXES,
  MODE_OPTIONS,
  MODE_DEFINITIONS,
  add,
  subtract,
  scale,
  dot,
  cross,
  length,
  normalize,
  signedDistance,
  isPointOnPlane,
  projectPointToView,
  projectLineToView,
  projectPolygonToView,
  getModeDefinition,
  getPlaneGeometry,
  getLineIntersection
};
