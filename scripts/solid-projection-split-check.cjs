#!/usr/bin/env node
// 基本立体拆分检查：课程入口、页面类型范围、共享几何接线和 AI 入口边界。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadPage(relativePath) {
  let definition = null;
  const previousPage = global.Page;
  global.Page = (page) => { definition = page; };
  try {
    const absolute = path.join(ROOT, relativePath);
    delete require.cache[require.resolve(absolute)];
    require(absolute);
  } finally {
    global.Page = previousPage;
  }
  return definition;
}

function makePage(definition) {
  return Object.assign({}, definition, {
    data: clone(definition.data),
    setData(patch, callback) {
      Object.keys(patch).forEach((key) => {
        this.data[key] = patch[key];
      });
      if (typeof callback === 'function') callback();
    },
    drawScene() {},
    recordInteraction() {}
  });
}

function main() {
  const appJson = JSON.parse(read('app.json'));
  [
    'pages/plane-solid-projection/plane-solid-projection',
    'pages/curved-solid-projection/curved-solid-projection'
  ].forEach((page) => {
    check(appJson.pages.includes(page), '页面已注册：' + page);
  });

  const catalog = require('../config/course-catalog.js');
  const chapter = catalog.chapters[4];
  check(chapter.points.map((point) => point.title).join(',')
    === '平面立体的投影,曲面立体的投影',
  '第五章删除基本立体介绍，只保留平面和曲面立体投影');
  check(!chapter.points.some((point) => point.id === 'solid-projection'),
    '旧“基本立体的介绍”知识点已删除');
  const planePoint = chapter.points.find((point) => point.id === 'polyhedron-projection');
  const curvedPoint = chapter.points.find((point) => point.id === 'curved-solid-projection');
  check(planePoint.route.path
    === '/pages/plane-solid-projection/plane-solid-projection'
    && planePoint.route.kind === 'page',
  '平面立体投影使用独立页面');
  check(curvedPoint.route.path
    === '/pages/curved-solid-projection/curved-solid-projection'
    && curvedPoint.route.kind === 'page',
  '曲面立体投影使用独立页面');

  const sharedView = read('pages/index/solid-projection-view.wxml');
  const sharedPageSource = read('pages/index/solid-projection-page.js');
  check(sharedView.includes('id="geometryCanvas"')
    && sharedView.includes('wx:if="{{showAi && canUseAi}}"')
    && sharedView.includes('bindtap="handleBasicSolidType"')
    && sharedView.includes('bindchange="handleSizeSlider"')
    && sharedView.includes('bindtap="handlePoseTab"')
    && sharedView.includes('bindtap="resetPoint"'),
  '共享视图保留原基本立体的参数、姿态、三视图和重置控件');
  check(!sharedView.includes('buildPrism')
    && sharedPageSource.includes("require('./render-scene.js')")
    && sharedPageSource.includes("require('./ui-handlers.js')")
    && sharedPageSource.includes("require('./projection.js')")
    && !sharedPageSource.includes('function buildPrism'),
  '独立页面复用原几何与三视图模块，不复制几何算法');
  check(sharedView.includes('class="plane-first-row"')
    && sharedView.includes('class="solid-type-tabs plane-type-tabs"')
    && sharedView.includes('class="slider-row plane-sides-row"')
    && sharedView.includes('class="solid-size-row plane-dimension-row"')
    && sharedView.includes('solid-pose-compact')
    && sharedView.includes('class="axis-selector"')
    && !sharedView.includes('class="ghost-button home-entry"')
    && !sharedView.includes('url="/pages/home/home"'),
  '平面立体参数区包含三行专用布局');
  const firstRowIndex = sharedView.indexOf('class="plane-first-row"');
  const dimensionRowIndex = sharedView.indexOf('class="solid-size-row plane-dimension-row"');
  const poseRowIndex = sharedView.indexOf('solid-pose-compact');
  check(firstRowIndex >= 0 && firstRowIndex < dimensionRowIndex
    && dimensionRowIndex < poseRowIndex,
  '平面立体行顺序为类型/棱数、半径/高度、旋转平移');

  [
    'pages/plane-solid-projection/plane-solid-projection.wxml',
    'pages/curved-solid-projection/curved-solid-projection.wxml'
  ].forEach((relativePath) => {
    check(read(relativePath).indexOf(
      '<include src="../index/solid-projection-view.wxml" />'
    ) >= 0, '页面使用共享立体视图：' + relativePath);
  });
  [
    'pages/plane-solid-projection/plane-solid-projection.wxss',
    'pages/curved-solid-projection/curved-solid-projection.wxss'
  ].forEach((relativePath) => {
    check(read(relativePath).indexOf('@import "../index/index.wxss";') >= 0,
      '页面复用原立体布局样式：' + relativePath);
  });

  global.wx = {
    setNavigationBarTitle() {},
    cloud: {
      callFunction() {
        return Promise.resolve({ result: { ok: true } });
      }
    }
  };
  const planeDefinition = loadPage(
    'pages/plane-solid-projection/plane-solid-projection.js'
  );
  const curvedDefinition = loadPage(
    'pages/curved-solid-projection/curved-solid-projection.js'
  );
  const indexDefinition = loadPage('pages/index/index.js');
  check(!!planeDefinition && !!curvedDefinition,
    '两个独立立体页面均可注册 Page 对象');
  check(JSON.stringify(planeDefinition.data.solidTypes)
    === JSON.stringify(['棱柱', '棱锥'])
    && planeDefinition.data.solid.type === 'prism'
    && planeDefinition.data.layoutMode === 'plane',
  '平面立体页只包含棱柱、棱锥且默认棱柱');
  check(JSON.stringify(curvedDefinition.data.solidTypes)
    === JSON.stringify(['圆柱', '圆锥', '圆球', '圆环'])
    && curvedDefinition.data.solid.type === 'cylinder'
    && curvedDefinition.data.layoutMode === 'default',
  '曲面立体页只包含圆柱、圆锥、圆球、圆环且默认圆柱');
  check(planeDefinition.data.showAi
    && planeDefinition.data.aiEntryEnabled
    && !curvedDefinition.data.showAi
    && !curvedDefinition.data.aiEntryEnabled,
  'AI 入口只对平面立体页面启用');
  check(!read('pages/index/index.wxml').includes('class="ai-fab"'),
    '旧首页基本立体兼容深链不再显示 AI 入口');
  const planeWxss = read(
    'pages/plane-solid-projection/plane-solid-projection.wxss'
  );
  const curvedWxss = read(
    'pages/curved-solid-projection/curved-solid-projection.wxss'
  );
  const sharedPoseWxss = read('pages/index/solid-pose-compact.wxss');
  check(planeWxss.includes('.plane-solid-layout .plane-first-row')
    && planeWxss.includes('grid-template-columns: 180rpx minmax(0, 1fr)')
    && planeWxss.includes('width: 180rpx')
    && planeWxss.includes('margin-left: 24rpx')
    && planeWxss.includes('.plane-solid-layout .plane-dimension-row')
    && planeWxss.includes('flex-wrap: nowrap')
    && planeWxss.includes('.plane-solid-layout .plane-dimension-row > .slider-row')
    && planeWxss.includes('@import "../index/solid-pose-compact.wxss"')
    && curvedWxss.includes('@import "../index/solid-pose-compact.wxss"')
    && sharedPoseWxss.includes('.solid-pose-compact .axis-selector')
    && sharedPoseWxss.includes('position: relative')
    && sharedPoseWxss.includes('axis-chip:nth-child(3)')
    && sharedPoseWxss.includes('left: calc(50% - 64rpx)')
    && sharedPoseWxss.includes('left: calc(50% + 24rpx)'),
  '平面页配置紧凑首行和加长滑轨，平面/曲面页共享以 Y 为中轴的姿态行');
  const sharedHandlers = Array.from(
    sharedView.matchAll(/\b(?:bind|catch)[a-z]*="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  sharedHandlers.forEach((handler) => {
    check(typeof planeDefinition[handler] === 'function'
      && typeof curvedDefinition[handler] === 'function',
    `共享视图事件 ${handler} 在两个页面均有实现`);
  });

  const planePage = makePage(planeDefinition);
  planePage.handleBasicSolidType({ currentTarget: { dataset: { type: '1' } } });
  check(planePage.data.solid.type === 'pyramid'
    && planePage.data.solidTypeIndex === 1,
  '平面立体页可切换到棱锥');
  planePage.handleBasicSolidType({ currentTarget: { dataset: { type: '2' } } });
  check(planePage.data.solid.type === 'pyramid',
    '平面立体页忽略超出范围的曲面类型索引');

  const curvedPage = makePage(curvedDefinition);
  curvedPage.handleBasicSolidType({ currentTarget: { dataset: { type: '3' } } });
  check(curvedPage.data.solid.type === 'torus'
    && curvedPage.data.solidTypeIndex === 3,
  '曲面立体页可切换到圆环');
  curvedPage.handleReset();
  check(curvedPage.data.solid.type === 'torus'
    && curvedPage.data.solidTypeIndex === 3,
  '曲面立体页重置保持当前圆环类型');
  check(curvedPage.data.solid.majorRadius === 2
    && curvedPage.data.solid.minorRadius === 0.8,
  '圆环重置参数与原基本立体模块一致');

  const layoutCases = [
    { width: 360.4, height: 540 },
    { width: 1000, height: 500 }
  ];
  layoutCases.forEach((size) => {
    const indexPage = makePage(indexDefinition);
    indexPage.data.mode = 'solid';
    indexPage.canvasWidth = size.width;
    indexPage.canvasHeight = size.height;
    const baselineLayout = JSON.stringify(indexPage.getLayout());
    const baselineMetrics = JSON.stringify(indexPage.getProjectionMetrics());
    [planePage, curvedPage].forEach((page) => {
      page.canvasWidth = size.width;
      page.canvasHeight = size.height;
      check(JSON.stringify(page.getLayout()) === baselineLayout,
        `新立体页布局与原 solid 模式一致：${size.width}×${size.height}`);
      check(JSON.stringify(page.getProjectionMetrics()) === baselineMetrics,
        `新立体页投影度量与原 solid 模式一致：${size.width}×${size.height}`);
    });
  });

  const navigations = [];
  global.wx.navigateTo = ({ url }) => navigations.push(url);
  planePage.data.canUseAi = true;
  planePage.goToAi();
  check(navigations.includes('/pages/ai/ai'),
    '平面立体页准入后保留 AI 教师入口');
  navigations.length = 0;
  curvedPage.data.canUseAi = true;
  curvedPage.goToAi();
  check(navigations.length === 0,
    '曲面立体页即使误置准入状态也不跳转 AI 教师');

  console.log(`solid-projection-split-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('solid-projection-split-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
