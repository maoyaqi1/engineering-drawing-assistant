// 基本立体模块 —— 参数化几何 + 三面投影。
// 只作为新模块被 index 页面挂载，复用页面的投影/绘图基础设施（projectIsometric /
// getProjectionScreenPoints / drawLine / drawDashedLine / drawPolygon / drawText / getLayout）。
// SolidState( 页面 data.solid ) 是唯一数据源；3D 与三面投影均由它派生。
//
// 坐标与变换：
//   · 参数先在实体局部坐标中生成，再统一应用 R = Rz * Ry * Rx 和平移；
//   · 棱柱与棱锥的局部底/顶面平行于 XY 面，尺寸与位移使用教学模型单位；
//   · 曲面体由固定密度的参数网格近似，轮廓与遮挡只用于教学显示，
//     不反向成为截交模块 section-geometry.js 的几何真值。

// 判断面朝向时使用的模型空间容差；小于它视为 edge-on（切线/投影轮廓）。
const EPS = 1e-6;

// UI 与配置使用角度，几何计算内部统一使用弧度；所有旋转变换都经此入口。
function rad(deg) {
  return (deg || 0) * Math.PI / 180;
}

// 由 XYZ 欧拉角生成局部到世界的旋转矩阵。固定顺序 Rz * Ry * Rx，
// 因此改变字段顺序或乘法顺序会无声改变实体姿态。
function rotMatrix(rot) {
  const r = rot || {};
  const cx = Math.cos(rad(r.x));
  const sx = Math.sin(rad(r.x));
  const cy = Math.cos(rad(r.y));
  const sy = Math.sin(rad(r.y));
  const cz = Math.cos(rad(r.z));
  const sz = Math.sin(rad(r.z));
  // R = Rz * Ry * Rx
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx]
  ];
}

function applyTransform(v, mat, pos) {
  // 返回新对象，不修改局部顶点；调用方可安全地复用同一套局部参数。
  return {
    x: mat[0][0] * v.x + mat[0][1] * v.y + mat[0][2] * v.z + pos.x,
    y: mat[1][0] * v.x + mat[1][1] * v.y + mat[1][2] * v.z + pos.y,
    z: mat[2][0] * v.x + mat[2][1] * v.y + mat[2][2] * v.z + pos.z
  };
}

function centroidOf(vertices) {
  // 顶点算术平均。对均匀参数网格的包围和中心线足够，不代表体积质心。
  let x = 0;
  let y = 0;
  let z = 0;
  vertices.forEach((v) => { x += v.x; y += v.y; z += v.z; });
  return { x: x / vertices.length, y: y / vertices.length, z: z / vertices.length };
}

function faceNormal(vertices, face) {
  // Newell 法：对多边形每条边累加叉积分量，对共面多边形顶点顺序稳定，
  // 且比只取前三个顶点更适合四边形参数网格。
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < face.length; i += 1) {
    const a = vertices[face[i]];
    const b = vertices[face[(i + 1) % face.length]];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return { x: nx, y: ny, z: nz };
}

function outwardNormal(vertices, face, centroid) {
  // faceNormal 的方向取决于面的顶点环绕顺序；用“实体中心 → 面中心”的向量
  // 统一点积符号，使所有面的法向朝外，供 edgeStyle 判断前后关系。
  const n = faceNormal(vertices, face);
  const fc = centroidOf(face.map((i) => vertices[i]));
  const toFace = { x: fc.x - centroid.x, y: fc.y - centroid.y, z: fc.z - centroid.z };
  if (n.x * toFace.x + n.y * toFace.y + n.z * toFace.z < 0) {
    return { x: -n.x, y: -n.y, z: -n.z };
  }
  return n;
}

