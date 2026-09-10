const EPSILON = 1e-8;

function point(x, y, z) {
  return { x, y, z };
}

function addTriangle(triangles, a, b, c) {
  triangles.push([a, b, c]);
}

function addEdge(edges, a, b) {
  edges.push([a, b]);
}

function ringPoint(cx, cy, z, radius, angle) {
  return point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z);
}

function createTriangularPyramid() {
  const centerX = 4;
  const centerY = 4;
  const radius = 2.5;
  const base = Array.from({ length: 3 }, (_, index) => {
    const angle = Math.PI / 6 + index * Math.PI * 2 / 3;
    return ringPoint(centerX, centerY, 1, radius, angle);
  });
  const apex = point(4, 4, 7);
  const triangles = [
    [base[0], base[2], base[1]],
    [base[0], base[1], apex],
    [base[1], base[2], apex],
    [base[2], base[0], apex]
  ];
  const edges = [
    [base[0], base[1]], [base[1], base[2]], [base[2], base[0]],
    [base[0], apex], [base[1], apex], [base[2], apex]
  ];
  return { triangles, edges };
}

function createPentagonalPrism() {
  const count = 5;
  const bottom = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return ringPoint(4, 4, 1, 2.3, angle);
  });
  const top = bottom.map((vertex) => point(vertex.x, vertex.y, 6.5));
  const triangles = [];
  const edges = [];
  for (let index = 1; index < count - 1; index += 1) {
    addTriangle(triangles, bottom[0], bottom[index + 1], bottom[index]);
    addTriangle(triangles, top[0], top[index], top[index + 1]);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    addTriangle(triangles, bottom[index], bottom[next], top[next]);
    addTriangle(triangles, bottom[index], top[next], top[index]);
    addEdge(edges, bottom[index], bottom[next]);
    addEdge(edges, top[index], top[next]);
    addEdge(edges, bottom[index], top[index]);
  }
  return { triangles, edges };
}

function createCylinder(radialSegments = 72) {
  const bottom = [];
  const top = [];
  const triangles = [];
  const edges = [];
  const bottomCenter = point(4, 4, 1);
  const topCenter = point(4, 4, 6.5);
  for (let index = 0; index < radialSegments; index += 1) {
    const angle = index * Math.PI * 2 / radialSegments;
    bottom.push(ringPoint(4, 4, 1, 2.2, angle));
    top.push(ringPoint(4, 4, 6.5, 2.2, angle));
  }
  for (let index = 0; index < radialSegments; index += 1) {
    const next = (index + 1) % radialSegments;
    addTriangle(triangles, bottom[index], bottom[next], top[next]);
    addTriangle(triangles, bottom[index], top[next], top[index]);
    addTriangle(triangles, bottomCenter, bottom[next], bottom[index]);
    addTriangle(triangles, topCenter, top[index], top[next]);
    addEdge(edges, bottom[index], bottom[next]);
    addEdge(edges, top[index], top[next]);
    // Store every generator as a geometric candidate. The renderer selects only
    // the two silhouette generators for its current fixed teaching view.
    addEdge(edges, bottom[index], top[index]);
  }
  return { triangles, edges };
}

function createCone(radialSegments = 72) {
  const base = [];
  const triangles = [];
  const edges = [];
  const baseCenter = point(4, 4, 1);
  const apex = point(4, 4, 7);
  for (let index = 0; index < radialSegments; index += 1) {
    const angle = index * Math.PI * 2 / radialSegments;
    base.push(ringPoint(4, 4, 1, 2.4, angle));
  }
  for (let index = 0; index < radialSegments; index += 1) {
    const next = (index + 1) % radialSegments;
    addTriangle(triangles, base[index], base[next], apex);
    addTriangle(triangles, baseCenter, base[next], base[index]);
    addEdge(edges, base[index], base[next]);
    // Generators are candidates, not a wireframe. Only silhouette generators
    // are drawn in the spatial view.
    addEdge(edges, base[index], apex);
  }
  return { triangles, edges };
}

