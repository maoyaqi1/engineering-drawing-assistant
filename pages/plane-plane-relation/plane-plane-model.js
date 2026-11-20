// 两平面相交 · 纯几何模型。
//
// 所有输入输出均为教学空间三维数据。两平面交线由两法向量叉积和
// 平面方程直接求出，不依赖页面或 Canvas。
const base = require('../line-plane-relation/line-plane-model.js');
const RELATION_EPSILON = 1e-6;
const PLANE_TOWARD_ORIGIN = 0.12;
const MIN_PROJECTED_EDGE_CLEARANCE = 0.35;
const MIN_PROJECTED_POINT_CLEARANCE = 0.35;
const MIN_VISIBLE_INTERSECTION_LENGTH = 1.5;

function moveTowardOrigin(plane, distance) {
  const offset = Number.isFinite(distance) ? distance : 0.2;
  return {
    a: {
      x: plane.a.x - offset,
      y: plane.a.y - offset,
      z: plane.a.z - offset
    },
    b: {
      x: plane.b.x - offset,
      y: plane.b.y - offset,
      z: plane.b.z - offset
    },
    c: {
      x: plane.c.x - offset,
      y: plane.c.y - offset,
      z: plane.c.z - offset
    }
  };
}

const PLANE_P = {
  general: moveTowardOrigin({
    // 大面积三角形 A/B/C，向原点内移后仍避开 Q 的边线端点。
    a: { x: 2.15, y: 0.887, z: 5.963 },
    b: { x: 6.276, y: 1.772, z: 0.952 },
    c: { x: 1.902, y: 6.316, z: 0.782 }
  }, PLANE_TOWARD_ORIGIN),
  vertical: moveTowardOrigin(base.VERTICAL_PLANE, PLANE_TOWARD_ORIGIN),
  frontProjecting: moveTowardOrigin(
    base.SPECIAL_PLANE,
    PLANE_TOWARD_ORIGIN
  ),
  profileProjecting: moveTowardOrigin(
    base.PROFILE_PROJECTING_PLANE,
    PLANE_TOWARD_ORIGIN
  )
};

const PLANE_Q = {
  general: {
    // 大面积三角形 E/F/G，在 x - y + z = 5 上并避开 P 的边线端点。
    a: { x: 4.582, y: 0.89, z: 1.308 },
    b: { x: 6.561, y: 6.238, z: 4.677 },
    c: { x: 0.799, y: 2.722, z: 6.923 }
  },
  vertical: {
    a: { x: 1, y: 5, z: 1 },
    b: { x: 5, y: 1, z: 2 },
    c: { x: 1, y: 5, z: 6 }
  },
  frontProjecting: {
    a: { x: 1, y: 2, z: 5 },
    b: { x: 5, y: 4, z: 1 },
    c: { x: 2, y: 1, z: 4 }
  },
  profileProjecting: {
    a: { x: 2, y: 1, z: 5 },
    b: { x: 5, y: 5, z: 1 },
    c: { x: 7, y: 3, z: 3 }
  }
};

function getPolygonCenter(points) {
  return points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length,
    z: sum.z + point.z / points.length
  }), { x: 0, y: 0, z: 0 });
}

function buildCubeSectionPolygon(normal, constant) {
  const minimum = base.PLANE_PATCH_MARGIN;
  const maximum = base.MODEL_MAX - base.PLANE_PATCH_MARGIN;
  const vertices = [];
  [minimum, maximum].forEach((x) => {
    [minimum, maximum].forEach((y) => {
      [minimum, maximum].forEach((z) => {
        vertices.push({ x, y, z });
      });
    });
  });
  const intersections = [];
  const append = (point) => {
    if (!intersections.some((candidate) => (
      base.length(base.subtract(candidate, point)) <= base.MODEL_EPSILON
    ))) {
      intersections.push(point);
    }
  };
  for (let firstIndex = 0; firstIndex < vertices.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1;
      secondIndex < vertices.length;
      secondIndex += 1) {
      const first = vertices[firstIndex];
      const second = vertices[secondIndex];
      const differingAxes = ['x', 'y', 'z'].filter(
        (axis) => first[axis] !== second[axis]
      );
      if (differingAxes.length !== 1) continue;
      const firstDistance = base.dot(normal, first) - constant;
      const secondDistance = base.dot(normal, second) - constant;
      if (Math.abs(firstDistance) <= base.MODEL_EPSILON) append(first);
      if (Math.abs(secondDistance) <= base.MODEL_EPSILON) append(second);
      if (firstDistance * secondDistance < 0) {
        const parameter = firstDistance / (firstDistance - secondDistance);
        append(base.lerp(first, second, parameter));
      }
    }
  }
  if (intersections.length < 3) return intersections;
  const center = getPolygonCenter(intersections);
  const reference = base.normalize(base.cross(
    normal,
    Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  ));
  if (!reference) return intersections;
  const secondReference = base.normalize(base.cross(normal, reference));
  return intersections.sort((first, second) => (
    Math.atan2(
      base.dot(base.subtract(first, center), secondReference),
      base.dot(base.subtract(first, center), reference)
    ) - Math.atan2(
      base.dot(base.subtract(second, center), secondReference),
      base.dot(base.subtract(second, center), reference)
    )
  ));
}

