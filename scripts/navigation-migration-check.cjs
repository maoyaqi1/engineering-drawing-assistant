#!/usr/bin/env node
// 导航职责迁移检查：确认学习页移除常驻模块导航、增加真实首页入口，
// 同时保留教学控件、Canvas 事件和 Web 运行时兼容接口。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('navigation-migration-check');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function assertHomeNavigation(relativePath, markers, label, expectHome) {
  const wxml = read(relativePath);
  if (expectHome === false) {
    suite.check(!wxml.includes('url="/pages/home/home"'), label + '已删除首页入口');
    suite.check(!wxml.includes('aria-label="返回课程首页"'), label + '不再保留首页入口无障碍文案');
  } else {
    suite.check(wxml.includes('url="/pages/home/home"'), label + '提供首页入口');
    suite.check(wxml.includes('open-type="reLaunch"'), label + '首页入口使用 reLaunch');
    suite.check(wxml.includes('aria-label="返回课程首页"'), label + '首页入口有无障碍名称');
  }
  markers.forEach((marker) => {
    suite.check(wxml.includes(marker), label + '保留教学内容：' + marker);
  });
  return wxml;
}

suite.section('1. pages/index 导航迁移');
const indexWxml = read('pages/index/index.wxml');
const indexWxss = read('pages/index/index.wxss');
const indexJs = read('pages/index/index.js');
const indexHandlersJs = read('pages/index/ui-handlers.js');
suite.check(!indexWxml.includes('class="app-toolbar"'), '移除首页常驻深色工具栏');
suite.check(!indexWxml.includes('class="module-picker"'), '移除原生模块选择器');
suite.check(!indexWxml.includes('/pages/projection/projection'), '移除旧顶栏投影体系入口');
suite.check(indexHandlersJs.includes('handleModulePicker('), 'JavaScript 保留 handleModulePicker');
suite.check(indexJs.includes("moduleOptions: ['点', '直线', '平面', '基本立体', '平面切割立体']"),
  'JavaScript 保留 moduleOptions');
suite.check(indexJs.includes('moduleIndex: 0'), 'JavaScript 保留 moduleIndex');
suite.equal(count(indexWxml, /url="\/pages\/home\/home"/g), 1,
  '五种模式共用唯一首页入口');
suite.check(indexWxml.includes('wx:if="{{mode !== \'point\' && mode !== \'line\' && mode !== \'plane\'}}"')
  && indexWxml.includes('class="ghost-button home-entry"'),
'点、直线和平面模式隐藏首页入口，立体和切割模式保留');
suite.check(!indexWxml.includes('/pages/triangle-method/triangle-method')
  && !indexWxml.includes('/pages/right-angle-projection/right-angle-projection'),
'直线模式关键知识点入口已删除，由课程目录直接映射');
const lineModeWxss = read('pages/index/index.wxss');
suite.check(lineModeWxss.includes('.mode-line .card-title')
  && lineModeWxss.includes('white-space: nowrap')
  && lineModeWxss.includes('.mode-line .card-actions .ghost-button'),
'直线模式卡片标题单行且重置按钮窄宽靠右');
suite.check(!indexWxml.includes('/pages/maximum-slope-line/maximum-slope-line')
  && !indexWxml.includes('/pages/line-plane-relation/line-plane-relation'),
'平面模式关键知识点入口已删除，由课程目录直接映射');
suite.check(lineModeWxss.includes('.mode-plane .card-title')
  && lineModeWxss.includes('.mode-plane .card-actions .ghost-button'),
'平面模式卡片标题单行且重置按钮窄宽靠右');
[
  'bindtap="handlePointType"',
  'bindtap="handleLineType"',
  'bindtap="handlePlaneType"',
  'bindtap="handleBasicSolidType"',
  'bindtap="handleSectionPlaneType"',
  'bindtouchstart="handleTouchStart"',
  'bindtouchmove="handleTouchMove"',
  'bindtouchend="handleTouchEnd"',
  'bindtap="resetPoint"'
].forEach((marker) => suite.check(indexWxml.includes(marker), '首页保留教学绑定：' + marker));
suite.check(indexWxss.includes('height: calc(100vw * 1.44);')
  && indexWxss.includes('height: calc(100vh - 330px);'),
  '首页 Canvas 高度规则未改变');
suite.check(!indexWxss.includes('.app-toolbar')
  && !indexWxss.includes('.module-selector'),
  '首页删除旧工具栏样式');

