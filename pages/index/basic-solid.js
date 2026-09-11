// 基本立体模块 —— 参数化几何 + 三面投影。
// 只作为新模块被 index 页面挂载，复用页面的投影/绘图基础设施（projectIsometric /
// getProjectionScreenPoints / drawLine / drawDashedLine / drawPolygon / drawText / getLayout）。
// SolidState( 页面 data.solid ) 是唯一数据源；3D 与三面投影均由它派生。

const EPS = 1e-6;

function rad(deg) {
  return (deg || 0) * Math.PI / 180;
}

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
  return {
    x: mat[0][0] * v.x + mat[0][1] * v.y + mat[0][2] * v.z + pos.x,
    y: mat[1][0] * v.x + mat[1][1] * v.y + mat[1][2] * v.z + pos.y,
    z: mat[2][0] * v.x + mat[2][1] * v.y + mat[2][2] * v.z + pos.z
  };
}

function centroidOf(vertices) {
  let x = 0;
  let y = 0;
  let z = 0;
  vertices.forEach((v) => { x += v.x; y += v.y; z += v.z; });
  return { x: x / vertices.length, y: y / vertices.length, z: z / vertices.length };
}

function faceNormal(vertices, face) {
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
  const n = faceNormal(vertices, face);
  const fc = centroidOf(face.map((i) => vertices[i]));
  const toFace = { x: fc.x - centroid.x, y: fc.y - centroid.y, z: fc.z - centroid.z };
  if (n.x * toFace.x + n.y * toFace.y + n.z * toFace.z < 0) {
    return { x: -n.x, y: -n.y, z: -n.z };
  }
  return n;
}

function buildPrism(state) {
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

function convexHull(points) {
  // Andrew 单调链，返回落在凸包上的点索引（有序）
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
  return vertices.map((v) => page.getProjectionScreenPoints(v)[viewType]);
}

function buildSolidGeometry(state) {
  if (state.type === 'pyramid') return buildPyramid(state);
  if (state.type === 'cylinder') return buildCylinder(state);
  if (state.type === 'cone') return buildCone(state);
  if (state.type === 'sphere') return buildSphere(state);
  if (state.type === 'torus') return buildTorus(state);
  return buildPrism(state);
}

function solidKey(state) {
  const pos = state.position || {};
  const rot = state.rotation || {};
  return [state.type, state.sides, state.radius, state.height,
    state.majorRadius, state.minorRadius,
    pos.x, pos.y, pos.z, rot.x, rot.y, rot.z].join('|');
}

function getSolidGeo(page) {
  const state = page.data.solid;
  const key = solidKey(state);
  if (!page._solidGeo || page._solidGeoKey !== key) {
    page._solidGeo = buildSolidGeometry(state);
    page._solidGeoKey = key;
  }
  return page._solidGeo;
}

function drawProjectionOnPlane(context, page, geo, planeFn, viewType, color) {
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
  // 填充“顶面”：取平均 z 最大的面
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

function drawViews(context, page) {
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
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 0.8;
  context.setLineDash([3, 3]);
  page.drawLine(context, a, b);
  context.restore();
}

function curvedBounds(sil) {
  return [].concat(...sil).reduce((r, v) => ({
    minX: Math.min(r.minX, v.x), maxX: Math.max(r.maxX, v.x),
    minY: Math.min(r.minY, v.y), maxY: Math.max(r.maxY, v.y),
    minZ: Math.min(r.minZ, v.z), maxZ: Math.max(r.maxZ, v.z)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function drawCurvedCenterLines(context, page, geo) {
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