function withDisplayPolygon(planeGeometry) {
  const patch = buildCubeSectionPolygon(
    planeGeometry.normal,
    planeGeometry.constant
  );
  if (patch.length < 3) return planeGeometry;
  const center = getPolygonCenter(patch);
  return Object.assign({}, planeGeometry, {
    vertices: patch.map(base.clonePoint),
    center,
    patch: patch.map(base.clonePoint)
  });
}

function createTriangleGeometry(plane) {
  const source = base.createPlaneGeometry(plane);
  if (!source) return null;
  const triangle = base.clonePlane(plane);
  const u = base.normalize(base.subtract(triangle.b, triangle.a));
  const v = u ? base.normalize(base.cross(source.normal, u)) : null;
  if (!v) return null;
  return Object.assign({}, source, {
    plane: triangle,
    vertices: [triangle.a, triangle.b, triangle.c],
    center: getPolygonCenter([triangle.a, triangle.b, triangle.c]),
    basis: { u, v },
    patch: [triangle.a, triangle.b, triangle.c]
  });
}

function createGeometryFromTriangle(planeGeometry, vertices) {
  if (!planeGeometry || !vertices || vertices.length !== 3) return null;
  const triangle = {
    a: base.clonePoint(vertices[0]),
    b: base.clonePoint(vertices[1]),
    c: base.clonePoint(vertices[2])
  };
  const u = base.normalize(base.subtract(triangle.b, triangle.a));
  const v = u ? base.normalize(base.cross(planeGeometry.normal, u)) : null;
  if (!v) return null;
  return Object.assign({}, planeGeometry, {
    plane: triangle,
    vertices: [triangle.a, triangle.b, triangle.c],
    center: getPolygonCenter([triangle.a, triangle.b, triangle.c]),
    basis: { u, v },
    patch: [triangle.a, triangle.b, triangle.c]
  });
}

function orderTriangleVerticesForDisplay(points, preferHighBC) {
  if (!preferHighBC) return points;
  const sorted = points
    .map((point, index) => ({ point, index }))
    .sort((first, second) => (
      second.point.z - first.point.z || first.index - second.index
    ));
  return [sorted[2].point, sorted[0].point, sorted[1].point];
}

function buildTriangleSamplePoints(planeGeometry) {
  if (!planeGeometry || planeGeometry.patch.length < 3) return [];
  const center = planeGeometry.center;
  const points = [];
  const appendPoint = (point) => {
    if (!points.some((existing) => (
      base.length(base.subtract(existing, point)) <= base.MODEL_EPSILON
    ))) {
      points.push(point);
    }
  };
  planeGeometry.patch.forEach((point, index) => {
    appendPoint(base.lerp(point, center, 0.12));
    appendPoint(base.lerp(point, center, 0.28));
    appendPoint(base.lerp(point, center, 0.46));
    appendPoint(base.lerp(point, center, 0.64));
  });
  appendPoint(center);
  return points;
}

function buildTriangleCandidates(
  planeGeometry,
  line,
  ownerName,
  preferHighBC
) {
  if (!planeGeometry || !line || planeGeometry.patch.length < 3) return [];
  const points = buildTriangleSamplePoints(planeGeometry);
  const candidates = [];
  for (let first = 0; first < points.length - 2; first += 1) {
    for (let second = first + 1; second < points.length - 1; second += 1) {
      for (let third = second + 1; third < points.length; third += 1) {
        const orderedPoints = orderTriangleVerticesForDisplay([
          points[first],
          points[second],
          points[third]
        ], preferHighBC);
        const triangle = createGeometryFromTriangle(
          planeGeometry,
          orderedPoints
        );
        if (!triangle) continue;
        const allVerticesOffLine = triangle.vertices.every((point) => (
          pointLineDistance(point, line.origin, line.direction)
            > 0.15
        ));
        if (!allVerticesOffLine) continue;
        const hasObliqueEdges = triangle.vertices.every(
          (point, index) => {
            const next = triangle.vertices[(index + 1) % 3];
            const edge = base.subtract(next, point);
            const nonZeroAxes = ['x', 'y', 'z'].filter(
              (axis) => Math.abs(edge[axis]) > base.MODEL_EPSILON
            ).length;
            return nonZeroAxes >= 2;
          }
        );
        if (!hasObliqueEdges) continue;
        const clipped = base.clipLineToTriangle(
          triangle,
          line.origin,
          line.direction
        );
        if (!clipped) continue;
        const area = base.length(base.cross(
          base.subtract(triangle.vertices[1], triangle.vertices[0]),
          base.subtract(triangle.vertices[2], triangle.vertices[0])
        )) / 2;
        if (area <= base.MODEL_EPSILON) continue;
        const centroidDistance = base.length(base.subtract(
          triangle.center,
          { x: 0, y: 0, z: 0 }
        ));
        const bcSpread = ownerName === 'P'
          ? triangle.vertices[1].z - triangle.vertices[2].z
          : 0;
        const bcHeight = ownerName === 'P'
          ? Math.min(
            triangle.vertices[1].z,
            triangle.vertices[2].z
          )
          : 0;
        if (preferHighBC
          && (bcSpread < 0.2 || bcHeight < 4.5)) {
          continue;
        }
        candidates.push({
          triangle,
          minimum: clipped.minimum,
          maximum: clipped.maximum,
          area,
          centroidDistance,
          bcSpread,
          bcHeight,
          score: area * 0.7
            + (clipped.maximum - clipped.minimum) * 3
            - centroidDistance * 0.25
            + bcSpread * 1.5
            + bcHeight * 0.4
        });
      }
    }
  }
  return candidates
    .sort((first, second) => second.score - first.score)
    .slice(0, 256);
}

