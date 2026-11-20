#!/usr/bin/env node
// 线面、面面平行：几何条件、静态 Canvas、课程路由和视频号按钮接线。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../pages/parallel-relations/parallel-relations-model.js');
const renderer = require('../pages/parallel-relations/parallel-relations-render.js');
const videoRefs = require('../pages/parallel-relations/parallel-relations-video.js');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function close(actual, expected, tolerance, message) {
  checks += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}`);
}

function makeCanvasContext(drawnText) {
  const noop = () => {};
  return {
    lineWidth: 1,
    save: noop,
    restore: noop,
    clearRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    fillRect: noop,
    stroke: noop,
    strokeRect: noop,
    arc: noop,
    setLineDash: noop,
    fillText(text) {
      drawnText.push(String(text));
    }
  };
}

function main() {
  const linePlane = model.buildLinePlaneScene();
  check(linePlane.checks.lineInPlane,
    '线面平行示意中的直线 l 位于平面 P 内');
  check(linePlane.checks.parallelDirections,
    '线面平行示意中的 a 与 l 方向平行');
  check(linePlane.checks.notParallelToPlaneEdge,
    '线面平行主图中的直线不与平面边平行');
  check(linePlane.checks.lineOutsidePlane,
    '线面平行示意中的直线 a 位于平面 P 外');
  close(model.signedPlaneDistance(linePlane.plane, linePlane.pointA),
    1.55, 1e-8, '点 A 到平面 P 的距离与模型一致');

  const planePlane = model.buildPlanePlaneScene();
  check(planePlane.checks.planeNormalsParallel,
    '面面平行示意中的两个平面法向量平行');
  check(planePlane.checks.firstPairParallel,
    '面面平行示意中的 a 与 a₁ 平行');
  check(planePlane.checks.secondPairParallel,
    '面面平行示意中的 b 与 b₁ 平行');
  check(planePlane.checks.internalLinesIntersect,
    '面面平行条件所取的两条直线在各自平面内相交');

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes(
    'pages/parallel-relations/parallel-relations'
  ), '线面、面面平行页面已注册');
  const catalog = require('../config/course-catalog.js');
  const catalogPoint = catalog.chapters[3].points.find(
    (point) => point.id === 'parallel-relations'
  );
  check(catalogPoint
    && catalogPoint.availability === 'available'
    && catalogPoint.route
    && catalogPoint.route.path === '/pages/parallel-relations/parallel-relations',
  '第四章平行知识点映射到独立图文页');

  const pageDir = path.join(ROOT, 'pages/parallel-relations');
  const wxml = fs.readFileSync(path.join(pageDir, 'parallel-relations.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(pageDir, 'parallel-relations.wxss'), 'utf8');
  const renderSource = fs.readFileSync(
    path.join(pageDir, 'parallel-relations-render.js'),
    'utf8'
  );
  check(wxml.includes('id="linePlaneCanvas"')
    && wxml.includes('id="planePlaneCanvas"'),
  '页面提供线面、面面两幅静态示意图');
  check(wxml.includes('平面外的一条直线与平面内的一条直线平行')
    && wxml.includes('一个平面内的两条相交直线分别平行于另一个平面'),
  '页面直接表达线面与面面平行的几何条件');
  check(wxml.includes('AB ∥ CD') && wxml.includes('AB ∥ EF')
    && wxml.includes('CD ∥ GH'),
    '页面用符号表达两组平行条件');
  check(wxml.includes('当平面为投影面的垂直面时，只要平面有积聚性的投影和直线的同面投影平行')
    && wxml.includes('或直线也为该投影面的垂线，则直线与平面必定平行。')
    && wxml.includes('若两投影面垂直面相互平行，则它们具有积聚性的那组投影必相互平行。'),
  '页面补充线面、面面的积聚性投影条件');
  check((wxml.match(/data-video-key=/g) || []).length === 2
    && wxml.includes('过平面外一点作一直线平行于给定平面')
    && wxml.includes('过平面外一点作一平面平行于给定平面'),
  '页面预留两个视频号按钮且名称完整');
  check(wxml.includes('bindtap="handleVideoTap"')
    && wxml.includes('class="video-button"'),
  '两个视频号入口使用同一真实点击处理');
  check(!wxml.includes('page-intro')
    && !wxml.includes('<scroll-view')
    && !wxml.includes('construction-box'),
  '页面删除顶部说明和作图提示并固定为单屏结构');
  check((wxml.match(/class="video-row"/g) || []).length === 2
    && wxss.includes('.video-row')
    && wxss.includes('width: 100%')
    && wxss.includes('min-width: 100%'),
  '两个视频号按钮各自占满一整行');
  check(wxss.includes('height: 100vh')
    && wxss.includes('overflow: hidden')
    && wxss.includes('flex: 1 1 0')
    && wxss.includes('min-height: 280rpx'),
  '页面压缩两幅图并在手机视口内禁止滚动');
  check(!fs.readFileSync(
    path.join(pageDir, 'parallel-relations-render.js'),
    'utf8'
  ).includes('rgba(249, 253, 255, 0.94)'),
  '图中文字标签不使用白色底框');
  check(!renderSource.includes('drawArrow(context')
    && !renderSource.includes('[4, 4]'),
  '主图线条不使用箭头或点下虚线');
  check(!renderSource.includes('drawPoint(context'),
  '直线端点不绘制小圆圈');
  check(renderSource.includes("'积聚性投影'")
    && renderSource.includes('linePlane')
    && renderSource.includes('planePlane'),
  '两幅主图均带独立的积聚性投影区域');
  check(!wxss.includes('[disabled]')
    && !wxss.includes('> view')
    && !wxss.includes('> text'),
  '静态页 WXSS 不含不支持的属性或标签选择器');

  check(videoRefs.lineThroughPoint.finderUserName === ''
    && videoRefs.lineThroughPoint.feedId === ''
    && videoRefs.planeThroughPoint.finderUserName === ''
    && videoRefs.planeThroughPoint.feedId === '',
  '视频号身份与内容 ID 集中保留为空配置');

  const lineText = [];
  const planeText = [];
  const lineContext = makeCanvasContext(lineText);
  const planeContext = makeCanvasContext(planeText);
  renderer.drawLinePlaneScene(lineContext, 360, 190, linePlane);
  renderer.drawPlanePlaneScene(planeContext, 700, 210, planePlane);
  check(lineText.includes('AB ∥ CD')
    && ['A', 'B', 'C', 'D'].every((label) => lineText.includes(label))
    && ['a(b)', 'c', 'd', 'e(f)', 'h(g)'].every((label) => (
      lineText.includes(label)
    )),
  '线面平行静态图绘制主关系及积聚性小图');
  check(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].every((label) => (
    planeText.includes(label)
  ))
    && planeText.includes('P') && planeText.includes('Q')
    && planeText.includes('P_H') && planeText.includes('Q_H'),
  '面面平行静态图在四组直线两端标注端点字母并绘制积聚性小图');
  check(renderSource.includes('left + width * 0.29')
    && renderSource.includes('const qStart = { x: left + width * 0.22')
    && renderSource.includes('const qEnd = { x: left + width * 0.42'),
  '右侧 Q 平面使用不等边三角形');

  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    delete require.cache[require.resolve(
      path.join(pageDir, 'parallel-relations.js')
    )];
    require(path.join(pageDir, 'parallel-relations.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '图文页通过 Page() 注册');
  const handlers = Array.from(
    wxml.matchAll(/bind(?:tap|change|touchstart|touchmove|touchend)="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  handlers.forEach((handler) => {
    check(typeof pageDefinition[handler] === 'function',
      `WXML 事件 ${handler} 有实现`);
  });

  const toastCalls = [];
  const channelCalls = [];
  const previousWx = global.wx;
  global.wx = {
    showToast(options) {
      toastCalls.push(options.title);
    },
    openChannelsActivity(options) {
      channelCalls.push(options);
    }
  };
  try {
    const page = Object.assign({}, pageDefinition, {
      data: JSON.parse(JSON.stringify(pageDefinition.data)),
      _interactionCount: 0
    });
    page.handleVideoTap({
      currentTarget: { dataset: { videoKey: 'lineThroughPoint' } }
    });
    check(toastCalls.includes('视频号内容待配置')
      && channelCalls.length === 0,
    '未配置视频号时只提示，不伪造播放');
    page.data.videoRefs.lineThroughPoint.finderUserName = 'test-finder';
    page.data.videoRefs.lineThroughPoint.feedId = 'test-feed';
    page.handleVideoTap({
      currentTarget: { dataset: { videoKey: 'lineThroughPoint' } }
    });
    check(channelCalls.length === 1
      && channelCalls[0].finderUserName === 'test-finder'
      && channelCalls[0].feedId === 'test-feed',
    '配置后通过 wx.openChannelsActivity 打开视频号内容');
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }

  console.log(`parallel-relations-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('parallel-relations-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
