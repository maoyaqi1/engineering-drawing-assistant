// 正投影：基本性质的纯几何模型。
//
// 本文件不读取页面、Canvas 或 wx API。所有空间点、垂直投射线和投影结果
// 都由这里的立体几何计算产生；页面与渲染层只消费这些结果。
(function () {
  const EPSILON = 1e-8;
  const PLANE_DISPLAY_EXTENT = 8;

  const RELATION_DEFINITIONS = Object.freeze({
    parallel: Object.freeze({
      key: 'parallel',
      symbol: '∥ P',
      label: '平行',
      property: '真实性',
      condition: '线段为投影面平行线，平面为投影面平行平面',
      caption: '投影保持实长或实形',
      lineType: '投影面平行线',
      planeType: '投影面平行平面',
      lineResult: '线段 EF 为投影面平行线（EF ∥ P），投影 ef 反映实长。',
      planeResult: '平面 △ABC 为投影面平行平面（△ABC ∥ P），投影 △abc 与 △ABC 全等，反映实形。',
      bridgeTitle: '走向特殊位置：平行',
      bridge: '后续可据此识别投影面平行线和投影面平行面，并直接读取实长或实形。'
    }),
    perpendicular: Object.freeze({
      key: 'perpendicular',
      symbol: '⊥ P',
      label: '垂直',
      property: '积聚性',
      condition: '线段为投影面垂直线，平面为投影面垂直平面',
      caption: '直线聚成点，平面聚成线',
      lineType: '投影面垂直线',
      planeType: '投影面垂直平面',
      lineResult: '线段 EF 为投影面垂直线（EF ⊥ P），投影 ef 积聚为一个点。',
      planeResult: '平面 △ABC 为投影面垂直平面（△ABC ⊥ P），投影 abc 积聚为一条直线。',
      bridgeTitle: '走向特殊位置：垂直',
      bridge: '后续可识别投影面垂直线和投影面垂直面，并利用积聚性直接求交点或交线。'
    }),
    oblique: Object.freeze({
      key: 'oblique',
      symbol: '∠ P',
      label: '倾斜',
      property: '相似性',
      condition: '线段为一般位置直线，平面为一般位置平面',
      caption: '保持图形类型，尺寸和角度改变',
      lineType: '一般位置直线',
      planeType: '一般位置平面',
      lineResult: '线段 EF 为一般位置直线（与 P 倾斜），投影 ef 短于 EF。',
      planeResult: '平面 △ABC 为一般位置平面（与 P 倾斜），投影仍是三角形并保持顶点连接关系，但边长和角度通常改变。',
      bridgeTitle: '走向一般位置：倾斜',
      bridge: '一般位置直线和平面不能直接读出实长或实形，后续需用直角三角形法或辅助作图继续求解。'
    })
  });

  const RELATION_OPTIONS = Object.freeze([
    RELATION_DEFINITIONS.parallel,
    RELATION_DEFINITIONS.perpendicular,
    RELATION_DEFINITIONS.oblique
  ]);

  const LINE_PRESETS = Object.freeze({
    parallel: Object.freeze({
      start: Object.freeze({ x: 1.2, y: 1.8, z: 3.35 }),
      end: Object.freeze({ x: 5.4, y: 3.1, z: 3.35 })
    }),
    perpendicular: Object.freeze({
      start: Object.freeze({ x: 4.1, y: 2.2, z: 1.35 }),
      end: Object.freeze({ x: 4.1, y: 2.2, z: 5.55 })
    }),
    oblique: Object.freeze({
      start: Object.freeze({ x: 1.25, y: 1.65, z: 2.0 }),
      end: Object.freeze({ x: 5.35, y: 2.75, z: 5.25 })
    })
  });

  const PLANE_PRESETS = Object.freeze({
    parallel: Object.freeze([
      Object.freeze({ x: 1.45, y: 1.45, z: 3.45 }),
      Object.freeze({ x: 5.2, y: 1.75, z: 3.45 }),
      Object.freeze({ x: 3.45, y: 4.55, z: 3.45 })
    ]),
    perpendicular: Object.freeze([
      Object.freeze({ x: 4.0, y: 1.35, z: 1.45 }),
      Object.freeze({ x: 4.0, y: 1.75, z: 4.7 }),
      Object.freeze({ x: 4.0, y: 4.55, z: 3.85 })
    ]),
    oblique: Object.freeze([
      Object.freeze({ x: 2.69, y: 4.78, z: 2.84 }),
      Object.freeze({ x: 5.15, y: 1.62, z: 2.84 }),
      Object.freeze({ x: 2.62, y: 1.94, z: 4.1 })
    ])
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

  function distance3D(first, second) {
    return length(subtract(first, second));
  }

  function distance2D(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function isFinitePoint(point) {
    return !!point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && Number.isFinite(point.z);
  }

  function projectPointOrthographic(point) {
    if (!isFinitePoint(point)) return null;
    const projection = { x: point.x, y: point.y, z: 0 };
    return {
      source: point,
      point: projection,
      ray: {
        start: point,
        end: projection
      }
    };
  }

  function getLineRelation(line) {
    const delta = subtract(line.end, line.start);
    if (Math.abs(delta.z) <= EPSILON) return 'parallel';
    if (Math.hypot(delta.x, delta.y) <= EPSILON) return 'perpendicular';
    return 'oblique';
  }

  function getTriangleNormal(triangle) {
    if (!Array.isArray(triangle) || triangle.length < 3) return null;
    return cross(
      subtract(triangle[1], triangle[0]),
      subtract(triangle[2], triangle[0])
    );
  }

  function getPlaneRelation(triangle) {
    const normal = getTriangleNormal(triangle);
    if (!normal || length(normal) <= EPSILON) return 'degenerate';
    if (Math.abs(normal.x) <= EPSILON && Math.abs(normal.y) <= EPSILON) {
      return 'parallel';
    }
    if (Math.abs(normal.z) <= EPSILON) return 'perpendicular';
    return 'oblique';
  }

  function triangleArea3D(triangle) {
    const normal = getTriangleNormal(triangle);
    return normal ? length(normal) * 0.5 : 0;
  }

  function triangleArea2D(triangle) {
    if (!Array.isArray(triangle) || triangle.length < 3) return 0;
    return Math.abs(
      (triangle[1].x - triangle[0].x) * (triangle[2].y - triangle[0].y)
      - (triangle[2].x - triangle[0].x) * (triangle[1].y - triangle[0].y)
    ) * 0.5;
  }

  function arePointsCollinear2D(first, second, third) {
    const area = Math.abs(
      (second.x - first.x) * (third.y - first.y)
      - (third.x - first.x) * (second.y - first.y)
    );
    const scale = Math.max(
      1,
      distance2D(first, second),
      distance2D(second, third),
      distance2D(first, third)
    );
    return area <= EPSILON * scale;
  }

  function easeInOut(progress) {
    const t = clamp(progress, 0, 1);
    return t < 0.5
      ? 2 * t * t
      : -1 + (4 - 2 * t) * t;
  }

  function createLineCase(relationKey) {
    const key = RELATION_DEFINITIONS[relationKey] ? relationKey : 'parallel';
    const preset = LINE_PRESETS[key];
    const source = {
      start: Object.assign({}, preset.start),
      end: Object.assign({}, preset.end)
    };
    const projectedStart = projectPointOrthographic(source.start);
    const projectedEnd = projectPointOrthographic(source.end);
    const trueLength = distance3D(source.start, source.end);
    const projectedLength = distance2D(
      projectedStart.point,
      projectedEnd.point
    );
    return {
      key,
      source,
      projected: {
        start: projectedStart.point,
        end: projectedEnd.point
      },
      rays: {
        start: projectedStart.ray,
        end: projectedEnd.ray
      },
      metrics: {
        trueLength,
        projectedLength,
        ratio: trueLength > EPSILON ? projectedLength / trueLength : 0
      },
      detectedRelation: getLineRelation(source)
    };
  }

  function createPlaneCase(relationKey) {
    const key = RELATION_DEFINITIONS[relationKey] ? relationKey : 'parallel';
    const source = PLANE_PRESETS[key].map((point) => Object.assign({}, point));
    const projections = source.map(projectPointOrthographic);
    const projected = projections.map((item) => item.point);
    const trueArea = triangleArea3D(source);
    const projectedArea = triangleArea2D(projected);
    return {
      key,
      source,
      projected,
      rays: projections.map((item) => item.ray),
      metrics: {
        trueArea,
        projectedArea,
        ratio: trueArea > EPSILON ? projectedArea / trueArea : 0,
        isProjectionCollinear: arePointsCollinear2D(
          projected[0],
          projected[1],
          projected[2]
        )
      },
      detectedRelation: getPlaneRelation(source)
    };
  }

  function getRelationDefinition(relationKey) {
    return RELATION_DEFINITIONS[relationKey] || RELATION_DEFINITIONS.parallel;
  }

  function createRelationScene(relationKey) {
    const definition = getRelationDefinition(relationKey);
    const key = definition.key;
    return {
      key,
      definition,
      line: createLineCase(key),
      plane: createPlaneCase(key)
    };
  }

  function getPlaneDisplayBounds(points, padding) {
    const pad = Number.isFinite(padding) ? padding : 0.45;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      minX: clamp(Math.min.apply(null, xs) - pad, 0, PLANE_DISPLAY_EXTENT),
      maxX: clamp(Math.max.apply(null, xs) + pad, 0, PLANE_DISPLAY_EXTENT),
      minY: clamp(Math.min.apply(null, ys) - pad, 0, PLANE_DISPLAY_EXTENT),
      maxY: clamp(Math.max.apply(null, ys) + pad, 0, PLANE_DISPLAY_EXTENT)
    };
  }

  module.exports = {
    EPSILON,
    PLANE_DISPLAY_EXTENT,
    RELATION_DEFINITIONS,
    RELATION_OPTIONS,
    LINE_PRESETS,
    PLANE_PRESETS,
    clamp,
    add,
    subtract,
    dot,
    cross,
    length,
    distance3D,
    distance2D,
    projectPointOrthographic,
    getLineRelation,
    getTriangleNormal,
    getPlaneRelation,
    triangleArea3D,
    triangleArea2D,
    arePointsCollinear2D,
    easeInOut,
    createLineCase,
    createPlaneCase,
    getRelationDefinition,
    createRelationScene,
    getPlaneDisplayBounds
  };
})();