function buildPlanarTriangleCandidates(planeGeometry, ownerName) {
  if (!planeGeometry || planeGeometry.patch.length < 3) return [];
  const points = buildTriangleSamplePoints(planeGeometry);
  const candidates = [];
  for (let first = 0; first < points.length - 2; first += 1) {
    for (let second = first + 1; second < points.length - 1; second += 1) {
      for (let third = second + 1; third < points.length; third += 1) {
        const orderedPoints = orderTriangleVerticesForDisplay([
          points[first],
          points[second],
          points[third]
        ], ownerName === 'P');
        const triangle = createGeometryFromTriangle(
          planeGeometry,
          orderedPoints
        );
        if (!triangle) continue;
        const hasObliqueEdges = triangle.vertices.every(
          (point, index) => {
            const edge = base.subtract(
              triangle.vertices[(index + 1) % 3],
              point
            );
            return ['x', 'y', 'z'].filter(
              (axis) => Math.abs(edge[axis]) > base.MODEL_EPSILON
            ).length >= 2;
          }
        );
        if (!hasObliqueEdges) continue;
        const area = base.length(base.cross(
          base.subtract(triangle.vertices[1], triangle.vertices[0]),
          base.subtract(triangle.vertices[2], triangle.vertices[0])
        )) / 2;
        if (area <= base.MODEL_EPSILON) continue;
        const centroidDistance = base.length(triangle.center);
        const bcSpread = ownerName === 'P'
          ? triangle.vertices[1].z - triangle.vertices[2].z
          : 0;
        const bcHeight = ownerName === 'P'
          ? Math.min(triangle.vertices[1].z, triangle.vertices[2].z)
          : 0;
        candidates.push({
          triangle,
          area,
          centroidDistance,
          bcSpread,
          bcHeight,
          score: area * 0.7
            - centroidDistance * 0.2
            + bcSpread * 1.5
            + bcHeight * 0.4
        });
      }
    }
  }
  return candidates
    .sort((first, second) => second.score - first.score)
    .slice(0, 256);
}

function buildParallelTrianglePair(sectionP, sectionQ) {
  const candidatesP = buildPlanarTriangleCandidates(sectionP, 'P');
  const candidatesQ = buildPlanarTriangleCandidates(sectionQ, 'Q');
  let best = null;
  candidatesP.forEach((candidateP) => {
    candidatesQ.forEach((candidateQ) => {
      const hasCoincidentVertex = candidateP.triangle.vertices.some(
        (point) => candidateQ.triangle.vertices.some((other) => (
          base.length(base.subtract(point, other)) <= 0.25
        ))
      );
      if (hasCoincidentVertex) return;
      if (hasOverlappingEdge(candidateP.triangle, candidateQ.triangle)) {
        return;
      }
      const projectedClearance = getProjectedEdgeClearance(
        candidateP.triangle,
        candidateQ.triangle
      );
      if (projectedClearance < MIN_PROJECTED_EDGE_CLEARANCE) return;
      const projectedPointClearance = getProjectedPointClearance(
        candidateP.triangle,
        candidateQ.triangle
      );
      const score = Math.min(candidateP.area, candidateQ.area) * 0.8
        + (candidateP.area + candidateQ.area) * 0.2
        + projectedClearance * 20
        + projectedPointClearance * 100
        + candidateP.bcSpread * 1.2
        + candidateP.bcHeight * 0.3;
      if (!best || score > best.score) {
        best = {
          score,
          projectedClearance,
          projectedPointClearance,
          geometryP: candidateP.triangle,
          geometryQ: candidateQ.triangle
        };
      }
    });
  });
  return best;
}

function pointLineDistance(point, start, direction) {
  return base.length(base.cross(
    base.subtract(point, start),
    direction
  ));
}

