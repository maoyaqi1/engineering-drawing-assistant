#!/usr/bin/env node
// 几何真值回归检查（开发者本机运行，零第三方依赖）。
//
// 运行：node scripts/geometry-test.js            （或 node scripts/run-all.js 统一运行）
//       node scripts/geometry-test.js --quiet    只打印失败项与备注
//
// 目的：AGENTS.md §49 要求「纯数学函数应进行确定性测试」。本脚本把已经过真机验证的几何真值
//       写成确定性数值/拓扑断言，使后续任何改动都能在微信开发者工具之外第一时间发现回归。
//
// 覆盖：
//   A. pages/index/section-geometry.js（F2 几何真值层）：立体网格、截平面、求交、截交环、截面封盖
//   B. pages/index/basic-solid.js（F4 基本立体）：参数化立体的顶点/面/法向与变换不变量
//   C. 退化情形：记录当前行为（其中共面退化为已知限制，只记录、不在此处修改实现）
//   D. pages/projection/unfold.js（投影体系）：展开旋转的刚性、折痕不动、钳制，
//      以及「三个投影面展开 90° 后，三个投影点的第一角正投影与三视图逐点一致」这条教学不变量
//
// 边界（必须明确）：
//   1. 只 require 纯几何模块，不加载 wx / canvas / 网络；
//   2. 这不是自动化测试框架，也不是 CI；它不能替代真机与模拟器回归（AGENTS.md C11）；
//   3. 只断言几何真值与拓扑不变量，不断言渲染样式、像素与线型。

const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const EPS = 1e-8;
const PLANE_EPS = 1e-7;
const ENDPOINT_EPS = 1e-5; // 与 createSectionLoops 默认 tolerance 一致

let SG = null;
let BS = null;
let PS = null;
let PJ = null;

// ---- 基准值（由当前实现实测得到，均为「已通过真机验证」的行为，改动必须是有意为之）----

const SOLID_BASELINE = {
  triangularPyramid: { triangles: 4, edges: 6, renderTriangles: 4 },
  pentagonalPrism: { triangles: 16, edges: 15, renderTriangles: 16 },
  cylinder: { triangles: 288, edges: 216, renderTriangles: 128 },
  cone: { triangles: 144, edges: 144, renderTriangles: 64 },
  sphere: { triangles: 4096, edges: 704, renderTriangles: 784 },
  torus: { triangles: 4032, edges: 512, renderTriangles: 1008 }
};

const INTERSECT_BASELINE = {
  triangularPyramid: 3,
  pentagonalPrism: 10,
  cylinder: 144,
  cone: 72,
  sphere: 154,
  torus: 154
};

const LOOP_BASELINE = {
  triangularPyramid: [3],
  pentagonalPrism: [10],
  cylinder: [144],
  cone: [72],
  sphere: [154],
  // 圆环被 42° 截平面切成两个闭合环，按顶点数升序记录
  torus: [74, 80]
};

const SOLID_TYPES = Object.keys(SOLID_BASELINE);

const SOLID_STATE = {
  sides: 7,
  radius: 2.7,
  height: 4.3,
  majorRadius: 2.4,
  minorRadius: 0.8,
  position: { x: 4, y: 4, z: 4 },
  rotation: { x: 0, y: 0, z: 0 }
};

const BUILT_SOLID_BASELINE = {
  prism: { vertices: 14, faces: 9 },
  pyramid: { vertices: 8, faces: 8 },
  cylinder: { vertices: 74, faces: 108 },
  cone: { vertices: 38, faces: 72 },
  sphere: { vertices: 220, faces: 200 },
  torus: { vertices: 512, faces: 512 }
};

// 退化/边界情形：当前实现的实测行为（含已知限制）
const DEGENERATE_BASELINE = [
  { name: '五棱柱 · 距顶面 1e-6（接近但不共面）', type: 'pentagonalPrism', angle: 0, offset: 2.5 - 1e-6, segments: 10, loops: [5] },
  { name: '五棱柱 · 过中间高度', type: 'pentagonalPrism', angle: 0, offset: 0, segments: 10, loops: [10] },
  { name: '五棱柱 · 截平面与顶面完全共面', type: 'pentagonalPrism', angle: 0, offset: 2.5, segments: 8, loops: [3], known: '共面时截交环退化为 3 点（网格顶点落在平面上的容差效应）；相差 1e-6 时恢复正常 5 点环。' },
  { name: '圆柱 · 截平面与顶面完全共面', type: 'cylinder', angle: 0, offset: 2.5, segments: 144, loops: [73], known: '共面时截交环含一个重合点（73 ≈ 72 + 1）。' },
  { name: '圆球 · 截平面与最高点相切', type: 'sphere', angle: 0, offset: 2.5, segments: 0, loops: [] },
  { name: '三棱锥 · 截平面过锥尖', type: 'triangularPyramid', angle: 0, offset: 3, segments: 0, loops: [] },
  { name: '三棱锥 · 截平面与底面共面', type: 'triangularPyramid', angle: 0, offset: -3, segments: 4, loops: [] }
];