function buildPrism(state) {
  // 棱柱：底/顶各 n 个顶点，顶面、底面和 n 个四边形侧面。
  // 棱数为 3..8 的输入由 UI 约束；这里仍用 max(3) 和正数下限防御异常状态。
  const n = Math.max(3, Math.round(Number(state.sides) || 6));
  const r = Math.max(0.1, Number(state.radius) || 2);
  const h = Math.max(0.1, Number(state.height) || 3);
  const pos = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const half = h / 2;
  const vertices = [];
  for (let k = 0; k < n; k += 1) {
    const a = (-Math.PI / 2) + (2 * Math.PI * k) / n;
    vertices.push(applyTransform({ x: r * Math.cos(a), y: r * Math.sin(a), z: -half }, mat, pos));
  }
  for (let k = 0; k < n; k += 1) {
    const a = (-Math.PI / 2) + (2 * Math.PI * k) / n;
    vertices.push(applyTransform({ x: r * Math.cos(a), y: r * Math.sin(a), z: half }, mat, pos));
  }
  const faces = [];
  faces.push(Array.from({ length: n }, (_, k) => k));
  faces.push(Array.from({ length: n }, (_, k) => n + k));
  for (let k = 0; k < n; k += 1) {
    const k1 = (k + 1) % n;
    faces.push([k, k1, n + k1, n + k]);
  }
  const centroid = centroidOf(vertices);
  const normals = faces.map((f) => outwardNormal(vertices, f, centroid));
  return { vertices, faces, normals, centroid, n };
}

function buildPyramid(state) {
  // 棱锥：底面 n 个顶点 + 局部正上方锥尖；锥尖编号固定为 n。
  const n = Math.max(3, Math.round(Number(state.sides) || 5));
  const r = Math.max(0.1, Number(state.radius) || 2);
  const h = Math.max(0.1, Number(state.height) || 3);
  const pos = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const half = h / 2;
  const vertices = [];
  for (let k = 0; k < n; k += 1) {
    const a = (-Math.PI / 2) + (2 * Math.PI * k) / n;
    vertices.push(applyTransform({ x: r * Math.cos(a), y: r * Math.sin(a), z: -half }, mat, pos));
  }
  // 顶点（锥尖）位于棱锥中心正上方
  vertices.push(applyTransform({ x: 0, y: 0, z: half }, mat, pos));
  const faces = [];
  faces.push(Array.from({ length: n }, (_, k) => k));
  for (let k = 0; k < n; k += 1) {
    faces.push([k, (k + 1) % n, n]);
  }
  const centroid = centroidOf(vertices);
  const normals = faces.map((f) => outwardNormal(vertices, f, centroid));
  return { vertices, faces, normals, centroid, n };
}

function num(v, d) { return Math.max(0.1, Number(v) || d); }

function buildCylinder(state) {
  // 圆柱使用 36 段参数网格：侧面四边形 + 顶/底面中心扇形。
  // sil 保留完整上下圆作为三视图轮廓数据，rings 提供空间视图的结构圆。
  const r = num(state.radius, 2);
  const h = num(state.height, 3);
  const m = 36;
  const half = h / 2;
  const pos = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const bottom = [];
  const top = [];
  for (let i = 0; i < m; i += 1) {
    const a = (2 * Math.PI * i) / m;
    const xy = { x: r * Math.cos(a), y: r * Math.sin(a) };
    bottom.push(applyTransform({ x: xy.x, y: xy.y, z: -half }, mat, pos));
    top.push(applyTransform({ x: xy.x, y: xy.y, z: half }, mat, pos));
  }
  const cb = applyTransform({ x: 0, y: 0, z: -half }, mat, pos);
  const ct = applyTransform({ x: 0, y: 0, z: half }, mat, pos);
  const verts = bottom.concat(top).concat([cb, ct]);
  const faces = [];
  for (let i = 0; i < m; i += 1) {
    const i1 = (i + 1) % m;
    faces.push([i, i1, m + i1, m + i]);
    faces.push([i, i1, 2 * m]);
    faces.push([m + i1, m + i, 2 * m + 1]);
  }
  return { kind: 'curved', type: 'cylinder', iso: { vertices: verts, faces }, sil: [bottom.concat(top)], rings: [bottom, top] };
}