function hasOverlappingEdge(first, second) {
  return first.vertices.some((start, firstIndex) => {
    const end = first.vertices[(firstIndex + 1) % 3];
    const direction = base.normalize(base.subtract(end, start));
    if (!direction) return false;
    return second.vertices.some((otherStart, secondIndex) => {
      const otherEnd = second.vertices[(secondIndex + 1) % 3];
      const otherDirection = base.normalize(base.subtract(
        otherEnd,
        otherStart
      ));
      if (!otherDirection) return false;
      const parallel = base.length(base.cross(direction, otherDirection))
        <= 1e-6;
      return parallel
        && pointLineDistance(otherStart, start, direction) <= 0.1
        && pointLineDistance(end, otherStart, otherDirection) <= 0.1;
    });
  });
}

function projectPointTo2D(point, viewType) {
  if (viewType === 'front') return { x: point.x, y: point.z };
  if (viewType === 'top') return { x: point.x, y: point.y };
  return { x: point.y, y: point.z };
}

function pointToSegment2D(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const parameter = denominator > base.MODEL_EPSILON
    ? Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy)
        / denominator
    ))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * parameter),
    point.y - (start.y + dy * parameter)
  );
}

function getProjectedEdgeClearance(first, second) {
  let minimum = Infinity;
  ['front', 'top', 'left'].forEach((viewType) => {
    const firstPoints = first.vertices.map(
      (point) => projectPointTo2D(point, viewType)
    );
    const secondPoints = second.vertices.map(
      (point) => projectPointTo2D(point, viewType)
    );
    for (let firstIndex = 0; firstIndex < 3; firstIndex += 1) {
      const firstStart = firstPoints[firstIndex];
      const firstEnd = firstPoints[(firstIndex + 1) % 3];
      const firstDirection = {
        x: firstEnd.x - firstStart.x,
        y: firstEnd.y - firstStart.y
      };
      const firstLength = Math.hypot(firstDirection.x, firstDirection.y);
      for (let secondIndex = 0; secondIndex < 3; secondIndex += 1) {
        const secondStart = secondPoints[secondIndex];
        const secondEnd = secondPoints[(secondIndex + 1) % 3];
        const secondDirection = {
          x: secondEnd.x - secondStart.x,
          y: secondEnd.y - secondStart.y
        };
        const secondLength = Math.hypot(
          secondDirection.x,
          secondDirection.y
        );
        if (firstLength <= base.MODEL_EPSILON
          || secondLength <= base.MODEL_EPSILON) {
          continue;
        }
        const sine = Math.abs(
          firstDirection.x * secondDirection.y
            - firstDirection.y * secondDirection.x
        ) / (firstLength * secondLength);
        if (sine > 0.15) continue;
        minimum = Math.min(
          minimum,
          pointToSegment2D(secondStart, firstStart, firstEnd),
          pointToSegment2D(secondEnd, firstStart, firstEnd),
          pointToSegment2D(firstStart, secondStart, secondEnd),
          pointToSegment2D(firstEnd, secondStart, secondEnd)
        );
      }
    }
  });
  return minimum;
}

function getProjectedPointClearance(first, second) {
  let minimum = Infinity;
  ['front', 'top', 'left'].forEach((viewType) => {
    const firstPoints = first.vertices.map(
      (point) => projectPointTo2D(point, viewType)
    );
    const secondPoints = second.vertices.map(
      (point) => projectPointTo2D(point, viewType)
    );
    firstPoints.forEach((firstPoint) => {
      secondPoints.forEach((secondPoint) => {
        minimum = Math.min(minimum, Math.hypot(
          firstPoint.x - secondPoint.x,
          firstPoint.y - secondPoint.y
        ));
      });
      for (let index = 0; index < 3; index += 1) {
        minimum = Math.min(
          minimum,
          pointToSegment2D(
            firstPoint,
            secondPoints[index],
            secondPoints[(index + 1) % 3]
          )
        );
      }
    });
    secondPoints.forEach((secondPoint) => {
      for (let index = 0; index < 3; index += 1) {
        minimum = Math.min(
          minimum,
          pointToSegment2D(
            secondPoint,
            firstPoints[index],
            firstPoints[(index + 1) % 3]
          )
        );
      }
    });
  });
  return minimum;
}

function translateTriangleGeometry(planeGeometry, du, dv, preferHighBC) {
  if (!planeGeometry) return null;
  const offset = base.add(
    base.scale(planeGeometry.basis.u, du),
    base.scale(planeGeometry.basis.v, dv)
  );
  const vertices = planeGeometry.vertices.map(
    (point) => base.add(point, offset)
  );
  if (vertices.some((point) => (
    ['x', 'y', 'z'].some((axis) => (
      point[axis] < base.MODEL_MIN + 0.15
        || point[axis] > base.MODEL_MAX - 0.15
    ))
  ))) {
    return null;
  }
  return createGeometryFromTriangle(
    planeGeometry,
    orderTriangleVerticesForDisplay(vertices, preferHighBC)
  );
}

function trianglePairSharesLine(first, second) {
  const line = buildPlanePairLine(first, second);
  if (!line) return true;
  const firstClip = base.clipLineToTriangle(
    first,
    line.origin,
    line.direction
  );
  const secondClip = base.clipLineToTriangle(
    second,
    line.origin,
    line.direction
  );
  return !!firstClip && !!secondClip
    && Math.min(firstClip.maximum, secondClip.maximum)
      - Math.max(firstClip.minimum, secondClip.minimum)
      >= MIN_VISIBLE_INTERSECTION_LENGTH;
}

