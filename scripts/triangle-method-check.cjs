#!/usr/bin/env node
// 直角三角形法纯几何与路由接线检查，不依赖 wx / Canvas / 网络。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  computeLineMetrics,
  getProjectionTarget,
  projectionReflectsTrueLength,
  nearlyEqual
} = require('../pages/triangle-method/triangle-metrics.js');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function close(actual, expected, tolerance, message) {
  checks += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function makePageInstance(definition, metrics) {
  // 用最小 Page/setData/Canvas 桩执行真实页面方法，不模拟微信运行时。
  const data = JSON.parse(JSON.stringify(definition.data));
  const page = Object.assign({}, definition, {
    data,
    canvasWidth: 800,
    canvasHeight: 640,
    canvasDragging: false,
    _metrics: metrics,
    _target: null,
    _interactionCount: 0,
    setData(patch, callback) {
      Object.keys(patch || {}).forEach((key) => setPath(this.data, key, patch[key]));
      if (typeof callback === 'function') callback();
    },
    scheduleCanvasDraw() {},
    recordInteraction() {
      this._interactionCount += 1;
    }
  });
  return page;
}

function makeCanvasContext(drawnText, arcs, labels) {
  // 记录弧心与文字位置，足以验证关键标注意图；其余 Canvas 调用保持无副作用。
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    clearRect: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    fillRect: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc(x, y, radius) {
      if (arcs) arcs.push({ x, y, radius });
    },
    arcTo: noop,
    fillText(text, x, y) {
      if (drawnText) drawnText.push(String(text));
      if (labels) labels.push({ text: String(text), x, y });
    },
    setLineDash: noop,
    scale: noop
  };
}

function checkCompactLayout(page, width, height) {
  page.canvasWidth = width;
  page.canvasHeight = height;
  const layout = page.getLayout();
  if (!layout.split) {
    close(layout.topHeight, height * 0.4, 1e-8,
      `${width}x${height} 黑色空间区占画布高度 40%`);
  }
  const zEnd = page.projectIsometric({ x: 0, y: 0, z: 10 });
  const hBottom = page.projectIsometric({ x: 8.8, y: 8.8, z: 0 });
  close(zEnd.y, 2, 1e-8,
    `${width}x${height} Z 轴箭头顶在黑色区上边`);
  close(hBottom.y, layout.topHeight - 2, 1e-8,
    `${width}x${height} H 面最低角点贴住黑色区下边`);
  const sourcePoints = [
    page.data.line.a,
    page.data.line.b,
    { x: page.data.line.a.x, y: page.data.line.a.y, z: 0 },
    { x: page.data.line.b.x, y: page.data.line.b.y, z: 0 },
    { x: page.data.line.a.x, y: 0, z: page.data.line.a.z },
    { x: page.data.line.b.x, y: 0, z: page.data.line.b.z },
    { x: 0, y: page.data.line.a.y, z: page.data.line.a.z },
    { x: 0, y: page.data.line.b.y, z: page.data.line.b.z }
  ];
  sourcePoints.forEach((point, index) => {
    const screen = page.projectIsometric(point);
    check(screen.x >= 0 && screen.x <= layout.leftWidth
      && screen.y >= 0 && screen.y <= layout.topHeight,
    `${width}x${height} 空间点 ${index} 位于压缩画布内`);
  });
  [page.data.line.a, page.data.line.b].forEach((point, index) => {
    const views = page.getProjectionScreenPoints(point);
    Object.keys(views).forEach((viewType) => {
      const screen = views[viewType];
      check(screen.x >= layout.projectionLeft
        && screen.x <= layout.projectionLeft + layout.projectionWidth
        && screen.y >= layout.projectionTop
        && screen.y <= layout.projectionTop + layout.projectionHeight,
      `${width}x${height} ${viewType} 投影点 ${index} 位于压缩画布内`);
    });
  });
}

