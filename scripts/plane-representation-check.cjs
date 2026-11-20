#!/usr/bin/env node
// 平面的表示方法：纯几何、六模式接线、无滚动布局与 Canvas 绘制检查。

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('plane-representation-check');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8')
  .replace(/\r\n/g, '\n');
const model = require('../pages/plane-representation/plane-representation-model.js');

function assertOnPlane(point, label) {
  suite.close(model.signedDistance(point), 0, 1e-8, `${label} 属于平面 P`);
}

function makePageInstance(definition) {
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    canvasWidth: 375,
    canvasHeight: 520,
    _interactionCount: 0,
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (typeof callback === 'function') callback();
    },
    scheduleCanvasDraw() {}
  });
}

function makeCanvasContext(texts, strokes) {
  const noop = () => {};
  return {
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
    lineDash: [],
    save: noop,
    restore: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    rect: noop,
    clip: noop,
    fillRect: noop,
    moveTo: noop,
    lineTo: noop,
    fill: noop,
    arc: noop,
    stroke() {
      strokes.push({
        color: this.strokeStyle,
        width: this.lineWidth,
        dash: this.lineDash.slice()
      });
    },
    fillText(text) {
      texts.push(String(text));
    },
    setLineDash(pattern) {
      this.lineDash = (pattern || []).slice();
    }
  };
}

suite.section('1. 五种几何元素表示法与同一平面');
suite.equal(model.MODE_OPTIONS.length, 6, '共提供五种几何元素表示法和一种迹线表示法');
suite.equal(
  model.MODE_OPTIONS.map((item) => item.key).join(','),
  'threePoints,pointLine,intersectLines,parallelLines,planeFigure,traces',
  '六种模式顺序稳定'
);

const allModes = model.MODE_OPTIONS.map((item) => item.key);
allModes.forEach((modeKey) => {
  const definition = model.getModeDefinition(modeKey);
  definition.points.forEach((item) => assertOnPlane(item.point, `${modeKey}/${item.key}`));
  definition.lines.forEach((line) => {
    assertOnPlane(line.start, `${modeKey}/${line.key} 起点`);
    assertOnPlane(line.end, `${modeKey}/${line.key} 终点`);
  });
  definition.polygons.forEach((polygon) => {
    polygon.points.forEach((point, index) => {
      assertOnPlane(point, `${modeKey}/${polygon.key} 顶点 ${index}`);
    });
  });
});

const pointsMode = model.getModeDefinition('threePoints');
const [pointA, pointB, pointC] = pointsMode.points.map((item) => item.point);
const triangleNormal = model.cross(
  model.subtract(pointB, pointA),
  model.subtract(pointC, pointA)
);
suite.check(model.length(triangleNormal) > 1e-6, '三点定面案例中的 A、B、C 不共线');

const pointLineMode = model.getModeDefinition('pointLine');
const pointK = pointLineMode.points[0].point;
const pointLine = pointLineMode.lines[0];
const pointLineDirection = model.normalize(model.subtract(
  pointLine.end,
  pointLine.start
));
const pointOffset = model.subtract(pointK, pointLine.start);
const pointLineCross = model.normalize(model.cross(
  pointLineDirection,
  pointOffset
));
suite.check(!!pointLineCross && model.length(pointLineCross) > 1e-6,
  '点与直线案例中的 K 不在直线 l 上');

const intersectMode = model.getModeDefinition('intersectLines');
const intersection = model.getLineIntersection(
  intersectMode.lines[0],
  intersectMode.lines[1]
);
suite.check(!!intersection, '相交两直线案例存在唯一交点');
if (intersection) {
  suite.close(intersection.x, intersectMode.points[0].point.x, 1e-8,
    '相交两线交点 x 坐标正确');
  suite.close(intersection.y, intersectMode.points[0].point.y, 1e-8,
    '相交两线交点 y 坐标正确');
  suite.close(intersection.z, intersectMode.points[0].point.z, 1e-8,
    '相交两线交点 z 坐标正确');
}

