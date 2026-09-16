#!/usr/bin/env node
// 截交三视图「可见 / 不可见轮廓」等价性守护（开发者本机运行，只读，零第三方依赖）。
//
// 运行：node scripts/section-projection-check.cjs            （或 node scripts/run-all.js 统一运行）
//       node scripts/section-projection-check.cjs --quiet    只打印失败项与备注
//
// 背景：2026-09-15 的 F3 性能冻结给三视图遮挡测试加了「投影包围盒预筛」
//       （pages/index/solid-projection.js 的 buildViewTriangleIndex + isProjectionEdgeVisible，
//        见 docs/freeze-section-projection-2026-09-15.md）。该优化的前提是「绘制结果不变」，
//       本脚本就是这条前提的守护：把改动前的实现（提交 734feb9 · blob 4ffcfd8874）逐字内嵌为基准，
//       与当前实现比对每条棱的可见 / 隐藏分类。
//
// 检查项：
//   1. 预筛实现仍在（被删掉时脚本必须显式失败，而不是自己和自己比）
//   2. 切割模式 6 种立体 × 4 组截平面参数 × 3 个视图 × 2 种画布尺寸：可见棱与隐藏棱集合与基准实现一致
//   3. 预筛确实在生效：重心判定调用次数远低于基准实现（防止「等价但退化回慢实现」）
//
// 覆盖路径：`drawSectionProjectionOverlay` → `drawSolidProjection` → `getProjectionLineSets`。
//   该函数当前只被平面切割立体（F3）使用；基本立体（F4）走 basic-solid.js 自己的 edgeStyle，
//   不经过此处，因此本脚本不覆盖 F4（F4 由 geometry-test.js 与真机回归覆盖）。
//
// 边界（必须明确）：
//   1. 只加载首页 Page（Page / wx 用桩），不连网络、不写任何文件；
//   2. 只比对棱的可见性分类，不断言像素、颜色与线型（像素级比对见冻结记录 §3）；
//   3. 不是自动化测试框架，也不能替代真机回归（AGENTS.md C11）。

const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const VIEWS = ['front', 'top', 'left'];

// ---- 基准实现：改动前（提交 734feb9 · blob 4ffcfd8874）的 isProjectionEdgeVisible，逐字复制 ----
function baselineIsProjectionEdgeVisible(edge, triangles, viewType) {
  const projectedStart = this.projectPointToView(edge[0], viewType);
  const projectedEnd = this.projectPointToView(edge[1], viewType);
  const midpoint = {
    x: (projectedStart.x + projectedEnd.x) / 2,
    y: (projectedStart.y + projectedEnd.y) / 2
  };
  const edgeDepth = (this.getViewDepth(edge[0], viewType) + this.getViewDepth(edge[1], viewType)) / 2;
  let nearestDepth = -Infinity;
  triangles.forEach((triangle) => {
    const projected = triangle.map((vertex) => this.projectPointToView(vertex, viewType));
    const barycentric = this.getBarycentricCoordinates(midpoint, projected);
    if (!barycentric) return;
    const depth = barycentric[0] * this.getViewDepth(triangle[0], viewType)
      + barycentric[1] * this.getViewDepth(triangle[1], viewType)
      + barycentric[2] * this.getViewDepth(triangle[2], viewType);
    nearestDepth = Math.max(nearestDepth, depth);
  });
  return nearestDepth <= edgeDepth + 1e-4;
}

const SECTION_CASES = [
  { angle: 0, offset: 0 },
  { angle: 42, offset: -1.5 },
  { angle: 90, offset: 0 },
  { angle: 128, offset: 2 }
];

const SOLID_TYPES = ['sphere', 'torus', 'cylinder', 'cone', 'pentagonalPrism', 'triangularPyramid'];

const SIZES = [
  { name: '手机竖屏 375x640', width: 375, height: 640 },
  { name: '平板横屏 1053x445', width: 1053, height: 445 }
];

// 只关心分类、不关心像素时的空上下文
function createNullContext() {
  const noop = () => {};
  return {
    clearRect: noop, rect: noop, clip: noop, save: noop, restore: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, closePath: noop, fill: noop,
    stroke: noop, fillRect: noop, fillText: noop, setLineDash: noop, scale: noop
  };
}

// 真机上页面方法是否都挂上去了，只能在运行时看：这里用桩加载首页 Page 对象
function loadPageOptions() {
  const indexFile = path.join(ROOT, 'pages', 'index', 'index.js');
  const previousPage = global.Page;
  const previousWx = global.wx;
  let captured = null;
  global.Page = (options) => { captured = options; };
  global.wx = { cloud: undefined, getWindowInfo: () => ({ pixelRatio: 2 }), setNavigationBarTitle: () => {} };
  try {
    Object.keys(require.cache).forEach((key) => {
      if (key.indexOf(path.join(ROOT, 'pages', 'index')) === 0) delete require.cache[key];
    });
    require(indexFile);
  } finally {
    global.Page = previousPage;
    global.wx = previousWx;
  }
  return captured;
}