function main() {
  const a = { x: 2, y: 2, z: 6 };
  const b = { x: 6, y: 5, z: 2 };
  const metrics = computeLineMetrics(a, b);

  check(metrics.valid, '一般位置线段有效');
  check(metrics.kind === 'general', '一般位置直线分类');
  close(metrics.horizontalLength, 5, 1e-12, 'H 投影长度');
  close(metrics.frontLength, Math.sqrt(32), 1e-12, 'V 投影长度');
  close(metrics.profileLength, 5, 1e-12, 'W 投影长度');
  close(metrics.trueLength, Math.sqrt(41), 1e-12, '空间实长');
  close(metrics.alphaDegrees, 38.659808254090095, 1e-10, 'H 面倾角');
  close(metrics.betaDegrees, 27.938352729602354, 1e-10, 'V 面倾角');
  close(metrics.gammaDegrees, 38.659808254090095, 1e-10, 'W 面倾角');

  close(Math.hypot(metrics.horizontalLength, metrics.dz), metrics.trueLength, 1e-12, 'H 法实长恒等式');
  close(Math.hypot(metrics.frontLength, metrics.dy), metrics.trueLength, 1e-12, 'V 法实长恒等式');
  close(Math.hypot(metrics.profileLength, metrics.dx), metrics.trueLength, 1e-12, 'W 法实长恒等式');

  const reversed = computeLineMetrics(b, a);
  close(reversed.trueLength, metrics.trueLength, 1e-12, '交换端点后实长不变');
  close(reversed.alphaDegrees, metrics.alphaDegrees, 1e-12, '交换端点后 α 不变');
  close(reversed.betaDegrees, metrics.betaDegrees, 1e-12, '交换端点后 β 不变');
  close(reversed.gammaDegrees, metrics.gammaDegrees, 1e-12, '交换端点后 γ 不变');

  const hTarget = getProjectionTarget(metrics, 'H');
  const vTarget = getProjectionTarget(metrics, 'V');
  const wTarget = getProjectionTarget(metrics, 'W');
  check(getProjectionTarget(metrics, 'INVALID') === null, '未知投影面不静默回退到 W');
  check(hTarget.deltaAxis === 'z' && hTarget.orthogonalLength === 4, 'H 法使用 |Δz|');
  check(vTarget.deltaAxis === 'y' && vTarget.orthogonalLength === 3, 'V 法使用 |Δy|');
  check(wTarget.deltaAxis === 'x' && wTarget.orthogonalLength === 4, 'W 法使用 |Δx|');
  check(!projectionReflectsTrueLength(metrics, 'H'), '一般位置 H 投影不反映实长');
  check(!projectionReflectsTrueLength(metrics, 'V'), '一般位置 V 投影不反映实长');
  check(!projectionReflectsTrueLength(metrics, 'W'), '一般位置 W 投影不反映实长');

  const horizontal = computeLineMetrics({ x: 1, y: 2, z: 4 }, { x: 6, y: 6, z: 4 });
  check(horizontal.kind === 'horizontal', '水平线分类');
  close(horizontal.alphaDegrees, 0, 1e-12, '水平线对 H 面倾角为 0');
  check(projectionReflectsTrueLength(horizontal, 'H'), '水平线的 H 投影反映实长');

  const frontal = computeLineMetrics({ x: 1, y: 3, z: 2 }, { x: 6, y: 3, z: 6 });
  check(frontal.kind === 'frontal', '正平线分类');
  close(frontal.betaDegrees, 0, 1e-12, '正平线对 V 面倾角为 0');
  check(projectionReflectsTrueLength(frontal, 'V'), '正平线的 V 投影反映实长');

  const profile = computeLineMetrics({ x: 3, y: 2, z: 6 }, { x: 3, y: 6, z: 2 });
  check(profile.kind === 'profile', '侧平线分类');
  close(profile.gammaDegrees, 0, 1e-12, '侧平线对 W 面倾角为 0');
  check(projectionReflectsTrueLength(profile, 'W'), '侧平线的 W 投影反映实长');

  const verticalH = computeLineMetrics({ x: 4, y: 4, z: 1 }, { x: 4, y: 4, z: 7 });
  check(verticalH.kind === 'verticalH', '铅垂线分类');
  close(verticalH.horizontalLength, 0, 1e-12, '铅垂线 H 投影积聚为点');
  close(verticalH.alphaDegrees, 90, 1e-12, '铅垂线对 H 面倾角为 90°');

  const degenerate = computeLineMetrics({ x: 4, y: 4, z: 4 }, { x: 4, y: 4, z: 4 });
  check(!degenerate.valid && degenerate.error === 'DEGENERATE_LINE', '重合端点被判为退化');

  const invalid = computeLineMetrics({ x: Number.NaN, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  check(!invalid.valid && invalid.error === 'NON_FINITE_POINT', '非有限坐标被拒绝');

  check(nearlyEqual(6.4, 6.43, 0.05), '显示精度容差内接受结果');
  check(!nearlyEqual(6.3, 6.43, 0.05), '显示精度容差外拒绝结果');
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes('pages/triangle-method/triangle-method'),
    '新页面已注册到 app.json');
  check(!appJson.pages.some((page) => page === 'pages/index/triangle-method'),
    '未改变首页既有路由');

  const pageDir = path.join(ROOT, 'pages', 'triangle-method');
  const wxml = fs.readFileSync(path.join(pageDir, 'triangle-method.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(pageDir, 'triangle-method.wxss'), 'utf8');
  const renderSource = fs.readFileSync(path.join(pageDir, 'triangle-render.js'), 'utf8');
  check(!wxml.includes('lesson-toolbar'), '简化版已移除自定义顶部标题区');
  ['α', 'β', 'γ'].forEach((symbol) => {
    check(wxml.includes(`<text class="plane-symbol">${symbol}</text>`),
      `顶部仅显示方向符号 ${symbol}`);
  });
  ['水平面 H', '正平面 V', '侧平面 W'].forEach((visibleText) => {
    check(!wxml.includes(`<text>${visibleText}</text>`),
      `顶部不再显示 ${visibleText} 附加文字`);
  });
  check(wxss.includes('height: 30px;')
    && !wxss.includes('background: #dfe8f2;')
    && wxss.includes('height: 460px;')
    && wxss.includes('height: 420px;')
    && !wxss.includes('height: 700px;')
    && !wxss.includes('height: 560px;'),
  '页面使用单层紧凑按钮与压缩画布尺寸');
  check(renderSource.includes("label: 'Z', dx: 10, dy: 10"),
    'Z 轴标签位于轴线右侧');
  check(wxml.includes('直角三角形四要素'), '页面包含直角三角形四要素说明');
  check(!wxml.includes('knowledge-slots'), '页面已移除底部两栏知识点占位卡');
  check(wxml.includes('bindtouchstart="handleTouchStart"'), '三视图保留触摸拖动入口');
  check(wxml.includes('bindtouchmove="handleTouchMove"'), '三视图拖动时实时更新');
  check(wxml.includes('bindtap="handleReset"'), '页面提供与其它页面一致的顶部重置入口');
  ['G03 ·', 'coordinate-row', 'lineAText', 'lineBText', '后续知识点：直角投影定理', 'next-topic']
    .forEach((removedContent) => {
      check(!wxml.includes(removedContent), `摘要卡已移除 ${removedContent}`);
    });
  ['.eyebrow', '.coordinate-row', '.coordinate-chip', '.next-topic']
    .forEach((removedStyle) => {
      check(!wxss.includes(removedStyle), `摘要卡已移除空样式 ${removedStyle}`);
    });
  const handlerNames = Array.from(wxml.matchAll(/bind[a-z]+="([A-Za-z0-9_]+)"/g),
    (match) => match[1]);
  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    require(path.join(pageDir, 'triangle-method.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '新页面通过 Page() 注册');
  handlerNames.forEach((name) => {
    check(typeof pageDefinition[name] === 'function', `WXML 事件 ${name} 有同名页面方法`);
  });
  check(typeof pageDefinition.drawScene === 'function', '新页面提供独立 drawScene');
  check(typeof pageDefinition.initializeCanvas === 'function', '复用现有 Canvas 初始化');
  check(typeof pageDefinition.scheduleCanvasDraw === 'function', '复用现有重绘调度');
  check(typeof pageDefinition.drawIsometricPanel === 'function', '新页面提供绕 OZ 旋转的三维面板');
  const pageForAxes = makePageInstance(pageDefinition, metrics);
  checkCompactLayout(pageForAxes, 375, 460);
  checkCompactLayout(pageForAxes, 900, 420);
  const axisOrigin = pageForAxes.projectIsometric({ x: 0, y: 0, z: 0 });
  const axisX = pageForAxes.projectIsometric({ x: 1, y: 0, z: 0 });
  const axisY = pageForAxes.projectIsometric({ x: 0, y: 1, z: 0 });
  const xAngle = Math.atan2(axisX.y - axisOrigin.y, axisX.x - axisOrigin.x);
  const yAngle = Math.atan2(axisY.y - axisOrigin.y, axisY.x - axisOrigin.x);
  check(Math.abs(xAngle - yAngle) > Math.PI / 6, '三维坐标系采用非对称斜二等轴测姿态');

  const page = makePageInstance(pageDefinition, metrics);
  page.updateMetrics('H', false);
  check(page.data.selectedPlane === 'H', '默认显示与 H 面夹角 α');
  check(page.data.targetView.projection === 'H', '默认目标为水平投影');
  check(page.data.targetView.deltaLabel === '|Δz|', 'H 面投影三角形使用 |Δz|');
  check(page.data.targetView.baseLineLabel === 'ab', 'H 法底边平行于水平投影 ab');
  check(page.data.targetView.deltaAxisLabel === 'OZ', 'H 法坐标差平行于 OZ');
  close(page._target.angleDegrees, metrics.alphaDegrees, 1e-12, '默认 α 内部角度正确但不展示数值');
  page.selectPlane({ currentTarget: { dataset: { plane: 'V' } } });
  check(page.data.selectedPlane === 'V' && page.data.targetView.projection === 'V', '可切换到正平面夹角 β');
  check(page.data.targetView.deltaLabel === '|Δy|', 'V 面投影三角形使用 |Δy|');
  check(page.data.targetView.deltaAxisLabel === 'OY', 'V 法坐标差平行于 OY');
  page.selectPlane({ currentTarget: { dataset: { plane: 'W' } } });
  check(page.data.selectedPlane === 'W' && page.data.targetView.projection === 'W', '可切换到侧平面夹角 γ');
  check(page.data.targetView.deltaLabel === '|Δx|', 'W 面投影三角形使用 |Δx|');
  check(page.data.targetView.deltaAxisLabel === 'OX', 'W 法坐标差平行于 OX');
  page.selectPlane({ currentTarget: { dataset: { plane: 'H' } } });
  check(page.data.selectedPlane === 'H', '可以重新切回 H 面');

  const dragPoint = page.getProjectionScreenPoints(page.data.line.a).front;
  const beforeDragX = page.data.line.a.x;
  page.handleTouchStart({ touches: [{ x: dragPoint.x, y: dragPoint.y }] });
  check(page.data.canvasDragging === true, '触摸三视图端点后进入拖动状态');
  check(page.draggingLineProjection && page.draggingLineProjection.endpointKey === 'a',
    '命中直线端点 A 并记录拖动主体');
  page.handleTouchMove({ touches: [{ x: dragPoint.x - 18, y: dragPoint.y + 12 }] });
  check(page.data.line.a.x !== beforeDragX, '拖动后直线端点坐标发生变化');
  page.handleTouchEnd();
  check(page.data.canvasDragging === false, '松手后解除页面滚动锁');
  check(page.draggingLineProjection === null, '松手后清理拖动主体');

  const hiddenDragPoint = page.getProjectionScreenPoints(page.data.line.a).front;
  page.handleTouchStart({ touches: [{ x: hiddenDragPoint.x, y: hiddenDragPoint.y }] });
  check(page.data.canvasDragging === true && page.draggingLineProjection !== null,
    '隐藏页面前重新进入有效拖动状态');
  page.handleTouchMove({
    touches: [{ x: hiddenDragPoint.x - 12, y: hiddenDragPoint.y + 10 }]
  });
  page.onHide();
  check(page.data.canvasDragging === false && page.draggingLineProjection === null,
    '页面隐藏时清理拖动锁和拖动主体');
  check(!Object.prototype.hasOwnProperty.call(page.data, 'lineAText')
    && !Object.prototype.hasOwnProperty.call(page.data, 'lineBText')
    && !Object.prototype.hasOwnProperty.call(page.data, 'lineKindText'),
  '页面不再维护已删除的线型和坐标展示字段');

  page.selectPlane({ currentTarget: { dataset: { plane: 'W' } } });
  page.handleReset();
  check(page.data.line.a.x === 2 && page.data.line.a.y === 2 && page.data.line.a.z === 6,
    '重置恢复默认端点 A');
  check(page.data.line.b.x === 6 && page.data.line.b.y === 5 && page.data.line.b.z === 2,
    '重置恢复默认端点 B');
  check(page.data.lineType === 'general', '重置恢复一般位置直线');
  check(page.data.selectedPlane === 'H' && page.data.targetView.projection === 'H',
    '重置回到默认 H 面观察状态');
  check(page.data.canvasDragging === false
    && page.draggingProjection === null
    && page.draggingLineProjection === null
    && page.draggingPlaneProjection === null,
  '重置清除拖动锁和拖动主体');

  const renderPage = makePageInstance(pageDefinition, metrics);
  const drawnText = [];
  const arcs = [];
  const labels = [];
  renderPage.context = makeCanvasContext(drawnText, arcs, labels);
  renderPage.updateMetrics('H', false);
  let renderError = null;
  try {
    renderPage.drawScene();
    renderPage.canvasWidth = 375;
    renderPage.canvasHeight = 667;
    renderPage.drawScene();
  } catch (error) {
    renderError = error;
  }
  check(!renderError, '横屏/竖屏 Canvas 绘制路径不抛错');
  check(drawnText.includes('空间直线及投影'), '三维区沿用首页直线模式画布');
  ['V 面', 'W 面', 'H 面'].forEach((text) => {
    check(labels.some((label) => label.text === text), `三维区绘制投影面角标 ${text}`);
  });
  const spatialPoints = [
    renderPage.projectIsometric(renderPage.data.line.a),
    renderPage.projectIsometric(renderPage.data.line.b),
    renderPage.projectIsometric({ x: 2, y: 2, z: 0 }),
    renderPage.projectIsometric({ x: 6, y: 5, z: 0 }),
    renderPage.projectIsometric({ x: 2, y: 0, z: 6 }),
    renderPage.projectIsometric({ x: 6, y: 0, z: 2 }),
    renderPage.projectIsometric({ x: 0, y: 2, z: 6 }),
    renderPage.projectIsometric({ x: 0, y: 5, z: 2 })
  ];
  ['V 面', 'W 面', 'H 面'].forEach((text) => {
    const label = labels.find((item) => item.text === text);
    const nearest = Math.min(...spatialPoints.map(
      (point) => Math.hypot(label.x - point.x, label.y - point.y)
    ));
    check(nearest > 12, `${text} 角标避开三维端点与投影点`);
  });
  check(drawnText.includes('L'), '空间直角三角形高亮实长 L');
  check(drawnText.includes('|Δz|'), 'H 面绘制金色坐标差 |Δz|');
  check(drawnText.includes('α'), 'H 面绘制倾角 α');
  const bScreen = renderPage.projectIsometric(renderPage.data.line.b);
  check(arcs.some((arc) => arc.radius === 30
    && Math.abs(arc.x - bScreen.x) < 1e-8
    && Math.abs(arc.y - bScreen.y) < 1e-8), 'H 面 α 弧以 B 为顶点');
  check(drawnText.includes('Δz'), 'H 面在 q-A 竖直边标注 Δz');

  const verticalMetrics = computeLineMetrics(
    { x: 4, y: 4, z: 1 },
    { x: 4, y: 4, z: 7 }
  );
  const degenerateRenderPage = makePageInstance(pageDefinition, verticalMetrics);
  degenerateRenderPage.context = makeCanvasContext([], []);
  degenerateRenderPage.updateMetrics('H', false);
  let degenerateRenderError = null;
  try {
    degenerateRenderPage.drawScene();
  } catch (error) {
    degenerateRenderError = error;
  }
  check(!degenerateRenderError, 'H 投影积聚为点时 Canvas 绘制不抛错');

  renderPage.updateMetrics('W', false);
  drawnText.length = 0;
  try {
    renderPage.drawScene();
  } catch (error) {
    renderError = error;
  }
  check(!renderError, '切换到 W 面后 Canvas 绘制路径不抛错');
  check(drawnText.includes('|Δx|'), 'W 面绘制金色坐标差 |Δx|');
  check(drawnText.includes('γ'), 'W 面绘制倾角 γ');

  console.log(`triangle-method-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('triangle-method-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