// ---- 小工具 ----

function loadGeometryModules() {
  const sectionPath = path.join(ROOT, 'pages', 'index', 'section-geometry.js');
  const solidPath = path.join(ROOT, 'pages', 'index', 'basic-solid.js');
  try {
    SG = require(sectionPath);
    BS = require(solidPath);
  } catch (error) {
    console.error('无法在 Node 中加载几何模块：' + (error && error.message || error));
    console.error('这两个模块必须保持「纯计算、无 wx / canvas 运行时依赖」，否则本脚本失去安全网作用。');
    process.exitCode = 2;
    return false;
  }
  return true;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function planeDistance(p, plane) {
  return p.x * plane.normal.x + p.y * plane.normal.y + p.z * plane.normal.z - plane.constant;
}

function trianglePoints(solid) {
  const points = [];
  solid.triangles.forEach((triangle) => triangle.forEach((v) => points.push(v)));
  return points;
}

function edgePoints(solid) {
  const points = [];
  solid.edges.forEach((edge) => edge.forEach((v) => points.push(v)));
  return points;
}

// 网格顶点在多个三角形/棱线上重复出现，语义断言需要先去重
function uniquePoints(points) {
  const unique = [];
  points.forEach((point) => {
    if (!unique.some((existing) => dist(existing, point) < 1e-12)) unique.push(point);
  });
  return unique;
}

function isFinitePoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function bounds(values) {
  return { min: Math.min(...values), max: Math.max(...values) };
}

function radialDistance(p, cx, cy) {
  return Math.hypot(p.x - cx, p.y - cy);
}

function allClose(actual, expected, tolerance) {
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
}

function geometryParts(geometry) {
  if (geometry && geometry.vertices && geometry.faces) {
    return { vertices: geometry.vertices, faces: geometry.faces, normals: geometry.normals || null };
  }
  if (geometry && geometry.iso && geometry.iso.vertices && geometry.iso.faces) {
    return { vertices: geometry.iso.vertices, faces: geometry.iso.faces, normals: null };
  }
  return null;
}

// 确定性伪随机洗牌（固定种子，避免随机测试不可复现，见 §55）
function shuffleWithSeed(list, seed) {
  const copy = list.slice();
  let state = seed;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

// ---- A. section-geometry.js ----

function checkSolidMesh(suite) {
  suite.section('A1 立体网格（createSolid）· 拓扑与数值基准');
  SOLID_TYPES.forEach((type) => {
    const solid = SG.createSolid(type);
    const base = SOLID_BASELINE[type];
    suite.equal(solid.triangles.length, base.triangles, type + ' 三角形数 = ' + base.triangles);
    suite.equal(solid.edges.length, base.edges, type + ' 棱线候选数 = ' + base.edges);
    suite.equal(solid.renderTriangles.length, base.renderTriangles, type + ' 渲染三角数 = ' + base.renderTriangles);

    const badTriangle = solid.triangles.find((t) => t.length !== 3 || !t.every(isFinitePoint));
    suite.check(!badTriangle, type + ' 每个三角形为 3 个有限坐标点');

    const badEdge = solid.edges.find((e) => e.length !== 2 || !e.every(isFinitePoint) || dist(e[0], e[1]) <= EPS);
    suite.check(!badEdge, type + ' 每条棱线两端点互不重合且坐标有限');

    const outside = trianglePoints(solid).find((p) => p.x < -1e-9 || p.x > 8 + 1e-9
      || p.y < -1e-9 || p.y > 8 + 1e-9 || p.z < -1e-9 || p.z > 8 + 1e-9);
    suite.check(!outside, type + ' 全部顶点位于教学坐标范围 0～8 内');
  });

  suite.section('A2 立体几何语义（常量取自模块自身的教学参数）');

  const pyramidPoints = trianglePoints(SG.createSolid('triangularPyramid'));
  suite.check(pyramidPoints.some((p) => dist(p, { x: 4, y: 4, z: 7 }) < 1e-12), '三棱锥锥尖 = (4, 4, 7)');
  suite.close(bounds(pyramidPoints.map((p) => p.z)).min, 1, 1e-12, '三棱锥底面 z = 1');
  const pyramidBase = uniquePoints(pyramidPoints.filter((p) => Math.abs(p.z - 1) < 1e-12));
  suite.equal(pyramidBase.length, 3, '三棱锥底面 3 个顶点');
  suite.close(bounds(pyramidBase.map((p) => radialDistance(p, 4, 4))).max, 2.5, 1e-12, '三棱锥底面外接圆半径 = 2.5');

  const prismPoints = trianglePoints(SG.createSolid('pentagonalPrism'));
  suite.check(allClose([...new Set(prismPoints.map((p) => p.z))].sort((a, b) => a - b), [1, 6.5], 1e-12), '五棱柱上下底面 z = 1 / 6.5');
  suite.close(bounds(prismPoints.map((p) => radialDistance(p, 4, 4))).max, 2.3, 1e-12, '五棱柱外接圆半径 = 2.3');

  const cylinderPoints = trianglePoints(SG.createSolid('cylinder'));
  suite.close(radialDistance({ x: 4, y: 4 }, 4, 4), 0, 1e-12, '圆柱轴心在 (4, 4)');
  suite.close(bounds(cylinderPoints.map((p) => radialDistance(p, 4, 4))).max, 2.2, 1e-12, '圆柱半径 = 2.2');
  suite.check(allClose([...new Set(cylinderPoints.map((p) => p.z))].sort((a, b) => a - b), [1, 6.5], 1e-12), '圆柱上下底 z = 1 / 6.5');

  const conePoints = trianglePoints(SG.createSolid('cone'));
  suite.check(conePoints.some((p) => dist(p, { x: 4, y: 4, z: 7 }) < 1e-12), '圆锥锥尖 = (4, 4, 7)');
  const coneBase = conePoints.filter((p) => Math.abs(p.z - 1) < 1e-12);
  suite.close(bounds(coneBase.map((p) => radialDistance(p, 4, 4))).max, 2.4, 1e-12, '圆锥底面半径 = 2.4');

  const spherePoints = trianglePoints(SG.createSolid('sphere'));
  suite.check(spherePoints.every((p) => Math.abs(dist(p, { x: 4, y: 4, z: 4 }) - 2.5) < 1e-12), '圆球：全部顶点到球心 (4, 4, 4) 距离 = 2.5');

  const torusPoints = trianglePoints(SG.createSolid('torus'));
  suite.check(torusPoints.every((p) => Math.abs(Math.hypot(radialDistance(p, 4, 4) - 2, p.z - 4) - 0.72) < 1e-12), '圆环：全部顶点到主圆（R=2）距离 = 0.72');

  suite.throws(() => SG.createSolid('notASolid'), /Unknown solid type/, '未知立体类型抛出明确错误');
}

function checkCuttingPlane(suite) {
  suite.section('A3 截平面（createCuttingPlane）');
  [0, 17, 42, 90, 137, 180].forEach((angle) => {
    const plane = SG.createCuttingPlane(angle, 0);
    const radians = angle * Math.PI / 180;
    const label = angle + '°';
    suite.close(Math.hypot(plane.normal.x, plane.normal.y, plane.normal.z), 1, 1e-12, label + ' 法向量为单位长度');
    suite.equal(plane.normal.y, 0, label + ' 法向量 y 分量恒为 0（正垂面族）');
    suite.close(plane.normal.x, Math.sin(radians), 1e-12, label + ' normal.x = sin(角度)');
    suite.close(plane.normal.z, Math.cos(radians), 1e-12, label + ' normal.z = cos(角度)');
    suite.close(planeDistance({ x: 4, y: 4, z: 4 }, plane), 0, 1e-12, label + ' 截平面过 (4, 4, 4)');
  });

  suite.close(planeDistance({ x: 4, y: 4, z: 4 + 0.5 }, SG.createCuttingPlane(0, 0.5)), 0, 1e-12, '0° + offset 0.5 → 平面 z = 4.5');
  suite.close(SG.createCuttingPlane(42, 1).constant - SG.createCuttingPlane(42, 0).constant, 1, 1e-12, 'offset 对 constant 平移是线性的（Δ=1）');
}

function checkIntersect(suite) {
  suite.section('A4 立体求交（intersectSolid）· 不变量与基准段数');
  const plane = SG.createCuttingPlane(42, 0);

  SOLID_TYPES.forEach((type) => {
    const solid = SG.createSolid(type);
    const segments = SG.intersectSolid(solid, plane);
    suite.equal(segments.length, INTERSECT_BASELINE[type], type + ' 在 42° 截平面上的截交段数');

    const offPlane = segments.find((s) => Math.abs(planeDistance(s[0], plane)) > PLANE_EPS
      || Math.abs(planeDistance(s[1], plane)) > PLANE_EPS);
    suite.check(!offPlane, type + ' 所有截交点都落在截平面上');

    const degenerate = segments.find((s) => dist(s[0], s[1]) <= EPS);
    suite.check(!degenerate, type + ' 不存在零长度截交段');

    const solidBox = trianglePoints(solid);
    const xRange = bounds(solidBox.map((p) => p.x));
    const yRange = bounds(solidBox.map((p) => p.y));
    const zRange = bounds(solidBox.map((p) => p.z));
    const inBox = (p) => p.x >= xRange.min - 1e-9 && p.x <= xRange.max + 1e-9
      && p.y >= yRange.min - 1e-9 && p.y <= yRange.max + 1e-9
      && p.z >= zRange.min - 1e-9 && p.z <= zRange.max + 1e-9;
    suite.check(segments.every((s) => inBox(s[0]) && inBox(s[1])), type + ' 截交点落在立体包围盒内');
  });

  const farCases = [100, -100];
  farCases.forEach((offset) => {
    const far = SG.createCuttingPlane(42, offset);
    const empty = SOLID_TYPES.filter((type) => SG.intersectSolid(SG.createSolid(type), far).length === 0);
    suite.equal(empty.length, SOLID_TYPES.length, '截平面移出立体 ' + offset + '：六种立体均无截交段');
  });

  suite.equal(SG.intersectSolid({ triangles: [] }, plane).length, 0, '空立体网格返回空结果（不抛错）');

  const solid = SG.createSolid('cylinder');
  const before = JSON.stringify(solid) + JSON.stringify(plane);
  SG.intersectSolid(solid, plane);
  SG.createSectionLoops(SG.intersectSolid(solid, plane));
  SG.createSectionCaps(SG.intersectSolid(solid, plane), plane, 1);
  suite.equal(JSON.stringify(solid) + JSON.stringify(plane), before, '求交与截面计算不修改输入的立体与平面');
}

function checkSectionLoops(suite) {
  suite.section('A5 截交环（createSectionLoops）· 闭合性与顺序');
  const plane = SG.createCuttingPlane(42, 0);

  SOLID_TYPES.forEach((type) => {
    const solid = SG.createSolid(type);
    const segments = SG.intersectSolid(solid, plane);
    const loops = SG.createSectionLoops(segments);
    const sizes = loops.map((loop) => loop.length).sort((a, b) => a - b);
    suite.check(allClose(sizes, LOOP_BASELINE[type], 0), type + ' 截交环个数与顶点数 = ' + LOOP_BASELINE[type].join('+'));

    const matchEndpoint = (a, b) => segments.some((s) => (dist(s[0], a) <= ENDPOINT_EPS && dist(s[1], b) <= ENDPOINT_EPS)
      || (dist(s[1], a) <= ENDPOINT_EPS && dist(s[0], b) <= ENDPOINT_EPS));

    let closed = true;
    let continuous = true;
    let noRepeat = true;
    let onPlane = true;
    loops.forEach((loop) => {
      for (let i = 0; i < loop.length; i += 1) {
        const current = loop[i];
        const next = loop[(i + 1) % loop.length];
        if (!matchEndpoint(current, next)) continuous = false;
        if (Math.abs(planeDistance(current, plane)) > PLANE_EPS) onPlane = false;
        for (let j = i + 1; j < loop.length; j += 1) {
          if (dist(current, loop[j]) <= ENDPOINT_EPS) noRepeat = false;
        }
      }
      if (loop.length < 3) closed = false;
    });
    suite.check(closed, type + ' 每个截交环顶点数 ≥ 3');
    suite.check(continuous, type + ' 截交环相邻顶点都由真实截交段相连（无断口）');
    suite.check(noRepeat, type + ' 同一截交环内无重复顶点');
    suite.check(onPlane, type + ' 截交环顶点全部落在截平面上');

    // 段序无关性：固定种子洗牌后应得到同样的环结构（§52 顶点顺序连续且稳定）
    const shuffledSizes = SG.createSectionLoops(shuffleWithSeed(segments, 20260913))
      .map((loop) => loop.length).sort((a, b) => a - b);
    suite.check(allClose(shuffledSizes, sizes, 0), type + ' 截交段顺序打乱后环结构不变');
  });

  suite.equal(SG.createSectionLoops([]).length, 0, '空截交段集合返回空环列表');
}

function checkSectionCaps(suite) {
  suite.section('A6 截面封盖（createSectionCaps）· 顶点与朝向');
  const plane = SG.createCuttingPlane(42, 0);

  SOLID_TYPES.forEach((type) => {
    const segments = SG.intersectSolid(SG.createSolid(type), plane);
    const loops = SG.createSectionLoops(segments);
    const totalLoopVertices = loops.reduce((sum, loop) => sum + loop.length, 0);

    [1, -1].forEach((outwardSign) => {
      const caps = SG.createSectionCaps(segments, plane, outwardSign);
      suite.equal(caps.length, totalLoopVertices, type + ' outwardSign=' + outwardSign + ' 时封盖三角形数 = 截交环顶点总数');

      let centroidOk = true;
      let orientationOk = true;
      let capsAllFinite = true;
      let cursor = 0;
      loops.forEach((loop) => {
        const centroid = loop.reduce((sum, v) => ({ x: sum.x + v.x, y: sum.y + v.y, z: sum.z + v.z }), { x: 0, y: 0, z: 0 });
        centroid.x /= loop.length;
        centroid.y /= loop.length;
        centroid.z /= loop.length;
        for (let i = 0; i < loop.length; i += 1) {
          const triangle = caps[cursor + i];
          if (!triangle || !triangle.every(isFinitePoint)) {
            capsAllFinite = false;
            continue;
          }
          if (dist(triangle[0], centroid) > 1e-9) centroidOk = false;
          const ab = { x: triangle[1].x - triangle[0].x, y: triangle[1].y - triangle[0].y, z: triangle[1].z - triangle[0].z };
          const ac = { x: triangle[2].x - triangle[0].x, y: triangle[2].y - triangle[0].y, z: triangle[2].z - triangle[0].z };
          const normal = {
            x: ab.y * ac.z - ab.z * ac.y,
            y: ab.z * ac.x - ab.x * ac.z,
            z: ab.x * ac.y - ab.y * ac.x
          };
          const orientation = normal.x * plane.normal.x + normal.y * plane.normal.y + normal.z * plane.normal.z;
          if (!(orientation * outwardSign > 0)) orientationOk = false;
        }
        cursor += loop.length;
      });

      suite.check(capsAllFinite, type + ' outwardSign=' + outwardSign + ' 时封盖三角形均为有限坐标');
      suite.check(centroidOk, type + ' outwardSign=' + outwardSign + ' 时封盖均以截交环重心为扇心');
      suite.check(orientationOk, type + ' outwardSign=' + outwardSign + ' 时封盖法向朝向与 outwardSign 一致');
    });
  });

  suite.equal(SG.createSectionCaps([], plane, 1).length, 0, '空截交段集合返回空封盖列表');
}

// ---- B. basic-solid.js ----

function checkBasicSolid(suite) {
  suite.section('B1 基本立体（buildSolidGeometry）· 拓扑基准');
  const state = (type, extra) => Object.assign({ type }, SOLID_STATE, extra || {});

  Object.keys(BUILT_SOLID_BASELINE).forEach((type) => {
    const geometry = geometryParts(BS.buildSolidGeometry(state(type)));
    const base = BUILT_SOLID_BASELINE[type];
    if (!geometry) {
      suite.check(false, type + ' buildSolidGeometry 返回可识别结构');
      return;
    }
    suite.equal(geometry.vertices.length, base.vertices, type + ' 顶点数 = ' + base.vertices);
    suite.equal(geometry.faces.length, base.faces, type + ' 面数 = ' + base.faces);
    suite.check(geometry.vertices.every(isFinitePoint), type + ' 全部顶点坐标有限');

    const badIndex = geometry.faces.find((face) => face.some((index) => !Number.isInteger(index)
      || index < 0 || index >= geometry.vertices.length));
    suite.check(!badIndex, type + ' 面索引均为合法顶点下标');

    if (geometry.normals) {
      const centroid = { x: 0, y: 0, z: 0 };
      geometry.vertices.forEach((v) => { centroid.x += v.x / geometry.vertices.length; centroid.y += v.y / geometry.vertices.length; centroid.z += v.z / geometry.vertices.length; });
      const outwardOk = geometry.faces.every((face, index) => {
        const normal = geometry.normals[index];
        if (!normal || !Number.isFinite(normal.x + normal.y + normal.z)) return false;
        if (Math.hypot(normal.x, normal.y, normal.z) <= EPS) return false;
        const faceCenter = face.reduce((sum, i) => ({
          x: sum.x + geometry.vertices[i].x / face.length,
          y: sum.y + geometry.vertices[i].y / face.length,
          z: sum.z + geometry.vertices[i].z / face.length
        }), { x: 0, y: 0, z: 0 });
        const toFace = { x: faceCenter.x - centroid.x, y: faceCenter.y - centroid.y, z: faceCenter.z - centroid.z };
        return normal.x * toFace.x + normal.y * toFace.y + normal.z * toFace.z > 0;
      });
      suite.check(outwardOk, type + ' 每个面法向非零且朝向立体外侧');
    }
  });

  suite.section('B2 基本立体 · 变换与语义不变量');
  const sphereState = state('sphere');
  const sphereGeometry = BS.buildSolidGeometry(sphereState);
  const sphereVertices = geometryParts(sphereGeometry).vertices;
  suite.check(sphereVertices.every((v) => Math.abs(dist(v, { x: 4, y: 4, z: 4 }) - SOLID_STATE.radius) < 1e-9), '圆球：顶点到中心距离 = 半径 2.7');
  const rotatedSphere = geometryParts(BS.buildSolidGeometry(state('sphere', { rotation: { x: 37, y: 53, z: 91 } }))).vertices;
  suite.check(rotatedSphere.every((v) => Math.abs(dist(v, { x: 4, y: 4, z: 4 }) - SOLID_STATE.radius) < 1e-9), '圆球：旋转后仍满足「顶点到中心距离 = 半径」');

  const cylinderVertices = geometryParts(BS.buildSolidGeometry(state('cylinder'))).vertices;
  const cylinderZ = bounds(cylinderVertices.map((v) => v.z));
  suite.close(cylinderZ.max - cylinderZ.min, SOLID_STATE.height, 1e-9, '圆柱：z 跨度 = 高度 4.3');
  suite.close(Math.max(...cylinderVertices.map((v) => radialDistance(v, 4, 4))), SOLID_STATE.radius, 1e-9, '圆柱：最远顶点到轴距离 = 半径 2.7');

  const torusVertices = geometryParts(BS.buildSolidGeometry(state('torus'))).vertices;
  suite.check(torusVertices.every((v) => Math.abs(Math.hypot(radialDistance(v, 4, 4) - SOLID_STATE.majorRadius, v.z - 4) - SOLID_STATE.minorRadius) < 1e-9), '圆环：顶点满足「到主圆距离 = 管半径」');

  const prism = BS.buildSolidGeometry(state('prism'));
  suite.equal(prism.n, SOLID_STATE.sides, '棱柱：n = 棱数 7');
  const pyramid = BS.buildSolidGeometry(state('pyramid'));
  suite.equal(pyramid.n, SOLID_STATE.sides, '棱锥：n = 棱数 7');
  const pyramidZ = bounds(geometryParts(pyramid).vertices.map((v) => v.z));
  suite.close(pyramidZ.max - pyramidZ.min, SOLID_STATE.height, 1e-9, '棱锥：z 跨度 = 高度 4.3');

  const pyramidApex = geometryParts(pyramid).vertices.filter((v) => Math.abs(v.z - (4 + SOLID_STATE.height / 2)) < 1e-9);
  suite.equal(pyramidApex.length, 1, '棱锥：锥尖位于中心正上方且唯一');
  suite.close(pyramidApex[0].x, 4, 1e-9, '棱锥：锥尖 x = 中心 x');
  suite.close(pyramidApex[0].y, 4, 1e-9, '棱锥：锥尖 y = 中心 y');

  const translated = geometryParts(BS.buildSolidGeometry(state('prism', { position: { x: 5.5, y: 2, z: 4.25 } }))).vertices;
  const delta = { x: 1.5, y: -2, z: 0.25 };
  const translationOk = translated.every((v, index) => {
    const origin = geometryParts(BS.buildSolidGeometry(state('prism'))).vertices[index];
    return Math.abs(v.x - (origin.x + delta.x)) < 1e-9
      && Math.abs(v.y - (origin.y + delta.y)) < 1e-9
      && Math.abs(v.z - (origin.z + delta.z)) < 1e-9;
  });
  suite.check(translationOk, '平移：全部顶点整体平移同一增量');

  const fullTurn = geometryParts(BS.buildSolidGeometry(state('pyramid', { rotation: { x: 360, y: 360, z: 360 } }))).vertices;
  const originPyramid = geometryParts(pyramid).vertices;
  suite.check(fullTurn.every((v, index) => dist(v, originPyramid[index]) < 1e-9), '旋转 360°：顶点回到原位');

  const asymmetric = state('prism', {
    sides: 7,
    radius: 2.7,
    height: 4.3,
    position: { x: 3.5, y: 4.25, z: 3.75 },
    rotation: { x: 12, y: 23, z: 34 }
  });
  const asymmetricFirst = BS.buildSolidGeometry(asymmetric);
  const asymmetricSecond = BS.buildSolidGeometry(asymmetric);
  suite.equal(JSON.stringify(asymmetricSecond), JSON.stringify(asymmetricFirst), '非对称非整数参数：同一输入结果确定可复现');
  suite.check(geometryParts(asymmetricFirst).vertices.every((v) => v.x >= -1e-9 && v.x <= 8 + 1e-9
    && v.y >= -1e-9 && v.y <= 8 + 1e-9 && v.z >= -1e-9 && v.z <= 8 + 1e-9), '非对称非整数参数：顶点仍在教学坐标范围内');

  const stateObject = { type: 'sphere' };
  suite.check(BS.getState({ data: { solid: stateObject } }) === stateObject, 'getState(page) 直接返回 page.data.solid（不复制、不重建）');
}

// ---- C. 退化情形（记录，不修改）----

function checkDegenerateCases(suite) {
  suite.section('C1 退化与边界情形（记录当前行为）');
  DEGENERATE_BASELINE.forEach((item) => {
    const plane = SG.createCuttingPlane(item.angle, item.offset);
    const segments = SG.intersectSolid(SG.createSolid(item.type), plane);
    const loops = SG.createSectionLoops(segments);
    suite.equal(segments.length, item.segments, item.name + '：截交段数');
    suite.check(allClose(loops.map((loop) => loop.length).sort((a, b) => a - b), item.loops, 0),
      item.name + '：截交环 = ' + (item.loops.join('+') || '无'));
    if (item.known) suite.note(item.name + ' → ' + item.known);
  });
  suite.note('以上为「记录当前行为」，不是需要立刻修的缺陷；若确要改动这些退化行为，属冻结模块 F2 的修改范围，需用户明确授权并做真机回归。');
}

// ---- 主流程 ----

// 投影体系：展开数学来自 pages/projection/unfold.js（纯函数），三视图口径取自 pages/index/projection.js
function loadProjectionModules() {
  try {
    PS = require(path.join(ROOT, 'pages', 'projection', 'unfold.js'));
    PJ = require(path.join(ROOT, 'pages', 'index', 'projection.js'));
  } catch (error) {
    console.error('无法在 Node 中加载投影体系模块：' + (error && error.message || error));
    console.error('pages/projection/unfold.js 必须保持「纯计算 + 绘制」分层，且不得在顶层依赖 wx / canvas。');
    process.exitCode = 2;
    return false;
  }
  return true;
}

// D. 投影体系：展开旋转的数学不变量（教学断言：展开到位后就是三视图）
function checkProjectionSystem(suite) {
  suite.section('D. 投影体系（展开数学与三视图一致性）');
  const modelPoint = { x: 4, y: 3, z: 5 };

  // θ=0：什么都不动（展开角 0 时必须是空间状态原样）
  const hAtZero = PS.unfoldHPoint({ x: modelPoint.x, y: modelPoint.y, z: 0 }, 0);
  const wAtZero = PS.unfoldWPoint({ x: 0, y: modelPoint.y, z: modelPoint.z }, 0);
  suite.close(hAtZero.x, modelPoint.x, EPS, 'θ=0°：H 面上的点 x 不变');
  suite.close(hAtZero.y, modelPoint.y, EPS, 'θ=0°：H 面上的点 y 不变');
  suite.close(hAtZero.z, 0, EPS, 'θ=0°：H 面上的点 z 保持 0');
  suite.close(wAtZero.y, modelPoint.y, EPS, 'θ=0°：W 面上的点 y 不变');
  suite.close(wAtZero.z, modelPoint.z, EPS, 'θ=0°：W 面上的点 z 不变');

  // θ=90：H 绕 OX 折到 OX 下方、W 绕 OZ 折到另一侧（第一角展开方向）
  const hAt90 = PS.unfoldHPoint({ x: modelPoint.x, y: modelPoint.y, z: 0 }, 90);
  const wAt90 = PS.unfoldWPoint({ x: 0, y: modelPoint.y, z: modelPoint.z }, 90);
  suite.close(hAt90.x, modelPoint.x, 1e-12, 'θ=90°：H 面上的点 x 不变（长对正）');
  suite.close(hAt90.y, 0, 1e-12, 'θ=90°：H 面上的点落到 V 面（y=0）');
  suite.close(hAt90.z, -modelPoint.y, 1e-12, 'θ=90°：俯视图落在 OX 下方（z=-y）');
  suite.close(wAt90.x, -modelPoint.y, 1e-12, 'θ=90°：左视图落在 OZ 另一侧（x=-y）');
  suite.close(wAt90.z, modelPoint.z, 1e-12, 'θ=90°：左视图高度不变（高平齐）');

  // 中间角度：方向单调推进，不停在原地
  const hMid = PS.unfoldHPoint({ x: modelPoint.x, y: modelPoint.y, z: 0 }, 45);
  const wMid = PS.unfoldWPoint({ x: 0, y: modelPoint.y, z: modelPoint.z }, 45);
  suite.check(hMid.z < -1e-9 && hMid.z > -modelPoint.y, 'θ=45°：俯视图已移到 OX 下方、尚未到位');
  suite.check(wMid.x < -1e-9 && wMid.x > -modelPoint.y, 'θ=45°：左视图已移到 OZ 另一侧、尚未到位');

  // 折痕不动：OX 上的点绕 x 轴旋转不变，OZ 上的点绕 z 轴旋转不变
  const onX = PS.rotatePointAboutX({ x: 6, y: 0, z: 0 }, 73);
  const onZ = PS.rotatePointAboutZ({ x: 0, y: 0, z: 6 }, -73);
  suite.close(dist(onX, { x: 6, y: 0, z: 0 }), 0, 1e-12, '折痕 OX 上的点旋转后不动');
  suite.close(dist(onZ, { x: 0, y: 0, z: 6 }), 0, 1e-12, '折痕 OZ 上的点旋转后不动');

  // 刚体：绕轴旋转不改变到原点的距离
  const probe = { x: 1.5, y: -0.8, z: 2.4 };
  const probeRadius = Math.hypot(probe.x, probe.y, probe.z);
  suite.close(Math.hypot(PS.rotatePointAboutX(probe, 37).x, PS.rotatePointAboutX(probe, 37).y, PS.rotatePointAboutX(probe, 37).z), probeRadius, 1e-12, '绕 OX 旋转保持长度');
  suite.close(Math.hypot(PS.rotatePointAboutZ(probe, -58).x, PS.rotatePointAboutZ(probe, -58).y, PS.rotatePointAboutZ(probe, -58).z), probeRadius, 1e-12, '绕 OZ 旋转保持长度');
  const xAxisTurned = PS.rotatePointAboutZ({ x: 1, y: 0, z: 0 }, 90);
  suite.close(dist(xAxisTurned, { x: 0, y: 1, z: 0 }), 0, 1e-12, '绕 OZ 转 90°：x 轴方向 → y 轴方向');

  // 展开角钳制（滑块与动画只允许 0..90）
  suite.equal(PS.clampUnfoldAngle(-15), 0, '展开角下限钳制到 0°');
  suite.equal(PS.clampUnfoldAngle(120), 90, '展开角上限钳制到 90°');
  suite.equal(PS.clampUnfoldAngle('bad'), 0, '非法展开角按 0° 处理');

  // 教学不变量：展开 90° 后，三个投影点落在同一个平面上，把它们按第一角正投影到 V 面，
  // 得到的二维坐标必须与 pages/index/projection.js 的三视图映射逐点相同。
  const unfolded = PS.unfoldProjections(modelPoint, 90);
  ['front', 'top', 'left'].forEach((key) => {
    suite.close(unfolded[key].y, 0, 1e-12, 'θ=90°：' + key + ' 落在 y=0 平面（三面共面）');
  });
  const viewNames = { front: 'a′（正视）', top: 'a（俯视）', left: 'a″（左视）' };
  ['front', 'top', 'left'].forEach((key) => {
    const expected = PJ.worldToView(modelPoint, key);
    const actual = PJ.worldToView(unfolded[key], 'front');
    suite.close(actual.u, expected.u, 1e-12, '展开 90° 后 ' + viewNames[key] + ' 的 u = 三视图 u');
    suite.close(actual.v, expected.v, 1e-12, '展开 90° 后 ' + viewNames[key] + ' 的 v = 三视图 v');
  });
  suite.note('本节锁住的是「三投影面展开成三视图」的口径：改动展开方向或旋转符号会立刻失败；'
    + '若确要改，须连同 pages/projection/unfold.js 的注释与真机表现一起改，并重新做真机回归。');

  // 实心投影面的遮挡判定：虽然不是展开数学，但同样是纯函数（给定三块面与视线，判断某点是否被挡住），
  // 它决定空间视图里"哪个分角编号/空间点看得见"，改错会让画面自相矛盾，因此一并锁住。
  const plateFrames = (rotateView) => {
    const rot = (p) => (rotateView ? PS.rotatePointAboutZ(p, 180) : p);
    return {
      V: { u1: rot({ x: 1, y: 0, z: 0 }), u2: rot({ x: 0, y: 0, z: 1 }) },
      H: { u1: rot({ x: 1, y: 0, z: 0 }), u2: rot({ x: 0, y: 1, z: 0 }) },
      W: { u1: rot({ x: 0, y: 0, z: 1 }), u2: rot({ x: 0, y: 1, z: 0 }) }
    };
  };
  const frontFrames = plateFrames(false);
  const backFrames = plateFrames(true);
  const octantRange = { center: 0, half: 7 };      // 八分角模式：板向两侧延伸
  const firstRange = { center: 3.5, half: 3.5 };   // 第一分角模式：板只覆盖 0..7
  const occluded = (point, frames, range) => PS.isOccludedByPlates(point, frames, range || octantRange);
  suite.check(!occluded(modelPoint, frontFrames), '默认视角：第一分角内的空间点不被投影面遮挡');
  suite.check(occluded({ x: -4, y: -3, z: 2 }, frontFrames), '默认视角：V 面背后的点被实心投影面挡住');
  suite.check(!occluded({ x: -4, y: -3, z: 9 }, frontFrames), '超出投影面范围（|坐标| > 7）的点不被挡住');
  // 实现里"旋转视角"= 把整个场景连同三块板一起绕 OZ 轴转，观察方向保持不变，
  // 所以这里也必须把点与三块板一起转，才是同一个视图坐标系。
  const inViewFrame = (point, angle) => PS.rotatePointAboutZ(point, angle);
  suite.check(!occluded(inViewFrame({ x: -4, y: -3, z: 2 }, 180), backFrames),
    '视角绕 OZ 轴转 180° 后，原本被挡住的 Ⅴ–Ⅷ 一侧的点可见');
  suite.check(!occluded(inViewFrame(modelPoint, 180), backFrames), '视角绕 OZ 轴转 180° 后，空间点本身仍在空处可见');
  // 板的大小决定谁能挡住谁：同一点在八分角模式下被延伸的 V 面挡住，在第一分角模式下不被挡住
  suite.check(occluded({ x: -4, y: -2, z: 4 }, frontFrames, octantRange),
    '八分角模式：V 面背后的点被延伸出去的那半块板挡住');
  suite.check(!occluded({ x: -4, y: -2, z: 4 }, frontFrames, firstRange),
    '第一分角模式：同一位置不被挡住（板只覆盖第一分角 0..7）');
  suite.check(!occluded({ x: 4, y: 3, z: 5 }, frontFrames, firstRange),
    '第一分角模式：第一分角内的空间点仍不被挡住');
  suite.note('遮挡判定用的是"从点朝观察者方向 (1, 1, 0.76) 走，是否穿过 ±7 的方板"，'
    + '与 pages/index/projection.js 的等轴测退化方向一致；改基向量或板尺寸都会影响可见性。');
}

function main() {
  const quiet = process.argv.includes('--quiet') || process.argv.includes('-q');
  const suite = createSuite('geometry-test', { quiet });

  if (!loadGeometryModules()) {
    console.log('\ngeometry-test：无法运行（几何模块在 Node 中不可加载）');
    return;
  }
  if (!loadProjectionModules()) {
    console.log('\ngeometry-test：无法运行（投影体系模块在 Node 中不可加载）');
    return;
  }

  checkSolidMesh(suite);
  checkCuttingPlane(suite);
  checkIntersect(suite);
  checkSectionLoops(suite);
  checkSectionCaps(suite);
  checkBasicSolid(suite);
  checkDegenerateCases(suite);
  checkProjectionSystem(suite);

  const code = suite.finish();
  if (!code) console.log('geometry-test: OK');
  process.exitCode = code;
}

main();