function refineProjectedSeparation(planeP, planeQ) {
  let best = {
    geometryP: planeP,
    geometryQ: planeQ,
    projectedPointClearance: getProjectedPointClearance(planeP, planeQ)
  };
  for (let du = -1.4; du <= 1.4; du += 0.05) {
    for (let dv = -1.4; dv <= 1.4; dv += 0.05) {
      [
        {
          geometryP: planeP,
          geometryQ: translateTriangleGeometry(planeQ, du, dv, false)
        },
        {
          geometryP: translateTriangleGeometry(planeP, du, dv, true),
          geometryQ: planeQ
        }
      ].forEach((candidate) => {
        if (!candidate.geometryP || !candidate.geometryQ) return;
        if (!trianglePairSharesLine(
          candidate.geometryP,
          candidate.geometryQ
        )) {
          return;
        }
        const projectedClearance = getProjectedEdgeClearance(
          candidate.geometryP,
          candidate.geometryQ
        );
        if (projectedClearance < MIN_PROJECTED_EDGE_CLEARANCE) return;
        const projectedPointClearance = getProjectedPointClearance(
          candidate.geometryP,
          candidate.geometryQ
        );
        if (projectedPointClearance > best.projectedPointClearance) {
          best = {
            geometryP: candidate.geometryP,
            geometryQ: candidate.geometryQ,
            projectedPointClearance
          };
        }
      });
    }
  }
  return best;
}

function intersectEdgeWithPlane(start, end, planeGeometry) {
  const relation = base.classifyLinePlane(planeGeometry, {
    e: start,
    f: end
  });
  if (!relation || !relation.intersection
    || !relation.intersection.isOnSegment) {
    return null;
  }
  return relation.intersection.point;
}

function buildDisplayTrianglePair(
  sectionP,
  sectionQ,
  line,
  requireAccumulationEdges,
  preferHighBC
) {
  const candidatesP = buildTriangleCandidates(
    sectionP,
    line,
    'P',
    preferHighBC
  );
  const candidatesQ = buildTriangleCandidates(
    sectionQ,
    line,
    'Q',
    false
  );
  let best = null;
  candidatesP.forEach((candidateP) => {
    candidatesQ.forEach((candidateQ) => {
      const hasCoincidentVertex = candidateP.triangle.vertices.some(
        (point) => candidateQ.triangle.vertices.some((other) => (
          base.length(base.subtract(point, other)) <= 0.25
        ))
      );
      if (hasCoincidentVertex) return;
      if (hasOverlappingEdge(candidateP.triangle, candidateQ.triangle)) return;
      const minimum = Math.max(candidateP.minimum, candidateQ.minimum);
      const maximum = Math.min(candidateP.maximum, candidateQ.maximum);
      const overlap = maximum - minimum;
      if (overlap < MIN_VISIBLE_INTERSECTION_LENGTH) return;
      const pointOnEG = intersectEdgeWithPlane(
        candidateQ.triangle.vertices[2],
        candidateQ.triangle.vertices[0],
        candidateP.triangle
      );
      const pointOnEF = intersectEdgeWithPlane(
        candidateQ.triangle.vertices[0],
        candidateQ.triangle.vertices[1],
        candidateP.triangle
      );
      if (requireAccumulationEdges && (!pointOnEG || !pointOnEF)) {
        return;
      }
      const projectedClearance = getProjectedEdgeClearance(
        candidateP.triangle,
        candidateQ.triangle
      );
      if (projectedClearance < MIN_PROJECTED_EDGE_CLEARANCE) return;
      const projectedPointClearance = getProjectedPointClearance(
        candidateP.triangle,
        candidateQ.triangle
      );
      const score = overlap * 5
        + Math.min(candidateP.area, candidateQ.area) * 0.7
        + (candidateP.area + candidateQ.area) * 0.2
        - (candidateP.centroidDistance + candidateQ.centroidDistance) * 0.12
        + candidateP.bcSpread * 1.5
        + candidateP.bcHeight * 0.4
        + projectedClearance * 20
        + projectedPointClearance * 100;
      if (!best || score > best.score) {
        best = {
          overlap,
          score,
          geometryP: candidateP.triangle,
          geometryQ: candidateQ.triangle,
          projectedClearance,
          projectedPointClearance
        };
      }
    });
  });
  if (!best) return null;
  if (best.projectedPointClearance < MIN_PROJECTED_POINT_CLEARANCE) {
    return refineProjectedSeparation(
      best.geometryP,
      best.geometryQ
    );
  }
  return best;
}

function clonePlaneGeometry(planeGeometry) {
  if (!planeGeometry) return null;
  return {
    plane: base.clonePlane(planeGeometry.plane),
    vertices: planeGeometry.vertices.map(base.clonePoint),
    normal: base.clonePoint(planeGeometry.normal),
    constant: planeGeometry.constant,
    center: base.clonePoint(planeGeometry.center),
    basis: {
      u: base.clonePoint(planeGeometry.basis.u),
      v: base.clonePoint(planeGeometry.basis.v)
    },
    patch: planeGeometry.patch.map(base.clonePoint)
  };
}