function buildCone(state) {
  // 圆锥的 36 段网格覆盖侧面，底面扇形封口；sil 包含底圆和锥尖，
  // 绘制层由此计算轮廓，不把参数网格逐条画成线框。
  const r = num(state.radius, 2);
  const h = num(state.height, 3);
  const m = 36;
  const half = h / 2;
  const pos = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const base = [];
  for (let i = 0; i < m; i += 1) {
    const a = (2 * Math.PI * i) / m;
    base.push(applyTransform({ x: r * Math.cos(a), y: r * Math.sin(a), z: -half }, mat, pos));
  }
  const apex = applyTransform({ x: 0, y: 0, z: half }, mat, pos);
  const cb = applyTransform({ x: 0, y: 0, z: -half }, mat, pos);
  const verts = base.concat([apex, cb]);
  const faces = [];
  for (let i = 0; i < m; i += 1) {
    const i1 = (i + 1) % m;
    faces.push([i, i1, m]);
    faces.push([i, i1, m + 1]);
  }
  return { kind: 'curved', type: 'cone', iso: { vertices: verts, faces }, sil: [base.concat([apex])], rings: [base] };
}

function buildSphere(state) {
  // 经纬网格 10×20 只服务 Canvas 填充与轮廓近似。角度 phi 从 z 轴两极开始，
  // lon 方向闭环，首尾不重复存点。
  const r = num(state.radius, 2);
  const lat = 10;
  const lon = 20;
  const pos = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const verts = [];
  for (let j = 0; j <= lat; j += 1) {
    const phi = (Math.PI * j) / lat;
    const z = r * Math.cos(phi);
    const rr = r * Math.sin(phi);
    for (let i = 0; i < lon; i += 1) {
      const a = (2 * Math.PI * i) / lon;
      verts.push(applyTransform({ x: rr * Math.cos(a), y: rr * Math.sin(a), z }, mat, pos));
    }
  }
  const faces = [];
  for (let j = 0; j < lat; j += 1) {
    for (let i = 0; i < lon; i += 1) {
      const i1 = (i + 1) % lon;
      const a = j * lon + i;
      const b = j * lon + i1;
      const c = (j + 1) * lon + i1;
      const d = (j + 1) * lon + i;
      faces.push([a, b, c, d]);
    }
  }
  return { kind: 'curved', type: 'sphere', iso: { vertices: verts, faces }, sil: [verts], rings: [] };
}

function buildTorus(state) {
  // 圆环参数：(R + r cosφ) 为当前环截面到 z 轴的距离，φ 控制管截面，
  // θ 控制主环。inner 保存内赤道圆，用于三视图内轮廓与中心线推导。
  const R = num(state.majorRadius, 3);
  const r = num(state.minorRadius, 1);
  const ring = 32;
  const tube = 16;
  const pos = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const verts = [];
  for (let i = 0; i < ring; i += 1) {
    const th = (2 * Math.PI * i) / ring;
    for (let j = 0; j < tube; j += 1) {
      const ph = (2 * Math.PI * j) / tube;
      const x = (R + r * Math.cos(ph)) * Math.cos(th);
      const y = (R + r * Math.cos(ph)) * Math.sin(th);
      const z = r * Math.sin(ph);
      verts.push(applyTransform({ x, y, z }, mat, pos));
    }
  }
  const faces = [];
  for (let i = 0; i < ring; i += 1) {
    const i1 = (i + 1) % ring;
    for (let j = 0; j < tube; j += 1) {
      const j1 = (j + 1) % tube;
      const a = i * tube + j;
      const b = i * tube + j1;
      const c = i1 * tube + j1;
      const d = i1 * tube + j;
      faces.push([a, b, c, d]);
    }
  }
  const inner = [];
  for (let i = 0; i < ring; i += 1) {
    const th = (2 * Math.PI * i) / ring;
    inner.push(applyTransform({ x: (R - r) * Math.cos(th), y: (R - r) * Math.sin(th), z: 0 }, mat, pos));
  }
  return { kind: 'curved', type: 'torus', iso: { vertices: verts, faces }, sil: [verts], inner: [inner], rings: [] };
}

function buildEdges(faces) {
  // 按无向顶点对合并共享边，并保留相邻面索引；edgeStyle 依据这些面法向
  // 判断边是否可见，不能按每个面的边重复绘制。
  const map = new Map();
  faces.forEach((face, fi) => {
    for (let k = 0; k < face.length; k += 1) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!map.has(key)) map.set(key, { a, b, faces: [] });
      map.get(key).faces.push(fi);
    }
  });
  return Array.from(map.values());
}

