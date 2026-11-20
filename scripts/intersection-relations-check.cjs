#!/usr/bin/env node
// 线面、面面相交概念概览页：课程路由、概念文字和两个入口。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function main() {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes(
    'pages/intersection-relations/intersection-relations'
  ), '相交概念概览页已注册');
  check(appJson.pages.includes(
    'pages/line-plane-relation/line-plane-relation'
  ), '原线面相交求交点页仍保留注册');
  check(appJson.pages.includes(
    'pages/plane-plane-relation/plane-plane-relation'
  ), '面面相交求交线页已注册');

  const catalog = require('../config/course-catalog.js');
  const catalogPoint = catalog.chapters[3].points.find(
    (point) => point.id === 'line-plane-relation'
  );
  check(catalogPoint
    && catalogPoint.availability === 'available'
    && catalogPoint.route
    && catalogPoint.route.path
      === '/pages/intersection-relations/intersection-relations',
  '课程首页第四相交知识点先进入概念页');

  const pageDir = path.join(ROOT, 'pages/intersection-relations');
  const wxml = fs.readFileSync(
    path.join(pageDir, 'intersection-relations.wxml'),
    'utf8'
  );
  const wxss = fs.readFileSync(
    path.join(pageDir, 'intersection-relations.wxss'),
    'utf8'
  );
  const plainWxml = wxml.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  check(wxml.indexOf('class="entry-grid"') < wxml.indexOf('class="overview-card"')
    && wxml.indexOf('class="overview-card"') < wxml.indexOf('class="concept-card line-concept"'),
  '总述模块位于两个入口下方、线面概念卡上方');
  check(wxml.includes('class="overview-title">相交关系总述'),
    '总述内容使用独立模块标题');
  check(wxss.includes('.overview-title')
    && wxss.includes('font-size: 40rpx')
    && wxss.includes('.overview-text')
    && wxss.includes('font-size: 28rpx')
    && wxss.includes('line-height: 1.55')
    && wxss.includes('padding: 4rpx 10rpx 10rpx'),
  '总述模块标题和正文使用加大字号');
  check((wxml.match(/<button/g) || []).length === 2
    && wxml.includes('bindtap="openLinePlane"')
    && wxml.includes('bindtap="openPlanePlane"'),
  '页面提供线面相交、面面相交两个按钮');
  check(wxml.includes('>线面相交</text>')
    && wxml.includes('>面面相交</text>'),
  '两个入口名称准确');
  [
    '直线与平面、平面与平面不平行则必相交',
    '交点是直线与平面共有的点',
    '它是两个平面的共有线',
    '求共有点、共有线的投影',
    '特殊位置线面相交',
    '利用直线或平面的积聚性投影直接求出',
    '辅助平面法',
    '特殊位置平面的某个投影有积聚性，交线可直接求出',
    '可利用求一般位置线面交点的方法找出交线上的两个点',
    '将其连线即为两平面的交线'
  ].forEach((text) => {
    check(plainWxml.includes(text.replace(/\s+/g, '')),
      '概念页包含图片知识点：' + text);
  });
  check((wxml.match(/class="highlight"/g) || []).length >= 8,
    '概念页突出显示关键判断文字');
  check((wxml.match(/>共有<\/text>/g) || []).length === 4,
    '“共有”四个出现位置均高亮');
  check(!wxss.includes('[disabled]')
    && !wxss.includes('> view')
    && !wxss.includes('> text'),
  '概念页 WXSS 不包含不支持的属性或标签选择器');

  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    delete require.cache[require.resolve(
      path.join(pageDir, 'intersection-relations.js')
    )];
    require(path.join(pageDir, 'intersection-relations.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '概念页通过 Page() 注册');
  const handlers = Array.from(
    wxml.matchAll(/bindtap="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  handlers.forEach((handler) => {
    check(typeof pageDefinition[handler] === 'function',
      `WXML 事件 ${handler} 有实现`);
  });

  const navigation = [];
  const toasts = [];
  const previousWx = global.wx;
  global.wx = {
    navigateTo(options) {
      navigation.push(options.url);
    },
    showToast(options) {
      toasts.push(options.title);
    }
  };
  try {
    const page = Object.assign({}, pageDefinition, {
      _interactionCount: 0
    });
    page.openLinePlane();
    check(navigation[0] === '/pages/line-plane-relation/line-plane-relation',
      '线面相交按钮进入原求交点页');
    page.openPlanePlane();
    check(navigation[1] === '/pages/plane-plane-relation/plane-plane-relation',
      '面面相交按钮进入面面求交线页');
    check(page._interactionCount === 2,
      '两个入口点击均计入学习交互');
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }

  console.log(`intersection-relations-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('intersection-relations-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