function getPlanePreset(kind, sourceName) {
  const presets = sourceName === 'Q' ? PLANE_Q : PLANE_P;
  return base.clonePlane(presets[kind] || presets.general);
}

function getUnifiedProjectingKind(kindP, kindQ) {
  if (kindP === 'general'
    && (kindQ === 'vertical'
      || kindQ === 'frontProjecting'
      || kindQ === 'profileProjecting')) {
    return kindQ;
  }
  if (kindQ === 'general'
    && (kindP === 'vertical'
      || kindP === 'frontProjecting'
      || kindP === 'profileProjecting')) {
    return kindP;
  }
  return null;
}

function getCanonicalProjectingGeneralPair(projectingKind) {
  return {
    P: getPlanePreset(projectingKind, 'P'),
    Q: getPlanePreset('general', 'Q')
  };
}

function getPlanePair(kindP, kindQ) {
  const projectingKind = getUnifiedProjectingKind(kindP, kindQ);
  if (!projectingKind) {
    return {
      P: getPlanePreset(kindP, 'P'),
      Q: getPlanePreset(kindQ, 'Q'),
      isCanonicalOrder: true
    };
  }
  const canonical = getCanonicalProjectingGeneralPair(projectingKind);
  const isCanonicalOrder = kindP === projectingKind;
  return {
    P: isCanonicalOrder ? canonical.P : canonical.Q,
    Q: isCanonicalOrder ? canonical.Q : canonical.P,
    isCanonicalOrder
  };
}

function classifyPlanePlane(planeP, planeQ) {
  const normalDot = base.dot(planeP.normal, planeQ.normal);
  if (Math.abs(1 - Math.abs(normalDot)) <= RELATION_EPSILON) {
    return {
      kind: 'parallel',
      label: '两平面平行',
      shortLabel: '平行',
      normalDot,
      isPerpendicular: false
    };
  }
  return {
    kind: 'intersect',
    label: '两平面相交',
    shortLabel: '相交',
    normalDot,
    isPerpendicular: Math.abs(normalDot) <= RELATION_EPSILON
  };
}

function buildPlaneIntersectionLine(planeP, planeQ) {
  const rawDirection = base.cross(
    planeP.normal,
    planeQ.normal
  );
  const direction = base.normalize(rawDirection);
  if (!direction) return null;
  const denominator = base.dot(rawDirection, rawDirection);
  const origin = base.scale(base.add(
    base.scale(
      base.cross(planeQ.normal, rawDirection),
      planeP.constant
    ),
    base.scale(
      base.cross(rawDirection, planeP.normal),
      planeQ.constant
    )
  ), 1 / denominator);
  let minimum = -Infinity;
  let maximum = Infinity;
  const lowest = base.PLANE_PATCH_MARGIN;
  const highest = base.MODEL_MAX - base.PLANE_PATCH_MARGIN;
  ['x', 'y', 'z'].forEach((axis) => {
    if (Math.abs(direction[axis]) <= RELATION_EPSILON) {
      if (origin[axis] < lowest || origin[axis] > highest) {
        minimum = Infinity;
        maximum = -Infinity;
      }
      return;
    }
    const first = (lowest - origin[axis]) / direction[axis];
    const second = (highest - origin[axis]) / direction[axis];
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  });
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)
    || maximum - minimum <= RELATION_EPSILON) {
    return null;
  }
  return {
    start: base.add(origin, base.scale(direction, minimum)),
    end: base.add(origin, base.scale(direction, maximum)),
    origin,
    direction
  };
}

function buildPlanePairLine(planeP, planeQ) {
  const direction = base.normalize(base.cross(
    planeP.normal,
    planeQ.normal
  ));
  if (!direction) return null;
  const rawDirection = base.cross(planeP.normal, planeQ.normal);
  const denominator = base.dot(rawDirection, rawDirection);
  if (denominator <= RELATION_EPSILON) return null;
  const origin = base.scale(base.add(
    base.scale(
      base.cross(planeQ.normal, rawDirection),
      planeP.constant
    ),
    base.scale(
      base.cross(rawDirection, planeP.normal),
      planeQ.constant
    )
  ), 1 / denominator);
  return { origin, direction };
}

function clipLineToDisplayPolygon(planeGeometry, line) {
  if (!planeGeometry || !line) return null;
  const displayGeometry = Object.assign({}, planeGeometry, {
    plane: {
      a: planeGeometry.patch[0],
      b: planeGeometry.patch[1],
      c: planeGeometry.patch[2]
    }
  });
  return base.clipLineToTriangle(
    displayGeometry,
    line.origin,
    line.direction
  );
}