suite.section('2. 投影体系');
const projectionWxml = read('pages/projection/projection.wxml');
suite.check(!projectionWxml.includes('/pages/home/home')
  && !projectionWxml.includes('class="ghost-button home-entry"'),
'投影体系页已删除首页入口');
[
  'bindtap="handleScope"',
  'bindtap="handleUnfoldToggle"',
  'bindtap="handleUnfoldReset"',
  'bindtouchstart="handleViewTouchStart"'
].forEach((marker) => {
  suite.check(projectionWxml.includes(marker), '投影体系页保留教学内容：' + marker);
});
const projectionWxss = read('pages/projection/projection.wxss');
suite.check(!projectionWxml.includes('class="app-toolbar"'), '移除投影体系深色常驻工具栏');
suite.check(!projectionWxml.includes('bindtap="goBack"'), '删除首页入口后不新增替代返回按钮');
suite.check(projectionWxml.includes('scope-pill') && projectionWxml.includes('scope-toolbar'),
  '投影范围和展开控件已进入内容区');
suite.check(projectionWxss.includes('height: calc(100vw * 1.4);')
  && projectionWxss.includes('height: calc(100vh - 210px);'),
  '投影体系 Canvas 高度规则未改变');
suite.check(projectionWxss.includes('.card-title')
  && projectionWxss.includes('white-space: nowrap')
  && projectionWxss.includes('text-overflow: ellipsis'),
  '投影体系标题保持单行显示');
suite.check(projectionWxss.includes('.card-actions .ghost-button')
  && projectionWxss.includes('flex: 0 0 92rpx')
  && projectionWxss.includes('width: 92rpx'),
  '投影体系重置按钮使用固定窄宽度并贴右');
suite.check(projectionWxml.includes('拖动画布旋转观察；展开角控制 H/W 面折叠'),
  '投影体系卡片副说明已压缩为单行');

suite.section('3. 独立知识点页');
[
  {
    path: 'pages/orthographic-projection/orthographic-projection.wxml',
    label: '正投影',
    markers: ['data-relation="{{item.key}}"', 'bindtap="selectRelation"', 'bindtap="handleReplay"', 'id="relationCanvas"']
  },
  {
    path: 'pages/two-line-position/two-line-position.wxml',
    label: '两直线位置关系',
    expectHome: false,
    markers: ['data-position="{{item.key}}"', 'bindtap="selectPosition"', 'data-key="{{item.key}}"', 'bindtap="selectJudgement"', 'id="geometryCanvas"']
  },
  {
    path: 'pages/triangle-method/triangle-method.wxml',
    label: '直角三角形法',
    expectHome: false,
    markers: ['data-plane="H"', 'data-plane="V"', 'data-plane="W"', 'bindtap="selectPlane"', 'bindtap="handleReset"', 'bindtouchend="handleTouchEnd"']
  },
  {
    path: 'pages/right-angle-projection/right-angle-projection.wxml',
    label: '直角投影定理',
    expectHome: false,
    markers: ['data-type="horizontal"', 'data-type="frontal"', 'data-type="profile"', 'bindtap="selectLineType"', 'bindtap="handleReset"', 'bindtouchend="handleTouchEnd"']
  },
  {
    path: 'pages/plane-representation/plane-representation.wxml',
    label: '平面的表示方法',
    expectHome: false,
    markers: [
      'wx:for="{{modeOptions}}"',
      'bindtap="selectMode"',
      'id="geometryCanvas"'
    ]
  },
  {
    path: 'pages/maximum-slope-line/maximum-slope-line.wxml',
    label: '最大斜度线',
    expectHome: false,
    markers: ['data-plane="H"', 'data-plane="V"', 'data-plane="W"', 'bindtap="selectPlane"', 'bindtap="handleReset"', 'bindtouchend="handleTouchEnd"']
  },
  {
    path: 'pages/line-plane-relation/line-plane-relation.wxml',
    label: '线面相交求交点',
    expectHome: false,
    markers: ['bindchange="handleLinePicker"', 'bindchange="handlePlanePicker"', 'bindtap="handleStepTap"', 'bindtap="handleReset"']
  },
  {
    path: 'pages/parallel-relations/parallel-relations.wxml',
    label: '线面、面面平行',
    expectHome: false,
    markers: ['id="linePlaneCanvas"', 'id="planePlaneCanvas"', 'bindtap="handleVideoTap"']
  },
  {
    path: 'pages/perpendicular-relations/perpendicular-relations.wxml',
    label: '线面、面面垂直',
    expectHome: false,
    markers: [
      'src="/images/line-plane-perpendicular-reference.png"',
      'src="/images/plane-plane-perpendicular-reference.png"',
      'bindtap="handleVideoTap"'
    ]
  },
  {
    path: 'pages/intersection-relations/intersection-relations.wxml',
    label: '线面、面面相交概览',
    expectHome: false,
    markers: ['bindtap="openLinePlane"', 'bindtap="openPlanePlane"']
  },
  {
    path: 'pages/plane-plane-relation/plane-plane-relation.wxml',
    label: '面面相交求交线',
    expectHome: false,
    markers: ['bindchange="handlePlanePPicker"', 'bindchange="handlePlaneQPicker"', 'bindtap="handleStepTap"', 'bindtap="handleReset"']
  }
].forEach((page) => {
  const wxml = assertHomeNavigation(
    page.path,
    page.markers,
    page.label,
    page.expectHome
  );
  if (page.expectHome !== false) {
    suite.equal(count(wxml, /url="\/pages\/home\/home"/g), 1,
      page.label + '只有一个首页入口');
  }
  if (page.path.indexOf('two-line-position') >= 0) {
    suite.check(!wxml.includes('bindtap="handleRotateView"')
      && !wxml.includes('bindtap="handleReset"'),
    '两直线位置关系页已删除旋转和重置按钮');
  }
});
const triangleWxss = read('pages/triangle-method/triangle-method.wxss');
const rightAngleWxss = read('pages/right-angle-projection/right-angle-projection.wxss');
suite.check(triangleWxss.includes('white-space: nowrap')
  && triangleWxss.includes('.card-actions .ghost-button')
  && triangleWxss.includes('width: 48px'),
'直角三角形法页面标题单行且重置按钮窄宽靠右');
suite.check(rightAngleWxss.includes('white-space: nowrap')
  && rightAngleWxss.includes('width: 48px')
  && rightAngleWxss.includes('margin-left: auto'),
'直角投影定理页面标题单行且重置按钮窄宽靠右');
const linePlaneWxml = read('pages/line-plane-relation/line-plane-relation.wxml');
const linePlaneWxss = read('pages/line-plane-relation/line-plane-relation.wxss');
suite.check(!linePlaneWxml.includes('/pages/home/home')
  && count(linePlaneWxml, /bindtap="handleReset"/g) === 1,
'线面相交求交点已删除首页入口且只保留重置按钮');
suite.check(linePlaneWxss.includes('.card-title')
  && linePlaneWxss.includes('white-space: nowrap')
  && linePlaneWxss.includes('width: 44px')
  && linePlaneWxss.includes('height: 22px')
  && linePlaneWxss.includes('margin-left: auto'),
'线面相交求交点标题单行且重置按钮缩小靠右');
suite.check(linePlaneWxss.includes('margin-top: 4px')
  && linePlaneWxss.includes('height: 27px')
  && linePlaneWxss.includes('min-height: 22px'),
'线面相交求交点顶部选择区和标题栏已压缩高度');