function createSphere(latitudeSegments = 32, longitudeSegments = 64) {
  const center = point(4, 4, 4);
  const radius = 2.5;
  const vertices = [];
  const triangles = [];
  const edges = [];
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const theta = latitude * Math.PI / latitudeSegments;
    const ringRadius = radius * Math.sin(theta);
    const z = center.z + radius * Math.cos(theta);
    const row = [];
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const phi = longitude * Math.PI * 2 / longitudeSegments;
      row.push(point(center.x + ringRadius * Math.cos(phi), center.y + ringRadius * Math.sin(phi), z));
    }
    vertices.push(row);
  }
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const next = (longitude + 1) % longitudeSegments;
      addTriangle(triangles, vertices[latitude][longitude], vertices[latitude + 1][longitude], vertices[latitude + 1][next]);
      addTriangle(triangles, vertices[latitude][longitude], vertices[latitude + 1][next], vertices[latitude][next]);
    }
  }
  for (let latitude = 4; latitude < latitudeSegments; latitude += 4) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      addEdge(edges, vertices[latitude][longitude], vertices[latitude][(longitude + 1) % longitudeSegments]);
    }
  }
  for (let longitude = 0; longitude < longitudeSegments; longitude += 8) {
    for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
      addEdge(edges, vertices[latitude][longitude], vertices[latitude + 1][longitude]);
    }
  }
  return { triangles, edges };
}

function createTorus(majorSegments = 72, minorSegments = 28) {
  const center = point(4, 4, 4);
  const majorRadius = 2;
  const minorRadius = 0.72;
  const vertices = [];
  const triangles = [];
  const edges = [];
  for (let major = 0; major < majorSegments; major += 1) {
    const u = major * Math.PI * 2 / majorSegments;
    const row = [];
    for (let minor = 0; minor < minorSegments; minor += 1) {
      const v = minor * Math.PI * 2 / minorSegments;
      const radial = majorRadius + minorRadius * Math.cos(v);
      row.push(point(
        center.x + radial * Math.cos(u),
        center.y + radial * Math.sin(u),
        center.z + minorRadius * Math.sin(v)
      ));
    }
    vertices.push(row);
  }
  for (let major = 0; major < majorSegments; major += 1) {
    const nextMajor = (major + 1) % majorSegments;
    for (let minor = 0; minor < minorSegments; minor += 1) {
      const nextMinor = (minor + 1) % minorSegments;
      addTriangle(triangles, vertices[major][minor], vertices[nextMajor][minor], vertices[nextMajor][nextMinor]);
      addTriangle(triangles, vertices[major][minor], vertices[nextMajor][nextMinor], vertices[major][nextMinor]);
      if (minor % 7 === 0) addEdge(edges, vertices[major][minor], vertices[nextMajor][minor]);
      if (major % 9 === 0) addEdge(edges, vertices[major][minor], vertices[major][nextMinor]);
    }
  }
  return { triangles, edges };
}

function createSolid(type) {
  if (type === 'triangularPyramid') {
    const solid = createTriangularPyramid();
    return { ...solid, renderTriangles: solid.triangles };
  }
  if (type === 'pentagonalPrism') {
    const solid = createPentagonalPrism();
    return { ...solid, renderTriangles: solid.triangles };
  }
  if (type === 'cylinder') {
    const solid = createCylinder();
    return { ...solid, renderTriangles: createCylinder(32).triangles };
  }
  if (type === 'cone') {
    const solid = createCone();
    return { ...solid, renderTriangles: createCone(32).triangles };
  }
  if (type === 'sphere') {
    const solid = createSphere();
    return { ...solid, renderTriangles: createSphere(14, 28).triangles };
  }
  if (type === 'torus') {
    const solid = createTorus();
    return { ...solid, renderTriangles: createTorus(36, 14).triangles };
  }
  throw new Error(`Unknown solid type: ${type}`);
}

function signedDistance(vertex, plane) {
  return vertex.x * plane.normal.x + vertex.y * plane.normal.y + vertex.z * plane.normal.z - plane.constant;
}

