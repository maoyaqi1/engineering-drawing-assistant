#!/usr/bin/env node
// 线面、面面垂直：参考图资产、条件文本、课程路由和视频号按钮接线。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function readPng(relativePath) {
  const image = fs.readFileSync(path.join(ROOT, relativePath));
  return {
    image,
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
    isPng: image.slice(0, 8).equals(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]))
  };
}

function loadPageDefinition() {
  let definition = null;
  const pagePath = path.join(
    ROOT,
    'pages/perpendicular-relations/perpendicular-relations.js'
  );
  const previousPage = global.Page;
  global.Page = (page) => { definition = page; };
  try {
    delete require.cache[require.resolve(pagePath)];
    require(pagePath);
  } finally {
    global.Page = previousPage;
  }
  return definition;
}

function main() {
  const linePlaneImage = readPng(
    'images/line-plane-perpendicular-reference.png'
  );
  const planePlaneImage = readPng(
    'images/plane-plane-perpendicular-reference.png'
  );
  check(linePlaneImage.isPng
    && linePlaneImage.image.length === 17581
    && linePlaneImage.width === 1089
    && linePlaneImage.height === 553,
  '线面垂直参考图保持原始 PNG 尺寸 1089×553');
  check(planePlaneImage.isPng
    && planePlaneImage.image.length === 19356
    && planePlaneImage.width === 1367
    && planePlaneImage.height === 509,
  '面面垂直参考图保持原始 PNG 尺寸 1367×509');
  const imageTotalBytes = fs.readdirSync(path.join(ROOT, 'images'))
    .filter((name) => /\.(png|jpe?g|gif|webp|svg|mp3|wav|m4a|aac|ogg)$/i.test(name))
    .reduce((total, name) => (
      total + fs.statSync(path.join(ROOT, 'images', name)).size
    ), 0);
  check(imageTotalBytes <= 200 * 1024,
    `图片与音频资源总量不超过 200 K（当前 ${imageTotalBytes} 字节）`);

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes(
    'pages/perpendicular-relations/perpendicular-relations'
  ), '线面、面面垂直页面已注册');
  const catalog = require('../config/course-catalog.js');
  const catalogPoint = catalog.chapters[3].points.find(
    (point) => point.id === 'perpendicular-relations'
  );
  check(catalogPoint
    && catalogPoint.availability === 'available'
    && catalogPoint.route
    && catalogPoint.route.path
      === '/pages/perpendicular-relations/perpendicular-relations',
  '第四章垂直知识点映射到独立图文页');
  check(catalogPoint && catalogPoint.keywords.includes('线面垂直')
    && catalogPoint.keywords.includes('面面垂直')
    && catalogPoint.keywords.includes('法线'),
  '垂直知识点提供线面、面面和法线搜索关键词');

  const pageDir = path.join(ROOT, 'pages/perpendicular-relations');
  const wxml = fs.readFileSync(
    path.join(pageDir, 'perpendicular-relations.wxml'),
    'utf8'
  );
  const wxss = fs.readFileSync(
    path.join(pageDir, 'perpendicular-relations.wxss'),
    'utf8'
  );
  check(wxml.includes(
    'src="/images/line-plane-perpendicular-reference.png"'
  )
    && wxml.includes(
      'src="/images/plane-plane-perpendicular-reference.png"'
    )
    && (wxml.match(/mode="widthFix"/g) || []).length === 2,
  '两个知识点均直接使用等比宽度参考图');
  check((wxml.match(/<image\b/g) || []).length === 2
    && !wxml.includes('<canvas')
    && !wxml.includes('id="linePlaneCanvas"')
    && !wxml.includes('id="planePlaneCanvas"'),
  '页面不再使用自绘 Canvas');
  check(wxml.includes('若一直线垂直于一平面，则必垂直于属于该平面的一切直线。')
    && wxml.includes('若一直线垂直于一定平面，则包含这条直线的所有平面都垂直于该平面。'),
  '页面按参考内容表达线面与面面垂直的几何条件');
  check(wxml.includes('直线的水平投影必垂直于属于该平面的水平线的水平投影')
    && wxml.includes('直线的正面投影必垂直于属于该平面的正平线的正面投影'),
  '页面完整表达线面垂直的投影定理');
  check(wxml.includes('若一直线的水平投影垂直于属于平面的水平线的水平投影')
    && wxml.includes('则直线必垂直于该平面'),
  '页面完整表达线面垂直的逆定理');
  check(wxml.includes('两平面相互垂直，则由属于第一个平面的任意一点向第二个平面所作的垂线必属于第一个平面。'),
  '页面完整表达两平面垂直的定理');
  check((wxml.match(/class="theorem-block"/g) || []).length === 3
    && wxml.includes('>定理 1<')
    && wxml.includes('>定理 2<')
    && !wxml.includes('>定理<'),
  '线面垂直保留定理 1、定理 2，面面垂直不再显示“定理”标签');
  check((wxml.match(/data-video-key=/g) || []).length === 2
    && wxml.includes('过平面外一点作给定平面的法线')
    && wxml.includes('过平面外一点作一平面垂直于给定平面'),
  '页面预留两个视频号按钮且名称完整');
  check(wxml.includes('bindtap="handleVideoTap"')
    && wxml.includes('class="video-button"'),
  '两个视频号入口使用同一真实点击处理');
  check(!wxml.includes('page-intro')
    && !wxml.includes('<scroll-view')
    && !wxml.includes('construction-box'),
  '页面为静态条件说明，不增加顶部说明、滚动容器或作图步骤');
  check((wxml.match(/class="video-row"/g) || []).length === 2
    && wxss.includes('.video-row')
    && wxss.includes('width: 100%')
    && wxss.includes('min-width: 100%'),
  '两个视频号按钮各自占满一整行');
  const pageRule = (wxss.match(/\.perpendicular-page\s*\{[\s\S]*?\}/) || [''])[0];
  check(pageRule.includes('min-height: 100vh')
    && !/(^|\n)\s*height:\s*100vh/.test(pageRule)
    && !pageRule.includes('overflow: hidden'),
  '页面按内容自然滚动，避免长定理被单屏裁切');
  check(wxss.includes('.reference-diagram')
    && wxss.includes('width: calc(100% - 20rpx)')
    && !wxss.includes('.diagram-canvas'),
  '两张参考图统一等比缩放且不保留 Canvas 样式');
  check(!wxss.includes('[disabled]')
    && !wxss.includes('> view')
    && !wxss.includes('> text'),
  '静态页 WXSS 不含不支持的属性或标签选择器');

  const videoRefs = require(
    '../pages/perpendicular-relations/perpendicular-relations-video.js'
  );
  check(videoRefs.planeNormalThroughPoint.finderUserName === ''
    && videoRefs.planeNormalThroughPoint.feedId === ''
    && videoRefs.perpendicularPlaneThroughPoint.finderUserName === ''
    && videoRefs.perpendicularPlaneThroughPoint.feedId === '',
  '视频号身份与内容 ID 集中保留为空配置');

  const pageDefinition = loadPageDefinition();
  check(!!pageDefinition, '图文页通过 Page() 注册');
  check(typeof pageDefinition.initializeCanvases !== 'function'
    && typeof pageDefinition.drawStage !== 'function',
  '页面不再初始化或绘制 Canvas');
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
      currentTarget: { dataset: { videoKey: 'planeNormalThroughPoint' } }
    });
    check(toastCalls.includes('视频号内容待配置')
      && channelCalls.length === 0,
    '未配置视频号时只提示，不伪造播放');
    page.data.videoRefs.planeNormalThroughPoint.finderUserName = 'test-finder';
    page.data.videoRefs.planeNormalThroughPoint.feedId = 'test-feed';
    page.handleVideoTap({
      currentTarget: { dataset: { videoKey: 'planeNormalThroughPoint' } }
    });
    check(channelCalls.length === 1
      && channelCalls[0].finderUserName === 'test-finder'
      && channelCalls[0].feedId === 'test-feed',
    '配置后通过 wx.openChannelsActivity 打开视频号内容');
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }

  console.log(`perpendicular-relations-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('perpendicular-relations-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