suite.section('3.1 第六章平面与立体相交拆分页');
const sectionSolidView = read('pages/index/section-solid-view.wxml');
suite.check(!sectionSolidView.includes('url="/pages/home/home"')
  && !sectionSolidView.includes('class="ai-fab"'),
'平面与立体相交拆分页不显示首页和 AI 教师入口');
[
  'bindtap="handleSectionSolidType"',
  'bindtap="handleSectionPlaneType"',
  'bindchange="handleSectionSlider"',
  'bindtap="resetPoint"'
].forEach((marker) => {
  suite.check(sectionSolidView.includes(marker),
    '平面与立体相交共享视图保留教学绑定：' + marker);
});
[
  'pages/plane-solid-intersection/plane-solid-intersection.wxml',
  'pages/curved-solid-intersection/curved-solid-intersection.wxml'
].forEach((relativePath) => {
  suite.check(read(relativePath).includes(
    '<include src="../index/section-solid-view.wxml" />'
  ), relativePath + ' 使用共享平面与立体相交视图');
});

suite.section('4. Canvas 与触摸区域');
[
  'pages/index/index.wxml',
  'pages/projection/projection.wxml',
  'pages/two-line-position/two-line-position.wxml',
  'pages/plane-representation/plane-representation.wxml',
  'pages/triangle-method/triangle-method.wxml',
  'pages/right-angle-projection/right-angle-projection.wxml',
  'pages/maximum-slope-line/maximum-slope-line.wxml',
  'pages/line-plane-relation/line-plane-relation.wxml',
  'pages/parallel-relations/parallel-relations.wxml',
  'pages/perpendicular-relations/perpendicular-relations.wxml',
  'pages/plane-plane-relation/plane-plane-relation.wxml',
  'pages/index/section-solid-view.wxml'
].forEach((relativePath) => {
  const wxml = read(relativePath);
  const expectedCanvasCount = relativePath.indexOf('parallel-relations') >= 0
    ? 2
    : (relativePath.indexOf('perpendicular-relations') >= 0 ? 0 : 1);
  suite.equal(count(wxml, /<canvas\b/g), expectedCanvasCount,
    relativePath + ` 保留 ${expectedCanvasCount} 个教学 Canvas`);
  if (relativePath.indexOf('line-plane-relation') >= 0
    || relativePath.indexOf('two-line-position') >= 0
    || relativePath.indexOf('plane-representation') >= 0
    || relativePath.indexOf('parallel-relations') >= 0
    || relativePath.indexOf('perpendicular-relations') >= 0
    || relativePath.indexOf('plane-plane-relation') >= 0
    || relativePath.indexOf('section-solid-view') >= 0
    ) {
    suite.check(!/bindtouch(start|move|end)=/g.test(wxml),
      relativePath + ' 使用按钮驱动交互，不新增 Canvas 触摸绑定');
  } else {
    suite.check(/bindtouchstart=/g.test(wxml), relativePath + ' 保留触摸开始处理');
    suite.check(/bindtouchmove=/g.test(wxml), relativePath + ' 保留触摸移动处理');
    suite.check(/bindtouchend=/g.test(wxml), relativePath + ' 保留触摸结束处理');
  }
});
const orthographicWxml = read(
  'pages/orthographic-projection/orthographic-projection.wxml'
);
suite.equal(count(orthographicWxml, /<canvas\b/g), 1,
  '正投影页只保留基本性质教学 Canvas');