// 投影视图：观察者朝向（指向观察者）与颜色，与现有 红(前)/绿(上)/蓝(左) 一致。
const VIEWS = {
  front: { viewType: 'front', color: '#df5757', dir: { x: 0, y: -1, z: 0 }, label: 'V面' },
  top: { viewType: 'top', color: '#43a66c', dir: { x: 0, y: 0, z: 1 }, label: 'H面' },
  left: { viewType: 'left', color: '#3779d0', dir: { x: -1, y: 0, z: 0 }, label: 'W面' }
};

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// 二维投影点的凸包（Andrew 单调链）。返回的 order 用于外轮廓描边，
// edgeKeys/onHull 用于判断内部棱是否仍需按面朝向选择实线或虚线。
function convexHull(points) {
  // Andrew 单调链，返回落在凸包上的点索引（有序）。
  // order 用于描外轮廓，edgeKeys / onHull 用于把内部棱标成虚线；
  // 曲面网格点很多时只保留实际轮廓，避免把参数网格全部显示出来。
  const idx = points.map((p, i) => ({ p, i }));
  idx.sort((a, b) => (a.p.x - b.p.x) || (a.p.y - b.p.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const item of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2].p, lower[lower.length - 1].p, item.p) <= 0) lower.pop();
    lower.push(item);
  }
  const upper = [];
  for (let i = idx.length - 1; i >= 0; i -= 1) {
    const item = idx[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2].p, upper[upper.length - 1].p, item.p) <= 0) upper.pop();
    upper.push(item);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const set = new Set(hull.map((item) => item.i));
  const edgeKeys = new Set();
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i].i;
    const b = hull[(i + 1) % hull.length].i;
    edgeKeys.add(a < b ? `${a}_${b}` : `${b}_${a}`);
  }
  return { edgeKeys, onHull: set, order: hull.map((item) => item.p) };
}

function edgeStyle(edge, normals, dir) {
  // dir 指向观察者。两相邻面都背向观察者 → 虚线；一前一后或两面都朝向
  // → 实线；点积落在 EPS 内视为 edge-on（切线或投影轮廓），按实线处理。
  const s = edge.faces.map((fi) => dot(normals[fi], dir));
  const s1 = s[0];
  const s2 = s.length > 1 ? s[1] : s[0];
  const vis1 = s1 > EPS;
  const vis2 = s2 > EPS;
  const hid1 = s1 < -EPS;
  const hid2 = s2 < -EPS;
  if ((vis1 && hid2) || (hid1 && vis2)) return 'solid';
  if (vis1 && vis2) return 'solid';
  if (hid1 && hid2) return 'dashed';
  return 'solid'; // edge-on（切线/轮廓）
}

function projectVertices(vertices, page, viewType) {
  // 只做批量屏幕投影，不改变顶点顺序；后续边表仍使用 geo.vertices 的索引。
  return vertices.map((v) => page.getProjectionScreenPoints(v)[viewType]);
}

// 立体类型到参数网格构造器的唯一分派点。未知类型保留历史棱柱默认行为，
// 以免旧页面状态或损坏缓存导致首页空白。
function buildSolidGeometry(state) {
  // type 是 UI 的稳定立体类型；未知/缺省值保持历史上的棱柱默认行为。
  if (state.type === 'pyramid') return buildPyramid(state);
  if (state.type === 'cylinder') return buildCylinder(state);
  if (state.type === 'cone') return buildCone(state);
  if (state.type === 'sphere') return buildSphere(state);
  if (state.type === 'torus') return buildTorus(state);
  return buildPrism(state);
}

function solidKey(state) {
  // 缓存键必须覆盖所有影响几何的字段；任一滑块变化都会生成新的局部几何。
  const pos = state.position || {};
  const rot = state.rotation || {};
  return [state.type, state.sides, state.radius, state.height,
    state.majorRadius, state.minorRadius,
    pos.x, pos.y, pos.z, rot.x, rot.y, rot.z].join('|');
}