function interpolate(a, b, distanceA, distanceB) {
  const t = distanceA / (distanceA - distanceB);
  return point(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function addUnique(points, candidate) {
  if (!points.some((existing) => squaredDistance(existing, candidate) < EPSILON * EPSILON * 100)) {
    points.push(candidate);
  }
}

function intersectTriangle(triangle, plane) {
  const intersections = [];
  const distances = triangle.map((vertex) => signedDistance(vertex, plane));
  for (let index = 0; index < 3; index += 1) {
    const next = (index + 1) % 3;
    const a = triangle[index];
    const b = triangle[next];
    const distanceA = distances[index];
    const distanceB = distances[next];
    if (Math.abs(distanceA) <= EPSILON) addUnique(intersections, a);
    if (distanceA * distanceB < -EPSILON * EPSILON) {
      addUnique(intersections, interpolate(a, b, distanceA, distanceB));
    }
  }
  if (intersections.length < 2) return null;
  if (intersections.length === 2) return intersections;
  let bestPair = [intersections[0], intersections[1]];
  let bestDistance = squaredDistance(bestPair[0], bestPair[1]);
  for (let first = 0; first < intersections.length; first += 1) {
    for (let second = first + 1; second < intersections.length; second += 1) {
      const distance = squaredDistance(intersections[first], intersections[second]);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [intersections[first], intersections[second]];
      }
    }
  }
  return bestPair;
}

function intersectSolid(solid, plane) {
  const segments = [];
  const n = plane.normal;
  const c = plane.constant;
  const len = solid.triangles.length;
  for (let i = 0; i < len; i += 1) {
    const triangle = solid.triangles[i];
    // 快速剔除：三顶点都在平面同一侧则本三角形不与平面相交，无需完整求交
    const d0 = triangle[0].x * n.x + triangle[0].y * n.y + triangle[0].z * n.z - c;
    const d1 = triangle[1].x * n.x + triangle[1].y * n.y + triangle[1].z * n.z - c;
    const d2 = triangle[2].x * n.x + triangle[2].y * n.y + triangle[2].z * n.z - c;
    if ((d0 > EPSILON && d1 > EPSILON && d2 > EPSILON) || (d0 < -EPSILON && d1 < -EPSILON && d2 < -EPSILON)) {
      continue;
    }
    const segment = intersectTriangle(triangle, plane);
    if (segment && squaredDistance(segment[0], segment[1]) > EPSILON * EPSILON) segments.push(segment);
  }
  return segments;
}

function createCuttingPlane(angleDegrees, offset) {
  const angle = angleDegrees * Math.PI / 180;
  const normal = point(Math.sin(angle), 0, Math.cos(angle));
  const center = point(4, 4, 4);
  return {
    normal,
    constant: normal.x * center.x + normal.z * center.z + offset
  };
}

function createSectionLoops(segments, tolerance = 1e-5) {
  const remaining = segments.map((segment) => [segment[0], segment[1]]);
  const loops = [];
  const isClose = (a, b) => squaredDistance(a, b) <= tolerance * tolerance;
  while (remaining.length) {
    const firstSegment = remaining.pop();
    const loop = [firstSegment[0], firstSegment[1]];
    let guard = remaining.length + 2;
    while (!isClose(loop[loop.length - 1], loop[0]) && remaining.length && guard > 0) {
      guard -= 1;
      const tail = loop[loop.length - 1];
      const matchIndex = remaining.findIndex((segment) => isClose(segment[0], tail) || isClose(segment[1], tail));
      if (matchIndex < 0) break;
      const match = remaining.splice(matchIndex, 1)[0];
      loop.push(isClose(match[0], tail) ? match[1] : match[0]);
    }
    if (loop.length >= 4 && isClose(loop[loop.length - 1], loop[0])) {
      loop.pop();
      const uniqueLoop = [];
      loop.forEach((vertex) => {
        if (!uniqueLoop.length || !isClose(uniqueLoop[uniqueLoop.length - 1], vertex)) uniqueLoop.push(vertex);
      });
      if (uniqueLoop.length >= 3) loops.push(uniqueLoop);
    }
  }
  return loops;
}

function createSectionCaps(segments, plane, outwardSign) {
  const capTriangles = [];
  createSectionLoops(segments).forEach((loop) => {
    const center = loop.reduce((sum, vertex) => point(sum.x + vertex.x, sum.y + vertex.y, sum.z + vertex.z), point(0, 0, 0));
    center.x /= loop.length;
    center.y /= loop.length;
    center.z /= loop.length;
    for (let index = 0; index < loop.length; index += 1) {
      const next = (index + 1) % loop.length;
      let triangle = [center, loop[index], loop[next]];
      const ab = point(
        triangle[1].x - triangle[0].x,
        triangle[1].y - triangle[0].y,
        triangle[1].z - triangle[0].z
      );
      const ac = point(
        triangle[2].x - triangle[0].x,
        triangle[2].y - triangle[0].y,
        triangle[2].z - triangle[0].z
      );
      const normal = point(
        ab.y * ac.z - ab.z * ac.y,
        ab.z * ac.x - ab.x * ac.z,
        ab.x * ac.y - ab.y * ac.x
      );
      const orientation = normal.x * plane.normal.x + normal.y * plane.normal.y + normal.z * plane.normal.z;
      if (orientation * outwardSign < 0) triangle = [center, loop[next], loop[index]];
      capTriangles.push(triangle);
    }
  });
  return capTriangles;
}

module.exports = {
  createSolid,
  createCuttingPlane,
  intersectSolid,
  createSectionLoops,
  createSectionCaps
};