suite.check(!/bindtouch(start|move|end)=/g.test(orthographicWxml),
  '正投影页使用按钮驱动位置关系，不新增 Canvas 触摸绑定');

suite.section('5. 无新增全局导航');
[
  'pages/index/index.wxml',
  'pages/projection/projection.wxml',
  'pages/orthographic-projection/orthographic-projection.wxml',
  'pages/two-line-position/two-line-position.wxml',
  'pages/plane-representation/plane-representation.wxml',
  'pages/triangle-method/triangle-method.wxml',
  'pages/right-angle-projection/right-angle-projection.wxml',
  'pages/maximum-slope-line/maximum-slope-line.wxml',
  'pages/line-plane-relation/line-plane-relation.wxml',
  'pages/parallel-relations/parallel-relations.wxml',
  'pages/perpendicular-relations/perpendicular-relations.wxml',
  'pages/plane-plane-relation/plane-plane-relation.wxml'
].forEach((relativePath) => {
  const wxml = read(relativePath);
  suite.check(!wxml.includes('tabBar') && !wxml.includes('bottom-navigation'),
    relativePath + ' 未增加底部常驻导航');
});

suite.section('6. 冻结边界');
[
  'pages/index/section-geometry.js',
  'pages/index/basic-solid.js',
  'pages/index/render-scene.js',
  'pages/index/touch.js',
  'cloudfunctions/api/index.js'
].forEach((relativePath) => {
  suite.check(fs.existsSync(path.join(ROOT, relativePath)), relativePath + ' 仍存在且未由本检查改写');
});

suite.section('7. 冻结哈希记录');
const frozenHashes = {
  'app.json': '01A8E65AC93125D2648D1D10644556FCCDF06CFBBF7C289A47873C00C9B87816',
  'pages/index/index.js': 'BB9C4079D382BD829EBA3702A6BAE74CEA3F51F340190E5EEA7B4ADB2E42F8BF',
  'pages/index/index.wxml': 'B06DCC68A8E8676424E2A92E3C520E9681F5C14B413E122E36B6C6E2BC4284D5',
  'pages/index/index.wxss': 'B5BDC92A474315A35C7E3EDF6D1C2952B3603446EB9FC32FEB7C16D1B537015B',
  'pages/projection/projection.wxml': 'BCF0147B705B971A9B21448C912EC9CFDC5A47F85CD6CCBE50F7090496267499',
  'pages/projection/projection.wxss': 'EAEFF5D7D696F0C0BC80E347256F54A1CE04EBAED6FFF838D3525B3F6AF99214',
  'pages/triangle-method/triangle-method.wxml': '6746A4285EECDFFD2CE1C6D35F392B14E8858167168F9182E9959425B64C3B4B',
  'pages/triangle-method/triangle-method.wxss': '5CD4F958E54CFE9229EAEE0ACEB3622D576D18CCFFB11A9CB211588673FD71B5',
  'pages/right-angle-projection/right-angle-projection.wxml': '7111B55C1108956861E334B80269D9C5E2F2B21555AC3BA6951BA67E2FD1419C',
  'pages/right-angle-projection/right-angle-projection.wxss': 'E1258428B2CA89C8054A7DDB1487197903BA1FF8E97C1FBE286B93BD887D52E3'
};
Object.keys(frozenHashes).forEach((relativePath) => {
  const digest = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, relativePath)))
    .digest('hex')
    .toUpperCase();
  suite.equal(digest, frozenHashes[relativePath], relativePath + ' 冻结哈希一致');
});
const freezeRecord = read('docs/freeze-ui-compact-2026-11-02.md');
Object.keys(frozenHashes).forEach((relativePath) => {
  suite.check(freezeRecord.includes(frozenHashes[relativePath]),
    '课程导航冻结记录包含哈希：' + relativePath);
});

process.exitCode = suite.finish();