const parallelMode = model.getModeDefinition('parallelLines');
const directionFirst = model.normalize(model.subtract(
  parallelMode.lines[0].end,
  parallelMode.lines[0].start
));
const directionSecond = model.normalize(model.subtract(
  parallelMode.lines[1].end,
  parallelMode.lines[1].start
));
suite.close(Math.abs(model.dot(directionFirst, directionSecond)), 1, 1e-8,
  '平行两直线案例方向向量平行');
const betweenStarts = model.subtract(
  parallelMode.lines[1].start,
  parallelMode.lines[0].start
);
suite.check(model.length(model.cross(directionFirst, betweenStarts)) > 1e-6,
  '平行两直线案例不重合');
['pointLine', 'intersectLines', 'parallelLines'].forEach((modeKey) => {
  model.getModeDefinition(modeKey).lines.forEach((line) => {
    suite.check(!!line.startLabel && !!line.endLabel,
      `${modeKey}/${line.key} 两个端点均有标注数据`);
  });
});

const figureMode = model.getModeDefinition('planeFigure');
const figurePoints = figureMode.polygons[0].points;
suite.check(model.length(model.cross(
  model.subtract(figurePoints[1], figurePoints[0]),
  model.subtract(figurePoints[2], figurePoints[0])
)) > 1e-6, '平面图形案例面积不为零');

suite.section('2. 迹线表示法');
const tracesMode = model.getModeDefinition('traces');
suite.equal(tracesMode.lines.length, 3, '迹线模式包含 P_H、P_V、P_W 三条迹线');
suite.equal(
  tracesMode.lines.map((line) => `${line.projectionPlane}:${line.label}`).join(','),
  'H:P_H,V:P_V,W:P_W',
  '三条迹线与投影面一一对应'
);
tracesMode.lines.forEach((trace) => {
  assertOnPlane(trace.start, `${trace.label} 起点`);
  assertOnPlane(trace.end, `${trace.label} 终点`);
  const ownValue = trace.projectionPlane === 'H'
    ? trace.start.z
    : (trace.projectionPlane === 'V' ? trace.start.y : trace.start.x);
  suite.close(ownValue, 0, 1e-8, `${trace.label} 起点位于自身投影面`);
});
const traceByPlane = Object.fromEntries(
  tracesMode.lines.map((line) => [line.projectionPlane, line])
);
suite.close(traceByPlane.H.start.x, traceByPlane.V.start.x, 1e-8,
  'P_H 与 P_V 交于 X 轴同一点');
suite.close(traceByPlane.H.end.y, traceByPlane.W.start.y, 1e-8,
  'P_H 与 P_W 交于 Y 轴同一点');
suite.close(traceByPlane.V.end.z, traceByPlane.W.end.z, 1e-8,
  'P_V 与 P_W 交于 Z 轴同一点');

suite.section('3. 页面注册、课程目录与无滚动结构');
const appJson = JSON.parse(read('app.json'));
suite.check(appJson.pages.includes(
  'pages/plane-representation/plane-representation'
), '新页面已注册到 app.json');

const catalog = require('../config/course-catalog.js');
const catalogPoint = catalog.chapters
  .flatMap((chapter) => chapter.points)
  .find((point) => point.id === 'plane-representation');
suite.check(catalogPoint
  && catalogPoint.title === '平面的表示方法'
  && catalogPoint.availability === 'available'
  && catalogPoint.route
  && catalogPoint.route.path === '/pages/plane-representation/plane-representation'
  && catalogPoint.route.kind === 'page',
'课程首页第三章“平面的表示方法”已映射到独立页面');
['三点定面', '点与直线', '相交直线', '平行直线', '迹线', 'P_H'].forEach((keyword) => {
  suite.check(catalogPoint.keywords.includes(keyword),
    `课程搜索包含关键词：${keyword}`);
});

