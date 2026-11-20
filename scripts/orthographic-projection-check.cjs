#!/usr/bin/env node
// 正投影：几何真值、三种位置关系、页面结构、路由和 Canvas 接线检查。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../pages/orthographic-projection/orthographic-projection-model.js');
const renderer = require('../pages/orthographic-projection/orthographic-projection-render.js');

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
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function createContext(drawnText, coordinates) {
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
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect(...args) { record('fillRect', args); },
    beginPath: noop,
    closePath: noop,
    rect: noop,
    clip: noop,
    moveTo(...args) { record('moveTo', args); },
    lineTo(...args) { record('lineTo', args); },
    arc(...args) { record('arc', args); },
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    fillText(value, x, y) {
      record('fillText', [x, y]);
      if (drawnText) drawnText.push(String(value));
    },
    arcTo: noop,
    scale: noop
  };
}

function pointIsFinite(value) {
  return !!value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function main() {
  check(model.RELATION_OPTIONS.length === 3, '位置关系固定为三种');
  check(
    model.RELATION_OPTIONS.map((item) => item.key).join(',')
      === 'parallel,perpendicular,oblique',
    '位置关系顺序为平行、垂直、倾斜'
  );
  check(
    model.RELATION_OPTIONS.map((item) => item.property).join(',')
      === '真实性,积聚性,相似性',
    '投影表现统一命名为真实性、积聚性、相似性'
  );
  const expectedTypes = {
    parallel: ['投影面平行线', '投影面平行平面'],
    perpendicular: ['投影面垂直线', '投影面垂直平面'],
    oblique: ['一般位置直线', '一般位置平面']
  };
  Object.keys(expectedTypes).forEach((key) => {
    const definition = model.RELATION_DEFINITIONS[key];
    check(definition.lineType === expectedTypes[key][0],
      `${definition.property}线段名称为${expectedTypes[key][0]}`);
    check(definition.planeType === expectedTypes[key][1],
      `${definition.property}平面名称为${expectedTypes[key][1]}`);
  });
  check(
    model.RELATION_OPTIONS.every((item) => !JSON.stringify(item).includes('类似性')),
    '正投影模型不再使用类似性术语'
  );

  ['parallel', 'perpendicular', 'oblique'].forEach((relationKey) => {
    const scene = model.createRelationScene(relationKey);
    check(scene.key === relationKey, `${relationKey} 场景使用所选关系`);
    check(scene.line.detectedRelation === relationKey,
      `${relationKey} 线段位置关系识别正确`);
    check(scene.plane.detectedRelation === relationKey,
      `${relationKey} 平面位置关系识别正确`);
    check(pointIsFinite(scene.line.source.start)
      && pointIsFinite(scene.line.source.end),
    `${relationKey} 线段空间端点有限`);
    check(scene.plane.source.every(pointIsFinite),
      `${relationKey} 平面空间顶点有限`);
    check([
      scene.line.projected.start,
      scene.line.projected.end,
      ...scene.plane.projected
    ].every((item) => pointIsFinite(item) && Math.abs(item.z) <= model.EPSILON),
    `${relationKey} 所有投影点都位于 P 面`);
    [scene.line.rays.start, scene.line.rays.end, ...scene.plane.rays]
      .forEach((ray, index) => {
        close(ray.start.x, ray.end.x, model.EPSILON,
          `${relationKey} 第 ${index + 1} 条投射线保持 x`);
        close(ray.start.y, ray.end.y, model.EPSILON,
          `${relationKey} 第 ${index + 1} 条投射线保持 y`);
        check(ray.start.z > 0 && Math.abs(ray.end.z) <= model.EPSILON,
          `${relationKey} 第 ${index + 1} 条投射线垂直落到 P`);
      });
  });

  const parallel = model.createRelationScene('parallel');
  close(
    parallel.line.metrics.projectedLength,
    parallel.line.metrics.trueLength,
    1e-8,
    '真实性：线段投影反映实长'
  );
  close(
    parallel.plane.metrics.projectedArea,
    parallel.plane.metrics.trueArea,
    1e-8,
    '真实性：平面投影反映实形面积'
  );
  check(!parallel.plane.metrics.isProjectionCollinear,
    '真实性：平面投影保持三角形');

  const perpendicular = model.createRelationScene('perpendicular');
  close(
    perpendicular.line.metrics.projectedLength,
    0,
    model.EPSILON,
    '积聚性：垂直线段投影为一点'
  );
  close(
    perpendicular.plane.metrics.projectedArea,
    0,
    model.EPSILON,
    '积聚性：垂直平面投影面积为零'
  );
  check(perpendicular.plane.metrics.isProjectionCollinear,
    '积聚性：垂直平面投影为一条直线');
  check(perpendicular.line.metrics.trueLength > 0
    && perpendicular.plane.metrics.trueArea > 0,
  '积聚性场景中的空间图形本身非退化');

  const oblique = model.createRelationScene('oblique');
  check(
    oblique.line.metrics.projectedLength > 0
      && oblique.line.metrics.projectedLength < oblique.line.metrics.trueLength,
    '相似性：倾斜线段投影缩短但不消失'
  );
  check(
    oblique.plane.metrics.projectedArea > 0
      && oblique.plane.metrics.projectedArea < oblique.plane.metrics.trueArea,
    '相似性：倾斜平面投影面积缩小但不消失'
  );
  check(!oblique.plane.metrics.isProjectionCollinear,
    '相似性：倾斜平面仍投影为三角形');
  const obliqueSourceScreenArea = model.triangleArea2D(
    oblique.plane.source.map((item) => renderer.rawToCanvas(item))
  );
  check(obliqueSourceScreenArea > 2,
    '相似性：空间平面在等轴测画面中保持清晰三角形，不近似为直线');
  check(
    oblique.plane.projected.every((item) => Number.isFinite(item.x)),
    '相似性：倾斜平面投影点均为有限值'
  );

  const appJson = JSON.parse(read('app.json'));
  check(appJson.pages.includes(
    'pages/orthographic-projection/orthographic-projection'
  ), 'app.json 已注册正投影页面');

  const catalog = require('../config/course-catalog.js');
  const firstChapter = catalog.chapters[0];
  const firstIds = firstChapter.points.slice(0, 3).map((point) => point.id);
  check(
    firstIds.join(',') === 'projection-basic,orthographic-projection,projection-system',
    '第一章顺序为投影法基础、正投影、三面投影体系'
  );
  const point = firstChapter.points.find((item) => item.id === 'orthographic-projection');
  check(!!point && point.title === '正投影', '课程目录新增正投影知识点');
  check(point.availability === 'available', '正投影知识点标记为可用');
  check(point.route.path === '/pages/orthographic-projection/orthographic-projection',
    '正投影课程入口指向独立页面');
  check(point.keywords.includes('真实性')
    && point.keywords.includes('积聚性')
    && point.keywords.includes('相似性'),
  '正投影搜索关键词包含三项投影表现');
  check(!read('config/course-catalog.js').includes('类似性'),
    '课程目录统一使用相似性');

  const pageJs = read('pages/orthographic-projection/orthographic-projection.js');
  const pageWxml = read('pages/orthographic-projection/orthographic-projection.wxml');
  const pageWxss = read('pages/orthographic-projection/orthographic-projection.wxss');
  const modelSource = read('pages/orthographic-projection/orthographic-projection-model.js');
  const pageJson = JSON.parse(read('pages/orthographic-projection/orthographic-projection.json'));
  check(pageJson.navigationBarTitleText === '正投影', '页面导航标题为“正投影”');
  check(pageWxml.includes('id="relationCanvas"')
    && !pageWxml.includes('definitionCanvas'),
  '页面只保留正投影基本性质 Canvas');
  check(pageWxml.includes('url="/pages/home/home"')
    && pageWxml.includes('open-type="reLaunch"'),
  '页面提供返回课程首页的真实入口');
  check(pageWxml.includes('wx:for="{{relationOptions}}"')
    && pageWxml.includes('data-relation="{{item.key}}"')
    && pageWxml.includes('bindtap="selectRelation"'),
  '位置关系的三个状态由交互按钮驱动');
  ['真实性', '积聚性', '相似性'].forEach((term) => {
    check(modelSource.includes(term) || pageWxml.includes(term),
      `页面呈现术语：${term}`);
  });
  check(!`${pageJs}\n${pageWxml}\n${pageWxss}`.includes('类似性'),
    '正投影页面统一使用相似性');
  check(pageWxml.includes('正投影的基本性质')
    && !pageWxml.includes('位置关系与投影表现'),
  '页面标题已改为正投影的基本性质');
  check(!pageWxml.includes('class="definition-card"')
    && !pageWxml.includes('投射线互相平行，并且垂直于投影面 P。'),
  '页面已删除顶部独立正投影定义卡');
  const propertyRule = (pageWxss.match(/\.relation-property\s*\{[\s\S]*?\}/) || [''])[0];
  check(propertyRule.includes('font-size: 24rpx')
    && propertyRule.includes('font-weight: 750'),
  '真实性、积聚性、相似性标签已加大');
  check(pageWxml.includes('{{relationLineType}}')
    && pageWxml.includes('{{relationPlaneType}}'),
  '结果卡按当前关系显示线段和平面类型名称');
  check(pageWxml.includes('层次提示')
    && pageWxml.includes('本页说明正投影结果与空间形状之间的度量表现'),
  '页面明确区分投影法性质与正投影表现');
  check(model.RELATION_DEFINITIONS.parallel.bridge.includes(
    '识别投影面平行线和投影面平行面'
  ),
    '真实性衔接后续投影面平行线和平面');
  check(model.RELATION_DEFINITIONS.perpendicular.bridge.includes(
    '识别投影面垂直线和投影面垂直面'
  ),
    '积聚性衔接后续投影面垂直线和平面');
  check(model.RELATION_DEFINITIONS.oblique.bridge.includes(
    '直角三角形法或辅助作图'
  ),
    '相似性衔接一般位置求解方法');
  check(pageJs.includes("chapter_id: 'orthographic-projection'")
    && pageJs.includes("knowledge_point_id: 'G01'"),
  '学习事件使用正投影章节标识与 G01 知识点');
  check(pageJs.includes('animateRelation(0, 1, 1500)')
    && pageJs.includes('handleReplay'),
  '页面支持首次投影动画和重新播放');
  check(pageJs.includes("type: '2d'") === false
    && pageWxml.includes('type="2d"'),
  'Canvas 2D 节点由页面声明');
  check(pageWxss.includes('.relation-canvas')
    && !pageWxss.includes('.definition-canvas'),
  '只保留正投影基本性质 Canvas 的响应式尺寸样式');

  const text = [];
  const coords = [];
  const context = createContext(text, coords);
  ['parallel', 'perpendicular', 'oblique'].forEach((relationKey) => {
    renderer.drawStage(context, 375, 560, 'relation', {
      relationKey,
      progress: 1
    });
  });
  check(text.includes('P'), 'Canvas 绘制投影面 P');
  check(['真实性', '积聚性', '相似性']
    .every((term) => text.some((item) => item.includes(term))),
    'Canvas 为三种位置关系绘制对应表现');
  check(text.includes('e(f)'), '积聚性线段投影点标注为同一点');
  [
    '投影面平行线', '投影面平行平面',
    '投影面垂直线', '投影面垂直平面',
    '一般位置直线', '一般位置平面'
  ].forEach((term) => {
    check(text.includes(term), `Canvas 显示几何类型：${term}`);
  });
  check(coords.length > 0, 'Canvas 绘制产生有效坐标');

  const planeBounds = renderer.RELATION_PLANE_BOUNDS;
  check(
    planeBounds.maxX - planeBounds.minX >= 6.5
      && planeBounds.maxY - planeBounds.minY >= 5.5,
    '三种状态使用统一的放大投影面'
  );
  const fixedRect = { x: 8, y: 42, width: 342, height: 250 };
  const firstViewport = renderer.createRelationViewport(fixedRect);
  const secondViewport = renderer.createRelationViewport(fixedRect);
  check(
    JSON.stringify(firstViewport) === JSON.stringify(secondViewport),
    '同一尺寸下三种状态共用固定投影面视口'
  );
  const relationPlane = renderer.getRelationPlane();
  const planeScreen = relationPlane.map(
    (item) => renderer.worldToCanvas(item, firstViewport)
  );
  const planeWidth = Math.max.apply(null, planeScreen.map((item) => item.x))
    - Math.min.apply(null, planeScreen.map((item) => item.x));
  check(planeWidth >= 150, '投影面在手机面板中充分放大');

  const narrowCoords = [];
  renderer.drawStage(createContext([], narrowCoords), 277, 300, 'relation', {
    relationKey: 'perpendicular',
    progress: 0.7
  });
  check(narrowCoords.every((value) => Number.isFinite(value)),
    '窄屏 Canvas 动画中间帧不产生 NaN');

  const renderSource = read(
    'pages/orthographic-projection/orthographic-projection-render.js'
  );
  check(renderSource.includes('projectPointOrthographic') === false,
    '渲染层不重复实现正投影公式');
  check(pageJs.includes("require('./orthographic-projection-model.js')")
    && pageJs.includes("require('./orthographic-projection-render.js')"),
  '页面层分离几何模型与 Canvas 渲染');
  check(!pageJs.includes('three.js') && !pageJs.includes('WebGL'),
    '页面未引入 Three.js 或 WebGL');
  check(!renderSource.includes('[4, 3]')
    && renderSource.includes('COLORS.ray, 0.85'),
  '投射线使用细实线');

  console.log(`orthographic-projection-check：合计 ${checks} 项，通过 ${checks}，失败 0`);
}

main();