function getSolidGeo(page) {
  // 缓存挂在页面实例上，与 Canvas 所有权一致；页面卸载时由既有清理路径移除。
  const state = page.data.solid;
  const key = solidKey(state);
  if (!page._solidGeo || page._solidGeoKey !== key) {
    page._solidGeo = buildSolidGeometry(state);
    page._solidGeoKey = key;
  }
  return page._solidGeo;
}

// 在空间投影面上绘制实体正交投影。planeFn 决定丢弃哪个世界轴；
// 轮廓优先于面朝向，以保证外轮廓不会被内部棱的隐藏判定误画成虚线。
function drawProjectionOnPlane(context, page, geo, planeFn, viewType, color) {
  // 先把实体顶点正交压到投影面，再在等轴测空间绘制投影轮廓。
  // 轮廓边用实线，其余边按面朝向决定实/虚；这里只生成绘制指令，不改 geo。
  const pts = geo.vertices.map((v) => page.projectIsometric(planeFn(v)));
  const hull = convexHull(pts);
  const edges = buildEdges(geo.faces);
  context.save();
  edges.forEach((e) => {
    const key = e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`;
    const isOutline = hull.edgeKeys.has(key);
    const style = isOutline ? 'solid' : edgeStyle(e, geo.normals, VIEWS[viewType].dir);
    const s = pts[e.a];
    const t = pts[e.b];
    if (style === 'solid') {
      context.strokeStyle = color;
      context.lineWidth = 1.6;
      page.drawLine(context, s, t);
    } else {
      page.drawDashedLine(context, s, t, color);
    }
  });
  context.restore();
}

function drawIso(context, page) {
  const geo = getSolidGeo(page);
  if (geo.kind === 'curved') { drawCurvedIso(context, page, geo); return; }
  const screen = geo.vertices.map((v) => page.projectIsometric(v));
  context.save();
  // 多面体只给平均 z 最高的面做半透明教学高亮；这不是完整隐面消隐，
  // 实体轮廓和边线仍由下面的面朝向判定负责。
  let topFace = -1;
  let topZ = -Infinity;
  geo.faces.forEach((face, fi) => {
    const fz = centroidOf(face.map((i) => geo.vertices[i])).z;
    if (fz > topZ) { topZ = fz; topFace = fi; }
  });
  if (topFace >= 0) {
    const pts = geo.faces[topFace].map((i) => screen[i]);
    page.drawPolygon(context, pts, 'rgba(255, 179, 71, 0.22)', 'rgba(255,179,71,0.9)', 2);
  }
  const edges = buildEdges(geo.faces);
  context.strokeStyle = '#ffb347';
  context.lineWidth = 2.2;
  edges.forEach((e) => {
    page.drawLine(context, screen[e.a], screen[e.b]);
  });
  // 在 V/H/W 三个投影面上分别画出棱柱的投影（红/绿/蓝）
  drawProjectionOnPlane(context, page, geo, (v) => ({ x: v.x, y: 0, z: v.z }), 'front', '#df5757');
  drawProjectionOnPlane(context, page, geo, (v) => ({ x: v.x, y: v.y, z: 0 }), 'top', '#43a66c');
  drawProjectionOnPlane(context, page, geo, (v) => ({ x: 0, y: v.y, z: v.z }), 'left', '#3779d0');
  context.restore();
}

// 多面体三视图统一使用同一 geo、边表和面法向。每个视图只在屏幕投影上做
// 凸包/重心选择，不改动空间顶点，也不另建几何真值。
function drawViews(context, page) {
  // 三视图共享同一套 geo 和顶点投影；长对正/高平齐/宽相等由投影页面
  // 的统一映射产生，不能在本函数里重新计算另一套二维坐标。
  const geo = getSolidGeo(page);
  if (geo.kind === 'curved') { drawCurvedViews(context, page, geo); return; }
  const edges = buildEdges(geo.faces);
  Object.keys(VIEWS).forEach((viewKey) => {
    const view = VIEWS[viewKey];
    const screen = projectVertices(geo.vertices, page, view.viewType);
    const hull = convexHull(screen);
    edges.forEach((e) => {
      const key = e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`;
      const isOutline = hull.edgeKeys.has(key);
      const style = isOutline ? 'solid' : edgeStyle(e, geo.normals, view.dir);
      const s = screen[e.a];
      const t = screen[e.b];
      if (style === 'solid') {
        context.strokeStyle = view.color;
        context.lineWidth = 2.2;
        page.drawLine(context, s, t);
      } else {
        page.drawDashedLine(context, s, t, view.color);
      }
    });
  });
  // 投影对应连线：与前面点/线/面一致，每个底面顶点画完整 长对正/高平齐/宽相等
  const metrics = page.getProjectionMetrics();
  const total = geo.vertices.length || 0;
  for (let i = 0; i < total; i += 1) {
    const vertex = geo.vertices[i];
    const views = page.getProjectionScreenPoints(vertex);
    page.drawProjectionCorrespondence(context, views, vertex.y, metrics.origin, metrics.unit, '#8f99a7');
  }
  // 视图标签
  const layout = page.getLayout();
  const origin = layout.projectionOrigin;
  page.drawText(context, 'V面', layout.projectionLeft + 10, layout.projectionTop + 44, '#df5757', 11, '700');
  page.drawText(context, 'H面', layout.projectionLeft + 10,
    layout.projectionTop + layout.projectionHeight - 16, '#43a66c', 11, '700');
  page.drawText(context, 'W面', layout.projectionLeft + layout.projectionWidth - 44,
    layout.projectionTop + 44, '#3779d0', 11, '700');
  context.restore();
}

