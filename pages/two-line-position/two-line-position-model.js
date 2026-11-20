// 两直线位置关系：纯几何判定模型。
//
// 本文件不读取页面、Canvas 或 wx API。关系按两条“无限延伸直线”的
// 方向、共面性和唯一交点判定；屏幕上的有限线段只用于教学展示。
(function () {
  const EPSILON = 1e-8;
  const MODEL_MIN = 0.8;
  const MODEL_MAX = 7.2;
  const PARALLEL_SINE_TOLERANCE = 0.015;
  const COPLANAR_DISTANCE_TOLERANCE = 0.08;

  const JUDGEMENT_OPTIONS = Object.freeze([
    Object.freeze({ key: 'parallel', title: '平行判断' }),
    Object.freeze({ key: 'intersect', title: '相交判断' })
  ]);

  const POSITION_OPTIONS = Object.freeze([
    Object.freeze({ key: 'general', title: '一般位置直线' }),
    Object.freeze({ key: 'special', title: '特殊位置直线' })
  ]);

  const PRESETS = Object.freeze({
    general: Object.freeze({
      parallel: Object.freeze({
        line1: Object.freeze({
          start: Object.freeze({ x: 0.8, y: 1.2, z: 5.2 }),
          end: Object.freeze({ x: 6.8, y: 4.8, z: 2.4 })
        }),
        line2: Object.freeze({
          start: Object.freeze({ x: 0.8, y: 3.2, z: 6.0 }),
          end: Object.freeze({ x: 6.8, y: 6.8, z: 3.2 })
        })
      }),
      intersect: Object.freeze({
        line1: Object.freeze({
          start: Object.freeze({ x: 0.8, y: 1.2, z: 5.5 }),
          end: Object.freeze({ x: 6.8, y: 5.4, z: 2.2 })
        }),
        line2: Object.freeze({
          start: Object.freeze({ x: 0.8, y: 4.3, z: 1.6 }),
          end: Object.freeze({ x: 6.8, y: 2.3, z: 6.1 })
        })
      })
    }),
    special: Object.freeze({
      parallel: Object.freeze({
        line1: Object.freeze({
          start: Object.freeze({ x: 2.4, y: 0.8, z: 6.4 }),
          end: Object.freeze({ x: 2.4, y: 6.8, z: 1.2 })
        }),
        line2: Object.freeze({
          start: Object.freeze({ x: 5.3, y: 0.8, z: 1.2 }),
          end: Object.freeze({ x: 5.3, y: 6.8, z: 6.4 })
        })
      }),
      intersect: Object.freeze({
        line1: Object.freeze({
          start: Object.freeze({ x: 0.8, y: 0.8, z: 2.2 }),
          end: Object.freeze({ x: 7.2, y: 6.8, z: 2.2 })
        }),
        line2: Object.freeze({
          start: Object.freeze({ x: 7.2, y: 4.0, z: 6.4 }),
          end: Object.freeze({ x: 0.8, y: 4.0, z: 1.0 })
        })
      })
    })
  });

  function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
  }

  function add(left, right) {
    return {
      x: left.x + right.x,
      y: left.y + right.y,
      z: left.z + right.z
    };
  }

  function subtract(left, right) {
    return {
      x: left.x - right.x,
      y: left.y - right.y,
      z: left.z - right.z
    };
  }

  function scale(vector, factor) {
    return {
      x: vector.x * factor,
      y: vector.y * factor,
      z: vector.z * factor
    };
  }

  function dot(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
  }

  function cross(left, right) {
    return {
      x: left.y * right.z - left.z * right.y,
      y: left.z * right.x - left.x * right.z,
      z: left.x * right.y - left.y * right.x
    };
  }

  function length(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function normalize(vector) {
    const magnitude = length(vector);
    if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return null;
    return scale(vector, 1 / magnitude);
  }

  function distance(first, second) {
    return length(subtract(first, second));
  }

  function midpoint(first, second) {
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      z: (first.z + second.z) / 2
    };
  }

  function clampPoint(point) {
    return {
      x: clamp(point && point.x, MODEL_MIN, MODEL_MAX),
      y: clamp(point && point.y, MODEL_MIN, MODEL_MAX),
      z: clamp(point && point.z, MODEL_MIN, MODEL_MAX)
    };
  }

  function cloneLines(lines) {
    return {
      line1: {
        start: Object.assign({}, lines.line1.start),
        end: Object.assign({}, lines.line1.end)
      },
      line2: {
        start: Object.assign({}, lines.line2.start),
        end: Object.assign({}, lines.line2.end)
      }
    };
  }

  function createPreset(positionMode, relationKey) {
    const mode = PRESETS[positionMode] ? positionMode : 'general';
    const relation = JUDGEMENT_OPTIONS.some((item) => item.key === relationKey)
      ? relationKey
      : 'parallel';
    return cloneLines(PRESETS[mode][relation]);
  }

  function getDirections(lines) {
    return {
      d1: subtract(lines.line1.end, lines.line1.start),
      d2: subtract(lines.line2.end, lines.line2.start)
    };
  }

  function closestLinePoints(lines) {
    const { d1, d2 } = getDirections(lines);
    const a = lines.line1.start;
    const c = lines.line2.start;
    const offset = subtract(a, c);
    const aa = dot(d1, d1);
    const bb = dot(d1, d2);
    const cc = dot(d2, d2);
    const dd = dot(d1, offset);
    const ee = dot(d2, offset);
    const denominator = aa * cc - bb * bb;
    if (Math.abs(denominator) <= EPSILON) {
      const t = clamp(dd / Math.max(aa, EPSILON), -1.5, 1.5);
      const pointOnLine1 = add(a, scale(d1, t));
      const vectorToLine2 = subtract(c, pointOnLine1);
      const s = dot(vectorToLine2, d2) / Math.max(cc, EPSILON);
      return {
        pointOnLine1,
        pointOnLine2: add(c, scale(d2, s))
      };
    }
    const t = (bb * ee - cc * dd) / denominator;
    const s = (aa * ee - bb * dd) / denominator;
    return {
      pointOnLine1: add(a, scale(d1, t)),
      pointOnLine2: add(c, scale(d2, s))
    };
  }

  function projectPointToView(point, viewType) {
    if (viewType === 'front') return { x: point.x, y: point.z };
    if (viewType === 'top') return { x: point.x, y: -point.y };
    return { x: -point.y, y: point.z };
  }

  function projectLineToView(line, viewType) {
    return {
      start: projectPointToView(line.start, viewType),
      end: projectPointToView(line.end, viewType)
    };
  }

  function projectedParallelViews(lines) {
    return ['front', 'top', 'left'].filter((viewType) => {
      const first = projectLineToView(lines.line1, viewType);
      const second = projectLineToView(lines.line2, viewType);
      const d1 = subtract(first.end, first.start);
      const d2 = subtract(second.end, second.start);
      const length1 = Math.hypot(d1.x, d1.y);
      const length2 = Math.hypot(d2.x, d2.y);
      if (length1 <= EPSILON || length2 <= EPSILON) return false;
      return Math.abs(d1.x * d2.y - d1.y * d2.x)
        <= PARALLEL_SINE_TOLERANCE * length1 * length2;
    });
  }

  function projectedIntersection(line1, line2, viewType) {
    const first = projectLineToView(line1, viewType);
    const second = projectLineToView(line2, viewType);
    const d1 = subtract(first.end, first.start);
    const d2 = subtract(second.end, second.start);
    const denominator = d1.x * d2.y - d1.y * d2.x;
    const length1 = Math.hypot(d1.x, d1.y);
    const length2 = Math.hypot(d2.x, d2.y);
    if (length1 <= EPSILON || length2 <= EPSILON) return null;
    if (Math.abs(denominator)
      <= PARALLEL_SINE_TOLERANCE * length1 * length2) {
      return null;
    }
    const offset = subtract(second.start, first.start);
    const t = (offset.x * d2.y - offset.y * d2.x) / denominator;
    return {
      x: first.start.x + d1.x * t,
      y: first.start.y + d1.y * t
    };
  }

  function projectedRelationLines(lines) {
    const result = {};
    ['front', 'top', 'left'].forEach((viewType) => {
      const first = projectLineToView(lines.line1, viewType);
      const second = projectLineToView(lines.line2, viewType);
      const d1 = subtract(first.end, first.start);
      const d2 = subtract(second.end, second.start);
      const length1 = Math.hypot(d1.x, d1.y);
      const length2 = Math.hypot(d2.x, d2.y);
      if (length1 <= EPSILON || length2 <= EPSILON) {
        result[viewType] = { kind: 'invalid', intersection: null };
        return;
      }
      const crossLength = Math.abs(d1.x * d2.y - d1.y * d2.x);
      if (crossLength > PARALLEL_SINE_TOLERANCE * length1 * length2) {
        result[viewType] = {
          kind: 'intersect',
          intersection: projectedIntersection(lines.line1, lines.line2, viewType)
        };
        return;
      }
      const offset = subtract(second.start, first.start);
      const distanceToLine = Math.abs(offset.x * d1.y - offset.y * d1.x)
        / length1;
      result[viewType] = {
        kind: distanceToLine <= COPLANAR_DISTANCE_TOLERANCE
          ? 'coincident'
          : 'parallel',
        intersection: null
      };
    });
    return result;
  }

  function classify(lines) {
    const { d1, d2 } = getDirections(lines);
    const length1 = length(d1);
    const length2 = length(d2);
    if (length1 <= EPSILON || length2 <= EPSILON) {
      return {
        kind: 'invalid',
        title: '线段退化',
        isParallel: false,
        isCoplanar: false,
        hasIntersection: false,
        distance: 0,
        angleDeg: 0,
        intersection: null,
        closestPoints: null,
        projectedParallelViews: [],
        projectedRelations: projectedRelationLines(lines)
      };
    }
    const directionCross = cross(d1, d2);
    const crossLength = length(directionCross);
    const isParallel = crossLength
      <= PARALLEL_SINE_TOLERANCE * length1 * length2;
    const separation = subtract(lines.line2.start, lines.line1.start);
    const tripleProduct = Math.abs(dot(separation, directionCross));
    const distanceBetweenLines = isParallel
      ? length(cross(subtract(lines.line2.start, lines.line1.start), d1)) / length1
      : tripleProduct / Math.max(crossLength, EPSILON);
    const closest = closestLinePoints(lines);
    const coincidentDistance = length(cross(
      subtract(lines.line2.start, lines.line1.start),
      d1
    )) / length1;
    const isCoincident = isParallel
      && coincidentDistance <= COPLANAR_DISTANCE_TOLERANCE;
    const isCoplanar = isParallel
      || distanceBetweenLines <= COPLANAR_DISTANCE_TOLERANCE;
    const hasIntersection = !isParallel && isCoplanar;
    const kind = isCoincident
      ? 'coincident'
      : (isParallel ? 'parallel' : (hasIntersection ? 'intersect' : 'skew'));
    const cosine = clamp(
      Math.abs(dot(d1, d2)) / (length1 * length2),
      0,
      1
    );
    const projectedRelations = projectedRelationLines(lines);
    return {
      kind,
      title: ({
        parallel: '平行',
        intersect: '相交',
        skew: '交叉',
        coincident: '重合'
      })[kind],
      isParallel,
      isCoplanar,
      isCoincident,
      hasIntersection,
      distance: kind === 'intersect' || kind === 'coincident'
        ? 0
        : distanceBetweenLines,
      angleDeg: Math.acos(cosine) * 180 / Math.PI,
      intersection: hasIntersection
        ? midpoint(closest.pointOnLine1, closest.pointOnLine2)
        : null,
      closestPoints: distanceBetweenLines > EPSILON ? closest : null,
      projectedParallelViews: projectedParallelViews(lines),
      projectedRelations
    };
  }

  function getEndpoint(lines, endpointKey) {
    return lines[endpointKey.line][endpointKey.end];
  }

  function setEndpoint(lines, endpointKey, point) {
    const nextLines = cloneLines(lines);
    nextLines[endpointKey.line][endpointKey.end] = clampPoint(point);
    const line = nextLines[endpointKey.line];
    if (distance(line.start, line.end) <= 0.25) return null;
    return nextLines;
  }

  module.exports = {
    EPSILON,
    MODEL_MIN,
    MODEL_MAX,
    PARALLEL_SINE_TOLERANCE,
    COPLANAR_DISTANCE_TOLERANCE,
    PRESETS,
    JUDGEMENT_OPTIONS,
    POSITION_OPTIONS,
    clamp,
    add,
    subtract,
    scale,
    dot,
    cross,
    length,
    normalize,
    distance,
    midpoint,
    clampPoint,
    cloneLines,
    createPreset,
    getDirections,
    closestLinePoints,
    projectPointToView,
    projectLineToView,
    projectedParallelViews,
    projectedIntersection,
    projectedRelationLines,
    classify,
    getEndpoint,
    setEndpoint
  };
})();