const wxml = read('pages/plane-representation/plane-representation.wxml');
const wxss = read('pages/plane-representation/plane-representation.wxss');
suite.check(!wxml.includes('<scroll-view'), '页面没有 scroll-view');
suite.equal((wxml.match(/<canvas\b/g) || []).length, 1, '页面只使用一个 Canvas');
suite.equal((wxml.match(/class="mode-button/g) || []).length, 1,
  '六个模式由同一循环按钮生成');
suite.check(wxml.includes('wx:for="{{modeOptions}}"')
  && wxml.includes('bindtap="selectMode"'),
'六种模式由数据驱动并可切换');
suite.check(!wxml.includes('/pages/home/home')
  && !wxml.includes('返回首页'),
'页面不显示返回首页入口');
suite.check(wxss.includes('height: 100vh;')
  && wxss.includes('overflow: hidden;')
  && wxss.includes('flex-direction: column;')
  && wxss.includes('flex: 1 1 0;')
  && wxss.includes('min-height: 0;'),
'页面固定为视口高度，Canvas 占用剩余空间');
suite.check(wxss.includes('@media (max-height: 650px)'),
  '矮屏手机有紧凑尺寸规则');
suite.check(wxss.includes('height: 32px;')
  && wxss.includes('font-size: 9.5px;')
  && wxss.includes('width: 100%;')
  && wxss.includes('max-width: 100%;'),
'六个模式按钮使用紧凑尺寸');

suite.section('4. Page 对象与模式切换');
let pageDefinition = null;
const previousPage = global.Page;
const previousGetApp = global.getApp;
const previousWx = global.wx;
global.Page = (definition) => { pageDefinition = definition; };
global.getApp = () => ({
  globalData: { user: { openid: 'plane-test', student_id: '20260001' } }
});
global.wx = {
  redirectTo() {},
  showToast() {}
};
try {
  delete require.cache[require.resolve('../pages/plane-representation/plane-representation.js')];
  require('../pages/plane-representation/plane-representation.js');
} finally {
  global.Page = previousPage;
  global.getApp = previousGetApp;
  global.wx = previousWx;
}
suite.check(!!pageDefinition, '页面通过 Page() 注册');
suite.equal(pageDefinition.data.modeOptions.length, 6, '页面 data 包含六个模式');
const handlers = Array.from(
  wxml.matchAll(/bind[a-z]+="([A-Za-z0-9_]+)"/g),
  (match) => match[1]
);
handlers.forEach((handler) => {
  suite.check(typeof pageDefinition[handler] === 'function',
    `WXML 事件 ${handler} 有实现`);
});
const page = makePageInstance(pageDefinition);
page.selectMode({ currentTarget: { dataset: { mode: 'traces' } } });
suite.equal(page.data.selectedMode, 'traces', '可切换到迹线表示法');
suite.equal(page.data.ruleTitle, '平面与投影面的交线', '切换后同步更新教学标题');
suite.equal(page._interactionCount, 1, '模式切换计入交互次数');

suite.section('5. Canvas 六模式与手机/宽屏');
const text = [];
const strokes = [];
page.context = makeCanvasContext(text, strokes);
['threePoints', 'pointLine', 'intersectLines', 'parallelLines', 'planeFigure', 'traces']
  .forEach((modeKey) => {
    const definition = model.getModeDefinition(modeKey);
    page.data = Object.assign({}, pageDefinition.data, {
      selectedMode: modeKey,
      modeLabel: definition.label,
      modeSymbol: model.MODE_OPTIONS.find((item) => item.key === modeKey).symbol,
      ruleTitle: definition.ruleTitle,
      rule: definition.rule,
      projectionNote: definition.projectionNote
    });
    text.length = 0;
    strokes.length = 0;
    let renderError = null;
    try {
      page.drawScene();
    } catch (error) {
      renderError = error;
    }
    suite.check(!renderError,
      `${modeKey} Canvas 绘制不抛错${renderError ? `: ${renderError.stack || renderError}` : ''}`);
    suite.check(text.includes('空间关系') && text.includes('第一角三面投影'),
      `${modeKey} 同时绘制空间关系与三面投影`);
  });

page.data = Object.assign({}, pageDefinition.data, {
  selectedMode: 'pointLine',
  modeLabel: '一直线和直线外一点',
  modeSymbol: 'K + l',
  ruleTitle: '点与直线',
  rule: '点 K 不在直线 l 上，K 与 l 确定唯一平面 P。',
  projectionNote: '点 K 和直线 l 的投影必须来自同一组空间位置。'
});
text.length = 0;
strokes.length = 0;
page.drawScene();
['E', 'F', 'e′', 'f′', 'e', 'f', 'e″', 'f″'].forEach((label) => {
  suite.check(text.includes(label), `点与直线模式标注端点 ${label}`);
});

page.data = Object.assign({}, pageDefinition.data, {
  selectedMode: 'traces',
  modeLabel: '迹线表示法',
  modeSymbol: 'P_H P_V P_W',
  ruleTitle: '平面与投影面的交线',
  rule: 'P_H=P∩H，P_V=P∩V，P_W=P∩W。',
  projectionNote: '迹线本面投影与自身重合；另两面投影落在相应投影轴上。'
});
text.length = 0;
strokes.length = 0;
page.canvasWidth = 375;
page.canvasHeight = 520;
page.drawScene();
['P_H', 'P_V', 'P_W'].forEach((label) => {
  suite.check(text.includes(label), `Canvas 标注迹线 ${label}`);
});
['H', 'V', 'W'].forEach((label) => {
  suite.check(text.includes(label), `空间图标注投影面 ${label}`);
});
['#34b979', '#e05a5a', '#397dd3'].forEach((color) => {
  suite.check(strokes.some((stroke) => stroke.color === color),
    `迹线使用投影面区分色 ${color}`);
});
suite.check(strokes.some((stroke) => (
  stroke.color === '#93a6b8' && stroke.width === 0.85
)), '投影图绘制细投影对应线');
suite.check(strokes.every((stroke) => stroke.dash.length === 0),
  '投影图不使用虚线');
const renderSource = read('pages/plane-representation/plane-representation-render.js');
suite.check(renderSource.includes('const SPATIAL_FRAME_SPAN = 9.2;')
  && renderSource.includes('context.lineWidth = ownTrace ? 2.8 : 1.45'),
'空间投影面大于目标平面，迹线投影保持细实线');
suite.check(renderSource.includes('const miterPoint = {')
  && renderSource.includes('this.drawLine(context, views.top, miterPoint);')
  && renderSource.includes('this.drawLine(context, miterPoint, views.left);'),
'两个 Y 轴之间通过完整转位连线连接');
suite.check(renderSource.includes("pointS: '#20b26b'")
  && renderSource.includes("item.key === 'S' ? 5.2 : 4.3")
  && renderSource.includes("item.key === 'S' ? 4.6 : 3.8"),
'两相交直线的空间交点使用绿色并放大');
suite.check(renderSource.includes("context.strokeText(text, x, y);")
  && renderSource.includes('getProjectionLineLabelOffset(')
  && renderSource.includes('this.drawLine(context, miterPoint, views.left);'),
'投影标注使用白底描边并按线外方向避让');

page.canvasWidth = 900;
page.canvasHeight = 520;
suite.check(page.getLayout().split, '宽屏切换为左右分区');
let wideError = null;
try {
  page.drawScene();
} catch (error) {
  wideError = error;
}
suite.check(!wideError,
  `宽屏 Canvas 绘制不抛错${wideError ? `: ${wideError.stack || wideError}` : ''}`);

page.canvasWidth = 320;
page.canvasHeight = 430;
suite.check(!page.getLayout().split, '小屏手机保持上下分区');
let smallError = null;
try {
  page.drawScene();
} catch (error) {
  smallError = error;
}
suite.check(!smallError,
  `小屏 Canvas 绘制不抛错${smallError ? `: ${smallError.stack || smallError}` : ''}`);

process.exitCode = suite.finish();