function buildVisibleIntersectionSegment(planeP, planeQ, line) {
  if (!line) return null;
  const clippedP = clipLineToDisplayPolygon(planeP, line);
  const clippedQ = clipLineToDisplayPolygon(planeQ, line);
  if (!clippedP || !clippedQ) return null;
  const minimum = Math.max(clippedP.minimum, clippedQ.minimum);
  const maximum = Math.min(clippedP.maximum, clippedQ.maximum);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)
    || maximum - minimum <= RELATION_EPSILON) {
    return null;
  }
  return {
    start: base.add(line.origin, base.scale(line.direction, minimum)),
    end: base.add(line.origin, base.scale(line.direction, maximum)),
    origin: line.origin,
    direction: line.direction,
    minimum,
    maximum
  };
}

function toPolygonCoordinates(point, planeGeometry) {
  const offset = base.subtract(point, planeGeometry.plane.a);
  return {
    u: base.dot(offset, planeGeometry.basis.u),
    v: base.dot(offset, planeGeometry.basis.v)
  };
}

function isPointInsideTriangle(planeGeometry, point) {
  const coordinates = planeGeometry.vertices.map((vertex) => (
    toPolygonCoordinates(vertex, planeGeometry)
  ));
  const target = toPolygonCoordinates(point, planeGeometry);
  let hasPositive = false;
  let hasNegative = false;
  for (let index = 0; index < coordinates.length; index += 1) {
    const start = coordinates[index];
    const end = coordinates[(index + 1) % coordinates.length];
    const edge = { u: end.u - start.u, v: end.v - start.v };
    const offset = { u: target.u - start.u, v: target.v - start.v };
    const side = edge.u * offset.v - edge.v * offset.u;
    if (side > base.MODEL_EPSILON) hasPositive = true;
    if (side < -base.MODEL_EPSILON) hasNegative = true;
  }
  return !(hasPositive && hasNegative);
}

function collectEdgePlaneIntersections(
  ownerGeometry,
  targetGeometry,
  ownerName
) {
  const edgeNames = ownerName === 'P'
    ? ['AB', 'BC', 'CA']
    : ['EF', 'FG', 'GE'];
  const results = [];
  ownerGeometry.vertices.forEach((start, index) => {
    const end = ownerGeometry.vertices[(index + 1) % 3];
    const line = { e: base.clonePoint(start), f: base.clonePoint(end) };
    const relation = base.classifyLinePlane(targetGeometry, line);
    const auxiliaryPlane = base.buildAuxiliaryPlane(line);
    const sectionLine = auxiliaryPlane
      ? base.buildSectionLine(targetGeometry, auxiliaryPlane)
      : null;
    if (!relation || !relation.intersection
      || !relation.intersection.isOnSegment
      || !auxiliaryPlane
      || !sectionLine
      || !isPointInsideTriangle(
        targetGeometry,
        relation.intersection.point
      )) {
      return;
    }
    results.push({
      ownerName,
      targetName: ownerName === 'P' ? 'EFG' : 'ABC',
      edgeLabel: edgeNames[index],
      line,
      point: base.clonePoint(relation.intersection.point),
      parameter: relation.intersection.parameter,
      auxiliaryPlane,
      sectionLine
    });
  });
  return results;
}

function buildTwoLinePlaneIntersections(
  planeP,
  planeQ,
  intersectionLine
) {
  if (!planeP || !planeQ || !intersectionLine) return [];
  const candidates = [
    ...collectEdgePlaneIntersections(planeP, planeQ, 'P'),
    ...collectEdgePlaneIntersections(planeQ, planeP, 'Q')
  ].sort((first, second) => (
    base.dot(first.point, intersectionLine.direction)
      - base.dot(second.point, intersectionLine.direction)
  ));
  const unique = [];
  candidates.forEach((candidate) => {
    if (!unique.some((existing) => (
      base.length(base.subtract(existing.point, candidate.point))
        <= base.RELATION_EPSILON
    ))) {
      unique.push(candidate);
    }
  });
  if (unique.length < 2) return [];
  return [unique[0], unique[unique.length - 1]].map((item, index) => {
    const constructionIndex = index + 1;
    const trace = item.auxiliaryPlane.trace;
    return Object.assign({}, item, {
      index: constructionIndex,
      auxiliaryPlane: Object.assign({}, item.auxiliaryPlane, {
        label: `R${constructionIndex}`,
        trace: trace ? Object.assign({}, trace, {
          label: `R${constructionIndex}_${trace.projectionPlane}`
        }) : null
      })
    });
  });
}