function draw(context, page) {
  drawIso(context, page);
  drawViews(context, page);
}

function drawHullOutline(context, page, screen, color, width) {
  // 屏幕空间凸包只负责外轮廓；少于三个点没有可填充/描边的面积轮廓。
  if (!screen || screen.length < 3) return;
  const hull = convexHull(screen);
  if (hull.order.length < 3) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  const pts = hull.order;
  for (let i = 0; i < pts.length; i += 1) {
    page.drawLine(context, pts[i], pts[(i + 1) % pts.length]);
  }
  context.restore();
}

function drawCurvedIso(context, page, geo) {
  // 曲面体采用固定光源的快速 Lambert 近似，按面朝向调整填充亮度；
  // 这是教学示意的明暗层次，不作为几何可见性或截交真值。
  const verts = geo.iso.vertices;
  const screen = verts.map((v) => page.projectIsometric(v));
  const centroid = centroidOf(verts);
  const light = { x: 0.5, y: 0.4, z: 0.75 };
  context.save();
  geo.iso.faces.forEach((face) => {
    const fl = face.length;
    if (fl < 3) return;
    const v0 = verts[face[0]];
    const v1 = verts[face[1]];
    const v2 = verts[face[2]];
    const v3 = fl > 3 ? verts[face[3]] : null;
    const cx = (v0.x + v1.x + v2.x + (v3 ? v3.x : 0)) / fl;
    const cy = (v0.y + v1.y + v2.y + (v3 ? v3.y : 0)) / fl;
    const cz = (v0.z + v1.z + v2.z + (v3 ? v3.z : 0)) / fl;
    const e1x = v1.x - v0.x; const e1y = v1.y - v0.y; const e1z = v1.z - v0.z;
    const e2x = v2.x - v0.x; const e2y = v2.y - v0.y; const e2z = v2.z - v0.z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    if (nx * (cx - centroid.x) + ny * (cy - centroid.y) + nz * (cz - centroid.z) < 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    const d = (nx * light.x + ny * light.y + nz * light.z) / len;
    const shade = 0.4 + 0.6 * Math.max(0, d);
    const r = Math.round(236 * shade);
    const g = Math.round(158 * shade);
    const b = Math.round(64 * shade);
    const pts = [screen[face[0]], screen[face[1]], screen[face[2]]];
    if (v3) pts.push(screen[face[3]]);
    page.drawPolygon(context, pts, `rgb(${r},${g},${b})`, 'rgba(255,179,71,0.12)', 0.6);
  });
  (geo.rings || []).forEach((ring) => drawRingIso(context, page, ring));
  drawHullOutline(context, page, screen, 'rgba(255,212,140,0.95)', 2);
  const planeProjectors = [
    { fn: (v) => ({ x: v.x, y: 0, z: v.z }), color: '#df5757' },
    { fn: (v) => ({ x: v.x, y: v.y, z: 0 }), color: '#43a66c' },
    { fn: (v) => ({ x: 0, y: v.y, z: v.z }), color: '#3779d0' }
  ];
  planeProjectors.forEach((pp) => {
    const all = [].concat(...geo.sil).map((v) => page.projectIsometric(pp.fn(v)));
    drawHullOutline(context, page, all, pp.color, 1.6);
  });
  context.restore();
}

function drawRingIso(context, page, ring) {
  // 结构圆只作为参数网格的教学参考线，使用固定低对比度颜色；
  // 闭合以取模连接首尾，调用方保证 ring 不重复存首点。
  if (!ring || ring.length < 3) return;
  context.save();
  context.strokeStyle = 'rgba(196,124,28,0.95)';
  context.lineWidth = 1.4;
  for (let i = 0; i < ring.length; i += 1) {
    page.drawLine(context, page.projectIsometric(ring[i]), page.projectIsometric(ring[(i + 1) % ring.length]));
  }
  context.restore();
}

function drawCurvedViews(context, page, geo) {
  // 曲面三视图由轮廓、内轮廓、结构圆、中心线和抽样对应线组成；
  // 全部来自 SectionGeometry 风格的同一组世界坐标，不读取 Canvas 像素。
  const all = [].concat(...geo.sil);
  Object.keys(VIEWS).forEach((viewKey) => {
    const view = VIEWS[viewKey];
    drawHullOutline(context, page, all.map((v) => page.getProjectionScreenPoints(v)[view.viewType]), view.color, 2.2);
    (geo.inner || []).forEach((g) => {
      drawHullOutline(context, page, g.map((v) => page.getProjectionScreenPoints(v)[view.viewType]), view.color, 2.2);
    });
    (geo.rings || []).forEach((ring) => drawRing(context, page, ring, viewKey, view.color));
  });
  drawCurvedCenterLines(context, page, geo);
  drawCurvedCorrespondence(context, page, geo);
  const layout = page.getLayout();
  page.drawText(context, 'V面', layout.projectionLeft + 10, layout.projectionTop + 44, '#df5757', 11, '700');
  page.drawText(context, 'H面', layout.projectionLeft + 10,
    layout.projectionTop + layout.projectionHeight - 16, '#43a66c', 11, '700');
  page.drawText(context, 'W面', layout.projectionLeft + layout.projectionWidth - 44,
    layout.projectionTop + 44, '#3779d0', 11, '700');
}

function drawRing(context, page, ring, viewType, color) {
  // 闭合圆的近半段用实线、远半段用细虚线。front 朝 -Y，top 朝 +Z，
  // left 朝 -X；此处仅处理结构圆，不替代曲面轮廓的可见性判定。
  if (!ring || ring.length < 3) return;
  const c = centroidOf(ring);
  const near = viewType === 'front' ? (p) => p.y < c.y : (viewType === 'left' ? (p) => p.x < c.x : (p) => p.z > c.z);
  context.save();
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const sa = page.getProjectionScreenPoints(a)[viewType];
    const sb = page.getProjectionScreenPoints(b)[viewType];
    if (near(a) && near(b)) {
      context.strokeStyle = color;
      context.lineWidth = 2.0;
      page.drawLine(context, sa, sb);
    } else {
      drawThinDash(context, page, sa, sb, color);
    }
  }
  context.restore();
}

