#!/usr/bin/env node
// 投影法基础：纯几何、页面结构、路由和 Canvas 绘制接线检查。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../pages/projection-method/projection-method-model.js');
const renderer = require('../pages/projection-method/projection-method-render.js');

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

function createContext(drawnText, coordinateCalls, pathCalls) {
  const record = (name, args) => {
    args.forEach((value) => {
      if (typeof value === 'number') {
        check(Number.isFinite(value), `${name} 的数值参数必须有限`);
        if (coordinateCalls) coordinateCalls.push(value);
      }
    });
  };
  const noop = () => {};
  return {
    lineDash: [],
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
    moveTo(...args) {
      record('moveTo', args);
      if (pathCalls) pathCalls.push({ type: 'moveTo', args });
    },
    lineTo(...args) {
      record('lineTo', args);
      if (pathCalls) pathCalls.push({ type: 'lineTo', args });
    },
    arc(...args) { record('arc', args); },
    fill: noop,
    stroke: noop,
    setLineDash(pattern) {
      this.lineDash = (pattern || []).slice();
    },
    fillText(text, x, y) {
      record('fillText', [x, y]);
      if (drawnText) drawnText.push(String(text));
    },
    arcTo: noop,
    scale: noop
  };
}

function main() {
  const plane = model.MODEL_PLANE;
  const centerProjection = model.projectTriangleFromCenter(
    model.DEFAULT_TRIANGLE,
    model.DEFAULT_CENTER,
    plane
  );
  check(centerProjection.isValid, '中心投影可以生成三个有限投影点');
  ['a', 'b', 'c'].forEach((key) => {
    close(
      model.planeSignedDistance(centerProjection.projected[key], plane),
      0,
      1e-8,
      `中心投影 ${key} 位于投影面`
    );
    check(
      model.arePointsCollinear(
        model.DEFAULT_CENTER,
        centerProjection.source[key],
        centerProjection.projected[key]
      ),
      `中心投影 ${key} 的 S、空间点和投影点共线`
    );
    check(
      centerProjection.projected[key].x >= 0
        && centerProjection.projected[key].x <= model.PLANE_DISPLAY_EXTENT
        && centerProjection.projected[key].y >= 0
        && centerProjection.projected[key].y <= model.PLANE_DISPLAY_EXTENT,
      `中心投影 ${key} 落在投影面显示范围内`
    );
  });

  const leftObliqueDirection = model.getRayDirectionFromPlaneAngle(
    45,
    plane,
    1
  );
  const rightObliqueDirection = model.getRayDirectionFromPlaneAngle(
    45,
    plane,
    -1
  );
  close(leftObliqueDirection.x, -rightObliqueDirection.x, 1e-8,
    '滑杆左右两侧产生镜像的投射线方向');
  close(leftObliqueDirection.z, rightObliqueDirection.z, 1e-8,
    '滑杆左右两侧保持相同的垂直分量');

  const orthographicDirection = model.getRayDirectionFromPlaneAngle(90, plane);
  const orthographicProjection = model.projectTriangleParallel(
    model.DEFAULT_TRIANGLE,
    orthographicDirection,
    plane
  );
  check(orthographicProjection.isValid, '正投影可以生成三个有限投影点');
  ['a', 'b', 'c'].forEach((key) => {
    const source = orthographicProjection.source[key];
    const projected = orthographicProjection.projected[key];
    const ray = orthographicProjection.rays[key];
    close(source.x, projected.x, 1e-8, `正投影 ${key} 保持 x`);
    close(source.y, projected.y, 1e-8, `正投影 ${key} 保持 y`);
    close(projected.z, 0, 1e-8, `正投影 ${key} 位于投影面`);
    close(ray.start.z, model.RAY_TOP_Z, 1e-8,
      `平行投影 ${key} 的投射线从与中心投影相同的顶部高度开始`);
    check(model.arePointsCollinear(ray.start, source, projected),
      `平行投影 ${key} 的顶部、形体和投影点共线`);
    check(
      projected.x >= 0 && projected.x <= model.PLANE_DISPLAY_EXTENT
        && projected.y >= 0 && projected.y <= model.PLANE_DISPLAY_EXTENT,
      `平行投影 ${key} 落在投影面显示范围内`
    );
  });
  const centeredViewport = renderer.centerViewportOnProjection(
    375,
    300,
    orthographicProjection.projected
  );
  const projectedCentroidX = ['a', 'b', 'c']
    .map((key) => renderer.worldToCanvas(orthographicProjection.projected[key], centeredViewport).x)
    .reduce((sum, value) => sum + value, 0) / 3;
  close(projectedCentroidX, 187.5, 1e-8,
    '默认正投影三角形在画布中水平居中');
  const invariance = model.createPropertyScene('invariance', 0).invariance;
  check(invariance.line.source.start.z !== invariance.line.source.end.z
    && invariance.line.projected.start.z === 0
    && invariance.line.projected.end.z === 0,
  '不变性直线以倾斜投影方式落在投影面上');
  check(Math.abs(
    invariance.line.projected.start.x - invariance.line.source.start.x
  ) > 0.1, '不变性直线使用倾斜投射线');
  check(!model.arePointsCollinear(
    invariance.triangle.projected.a,
    invariance.triangle.projected.b,
    invariance.triangle.projected.c
  ), '不变性三角形的投影仍为三角形');
  check(model.isParallelDirection(
    model.subtract(
      invariance.parallelLines.first.end,
      invariance.parallelLines.first.start
    ),
    model.subtract(
      invariance.parallelLines.second.end,
      invariance.parallelLines.second.start
    )
  ), '不变性场景明确包含两条空间平行线');
  check(model.isParallelDirection(
    model.subtract(
      invariance.parallelLines.projectedFirst.end,
      invariance.parallelLines.projectedFirst.start
    ),
    model.subtract(
      invariance.parallelLines.projectedSecond.end,
      invariance.parallelLines.projectedSecond.start
    )
  ), '两条平行直线的投影仍相互平行');
  check(invariance.rectangle.isOrthographicToPlane === true
    && invariance.rectangle.projected.every((point) => Math.abs(point.z) <= 1e-8),
  '不变性矩形采用正投影并落在投影面上');
  check(invariance.rectangle.width > 0 && invariance.rectangle.height > 0
    && model.isParallelDirection(
      model.subtract(invariance.rectangle.source[1], invariance.rectangle.source[0]),
      model.subtract(invariance.rectangle.projected[1], invariance.rectangle.projected[0])
    ),
  '不变性矩形投影保持尺寸与平行关系');
  close(
    model.distance(invariance.rectangle.source[0], invariance.rectangle.source[1]),
    model.distance(invariance.rectangle.projected[0], invariance.rectangle.projected[1]),
    1e-8,
    '不变性矩形正投影保持长边实长'
  );
  close(
    model.distance(invariance.rectangle.source[1], invariance.rectangle.source[2]),
    model.distance(invariance.rectangle.projected[1], invariance.rectangle.projected[2]),
    1e-8,
    '不变性矩形正投影保持短边实长'
  );

  const accumulation = model.createPropertyScene('accumulation', 0).accumulation;
  check(model.arePointsCollinear(
    accumulation.line.start,
    accumulation.line.end,
    accumulation.lineProjection
  ), '积聚性直线与斜投射线平行');
  check(model.isParallelDirection(
    model.subtract(accumulation.line.end, accumulation.line.start),
    accumulation.direction
  ), '积聚性演示使用斜投影法');
  close(accumulation.lineProjection.z, 0, 1e-8,
    '空间直线投影为一点');
  check(accumulation.planeProjection.every((point) => Math.abs(point.z) <= 1e-8),
    '空间平面各点投影均位于投影面');
  check(model.arePointsCollinear(
    accumulation.planeProjection[0],
    accumulation.planeProjection[1],
    accumulation.planeProjection[2]
  ), '空间平面投影积聚为直线');
  const insideX = (point) => point.y - point.x;
  const accumulationLineMinX = Math.min(
    insideX(accumulation.line.start),
    insideX(accumulation.line.end),
    insideX(accumulation.lineProjection)
  );
  const accumulationPlaneMaxX = Math.max.apply(
    null,
    accumulation.plane.concat(accumulation.planeProjection).map(insideX)
  );
  check(accumulationLineMinX > accumulationPlaneMaxX,
    '积聚性空间直线位于投影平面图形右侧且不被遮挡');

  const incidence = model.createPropertyScene('incidence', 0).incidence;
  check(model.arePointsCollinear(
    incidence.line.start,
    incidence.line.point,
    incidence.line.end
  ), '从属性 H 位于空间直线 EF 上');
  check(model.arePointsCollinear(
    incidence.line.projectedStart,
    incidence.line.projectedPoint,
    incidence.line.projectedEnd
  ), '从属性 h 位于投影线 ef 上');
  const planeNormal = model.cross(
    model.subtract(incidence.plane.source[1], incidence.plane.source[0]),
    model.subtract(incidence.plane.source[2], incidence.plane.source[0])
  );
  close(model.dot(
    planeNormal,
    model.subtract(incidence.plane.point, incidence.plane.source[0])
  ), 0, 1e-8, '从属性 J 位于空间平面 ABC 内');
  check(incidence.plane.projected.every((point) => Math.abs(point.z) <= 1e-8)
    && Math.abs(incidence.plane.projectedPoint.z) <= 1e-8,
  '从属性 J 及其所在平面均投到投影面');
  const incidenceLineMinX = Math.min(
    insideX(incidence.line.start),
    insideX(incidence.line.end),
    insideX(incidence.line.projectedStart),
    insideX(incidence.line.projectedEnd)
  );
  const incidencePlaneMaxX = Math.max.apply(
    null,
    incidence.plane.source.concat(incidence.plane.projected).map(insideX)
  );
  check(incidenceLineMinX > incidencePlaneMaxX,
    '从属性直线案例位于平面案例右侧且不交叉');

  const ratio = model.createPropertyScene('ratio', 0.37).ratio;
  close(ratio.sourceRatioBefore, ratio.projectedRatioBefore, 1e-8,
    '等比性保持 EH/EF 比例');
  close(ratio.sourceRatioAfter, ratio.projectedRatioAfter, 1e-8,
    '等比性保持 HF/EF 比例');
  close(ratio.projectedPoint.z, 0, 1e-8, '等比性投影点 h 位于投影面');

  const appJson = JSON.parse(read('app.json'));
  check(appJson.pages.includes('pages/projection-method/projection-method'),
    'app.json 已注册投影法基础页面');
  const catalog = require('../config/course-catalog.js');
  const firstPoint = catalog.chapters[0].points.find((point) => point.id === 'projection-basic');
  check(!!firstPoint, '课程目录保留 projection-basic 知识点 ID');
  check(firstPoint.title === '投影法基础', '课程目录已更名为投影法基础');
  check(firstPoint.route.path === '/pages/projection-method/projection-method',
    '课程目录跳转投影法基础新页面');

  const pageJs = read('pages/projection-method/projection-method.js');
  const pageWxml = read('pages/projection-method/projection-method.wxml');
  const pageWxss = read('pages/projection-method/projection-method.wxss');
  ['methodsCanvas', 'propertyCanvas'].forEach((id) => {
    check(pageWxml.includes(`id="${id}"`), `页面包含 Canvas：${id}`);
  });
  ['formationCanvas', 'angleCanvas', 'section-formation', 'section-angle', 'section-quiz'].forEach((token) => {
    check(!pageWxml.includes(token), `页面已删除旧模块：${token}`);
  });
  ['hero-card', 'section-nav', 'progress-card'].forEach((token) => {
    check(!pageWxml.includes(token), `页面已删除顶部非教学区域：${token}`);
  });
  check(pageWxml.includes('>投影方法</text>'), '第一模块标题为投影方法');
  check(!pageWxml.includes('中心投影与平行投影</text>'), '已删除第一模块重复大标题');
  check(pageWxml.includes('平行投影法的性质')
    && pageWxml.includes('wx:for="{{propertyOptions}}"'),
  '性质模块只保留平行投影法的四项性质按钮');
  check(pageWxml.includes('class="replay-button"')
    && pageWxml.includes('bindtap="handleMethodReplay"'),
  '投影方法标题行提供重新播放按钮');
  check(!pageWxml.includes('已观察')
    && !pageWxml.includes('demoComplete.methods'),
  '已删除投影方法的已观察状态');
  check(!pageWxml.includes('class="control-row"')
    && !pageWxml.includes('handleMethodPlay')
    && !pageWxml.includes('toggleMethodLabels'),
  '已删除投影方法下方三个按钮');
  const pageSource = `${pageWxml}\n${pageJs}`;
  ['中心投影', '平行投影', '正投影',
    '不变性', '积聚性', '从属性', '等比性'].forEach((text) => {
    check(pageSource.includes(text), `页面包含教学术语：${text}`);
  });
  ['投影的形成', '正投影与斜投影', '学习检验', 'quizItems', 'formationProgress']
    .forEach((token) => {
      check(!pageSource.includes(token), `页面不再包含旧模块文案或状态：${token}`);
    });
  check(!pageSource.includes('对比观察') && !pageJs.includes("key: 'compare'"),
    '已删除对比观察模式');
  check(!pageSource.includes('真实性') && !pageSource.includes('类似性'),
    '已删除旧的正投影真实性、类似性按钮');
  check(!pageWxml.includes('data-projection=')
    && !pageWxml.includes('selectParallelProjection'),
  '已删除正投影和斜投影两个按钮');
  check(pageWxml.includes('min="0"')
    && pageWxml.includes('max="150"')
    && pageWxml.includes('value="{{parallelSliderValue}}"')
    && pageWxml.includes('投射线与 P 面：{{parallelAngleDeg}}°')
    && pageWxml.includes('bindchange="handleParallelAngleChange"'),
  '平行投影通过角度滑杆显示并调整投射线角度');
  check(/parallelSliderValue:\s*75/.test(pageJs)
    && /parallelAngleDeg:\s*90/.test(pageJs)
    && /90 - Math\.abs\(parallelSliderValue - 75\)/.test(pageJs)
    && /parallelSliderValue >= 75 \? -1 : 1/.test(pageJs),
  '滑块正中间为 90°且左右方向映射相反');
  check(pageWxml.includes("parallelAngleDeg === 90 ? 'orthographic'"),
    '90°时页面角度提示切换为正投影高亮状态');
  check(!pageWxml.includes('handlePropertyChange')
    && !pageJs.includes('handlePropertyChange')
    && !pageJs.includes('propertyControl'),
  '等比性不再显示 H 点位置滑块');
  check(!pageJs.includes('three.js') && !pageJs.includes('WebGL'),
    '页面未引入 Three.js 或 WebGL');
  check(pageJs.includes('knowledge_point_id: \'G01\''),
    '学习事件使用 G01');
  check(pageJs.includes('_didInitialMethodPlay') && pageJs.includes('animateMethods(0, 1, 2200)'),
    '进入页面后自动播放一次投影过程');
  check(!pageJs.includes('methodPlaying') && !pageJs.includes('methodShowLabels'),
    '已删除播放状态和标注开关的冗余状态');
  check(pageWxss.includes('.methods-canvas') && pageWxss.includes('.property-canvas'),
    '两个保留模块具有页面样式');
  check(read('pages/projection-method/projection-method-render.js')
    .includes('line(context, through, planeEnd, color, 1.05);'),
  '形体到投影面的投射线使用细实线');
  check(read('pages/projection-method/projection-method-render.js')
    .includes('parallelAngle === 90 ? COLORS.projectionStroke : COLORS.muted'),
  '90°时画布内正投影说明使用红色高亮');

  const text = [];
  const coords = [];
  const context = createContext(text, coords);
  renderer.drawStage(context, 375, 300, 'methods', {
    mode: 'parallel',
    progress: 0.8,
    parallelAngleDeg: 45,
    showLabels: true
  });
  ['invariance', 'accumulation', 'incidence', 'ratio'].forEach((key) => {
    renderer.drawStage(context, 375, 300, 'property', {
      key,
      parameter: key === 'ratio' ? 0.4 : 0,
      showLabels: true
    });
  });
  check(text.includes('P'), 'Canvas 绘制投影面标注');
  check(text.some((item) => item.includes('斜投影'))
    && text.some((item) => item.includes('45°')),
  '斜投影模式绘制 45° 投射线');
  check(text.some((item) => item.includes('AB ∥ CD'))
    && text.some((item) => item.includes('不变性')),
    '不变性演示绘制平行关系和实形说明');
  const renderSource = read('pages/projection-method/projection-method-render.js');
  check(!renderSource.includes("'空间直线'")
    && !renderSource.includes("'积聚为点'")
    && !renderSource.includes("'空间平面'")
    && !renderSource.includes("'积聚为直线'"),
  '积聚性图面不显示附加文字');
  check(renderSource.includes('dot(context, linePoint, COLORS.vertex, 3.5)')
    && renderSource.includes('dot(context, planePoint, COLORS.vertex, 3.4)'),
  '从属性同时绘制直线点和平面点');
  const incidenceText = [];
  renderer.drawStage(createContext(incidenceText, []), 375, 300, 'property', {
    key: 'incidence',
    parameter: 0,
    showLabels: true
  });
  check(['E', 'F', 'H', 'e', 'f', 'h', 'A', 'B', 'C', 'J', 'a', 'b', 'c', 'j']
    .every((label) => incidenceText.includes(label)),
  '从属性图面标注空间点、投影点及空间平面顶点');
  const ratioText = [];
  renderer.drawStage(createContext(ratioText, []), 375, 300, 'property', {
    key: 'ratio',
    parameter: 0.4,
    showLabels: true
  });
  check(['E', 'F', 'H', 'e', 'f', 'h'].every((label) => ratioText.includes(label)),
    '等比性图面标注分点及对应投影点');
  check(coords.length > 0, 'Canvas 绘制调用产生有效坐标');

  const orthographicText = [];
  const orthographicContext = createContext(orthographicText, []);
  renderer.drawStage(orthographicContext, 375, 300, 'methods', {
    mode: 'parallel',
    progress: 1,
    parallelAngleDeg: 90,
    showLabels: true
  });
  check(orthographicText.some((item) => item.includes('正投影'))
    && orthographicText.some((item) => item.includes('90°')),
  '正投影模式绘制 90° 投射线');

  const obliquePaths = [];
  const orthographicPaths = [];
  renderer.drawStage(
    createContext([], [], obliquePaths),
    375,
    300,
    'methods',
    { mode: 'parallel', progress: 1, parallelAngleDeg: 15, showLabels: true }
  );
  renderer.drawStage(
    createContext([], [], orthographicPaths),
    375,
    300,
    'methods',
    { mode: 'parallel', progress: 1, parallelAngleDeg: 90, showLabels: true }
  );
  const firstPlanePath = (calls) => calls
    .filter((call) => call.type === 'moveTo' || call.type === 'lineTo')
    .slice(0, 4);
  check(
    JSON.stringify(firstPlanePath(obliquePaths)) === JSON.stringify(firstPlanePath(orthographicPaths)),
    '拖动角度时投影面位置保持固定'
  );

  console.log(`projection-method-check：合计 ${checks} 项，通过 ${checks}，失败 0`);
}

main();
