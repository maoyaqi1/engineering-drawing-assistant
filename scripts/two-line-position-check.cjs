#!/usr/bin/env node
// 两直线判断页：几何判定、一般/特殊位置案例、页面结构、路由和 Canvas 接线检查。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../pages/two-line-position/two-line-position-model.js');
const renderer = require('../pages/two-line-position/two-line-position-render.js');
const projection = require('../pages/index/projection.js');
const triangleRender = require('../pages/triangle-method/triangle-render.js');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function close(actual, expected, tolerance, message) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`
  );
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    .replace(/\r\n/g, '\n');
}

function normalizeLines(positionMode, judgementKey) {
  return model.createPreset(positionMode, judgementKey);
}

function createContext(coordinates, drawnText) {
  const record = (name, args) => {
    args.forEach((value) => {
      if (typeof value === 'number') {
        check(Number.isFinite(value), `${name} 的数值参数必须有限`);
        if (coordinates) coordinates.push(value);
      }
    });
  };
  const noop = () => {};
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    rect(...args) { record('rect', args); },
    clip: noop,
    moveTo(...args) { record('moveTo', args); },
    lineTo(...args) { record('lineTo', args); },
    arc(...args) { record('arc', args); },
    arcTo: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    strokeText(value, x, y) {
      record('strokeText', [x, y]);
    },
    fillText(value, x, y) {
      record('fillText', [x, y]);
      if (drawnText) drawnText.push(String(value));
    }
  };
}

function loadPageDefinition() {
  const previousPage = global.Page;
  const previousGetApp = global.getApp;
  const previousWx = global.wx;
  let pageDefinition = null;
  global.Page = (definition) => {
    pageDefinition = definition;
  };
  global.getApp = () => ({ globalData: { user: { name: 'check' } } });
  global.wx = {};
  const pagePath = require.resolve(
    '../pages/two-line-position/two-line-position.js'
  );
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = previousPage;
  global.getApp = previousGetApp;
  global.wx = previousWx;
  return pageDefinition;
}

function createPage(definition) {
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (callback) callback();
    },
    scheduleCanvasDraw() {},
    recordInteraction() {}
  });
}

function endpointDirection(line) {
  return model.subtract(line.end, line.start);
}

function allCoordinatesNonZero(line) {
  const direction = endpointDirection(line);
  return ['x', 'y', 'z'].every((axis) => Math.abs(direction[axis]) > 0.1);
}

function main() {
  check(model.JUDGEMENT_OPTIONS.length === 2, '页面只提供两种判断类型');
  check(
    model.JUDGEMENT_OPTIONS.map((item) => item.title).join(',')
      === '平行判断,相交判断',
    '第二排顺序为平行判断、相交判断'
  );
  check(model.POSITION_OPTIONS.length === 2, '第一排提供两种位置状态');
  check(
    model.POSITION_OPTIONS.map((item) => item.title).join(',')
      === '一般位置直线,特殊位置直线',
    '第一排顺序为一般位置直线、特殊位置直线'
  );
  check(!Object.prototype.hasOwnProperty.call(model.PRESETS.general, 'skew')
    && !Object.prototype.hasOwnProperty.call(model.PRESETS.special, 'skew'),
  '页面预设中已删除交叉选项');

  const generalParallel = normalizeLines('general', 'parallel');
  const generalIntersect = normalizeLines('general', 'intersect');
  const specialParallel = normalizeLines('special', 'parallel');
  const specialIntersect = normalizeLines('special', 'intersect');

  check(allCoordinatesNonZero(generalParallel.line1)
    && allCoordinatesNonZero(generalParallel.line2),
  '一般位置平行案例的两条直线均非投影面特殊位置线');
  check(allCoordinatesNonZero(generalIntersect.line1)
    && allCoordinatesNonZero(generalIntersect.line2),
  '一般位置相交案例的两条直线均非投影面特殊位置线');

  const specialParallelDirection1 = endpointDirection(specialParallel.line1);
  const specialParallelDirection2 = endpointDirection(specialParallel.line2);
  check(Math.abs(specialParallelDirection1.x) <= model.EPSILON
    && Math.abs(specialParallelDirection2.x) <= model.EPSILON,
  '特殊位置平行案例使用两条侧平线');
  check(Math.abs(specialParallel.line1.start.x - specialParallel.line1.end.x)
    <= model.EPSILON
    && Math.abs(specialParallel.line2.start.x - specialParallel.line2.end.x)
      <= model.EPSILON,
  '侧平线的两个端点具有相同 x 坐标');

  const parallelRelation = model.classify(generalParallel);
  check(parallelRelation.kind === 'parallel', '一般位置平行案例判定正确');
  check(parallelRelation.isParallel && parallelRelation.isCoplanar
    && !parallelRelation.hasIntersection,
  '一般位置平行线方向平行、共面且无交点');
  check(parallelRelation.projectedParallelViews.length === 3,
    '一般位置平行案例的三组同面投影均平行');

  const intersectRelation = model.classify(generalIntersect);
  check(intersectRelation.kind === 'intersect', '一般位置相交案例判定正确');
  check(!intersectRelation.isParallel && intersectRelation.isCoplanar
    && intersectRelation.hasIntersection,
  '一般位置相交线不平行、共面且有唯一交点');
  close(intersectRelation.intersection.x, 3.8, 1e-8, '交点 P 的 x');
  close(intersectRelation.intersection.y, 3.3, 1e-8, '交点 P 的 y');
  close(intersectRelation.intersection.z, 3.85, 1e-8, '交点 P 的 z');
  check(Object.values(intersectRelation.projectedRelations)
    .every((item) => item.kind === 'intersect'),
  '一般位置相交案例的三组同面投影均相交');

  const specialParallelRelation = model.classify(specialParallel);
  check(specialParallelRelation.kind === 'skew',
    '特殊位置平行反例实际上不是空间平行线');
  check(specialParallelRelation.projectedRelations.front.kind === 'parallel'
    && specialParallelRelation.projectedRelations.top.kind === 'parallel',
  '特殊位置平行反例的正面、水平投影表面平行');
  check(specialParallelRelation.projectedRelations.left.kind === 'intersect',
    '特殊位置平行反例的侧面投影不再平行');

  const specialIntersectRelation = model.classify(specialIntersect);
  const specialIntersectDirection1 = endpointDirection(specialIntersect.line1);
  const specialIntersectDirection2 = endpointDirection(specialIntersect.line2);
  check(Math.abs(specialIntersectDirection1.z) <= model.EPSILON
    && Math.abs(specialIntersectDirection2.y) <= model.EPSILON,
  '特殊位置相交反例由水平线和正平线组成');
  check(specialIntersectRelation.kind === 'skew',
    '特殊位置相交反例实际上不存在唯一空间交点');
  check(specialIntersectRelation.projectedRelations.front.kind === 'intersect'
    && specialIntersectRelation.projectedRelations.top.kind === 'intersect',
  '特殊位置相交反例的正面、水平投影表面相交');
  check(Math.abs(
    specialIntersectRelation.projectedRelations.front.intersection.x
      - specialIntersectRelation.projectedRelations.top.intersection.x
  ) > 0.5,
  '特殊位置相交反例在正面与水平面的视交点不满足长对正');
  check(specialIntersectRelation.projectedRelations.left.kind === 'intersect',
    '特殊位置相交反例的侧面投影仍有独立的视交点');

  const coincidentLines = normalizeLines('general', 'parallel');
  coincidentLines.line2 = {
    start: Object.assign({}, coincidentLines.line1.end),
    end: Object.assign({}, coincidentLines.line1.start)
  };
  check(model.classify(coincidentLines).kind === 'coincident',
    '重合线被单独识别为退化情形');

  const invalidLines = normalizeLines('general', 'parallel');
  invalidLines.line1.end = Object.assign({}, invalidLines.line1.start);
  check(model.classify(invalidLines).kind === 'invalid',
    '零长度线被识别为无效');

  const appJson = JSON.parse(read('app.json'));
  check(appJson.pages.includes('pages/two-line-position/two-line-position'),
    'app.json 已注册两直线位置关系页面');
  const catalog = require('../config/course-catalog.js');
  const point = catalog.chapters[1].points.find(
    (item) => item.id === 'two-line-position'
  );
  check(!!point, '课程目录保留两直线位置关系知识点');
  check(point.availability === 'available'
    && point.route
    && point.route.path === '/pages/two-line-position/two-line-position',
  '两直线位置关系映射到独立探索页');

  const pageWxml = read('pages/two-line-position/two-line-position.wxml');
  const pageJs = read('pages/two-line-position/two-line-position.js');
  const pageWxss = read('pages/two-line-position/two-line-position.wxss');
  const pageJson = JSON.parse(
    read('pages/two-line-position/two-line-position.json')
  );
  check(pageJson.navigationBarTitleText === '两直线位置关系',
    '页面标题为两直线位置关系');
  check(pageWxml.includes('wx:for="{{positionOptions}}"')
    && pageWxml.includes('bindtap="selectPosition"'),
  '第一排提供一般位置与特殊位置两个按钮');
  check(pageWxml.includes('wx:for="{{judgementOptions}}"')
    && pageWxml.includes('bindtap="selectJudgement"'),
  '第一排提供平行判断与相交判断两个按钮');
  check(pageWxml.indexOf('class="judgement-tabs"')
    < pageWxml.indexOf('class="position-tabs"'),
  '平行/相交判断位于一般/特殊位置按钮之前');
  check(!pageWxml.includes('relationOptions')
    && !pageWxml.includes('selectedPreset')
    && !pageWxml.includes('bindtap="selectPreset"'),
  '页面已删除平行、相交、交叉三个关系按钮');
  check(!pageWxml.includes('handleRotateView')
    && !pageWxml.includes('handleReset')
    && !pageWxml.includes('>旋转<')
    && !pageWxml.includes('>重置<'),
  '页面已删除旋转和重置按钮');
  check(!pageWxml.includes('card-heading')
    && !pageWxml.includes('relation-card')
    && !pageWxml.includes('为什么？'),
  '页面删除旧标题行、关系分析卡和“为什么”入口');
  check(!/bindtouch(start|move|end|cancel)=/.test(pageWxml),
    'Canvas 不绑定端点拖动事件');
  check(pageWxml.includes('class="criteria-card judgement-{{selectedJudgement}}"')
    && pageWxml.includes('{{criteriaRule}}')
    && pageWxml.includes('{{criteriaHighlight}}'),
  '底部判别准则根据判断类型动态显示');
  check(pageWxml.includes('投影视交点（非空间交点）')
    && pageWxml.includes('class="legend-ring"'),
  '特殊位置反例用空心点说明投影视交点不等同空间交点');
  check(!pageWxml.includes('交叉')
    && !pageWxml.includes('挑战模式')
    && !pageWxml.includes('专项训练')
    && !pageWxml.includes('保存场景'),
  '页面不保留交叉、挑战、专项训练和保存回放');

  check(pageJs.includes('judgementOptions: model.JUDGEMENT_OPTIONS')
    && pageJs.includes("selectedJudgement: 'parallel'")
    && pageJs.includes("positionMode: 'general'"),
  '页面默认状态为一般位置直线和平行判断');
  check(pageJs.includes('selectJudgement(event)')
    && pageJs.includes('selectPosition(event)')
    && !pageJs.includes('selectPreset')
    && !pageJs.includes('handleRotateView')
    && !pageJs.includes('handleReset'),
  '页面逻辑只保留位置和判断类型切换');
  check(pageJs.includes('若两直线的各同面投影均互相平行')
    && pageJs.includes('若为一般位置直线，由两面投影互相平行即可判断两直线空间平行。')
    && pageJs.includes('若为特殊位置直线，则需要做进一步辅助判断。'),
  '平行判断包含准则正文、一般位置要点和特殊位置要点');
  check(pageJs.includes('若两直线的各同面投影均相交')
    && pageJs.includes('交点的投影符合点的投影规律')
    && pageJs.includes('若为一般位置直线，由两面投影满足上述条件，即可判断两直线空间相交。'),
  '相交判断包含准则正文和一般位置要点');
  check(pageJs.includes('当前两条侧平线的正面、水平投影虽然都平行')
    && pageJs.includes('侧面投影不平行')
    && pageJs.includes('当前水平线与正平线的正面、水平投影虽然都出现交点')
    && pageJs.includes('两组交点不在同一投影连线上'),
  '特殊位置平行和相交案例均说明投影表象与真实空间关系的差异');
  check(pageJs.includes("startSession('two-line-position')"),
    '页面使用独立学习会话标识');
  check(pageJs.includes('judgement: this.data.selectedJudgement'),
    '学习会话记录判断类型');
  check(pageJs.includes('triangleRender.projectIsometric.call(this, point)'),
    '空间视图复用直角三角形法的 OZ 右旋投影');

  check(pageWxss.includes('.position-tabs')
    && pageWxss.includes('.judgement-tabs')
    && pageWxss.includes('.position-tab.active')
    && pageWxss.includes('.judgement-tab.active'),
  '两排选择按钮具有独立选中样式');
  check(pageWxss.indexOf('.judgement-tabs {')
    < pageWxss.indexOf('.position-tabs {')
    && pageWxss.includes('.judgement-tabs {\n  margin: 1px 3px 0;')
    && pageWxss.includes('.position-tabs {\n  margin: 6px 3px 6px;'),
  '第一条选择行显示为判断类型，第二条显示为位置类型');
  check(pageWxss.includes('.criteria-base')
    && pageWxss.includes('.criteria-highlight')
    && pageWxss.includes('.criteria-highlight-copy'),
  '底部准则正文和重点句具有主次分明的样式');
  check(pageWxss.includes('grid-template-columns: repeat(2, minmax(0, 1fr));')
    && pageWxss.includes('width: 100%;')
    && pageWxss.includes('max-width: 100%;')
    && pageWxss.includes('overflow: hidden;')
    && pageWxss.includes('text-overflow: ellipsis;'),
  '顶部两排四个按钮限制在各自网格列内，不横向重叠');

  const definition = loadPageDefinition();
  check(!!definition && definition.data.positionOptions.length === 2
    && definition.data.judgementOptions.length === 2,
  '页面定义提供两排各两个选项');
  check(definition.data.positionMode === 'general'
    && definition.data.selectedJudgement === 'parallel'
    && definition.data.relationKind === 'parallel',
  '默认进入一般位置直线的平行判断');
  check(definition.data.criteriaRule
    === '若两直线的各同面投影均互相平行，则它们空间平行。'
    && definition.data.criteriaHighlight
      === '若为一般位置直线，由两面投影互相平行即可判断两直线空间平行。',
  '默认底部显示平行准则和一般位置高亮句');

  const interactionPage = createPage(definition);
  interactionPage.selectJudgement({
    currentTarget: { dataset: { key: 'intersect' } }
  });
  check(interactionPage.data.selectedJudgement === 'intersect'
    && interactionPage.data.relationKind === 'intersect'
    && interactionPage.data.criteriaRule.includes('交点的投影符合点的投影规律'),
  '切换到相交判断后同步更新几何和判别准则');
  interactionPage.selectPosition({
    currentTarget: { dataset: { position: 'special' } }
  });
  check(interactionPage.data.positionMode === 'special'
    && interactionPage.data.relationKind === 'skew'
    && interactionPage.data.criteriaHighlight
      === '若为特殊位置直线，则需要做进一步辅助判断。',
  '切换特殊位置后保留相交判断并显示特殊反例');
  check(interactionPage.data.criteriaNote.includes('两组交点不在同一投影连线上'),
    '特殊位置相交反例说明视交点不对应同一空间点');
  interactionPage.selectJudgement({
    currentTarget: { dataset: { key: 'parallel' } }
  });
  check(interactionPage.data.selectedJudgement === 'parallel'
    && interactionPage.data.relationKind === 'skew'
    && interactionPage.data.criteriaNote.includes('侧面投影不平行'),
  '特殊位置平行反例说明仅凭正面和水平投影不能判定平行');

  const coordinates = [];
  const drawnText = [];
  ['general', 'special'].forEach((positionMode) => {
    ['parallel', 'intersect'].forEach((judgementKey) => {
      const page = createPage(definition);
      page.data.positionMode = positionMode;
      page.data.selectedJudgement = judgementKey;
      page.data.lines = normalizeLines(positionMode, judgementKey);
      page.data.relationKind = model.classify(page.data.lines).kind;
      page.data.judgementTitle = judgementKey === 'parallel'
        ? '平行判断'
        : '相交判断';
      page.data.positionLabel = positionMode === 'general'
        ? '一般位置直线'
        : '特殊位置直线';
      page._relation = model.classify(page.data.lines);
      page.canvasWidth = 360;
      page.canvasHeight = 520;
      page.projectIsometric = function projectIsometric(pointValue) {
        return triangleRender.projectIsometric.call(this, pointValue);
      };
      renderer.drawScene(createContext(coordinates, drawnText), page);
    });
  });
  check(coordinates.length > 0, '四种状态均产生有效 Canvas 坐标');
  check(['平行判断', '相交判断', '一般位置直线', '特殊位置 · 侧平线',
    '特殊位置 · 水平线与正平线']
    .every((term) => drawnText.some((value) => value.includes(term))),
  'Canvas 标明当前判断类型和位置类型');
  check(['a′', 'b′', 'c′', 'd′', 'a″', 'b″', 'c″', 'd″']
    .every((label) => drawnText.includes(label)),
  '三视图端点统一使用小写字母和对应撇号');
  check(['p', 'p′', 'p″'].every((label) => drawnText.includes(label)),
  '相交判断在三视图中标注 p、p′、p″');
  check(['H', 'V', 'W'].every((label) => drawnText.includes(label)),
  '三个投影面以 H、V、W 单字母标注');
  check(drawnText.includes('Y_H') && drawnText.includes('Y_W'),
    '三视图同时标注 Y_H 与 Y_W');
  check(!drawnText.some((value) => /^d=/.test(value)),
    '空间图不再绘制最短距离和 d= 数值文案');
  check(!['A', 'B', 'C', 'D'].some((label) => drawnText.includes(label)),
    '空间图不再绘制黑色 A/B/C/D 端点文字');
  check(!drawnText.includes('H 面') && !drawnText.includes('V 面')
    && !drawnText.includes('W 面'),
  '投影面不显示额外中文面名');

  const renderSource = read(
    'pages/two-line-position/two-line-position-render.js'
  );
  check(renderSource.includes('drawProjectionConnections(context, page, relation)'),
    '三视图绘制投影对应连线');
  check(renderSource.includes(
    'drawLine(context, views.front, views.top, COLORS.guide, 0.65)'
  ), '投影连线使用细实线');
  check(renderSource.includes("drawCornerLabel(context, 'V', xzPoint")
    && renderSource.includes("drawCornerLabel(context, 'W', yzPoint")
    && renderSource.includes("drawCornerLabel(context, 'H', yPoint"),
  'H/V/W 分别位于三块投影面的角部');
  check(renderSource.includes('const viewPositions = {')
    && renderSource.includes('y: projectionBottom - 12')
    && renderSource.includes('x: projectionRight - 14'),
  '三视图的 V/H/W 标签固定在各自视图外角');
  check(renderSource.includes('第一角三视图 · ${judgementLabel}')
    && renderSource.includes('${judgementLabel} · ${positionLabel}'),
  '空间图和三视图标题随判断类型及位置类型更新');
  check(renderSource.includes("relation.kind === 'skew'")
    && renderSource.includes('drawHollowPoint('),
  '特殊位置反例用空心点标出投影视交点');
  check(renderSource.includes('context.globalAlpha = 0.92')
    && renderSource.includes('drawLine(context, start, end, entry.color, 1.6)'),
  '空间投影线使用高不透明度和加粗线宽');
  check(renderSource.includes('drawProjectionPoint(')
    && renderSource.includes("context.strokeStyle = 'rgba(255, 255, 255, 0.96)'"),
  '三视图端点文字带有白色衬底并限制在绘图区内');
  check(!renderSource.includes('relation.distance.toFixed')
    && !renderSource.includes("'#d4d8dd'"),
  '空间图不再绘制白色最近距离虚线');

  const firstPage = createPage(definition);
  check(typeof firstPage.projectIsometric === 'function',
    '页面定义空间投影函数');
  [
    { width: 320, height: 450 },
    { width: 800, height: 440 },
    { width: 1024, height: 700 }
  ].forEach((size) => {
    const responsivePage = createPage(definition);
    responsivePage.canvasWidth = size.width;
    responsivePage.canvasHeight = size.height;
    const layout = responsivePage.getLayout();
    const spacePoints = [
      { x: 0, y: 0, z: 0 },
      { x: 8.8, y: 8.8, z: 0 },
      { x: 8.8, y: 0, z: 8.8 },
      { x: 0, y: 8.8, z: 8.8 }
    ];
    ['general', 'special'].forEach((positionMode) => {
      ['parallel', 'intersect'].forEach((judgementKey) => {
        const lines = normalizeLines(positionMode, judgementKey);
        spacePoints.push(
          lines.line1.start,
          lines.line1.end,
          lines.line2.start,
          lines.line2.end
        );
      });
    });
    const screenPoints = spacePoints.map(
      (source) => responsivePage.projectIsometric(source)
    );
    check(screenPoints.every((screenPoint) => screenPoint.x >= 0
      && screenPoint.x <= layout.leftWidth
      && screenPoint.y >= 0
      && screenPoint.y <= layout.topHeight),
    `${size.width}×${size.height} 空间图完整位于绘图区`);
  });

  console.log(`two-line-position-check：合计 ${checks} 项，通过 ${checks}，失败 0`);
}

main();