function buildGeometry(planeP, planeQ) {
  const sourceP = base.createPlaneGeometry(planeP);
  const sourceQ = base.createPlaneGeometry(planeQ);
  const triangleP = createTriangleGeometry(planeP);
  const triangleQ = createTriangleGeometry(planeQ);
  if (!sourceP || !sourceQ || !triangleP || !triangleQ) return null;
  const accumulationP = base.getPlaneAccumulationPlane(triangleP);
  const accumulationQ = base.getPlaneAccumulationPlane(triangleQ);
  const areBothGeneral = !accumulationP && !accumulationQ;
  const relation = classifyPlanePlane(triangleP, triangleQ);
  if (!relation) return null;
  const rawIntersectionLine = relation.kind === 'intersect'
    ? buildPlanePairLine(triangleP, triangleQ)
    : null;
  const sectionP = withDisplayPolygon(sourceP);
  const sectionQ = withDisplayPolygon(sourceQ);
  const sectionIntersection = rawIntersectionLine
    ? buildVisibleIntersectionSegment(sectionP, sectionQ, rawIntersectionLine)
    : null;
  let geometryP = triangleP;
  let geometryQ = triangleQ;
  let accumulationEdgePoints = null;
  if (relation.kind === 'parallel') {
    const parallelTriangles = buildParallelTrianglePair(sectionP, sectionQ);
    geometryP = parallelTriangles
      ? parallelTriangles.geometryP
      : sourceP;
    geometryQ = parallelTriangles
      ? parallelTriangles.geometryQ
      : sourceQ;
  } else if (!areBothGeneral && sectionIntersection) {
    const displayTriangles = buildDisplayTrianglePair(
      sectionP,
      sectionQ,
      sectionIntersection,
      accumulationP && !accumulationQ,
      !!accumulationP
    );
    if (displayTriangles) {
      geometryP = displayTriangles.geometryP;
      geometryQ = displayTriangles.geometryQ;
      if (accumulationP && !accumulationQ) {
        const pointOnEG = intersectEdgeWithPlane(
          geometryQ.vertices[2],
          geometryQ.vertices[0],
          geometryP
        );
        const pointOnEF = intersectEdgeWithPlane(
          geometryQ.vertices[0],
          geometryQ.vertices[1],
          geometryP
        );
        accumulationEdgePoints = [pointOnEG, pointOnEF];
      }
    }
  }
  let lineIntersections = [];
  let intersectionLine = null;
  if (accumulationEdgePoints
    && !accumulationEdgePoints.every(Boolean)) {
    accumulationEdgePoints = null;
  }
  if (accumulationEdgePoints) {
    const start = accumulationEdgePoints[0];
    const end = accumulationEdgePoints[1];
    intersectionLine = {
      start,
      end,
      origin: start,
      direction: rawIntersectionLine.direction,
      minimum: 0,
      maximum: base.length(base.subtract(end, start))
    };
  } else if (areBothGeneral && rawIntersectionLine) {
    lineIntersections = buildTwoLinePlaneIntersections(
      triangleP,
      triangleQ,
      rawIntersectionLine
    );
    if (lineIntersections.length === 2) {
      const start = lineIntersections[0].point;
      const end = lineIntersections[1].point;
      intersectionLine = {
        start,
        end,
        origin: start,
        direction: rawIntersectionLine.direction,
        minimum: 0,
        maximum: base.length(base.subtract(end, start))
      };
    }
  } else if (rawIntersectionLine) {
    intersectionLine = buildVisibleIntersectionSegment(
      geometryP,
      geometryQ,
      rawIntersectionLine
    ) || buildPlaneIntersectionLine(geometryP, geometryQ);
  }
  let methodKind = 'none';
  if (intersectionLine) {
    methodKind = areBothGeneral ? 'twoLinePlane' : 'plane';
    if (accumulationP && accumulationQ) methodKind = 'both';
    else if (accumulationP || accumulationQ) methodKind = 'plane';
  }
  const directPoints = intersectionLine
    ? [
      base.clonePoint(intersectionLine.start),
      base.clonePoint(intersectionLine.end)
    ]
    : [];
  const commonPoints = methodKind === 'twoLinePlane'
    ? lineIntersections.map((item) => item.point)
    : (accumulationEdgePoints || directPoints);
  return {
    planeP: geometryP,
    planeQ: geometryQ,
    relation,
    intersectionLine,
    accumulationP,
    accumulationQ,
    methodKind,
    lineIntersections,
    commonPoints
  };
}

function swapGeometryRoles(geometry) {
  if (!geometry) return null;
  return Object.assign({}, geometry, {
    planeP: geometry.planeQ,
    planeQ: geometry.planeP,
    accumulationP: geometry.accumulationQ,
    accumulationQ: geometry.accumulationP
  });
}

function buildPlanePairGeometry(kindP, kindQ) {
  const projectingKind = getUnifiedProjectingKind(kindP, kindQ);
  if (!projectingKind) {
    return buildGeometry(
      getPlanePreset(kindP, 'P'),
      getPlanePreset(kindQ, 'Q')
    );
  }
  const canonical = getCanonicalProjectingGeneralPair(projectingKind);
  const geometry = buildGeometry(canonical.P, canonical.Q);
  return kindP === projectingKind ? geometry : swapGeometryRoles(geometry);
}

module.exports = {
  PLANE_P,
  PLANE_Q,
  PLANE_TOWARD_ORIGIN,
  getPlanePair,
  getPlanePreset,
  classifyPlanePlane,
  buildPlaneIntersectionLine,
  buildGeometry,
  buildPlanePairGeometry,
  clonePlane: base.clonePlane,
  clonePlaneGeometry
};
