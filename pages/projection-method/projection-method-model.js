// 投影法基础：纯几何计算与教学参数。
//
// 本模块不读取页面、Canvas 或 wx API。所有投影结果都通过射线与投影面求交
// 得到，渲染层只负责把这里返回的三维数据映射到屏幕。
(function () {
  const EPSILON = 1e-8;
  const PLANE_DISPLAY_EXTENT = 8.0;
  const RAY_TOP_Z = 8.6;
  const MODEL_PLANE = Object.freeze({
    point: Object.freeze({ x: 0, y: 0, z: 0 }),
    normal: Object.freeze({ x: 0, y: 0, z: 1 }),
    u: Object.freeze({ x: 1, y: 0, z: 0 }),
    v: Object.freeze({ x: 0, y: 1, z: 0 })
  });
  const DEFAULT_CENTER = Object.freeze({ x: 1.3, y: 0.9, z: 8.6 });
  const DEFAULT_TRIANGLE = Object.freeze({
    // 同时错开三条平行投射线的屏幕通道，并让中心投影落点完整落在 P 面内。
    a: Object.freeze({ x: 1.3, y: 2.5, z: 4.35 }),
    b: Object.freeze({ x: 2.4, y: 5.5, z: 2.6 }),
    c: Object.freeze({ x: 3.7, y: 1.3, z: 4.1 })
  });

  const PROPERTY_DEFINITIONS = Object.freeze({
    invariance: Object.freeze({
      group: '平行投影法',
      title: '不变性',
      definition: '空间直线的投影仍为直线，平行线投影仍平行；平面图形投影仍保持相同边数和连接关系；采用正投影且形体平行于投影面时，投影与实际图形全等，显示实形。',
      formula: '直线 → 直线；AB ∥ CD → ab ∥ cd；形面 ∥ P → 实形',
      control: 'none',
      defaultValue: 0,
      min: 0,
      max: 0
    }),
    accumulation: Object.freeze({
      group: '平行投影法',
      title: '积聚性',
      definition: '空间直线或平面平行于投射线时，直线的投影积聚为点，平面的投影积聚为直线。',
      formula: '直线 ∥ 投射线 → 点；平面 ∥ 投射线 → 直线',
      control: 'none',
      defaultValue: 0,
      min: 0,
      max: 0
    }),
    incidence: Object.freeze({
      group: '平行投影法',
      title: '从属性',
      definition: '直线上的点，其投影仍在直线的投影上；平面上的点，其投影仍在平面的投影上。',
      formula: 'H ∈ EF → h ∈ ef；J ∈ △ABC → j ∈ △abc',
      control: 'none',
      defaultValue: 0,
      min: 0,
      max: 0
    }),
    ratio: Object.freeze({
      group: '平行投影法',
      title: '等比性',
      definition: '直线上一点分线段所得两段之比，等于投影点分投影线段所得两段之比。',
      formula: 'EH : HF = eh : hf',
      control: 'ratio',
      defaultValue: 0.42,
      min: 0.08,
      max: 0.92
    })
  });

  function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
  }

  function toRadians(angleDeg) {
    return clamp(angleDeg, -360, 360) * Math.PI / 180;
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

  function distance(first, second) {
    return length(subtract(first, second));
  }

  function normalize(vector) {
    const magnitude = length(vector);
    if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return null;
    return scale(vector, 1 / magnitude);
  }

  function interpolatePoint(start, end, ratio) {
    const t = clamp(ratio, 0, 1);
    return add(start, scale(subtract(end, start), t));
  }

  function planeSignedDistance(point, plane) {
    return dot(plane.normal, subtract(point, plane.point));
  }

  function getRayPlaneIntersection(rayOrigin, rayDirection, plane) {
    const direction = normalize(rayDirection);
    if (!direction) return null;
    const denominator = dot(plane.normal, direction);
    if (Math.abs(denominator) <= EPSILON) return null;
    const parameter = -planeSignedDistance(rayOrigin, plane) / denominator;
    if (!Number.isFinite(parameter) || parameter < -EPSILON) return null;
    return {
      point: add(rayOrigin, scale(direction, parameter)),
      direction,
      parameter
    };
  }

  function projectPointFromCenter(point, center, plane) {
    const rayOrigin = center || DEFAULT_CENTER;
    const result = getRayPlaneIntersection(
      rayOrigin,
      subtract(point, rayOrigin),
      plane || MODEL_PLANE
    );
    if (!result) return null;
    return {
      source: point,
      point: result.point,
      rayOrigin,
      rayDirection: result.direction,
      parameter: result.parameter
    };
  }

  function projectPointParallel(point, direction, plane) {
    const result = getRayPlaneIntersection(
      point,
      direction,
      plane || MODEL_PLANE
    );
    if (!result) return null;
    return {
      source: point,
      point: result.point,
      rayOrigin: point,
      rayDirection: result.direction,
      parameter: result.parameter
    };
  }

  function projectTriangleFromCenter(points, center, plane) {
    const source = points || DEFAULT_TRIANGLE;
    const projected = {};
    const rays = {};
    let isValid = true;
    ['a', 'b', 'c'].forEach((key) => {
      const result = projectPointFromCenter(
        source[key],
        center || DEFAULT_CENTER,
        plane || MODEL_PLANE
      );
      if (!result) {
        isValid = false;
        return;
      }
      projected[key] = result.point;
      rays[key] = {
        start: result.rayOrigin,
        end: result.point
      };
    });
    return { source, projected, rays, isValid };
  }

  function projectTriangleParallel(points, direction, plane) {
    const source = points || DEFAULT_TRIANGLE;
    const normalizedDirection = normalize(direction);
    const projected = {};
    const rays = {};
    if (!normalizedDirection) {
      return { source, projected, rays, isValid: false };
    }
    let isValid = true;
    ['a', 'b', 'c'].forEach((key) => {
      const result = projectPointParallel(
        source[key],
        normalizedDirection,
        plane || MODEL_PLANE
      );
      if (!result) {
        isValid = false;
        return;
      }
      projected[key] = result.point;
      const topOffset = Math.abs(normalizedDirection.z) > EPSILON
        ? (RAY_TOP_Z - source[key].z) / normalizedDirection.z
        : 0;
      rays[key] = {
        // 平行投射线和中心投影采用同一顶部高度，完整显示“顶部→形体→投影面”，
        // 而不是只画形体到投影面的一段。
        start: add(source[key], scale(normalizedDirection, topOffset)),
        end: result.point
      };
    });
    return { source, projected, rays, isValid };
  }

  function getRayDirectionFromPlaneAngle(angleDeg, plane, lateralSign) {
    const targetPlane = plane || MODEL_PLANE;
    const angle = clamp(angleDeg, 0, 90);
    const theta = toRadians(angle);
    const surface = normalize(targetPlane.u);
    const normal = normalize(targetPlane.normal);
    if (!surface || !normal) return null;
    const sign = Number(lateralSign) < 0 ? -1 : 1;
    return normalize(add(
      scale(surface, sign * Math.cos(theta)),
      scale(normal, -Math.sin(theta))
    ));
  }

  function isParallelDirection(first, second) {
    const a = normalize(first);
    const b = normalize(second);
    if (!a || !b) return false;
    return length(cross(a, b)) <= 1e-7;
  }

  function arePointsCollinear(first, second, third) {
    return isParallelDirection(subtract(second, first), subtract(third, first));
  }

  function createIncidenceSegment(ratio) {
    const start = { x: 1.0, y: 3.4, z: 3.25 };
    const end = { x: 5.65, y: 2.15, z: 2.65 };
    const point = interpolatePoint(start, end, ratio);
    const direction = getRayDirectionFromPlaneAngle(58, MODEL_PLANE, 1);
    const projectPoint = (value) => projectPointParallel(
      value,
      direction,
      MODEL_PLANE
    ).point;
    const projectedStart = projectPoint(start);
    const projectedEnd = projectPoint(end);
    const projectedPoint = projectPoint(point);
    const sourceTotal = distance(start, end);
    const projectedTotal = distance(projectedStart, projectedEnd);
    return {
      start,
      end,
      point,
      projectedStart,
      projectedEnd,
      projectedPoint,
      sourceRatioBefore: distance(start, point) / sourceTotal,
      sourceRatioAfter: distance(point, end) / sourceTotal,
      projectedRatioBefore: distance(projectedStart, projectedPoint) / projectedTotal,
      projectedRatioAfter: distance(projectedPoint, projectedEnd) / projectedTotal
    };
  }

  function averagePoints(points) {
    const total = points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 });
    return scale(total, 1 / points.length);
  }

  function createInvarianceScene() {
    const obliqueDirection = getRayDirectionFromPlaneAngle(58, MODEL_PLANE, 1);
    const project = (point) => projectPointParallel(
      point,
      obliqueDirection,
      MODEL_PLANE
    );
    const line = {
      start: { x: 0.4, y: 1.0, z: 3.2 },
      end: { x: 1.0, y: 3.8, z: 2.4 }
    };
    const triangle = {
      a: { x: 0.5, y: 2.0, z: 3.6 },
      b: { x: 2.6, y: 4.6, z: 2.7 },
      c: { x: 3.0, y: 1.5, z: 3.8 }
    };
    const parallelStart = { x: 0.2, y: 1.0, z: 3.4 };
    const parallelDirection = { x: 3.2, y: 1.2, z: -0.7 };
    const secondStart = add(parallelStart, { x: 0, y: 3.4, z: 0 });
    const first = {
      start: parallelStart,
      end: add(parallelStart, parallelDirection)
    };
    const second = {
      start: secondStart,
      end: add(secondStart, parallelDirection)
    };
    return {
      line: {
        source: line,
        projected: {
          start: project(line.start).point,
          end: project(line.end).point
        },
        rays: {
          start: { start: line.start, end: project(line.start).point },
          end: { start: line.end, end: project(line.end).point }
        }
      },
      triangle: {
        source: triangle,
        projected: {
          a: project(triangle.a).point,
          b: project(triangle.b).point,
          c: project(triangle.c).point
        },
        rays: {
          a: { start: triangle.a, end: project(triangle.a).point },
          b: { start: triangle.b, end: project(triangle.b).point },
          c: { start: triangle.c, end: project(triangle.c).point }
        }
      },
      parallelLines: {
        first,
        second,
        projectedFirst: {
          start: project(first.start).point,
          end: project(first.end).point
        },
        projectedSecond: {
          start: project(second.start).point,
          end: project(second.end).point
        }
      },
      rectangle: {
        source: [
          { x: 2.1, y: 1.4, z: 2.3 },
          { x: 4.8, y: 1.4, z: 2.3 },
          { x: 4.8, y: 3.4, z: 2.3 },
          { x: 2.1, y: 3.4, z: 2.3 }
        ],
        projected: [
          { x: 2.1, y: 1.4, z: 0 },
          { x: 4.8, y: 1.4, z: 0 },
          { x: 4.8, y: 3.4, z: 0 },
          { x: 2.1, y: 3.4, z: 0 }
        ],
        width: 2.7,
        height: 2.0,
        isOrthographicToPlane: true
      }
    };
  }

  function createAccumulationScene() {
    const direction = getRayDirectionFromPlaneAngle(58, MODEL_PLANE, 1);
    const lineStart = { x: 0.8, y: 5.8, z: 4.2 };
    const lineEnd = add(lineStart, scale(direction, (4.2 - 1.2) / Math.abs(direction.z)));
    const lineProjection = projectPointParallel(
      lineStart,
      direction,
      MODEL_PLANE
    ).point;
    const line = {
      start: lineStart,
      end: lineEnd
    };
    const raySpan = scale(direction, 4.6);
    const across = { x: 0, y: 2.4, z: 0 };
    const planeOrigin = { x: 2.4, y: 1.2, z: 4.2 };
    const plane = [
      planeOrigin,
      add(planeOrigin, across),
      add(add(planeOrigin, across), raySpan),
      add(planeOrigin, raySpan)
    ];
    return {
      line,
      lineProjection,
      direction,
      plane,
      planeProjection: plane.map((point) => projectPointParallel(
        point,
        direction,
        MODEL_PLANE
      ).point)
    };
  }

  function createIncidenceScene() {
    const direction = getRayDirectionFromPlaneAngle(58, MODEL_PLANE, 1);
    const project = (point) => projectPointParallel(
      point,
      direction,
      MODEL_PLANE
    ).point;
    const lineStart = { x: 0.8, y: 4.2, z: 3.25 };
    const lineEnd = { x: 3.1, y: 6.0, z: 2.65 };
    const linePoint = interpolatePoint(lineStart, lineEnd, 0.43);
    const plane = [
      { x: 3.7, y: 1.1, z: 2.1 },
      { x: 6.1, y: 2.0, z: 2.5 },
      { x: 4.5, y: 4.0, z: 2.0 }
    ];
    const planePoint = averagePoints(plane);
    return {
      line: {
        start: lineStart,
        end: lineEnd,
        point: linePoint,
        projectedStart: project(lineStart),
        projectedEnd: project(lineEnd),
        projectedPoint: project(linePoint)
      },
      plane: {
        source: plane,
        projected: plane.map(project),
        point: planePoint,
        projectedPoint: project(planePoint)
      }
    };
  }

  function easeInOut(progress) {
    const t = clamp(progress, 0, 1);
    return t < 0.5
      ? 2 * t * t
      : -1 + (4 - 2 * t) * t;
  }

  function getPropertyDefault(propertyKey) {
    return PROPERTY_DEFINITIONS[propertyKey] || PROPERTY_DEFINITIONS.invariance;
  }

  function createPropertyScene(propertyKey, value) {
    const definition = getPropertyDefault(propertyKey);
    const parameter = clamp(
      Number.isFinite(Number(value)) ? Number(value) : definition.defaultValue,
      definition.min,
      definition.max
    );
    if (propertyKey === 'incidence') {
      return {
        propertyKey,
        parameter,
        definition,
        incidence: createIncidenceScene()
      };
    }
    if (propertyKey === 'accumulation') {
      return {
        propertyKey,
        parameter,
        definition,
        accumulation: createAccumulationScene()
      };
    }
    if (propertyKey === 'ratio') {
      return {
        propertyKey,
        parameter,
        definition,
        ratio: createIncidenceSegment(parameter)
      };
    }
    return {
      propertyKey,
      parameter,
      definition,
      invariance: createInvarianceScene()
    };
  }

  module.exports = {
    EPSILON,
    PLANE_DISPLAY_EXTENT,
    RAY_TOP_Z,
    MODEL_PLANE,
    DEFAULT_CENTER,
    DEFAULT_TRIANGLE,
    PROPERTY_DEFINITIONS,
    clamp,
    toRadians,
    add,
    subtract,
    scale,
    dot,
    cross,
    length,
    distance,
    normalize,
    interpolatePoint,
    planeSignedDistance,
    getRayPlaneIntersection,
    projectPointFromCenter,
    projectPointParallel,
    projectTriangleFromCenter,
    projectTriangleParallel,
    getRayDirectionFromPlaneAngle,
    isParallelDirection,
    arePointsCollinear,
    createIncidenceSegment,
    createInvarianceScene,
    createAccumulationScene,
    createIncidenceScene,
    easeInOut,
    getPropertyDefault,
    createPropertyScene
  };
})();
