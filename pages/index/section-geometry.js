// 平面切割立体的几何真值层（冻结模块 F2）。
//
// 坐标与单位：
//   · 所有点均为教学模型空间中的右手坐标 (x, y, z)，教学范围为 0..8；
//   · EPSILON / 各容差均使用模型单位，不是屏幕像素；
//   · 截平面统一写作 n·p = constant，n 为单位法向量。
//
// 输出边界：
//   · createSolid 返回三角网格、候选棱线和低精度 renderTriangles；
//   · intersectSolid 只返回空间线段，不决定环序、可见性或颜色；
//   · 绘制层必须复用 createSectionLoops / createSectionCaps 的结果，
//     不得在空间图和三视图各自重建另一套几何真值。
//
// 曲面体用参数网格近似。求交网格比绘制网格更密，原因是数学精度不能由
// renderTriangles 的视觉细分等级决定；两者仍共享同一参数曲面语义。
const EPSILON = 1e-8;

// 构造教学模型空间点。该模块内所有函数都返回新对象，不修改调用方输入。
function point(x, y, z) {
  return { x, y, z };
}

// 三角形和结构棱分开收集：三角形用于求交/裁剪，棱用于教学线框与可见性。
function addTriangle(triangles, a, b, c) {
  triangles.push([a, b, c]);
}

function addEdge(edges, a, b) {
  edges.push([a, b]);
}

// 在给定高度的水平圆上取参数点；angle 使用弧度，供多面体和回转体共享。
function ringPoint(cx, cy, z, radius, angle) {
  return point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z);
}

// 教学用多面体：直接给出闭合三角面与结构棱，不保存通用凸多面体拓扑。
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
  // 底/顶面按扇形三角化，侧面按“底边-顶边-下一点”两个三角形拆分；
  // edges 同时保留底/顶环和竖向结构棱，供绘制层裁剪。
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
  // 曲面求交使用高密度参数圆；上下端盖以中心扇形封闭，侧面每个径向区间
  // 生成两个三角形。edges 是候选结构线，不表示最终可见线框。
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
  // 圆锥由底面扇形和“底边上一点-下一点-顶点”的侧面三角形组成。
  // 每条底边到顶点的母线都作为候选边，最终可见性由 projection 层筛选。
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
  // 球面使用经纬参数网格；首尾经线通过取模连接，不重复保存闭合点。
  // 提取的经纬候选线只服务绘制，不参与球体截交的数学定义。
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
  // 球面没有真实结构棱；这里抽取少量经纬候选线，仅用于绘制层生成
  // 曲面轮廓和教学辅助线，不参与球的截交判定本身。
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
  // 圆环由主环参数 u 和管截面参数 v 组成：
  // radial = R + r*cos(v)，z = center.z + r*sin(v)，u/v 均闭环。
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
      // 圆环同样没有离散网格意义上的结构棱。按较大步长抽取经向、纬向候选线，
      // 避免把参数网格全部画成线框；绘制层会再用投影边界筛选可见轮廓。
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
  // 曲面体的求交网格保留较高细分；renderTriangles 使用较低细分供 Canvas 填充。
  // 两者的顶点由同一参数方程生成，但密度不同，渲染精度不得反向影响截交结果。
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
  // 平面使用单位法向量 n 和常数 d 表示，s=n·p-d；s>0 位于法向一侧。
  return vertex.x * plane.normal.x + vertex.y * plane.normal.y + vertex.z * plane.normal.z - plane.constant;
}

// 用有符号距离线性插值求棱/三角形边与平面的交点。
// 仅当两端距离异号时调用，因此分母不会为零。
function interpolate(a, b, distanceA, distanceB) {
  const t = distanceA / (distanceA - distanceB);
  return point(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

function squaredDistance(a, b) {
  // 去重和退化判断比较平方距离，避免不必要的开方并向调用方暴露距离量纲。
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function addUnique(points, candidate) {
  // 候选点可能在顶点、棱和相邻三角形上重复出现；以模型空间的平方距离去重，
  // 避免开方并保持与 EPSILON 的量纲一致。
  if (!points.some((existing) => squaredDistance(existing, candidate) < EPSILON * EPSILON * 100)) {
    points.push(candidate);
  }
}

function intersectTriangle(triangle, plane) {
  // 逐边收集顶点共面和穿面交点，再按模型空间最大间距选出该三角形对截交环的
  // 一条贡献段。返回值是两点的无序对，不负责相邻三角形之间的连接顺序。
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
  // 不到两点无法构成面状截交；共面三角形或经过顶点时可能收集到多于两点，
  // 此时取距离最远的一对作为该三角形对截交环的边贡献。
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
  // 遍历全部求交三角形，返回空间线段集合。这里不闭合环、不判断可见性、
  // 不生成屏幕坐标；这些职责分别由 createSectionLoops 和绘制层承担。
  const segments = [];
  const n = plane.normal;
  const c = plane.constant;
  const len = solid.triangles.length;
  for (let i = 0; i < len; i += 1) {
    const triangle = solid.triangles[i];
    // 快速剔除：三顶点都在平面同一侧则本三角形不与平面相交，无需完整求交。
    // 距离恰好落在 EPSILON 内的顶点按“在平面上”保留，交由去重和闭环阶段收敛。
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
  // 角度只旋转正垂面方向：n=(sinθ, 0, cosθ)。offset 沿法向量平移，
  // 因此 constant 从过模型中心 (4,4,4) 的平面值开始累加。
  const angle = angleDegrees * Math.PI / 180;
  const normal = point(Math.sin(angle), 0, Math.cos(angle));
  const center = point(4, 4, 4);
  return {
    normal,
    constant: normal.x * center.x + normal.z * center.z + offset
  };
}

function createSectionLoops(segments, tolerance = 1e-5) {
  // 将无序截交线段贪心连接成闭合环。tolerance 使用模型单位，默认值与
  // geometry-test.js 的闭环端点基准一致；未能闭合成环的残段会被丢弃，
  // 因为调用方只把返回环当作可填充的截面轮廓。
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
  // 为每个闭合截面环生成扇形三角面。顶点按环序排列，三角面法向统一翻转
  // 到 outwardSign 指定的一侧；该符号来自 getSectionSideSigns，必须与裁剪侧一致。
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