function createPage(options, width, height) {
  const page = {};
  Object.keys(options).forEach((key) => { page[key] = options[key]; });
  page.data = JSON.parse(JSON.stringify(options.data));
  page.canvasWidth = width;
  page.canvasHeight = height;
  page.context = createNullContext();
  page.data.mode = 'section';
  return page;
}

function edgeKey(edge) {
  const vertexKey = (vertex) => `${Math.round(vertex.x * 1e5)},${Math.round(vertex.y * 1e5)},${Math.round(vertex.z * 1e5)}`;
  return vertexKey(edge[0]) + '>' + vertexKey(edge[1]);
}

// 走页面自己的调用路径（getProjectionLineSets），只做棱分类的快照
function viewSignature(page, viewType) {
  const result = page.getSectionResult();
  result.retainedSolid.projectionLineSets = {};
  const sets = page.getProjectionLineSets(result.retainedSolid, viewType);
  return JSON.stringify({
    visible: sets.visible.map(edgeKey).sort(),
    hidden: sets.hidden.map(edgeKey).sort()
  });
}

function main() {
  const quiet = process.argv.includes('--quiet') || process.argv.includes('-q');
  const suite = createSuite('section-projection-check', { quiet });
  const options = loadPageOptions();

  suite.section('0. 预筛实现仍在（F3 性能冻结的一部分）');
  suite.check(typeof options.buildViewTriangleIndex === 'function',
    'pages/index/solid-projection.js 仍提供 buildViewTriangleIndex',
    '预筛若被删除，第 1 节会退化成「自己和自己比」，必须在这里显式失败');
  suite.check(typeof options.isProjectionEdgeVisible === 'function', 'isProjectionEdgeVisible 仍存在');

  suite.section('1. 切割模式：可见 / 隐藏棱集合与基准实现一致');
  SIZES.forEach((size) => {
    SOLID_TYPES.forEach((solidType) => {
      const page = createPage(options, size.width, size.height);
      page.data.section.solidType = solidType;
      let mismatched = '';
      SECTION_CASES.forEach((testCase, caseIndex) => {
        page.data.section.angle = testCase.angle;
        page.data.section.offset = testCase.offset;
        page.sectionResultCache = null;
        const current = VIEWS.map((view) => viewSignature(page, view));
        page.isProjectionEdgeVisible = baselineIsProjectionEdgeVisible;
        page.sectionResultCache = null;
        const baseline = VIEWS.map((view) => viewSignature(page, view));
        page.isProjectionEdgeVisible = options.isProjectionEdgeVisible;
        page.sectionResultCache = null;
        baseline.forEach((signature, viewIndex) => {
          if (signature !== current[viewIndex] && !mismatched) {
            mismatched = '第 ' + (caseIndex + 1) + ' 组参数（角度 ' + testCase.angle + '°、位置 '
              + testCase.offset + '）的 ' + VIEWS[viewIndex] + ' 视图不一致';
          }
        });
      });
      suite.check(!mismatched,
        size.name + ' · ' + solidType + '：' + SECTION_CASES.length + ' 组参数 × 3 视图分类一致',
        mismatched);
    });
  });

  suite.section('2. 预筛确实在生效（重心判定调用次数对比）');
  const page = createPage(options, 375, 640);
  page.data.section.solidType = 'sphere';
  page.data.section.angle = 55;
  page.data.section.offset = 0;
  VIEWS.forEach((view) => {
    page.sectionResultCache = null;
    const result = page.getSectionResult();
    const raw = page.getBarycentricCoordinates;
    result.retainedSolid.projectionLineSets = {};
    let currentCalls = 0;
    page.getBarycentricCoordinates = function counted(point, triangle) {
      currentCalls += 1;
      return raw.call(this, point, triangle);
    };
    page.getProjectionLineSets(result.retainedSolid, view);
    result.retainedSolid.projectionLineSets = {};
    page.isProjectionEdgeVisible = baselineIsProjectionEdgeVisible;
    let baselineCalls = 0;
    page.getBarycentricCoordinates = function countedBaseline(point, triangle) {
      baselineCalls += 1;
      return raw.call(this, point, triangle);
    };
    page.getProjectionLineSets(result.retainedSolid, view);
    page.getBarycentricCoordinates = raw;
    page.isProjectionEdgeVisible = options.isProjectionEdgeVisible;
    suite.check(currentCalls * 3 <= baselineCalls,
      '圆球 ' + view + ' 视图：重心判定 ' + currentCalls + ' 次（基准 ' + baselineCalls + ' 次，'
        + (baselineCalls / Math.max(1, currentCalls)).toFixed(1) + ' 倍）',
      '当前实现与基准实现调用次数过于接近，预筛可能已失效');
  });

  suite.note('本脚本只保证「改前 = 改后」；截交几何真值由 scripts/geometry-test.js 独立锁定。');
  suite.note('真机回归仍需人工执行（AGENTS.md C11）：连续拖角度 / 位置、六种立体、四条回归底线。');
  process.exitCode = suite.finish();
}

main();