function drawThinDash(context, page, a, b, color) {
  // 曲面的隐藏结构圆使用更短虚线与更细线宽，和不可见轮廓的虚线语义分开。
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 0.8;
  context.setLineDash([3, 3]);
  page.drawLine(context, a, b);
  context.restore();
}

function curvedBounds(sil) {
  // 合并多组轮廓的世界坐标包围盒；空输入会得到 Infinity 边界，
  // 调用方只能在 sil 非空时使用该结果。
  return [].concat(...sil).reduce((r, v) => ({
    minX: Math.min(r.minX, v.x), maxX: Math.max(r.maxX, v.x),
    minY: Math.min(r.minY, v.y), maxY: Math.max(r.maxY, v.y),
    minZ: Math.min(r.minZ, v.z), maxZ: Math.max(r.maxZ, v.z)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function drawCurvedCenterLines(context, page, geo) {
  // 中心线只画在对称体的对称轴上：球画 XY 两轴，圆柱/圆锥在俯视图画
  // XY、正视和左视画 Z；圆环不画虚构的实体中心线。
  const state = page.data.solid;
  const center = state.position || { x: 0, y: 0, z: 0 };
  const mat = rotMatrix(state.rotation);
  const b = curvedBounds(geo.sil);
  const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) / 2 + 0.5;
  const dx = applyTransform({ x: 1, y: 0, z: 0 }, mat, { x: 0, y: 0, z: 0 });
  const dy = applyTransform({ x: 0, y: 1, z: 0 }, mat, { x: 0, y: 0, z: 0 });
  const dz = applyTransform({ x: 0, y: 0, z: 1 }, mat, { x: 0, y: 0, z: 0 });
  context.save();
  context.strokeStyle = '#5a6673';
  context.lineWidth = 1;
  context.setLineDash([8, 2, 1.5, 2]);
  const drawDir = (d, viewType) => {
    const a = { x: center.x - d.x * ext, y: center.y - d.y * ext, z: center.z - d.z * ext };
    const c = { x: center.x + d.x * ext, y: center.y + d.y * ext, z: center.z + d.z * ext };
    const sa = page.getProjectionScreenPoints(a)[viewType];
    const sb = page.getProjectionScreenPoints(c)[viewType];
    if (Math.abs(sa.x - sb.x) < 0.1 && Math.abs(sa.y - sb.y) < 0.1) return;
    page.drawLine(context, sa, sb);
  };
  ['front', 'top', 'left'].forEach((viewType) => {
    if (geo.type === 'sphere') {
      drawDir(dx, viewType);
      drawDir(dy, viewType);
    } else if (viewType === 'top') {
      drawDir(dx, viewType);
      drawDir(dy, viewType);
    } else {
      drawDir(dz, viewType);
    }
  });
  context.restore();
}

function drawCurvedCorrespondence(context, page, geo) {
  // 对应线不遍历全部网格点，只取圆环的 X/Y 极值点（以及圆锥顶点）。
  // 抽样后按模型坐标约 0.1 单位去重，避免同一极值点重复引线。
  const all = [].concat(...geo.sil);
  const metrics = page.getProjectionMetrics();
  const extremal = (arr, fn, max) => arr.reduce((best, v) => (max ? fn(v) > fn(best) : fn(v) < fn(best)) ? v : best, arr[0]);
  const candidates = [];
  (geo.rings || []).forEach((ring) => {
    if (ring.length < 3) return;
    candidates.push(
      extremal(ring, (p) => p.x, true),
      extremal(ring, (p) => p.x, false),
      extremal(ring, (p) => p.y, true),
      extremal(ring, (p) => p.y, false)
    );
  });
  if (geo.type === 'cone') {
    candidates.push(all.reduce((b, v) => (v.z > b.z ? v : b), all[0]));
  }
  if (!geo.rings || !geo.rings.length || candidates.length === 0) {
    candidates.push(extremal(all, (p) => p.x, true), extremal(all, (p) => p.x, false));
    candidates.push(extremal(all, (p) => p.y, true), extremal(all, (p) => p.y, false));
  }
  const seen = new Set();
  candidates.forEach((p) => {
    const key = `${Math.round(p.x * 10)}_${Math.round(p.y * 10)}_${Math.round(p.z * 10)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const views = page.getProjectionScreenPoints(p);
    page.drawProjectionCorrespondence(context, views, p.y, metrics.origin, metrics.unit, '#8f99a7');
    page.drawPoint(context, views.front, '#c94a4a', 2.5, '');
    page.drawPoint(context, views.top, '#2e9160', 2.5, '');
    page.drawPoint(context, views.left, '#2c63b8', 2.5, '');
  });
}

module.exports = { draw, buildSolidGeometry, drawIso, drawViews, getState: (p) => p.data.solid };
