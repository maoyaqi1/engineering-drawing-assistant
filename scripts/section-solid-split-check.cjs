#!/usr/bin/env node
// 平面与立体相交拆分检查：第六章入口、页面类型范围、共享几何接线、
// 三视图等价性和学习会话边界。

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

function setDataPath(target, key, value) {
  const parts = key.split('.');
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function makePage(definition) {
  return Object.assign({}, definition, {
    data: clone(definition.data),
    setData(patch, callback) {
      Object.keys(patch).forEach((key) => {
        setDataPath(this.data, key, patch[key]);
      });
      if (typeof callback === 'function') callback();
    },
    drawScene() {},
    recordInteraction() {}
  });
}

function main() {
  const appJson = JSON.parse(read('app.json'));
  const expectedPages = [
    'pages/plane-solid-intersection/plane-solid-intersection',
    'pages/curved-solid-intersection/curved-solid-intersection'
  ];
  expectedPages.forEach((page) => {
    check(appJson.pages.includes(page), '页面已注册：' + page);
    ['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
      check(fs.existsSync(path.join(ROOT, page + extension)),
        '页面文件存在：' + page + extension);
    });
  });

  const catalog = require('../config/course-catalog.js');
  const chapter = catalog.chapters[5];
  check(chapter.points.map((point) => point.title).join(',')
    === '直线与立体相交,平面与平面立体相交,平面与曲面立体相交',
  '第六章只保留直线与立体相交、平面与平面立体相交、平面与曲面立体相交');
  check(!chapter.points.some((point) => point.id === 'section-line-method'),
    '旧“截交线”知识点已删除');
  check(!chapter.points.some((point) => point.title === '平面与立体相交'),
    '旧“平面与立体相交”页面入口已删除');
  const linePoint = chapter.points.find((point) => point.id === 'line-solid-intersection');
  const planePoint = chapter.points.find((point) => point.id === 'plane-solid-intersection');
  const curvedPoint = chapter.points.find((point) => point.id === 'curved-solid-intersection');
  check(linePoint && linePoint.availability === 'planned' && !linePoint.route,
    '直线与立体相交保留待开放状态');
  check(planePoint && planePoint.availability === 'available'
    && planePoint.route.path
      === '/pages/plane-solid-intersection/plane-solid-intersection'
    && planePoint.route.kind === 'page',
  '平面与平面立体相交使用独立页面');
  check(curvedPoint && curvedPoint.availability === 'available'
    && curvedPoint.route.path
      === '/pages/curved-solid-intersection/curved-solid-intersection'
    && curvedPoint.route.kind === 'page',
  '平面与曲面立体相交使用独立页面');

  const sharedView = read('pages/index/section-solid-view.wxml');
  const sharedPageSource = read('pages/index/section-solid-page.js');
  check(sharedView.includes('id="geometryCanvas"')
    && sharedView.includes('bindtap="handleSectionSolidType"')
    && sharedView.includes('bindtap="handleSectionPlaneType"')
    && sharedView.includes('bindchange="handleSectionSlider"')
    && sharedView.includes('wx:if="{{sectionSupportsSides}}"')
    && sharedView.includes('bindtap="handleSectionSidesStep"')
    && sharedView.includes('bindtap="resetPoint"'),
  '共享视图保留棱数、截平面、三视图和重置控件');
  check(!sharedView.includes('class="ai-fab"')
    && !sharedView.includes('/pages/home/home'),
  '拆分页不显示首页和 AI 教师入口');
  check(sharedPageSource.includes("require('./render-scene.js')")
    && sharedPageSource.includes("require('./section-math.js')")
    && sharedPageSource.includes("require('./section-render.js')")
    && sharedPageSource.includes("require('./solid-projection.js')")
    && !sharedPageSource.includes('function createSolid(')
    && !sharedPageSource.includes('function intersectSolid('),
  '拆分页复用原截交、绘制、三视图和交互模块，不复制几何算法');
  check(sharedPageSource.includes("learningChapterName: config.learningChapterName")
    && read('pages/index/session.js').includes(
      "section: this.data.learningChapterName || '平面切割立体'"
    ),
  '拆分页与会话模块预留独立章节名称');

  const pageWxml = [
    'pages/plane-solid-intersection/plane-solid-intersection.wxml',
    'pages/curved-solid-intersection/curved-solid-intersection.wxml'
  ];
  pageWxml.forEach((relativePath) => {
    check(read(relativePath).includes(
      '<include src="../index/section-solid-view.wxml" />'
    ), '页面使用共享相交视图：' + relativePath);
  });
  [
    'pages/plane-solid-intersection/plane-solid-intersection.wxss',
    'pages/curved-solid-intersection/curved-solid-intersection.wxss'
  ].forEach((relativePath) => {
    check(read(relativePath).includes('@import "../index/index.wxss";')
      && read(relativePath).includes('@import "../index/section-solid-split.wxss";'),
    '页面复用原截交布局样式：' + relativePath);
  });

  global.wx = {
    setNavigationBarTitle() {},
    getWindowInfo: () => ({ pixelRatio: 2 }),
    cloud: undefined
  };
  global.getApp = () => ({
    globalData: { user: { openid: 'section-test', student_id: '20260001' } }
  });
  const planeDefinition = loadPage(
    'pages/plane-solid-intersection/plane-solid-intersection.js'
  );
  const curvedDefinition = loadPage(
    'pages/curved-solid-intersection/curved-solid-intersection.js'
  );
  const indexDefinition = loadPage('pages/index/index.js');
  check(!!planeDefinition && !!curvedDefinition,
    '两个独立相交页面均可注册 Page 对象');
  check(planeDefinition.data.section.solidType === 'prism'
    && planeDefinition.data.section.sides === 5
    && planeDefinition.data.sectionSupportsSides
    && JSON.stringify(planeDefinition.data.sectionSolidTypes.map((item) => item.key))
      === JSON.stringify(['prism', 'pyramid'])
    && JSON.stringify(planeDefinition.data.sectionSolidTypes.map((item) => item.label))
      === JSON.stringify(['棱柱', '棱锥']),
  '平面立体相交页只包含棱柱、棱锥，默认五棱柱并显示棱数选择');
  check(curvedDefinition.data.section.solidType === 'cylinder'
    && !curvedDefinition.data.sectionSupportsSides
    && JSON.stringify(curvedDefinition.data.sectionSolidTypes.map((item) => item.key))
      === JSON.stringify(['cylinder', 'cone', 'sphere', 'torus'])
    && JSON.stringify(curvedDefinition.data.sectionSolidTypes.map((item) => item.label))
      === JSON.stringify(['圆柱', '圆锥', '圆球', '圆环']),
  '曲面立体相交页只包含圆柱、圆锥、圆球、圆环且默认圆柱');
  check(planeDefinition.data.pageTitle === '平面与平面立体相交'
    && curvedDefinition.data.pageTitle === '平面与曲面立体相交',
  '两个页面的教学标题正确');

  const planePage = makePage(planeDefinition);
  planePage.handleSectionSolidType({
    currentTarget: { dataset: { type: 'pyramid' } }
  });
  check(planePage.data.section.solidType === 'pyramid',
    '平面立体相交页可切换到棱锥');
  planePage.handleSectionSolidType({
    currentTarget: { dataset: { type: 'sphere' } }
  });
  check(planePage.data.section.solidType === 'pyramid',
    '平面立体相交页忽略曲面立体类型');
  planePage.handleSectionSidesStep({
    currentTarget: { dataset: { delta: '1' } }
  });
  check(planePage.data.section.sides === 6,
    '棱数步进器可增加棱数');
  planePage.handleSectionSidesStep({
    currentTarget: { dataset: { delta: '3' } }
  });
  check(planePage.data.section.sides === 8,
    '棱数步进器限制最大 8 棱');
  planePage.handleSectionSidesStep({
    currentTarget: { dataset: { delta: '-10' } }
  });
  check(planePage.data.section.sides === 3,
    '棱数步进器限制最小 3 棱');
  planePage.handleSectionSidesStep({
    currentTarget: { dataset: { delta: '5' } }
  });
  planePage.handleSectionPlaneType({
    currentTarget: { dataset: { type: 'profile' } }
  });
  check(planePage.data.section.planeType === 'profile'
    && planePage.data.section.angle === 90,
  '平面立体相交页可切换侧平面');
  planePage.resetPoint();
  check(planePage.data.section.solidType === 'pyramid'
    && planePage.data.section.sides === 8
    && planePage.data.section.planeType === 'frontProjecting'
    && planePage.data.section.angle === 42,
  '重置只恢复截平面参数，不切换当前立体的类型和棱数');

  const curvedPage = makePage(curvedDefinition);
  curvedPage.handleSectionSolidType({
    currentTarget: { dataset: { type: 'torus' } }
  });
  check(curvedPage.data.section.solidType === 'torus',
    '曲面立体相交页可切换到圆环');
  curvedPage.handleSectionSolidType({
    currentTarget: { dataset: { type: 'triangularPyramid' } }
  });
  check(curvedPage.data.section.solidType === 'torus',
    '曲面立体相交页忽略平面立体类型');
  curvedPage.handleSectionSidesStep({
    currentTarget: { dataset: { delta: '1' } }
  });
  check(curvedPage.data.section.sides === 5,
    '曲面立体相交页忽略棱数步进');

  const cachePage = makePage(planeDefinition);
  cachePage.data.section.solidType = 'prism';
  cachePage.data.section.sides = 3;
  cachePage.data.section.angle = 42;
  cachePage.data.section.offset = 0;
  const threeSided = cachePage.getSectionResult();
  cachePage.data.section.sides = 8;
  const eightSided = cachePage.getSectionResult();
  check(threeSided.solid.sides === 3 && eightSided.solid.sides === 8,
    '棱数变化触发新的截面几何缓存');

  const layoutCases = [
    { width: 360.4, height: 540 },
    { width: 1000, height: 500 }
  ];
  layoutCases.forEach((size) => {
    const indexPage = makePage(indexDefinition);
    indexPage.data.mode = 'section';
    indexPage.canvasWidth = size.width;
    indexPage.canvasHeight = size.height;
    const baselineLayout = JSON.stringify(indexPage.getLayout());
    const baselineMetrics = JSON.stringify(indexPage.getProjectionMetrics());
    [planePage, curvedPage].forEach((page) => {
      page.canvasWidth = size.width;
      page.canvasHeight = size.height;
      check(JSON.stringify(page.getLayout()) === baselineLayout,
        `新相交页布局与原 section 模式一致：${size.width}×${size.height}`);
      check(JSON.stringify(page.getProjectionMetrics()) === baselineMetrics,
        `新相交页投影度量与原 section 模式一致：${size.width}×${size.height}`);
    });
  });

  const geometryCases = [
    { planeType: 'horizontal', angle: 0, offset: 0 },
    { planeType: 'frontProjecting', angle: 42, offset: -1.5 },
    { planeType: 'profile', angle: 90, offset: 2 }
  ];
  const typeCases = [
    [planePage, ['prism', 'pyramid'], [3, 5, 8]],
    [curvedPage, ['cylinder', 'cone', 'sphere', 'torus']]
  ];
  typeCases.forEach(([page, solidTypes, sidesCases]) => {
    solidTypes.forEach((solidType) => {
      geometryCases.forEach((testCase) => {
        const sidesList = sidesCases || [5];
        sidesList.forEach((sides) => {
          const indexPage = makePage(indexDefinition);
          indexPage.canvasWidth = 375;
          indexPage.canvasHeight = 640;
          indexPage.data.mode = 'section';
          indexPage.data.section.solidType = solidType;
          indexPage.data.section.sides = sides;
          indexPage.data.section.planeType = testCase.planeType;
          indexPage.data.section.angle = testCase.angle;
          indexPage.data.section.offset = testCase.offset;
          page.canvasWidth = 375;
          page.canvasHeight = 640;
          page.data.section.solidType = solidType;
          page.data.section.sides = sides;
          page.data.section.planeType = testCase.planeType;
          page.data.section.angle = testCase.angle;
          page.data.section.offset = testCase.offset;
          page.sectionResultCache = null;
          indexPage.sectionResultCache = null;
          const actual = page.getSectionResult();
          const baseline = indexPage.getSectionResult();
          check(JSON.stringify(actual.sectionSegments)
            === JSON.stringify(baseline.sectionSegments),
          `${solidType}/${sides}棱/${testCase.planeType} 截交线与原 section 模式一致`);
          check(JSON.stringify(actual.sectionCapTriangles)
            === JSON.stringify(baseline.sectionCapTriangles),
          `${solidType}/${sides}棱/${testCase.planeType} 截面封盖与原 section 模式一致`);
        });
      });
    });
  });

  const sharedHandlers = Array.from(
    sharedView.matchAll(/\b(?:bind|catch)[a-z]*="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  sharedHandlers.forEach((handler) => {
    check(typeof planeDefinition[handler] === 'function'
      && typeof curvedDefinition[handler] === 'function',
    `共享视图事件 ${handler} 在两个页面均有实现`);
  });

  console.log(`section-solid-split-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('section-solid-split-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
