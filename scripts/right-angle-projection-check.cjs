#!/usr/bin/env node
// 直角投影定理纯数学、页面接线和 Canvas 绘制检查，不依赖 wx / 网络。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LINE_TYPE_DEFINITIONS,
  MODEL_MIN,
  MODEL_MAX,
  buildGeometry,
  buildGeometryFromEndpoint,
  projectPoint,
  add,
  scale,
  dot,
  normalize
} = require('../pages/right-angle-projection/right-angle-model.js');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function close(actual, expected, tolerance, message) {
  checks += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!current[parts[index]]) current[parts[index]] = {};
    current = current[parts[index]];
  }
  current[parts[parts.length - 1]] = value;
}

function makePageInstance(definition) {
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    canvasWidth: 375,
    canvasHeight: 460,
    _interactionCount: 0,
    setData(patch, callback) {
      Object.keys(patch || {}).forEach((key) => setPath(this.data, key, patch[key]));
      if (typeof callback === 'function') callback();
    },
    scheduleCanvasDraw() {},
    recordInteraction() {
      this._interactionCount += 1;
    }
  });
}

function makeCanvasContext(drawnText, dashPatterns, arcCalls) {
  const noop = () => {};
  return {
    lineDash: [],
    lineWidth: 1,
    save: noop,
    restore: noop,
    clearRect: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    fillRect: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc(x, y, radius) {
      if (arcCalls) {
        arcCalls.push({
          x,
          y,
          radius,
          lineWidth: this.lineWidth,
          strokeStyle: this.strokeStyle
        });
      }
    },
    arcTo: noop,
    fillText(text) {
      if (drawnText) drawnText.push(String(text));
    },
    setLineDash(pattern) {
      this.lineDash = (pattern || []).slice();
      if (dashPatterns) dashPatterns.push(this.lineDash.slice());
    },
    scale: noop
  };
}

function checkSpatialBounds(page, width, height, lineType, armLength) {
  page.canvasWidth = width;
  page.canvasHeight = height;
  page.updateGeometry(lineType, armLength, armLength, false);
  const layout = page.getLayout();
  const geometry = page._geometry;
  const zEnd = page.projectIsometric({ x: 0, y: 0, z: 10 });
  const hBottom = page.projectIsometric({ x: 8.8, y: 8.8, z: 0 });
  close(zEnd.y, 2, 1e-8,
    `${width}x${height} Z 轴箭头顶在黑色区上边`);
  close(hBottom.y, layout.topHeight - 2, 1e-8,
    `${width}x${height} H 面最低角点贴住黑色区下边`);
  const spatialPoints = ['a', 'b', 'c', 'd', 'p']
    .map((key) => geometry.points[key])
    .filter(Boolean);
  const screenPoints = spatialPoints.concat(
    ['a', 'b', 'c', 'd', 'p']
      .map((key) => geometry.projectedPoints[key])
      .filter(Boolean)
  );
  spatialPoints.forEach((point) => {
    check(point.x >= MODEL_MIN && point.x <= MODEL_MAX
      && point.y >= MODEL_MIN && point.y <= MODEL_MAX
      && point.z >= MODEL_MIN && point.z <= MODEL_MAX,
    `${width}x${height} ${lineType}/${armLength} 空间点不越过模型边界`);
  });
  screenPoints.forEach((point) => {
    const screen = page.projectIsometric(point);
    check(screen.x >= 0 && screen.x <= layout.leftWidth
      && screen.y >= 0 && screen.y <= layout.topHeight,
    `${width}x${height} ${lineType}/${armLength} 空间点位于画布内`);
  });

  ['front', 'top', 'left'].forEach((viewType) => {
    ['a', 'b', 'c', 'd', 'p'].forEach((key) => {
      const viewPoint = page.getProjectionScreenPoints(geometry.points[key])[viewType];
      check(viewPoint.x >= layout.projectionLeft + 8
        && viewPoint.x <= layout.projectionLeft + layout.projectionWidth - 8
        && viewPoint.y >= layout.projectionTop + 8
        && viewPoint.y <= layout.projectionTop + layout.projectionHeight - 8,
      `${width}x${height} ${lineType}/${armLength} ${viewType} 投影点 ${key} 位于二维面板内`);
    });
  });
}

function main() {
  Object.keys(LINE_TYPE_DEFINITIONS).forEach((lineType) => {
    const theorem = buildGeometry(lineType, 3, 3);
    check(!!theorem, `${lineType} 演示构型可生成`);
    close(theorem.spatialAngle, 90, 1e-8, `${lineType} 空间两线垂直`);
    close(theorem.projectionAngle, 90, 1e-8, `${lineType} 对应投影保持直角`);
    check(theorem.lineParallelToPlane, `${lineType} l 平行投影面`);
    check(theorem.otherLineIsGeneral, `${lineType} m 为一般位置直线`);
    check(theorem.projectionPerpendicular, `${lineType} 投影判定为垂直`);
    check(Math.abs(dot(theorem.directions.m, theorem.normal)) > 1e-8,
      `${lineType} m 具有法向分量`);
    close(
      Math.hypot(theorem.points.p.x - theorem.points.a.x,
        theorem.points.p.y - theorem.points.a.y,
        theorem.points.p.z - theorem.points.a.z),
      Math.hypot(theorem.points.b.x - theorem.points.p.x,
        theorem.points.b.y - theorem.points.p.y,
        theorem.points.b.z - theorem.points.p.z),
      1e-8,
      `${lineType} 交点两侧的固定线长度相等`
    );

    ['a', 'b', 'c', 'd', 'p'].forEach((key) => {
      const point = theorem.points[key];
      check(point.x >= 0 && point.x <= 8
        && point.y >= 0 && point.y <= 8
        && point.z >= 0 && point.z <= 8,
      `${lineType} ${key.toUpperCase()} 位于 0..8 教学范围`);
    });
  });

  const hPoint = { x: 3, y: 5, z: 7 };
  const hProjection = projectPoint(hPoint, 'H');
  check(hProjection.x === 3 && hProjection.y === 5 && hProjection.z === 0,
    'H 面投影丢弃 z');
  check(projectPoint(hPoint, 'V').y === 0, 'V 面投影丢弃 y');
  check(projectPoint(hPoint, 'W').x === 0, 'W 面投影丢弃 x');

  const theorem = buildGeometry('horizontal', 3, 3);
  close(dot(theorem.directions.l, theorem.directions.m), 0, 1e-8,
    '空间两方向点积为零');
  close(dot(theorem.projectedDirections.l, theorem.projectedDirections.m), 0, 1e-8,
    '投影两方向点积为零');
  check(theorem.linesIntersect && theorem.points.p,
    '默认构型中两直线相交');
  const invalidGeometry = buildGeometryFromEndpoint(
    'horizontal',
    'c',
    { x: 5, y: 6, z: 5 },
    theorem
  );
  check(invalidGeometry.spatialAngle < 89,
    '拖动可生成 m 不垂直 l 的反例');
  check(!invalidGeometry.validationPassed
    && !invalidGeometry.spatialPerpendicular
    && !invalidGeometry.projectionPerpendicular,
  '反例不通过直角投影定理验证');
  check(invalidGeometry.points.d.x === theorem.points.d.x
    && invalidGeometry.points.d.y === theorem.points.d.y
    && invalidGeometry.points.d.z === theorem.points.d.z,
  '拖动 C 时固定端 D 坐标完全不变');

  const fixedD = theorem.points.d;
  const unitL = normalize(theorem.directions.l);
  const exactC = add(fixedD, scale(theorem.directions.m, 4));
  const nearPerpendicularC = add(exactC, scale(unitL, 0.03));
  const snappedGeometry = buildGeometryFromEndpoint(
    'horizontal',
    'c',
    nearPerpendicularC,
    theorem
  );
  close(dot(snappedGeometry.directions.l, snappedGeometry.directions.m), 0, 1e-8,
    '接近垂直时吸附为精确空间直角');
  check(snappedGeometry.validationPassed
    && snappedGeometry.spatialPerpendicular
    && snappedGeometry.projectionPerpendicular,
  '吸附后恢复定理高亮条件');
  check(snappedGeometry.points.d.x === fixedD.x
    && snappedGeometry.points.d.y === fixedD.y
    && snappedGeometry.points.d.z === fixedD.z,
  '吸附时仍保持另一端点不动');

  const offPerpendicularC = add(exactC, scale(unitL, 0.5));
  const offPerpendicularGeometry = buildGeometryFromEndpoint(
    'horizontal',
    'c',
    offPerpendicularC,
    theorem
  );
  check(!offPerpendicularGeometry.validationPassed
    && offPerpendicularGeometry.spatialAngle < 89,
  '离开吸附区后保留非垂直反例');

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes('pages/right-angle-projection/right-angle-projection'),
    '新页面已注册到 app.json');
  const homeWxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
  check(homeWxml.includes('url="/pages/right-angle-projection/right-angle-projection"'),
    '首页关键知识点入口已连接到新页面');

  const pageDir = path.join(ROOT, 'pages/right-angle-projection');
  const wxml = fs.readFileSync(path.join(pageDir, 'right-angle-projection.wxml'), 'utf8');
  const renderSource = fs.readFileSync(path.join(pageDir, 'right-angle-render.js'), 'utf8');
  const pageWxss = fs.readFileSync(
    path.join(pageDir, 'right-angle-projection.wxss'),
    'utf8'
  );
  ['horizontal', 'frontal', 'profile'].forEach((lineType) => {
    check(wxml.includes(`data-type="${lineType}"`), `顶部提供 ${lineType} 平行线选项`);
  });
  ['α', 'β', 'γ'].forEach((symbol) => {
    check(wxml.includes(`<text class="plane-symbol">${symbol}</text>`),
      `顶部仅显示符号 ${symbol}`);
  });
  ['水平线', '正平线', '侧平线'].forEach((visibleName) => {
    check(!wxml.includes(`<text class="plane-symbol">${visibleName}</text>`),
      `顶部不显示 ${visibleName} 文字`);
  });
  check(!wxml.includes('data-plane='), '顶部选项不再表示投影面选择');
  ['toggleLabels', 'toggleGuides', 'toggleRightAngle', 'display-row']
    .forEach((removedControl) => {
      check(!wxml.includes(removedControl), `已移除显示控制 ${removedControl}`);
    });
  ['定理 I', '定理 II（逆）', '垂直相交或交叉的两直线',
    '相交或交叉两直线在同一投影面的投影成直角'].forEach((theoremText) => {
    check(wxml.includes(theoremText), `页面包含定理内容：${theoremText}`);
  });
  check(!wxml.includes('formula-chip'), '定理卡不再混入互动操作标签');
  check(wxml.includes('class="lesson-card theorem-card"')
    && !wxml.includes('theorem-block')
    && !wxml.includes('lesson-index')
    && !wxml.includes('定理与逆定理'),
  '底部只保留单框定理卡和两条定理');
  ['control-card', 'mode-row', 'drag-hint', '平行 H 面', '平行 V 面', '平行 W 面']
    .forEach((removedText) => {
      check(!wxml.includes(removedText), `顶部控制区已移除 ${removedText}`);
    });
  check(!pageWxss.includes('.control-card')
    && pageWxss.includes('height: 30px;')
    && pageWxss.includes('background: #fff;'),
  'α/β/γ 改为无外层托盘的 30px 独立按钮');
  const cardHeadingIndex = wxml.indexOf('class="card-heading"');
  const resetButtonIndex = wxml.indexOf('class="reset-button"');
  const canvasIndex = wxml.indexOf('id="geometryCanvas"');
  check(cardHeadingIndex >= 0 && resetButtonIndex > cardHeadingIndex
    && resetButtonIndex < canvasIndex,
  '重置按钮位于空间直角与三面投影标题行');
  check(pageWxss.includes('height: 460px;')
    && pageWxss.includes('height: 420px;')
    && !pageWxss.includes('height: 500px;')
    && !pageWxss.includes('height: 440px;')
    && !pageWxss.includes('height: 620px;'),
  '直角投影页已使用压缩后的手机和宽屏画布高度');
  check(renderSource.includes("label: 'Z', dx: 10, dy: 10"),
    '直角投影页 Z 轴标签位于轴线右侧');
  const handlers = Array.from(wxml.matchAll(/bind[a-z]+="([A-Za-z0-9_]+)"/g),
    (match) => match[1]);
  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    require(path.join(pageDir, 'right-angle-projection.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '新页面通过 Page() 注册');
  handlers.forEach((handler) => {
    check(typeof pageDefinition[handler] === 'function', `WXML 事件 ${handler} 有实现`);
  });

  const page = makePageInstance(pageDefinition);
  check(!Object.prototype.hasOwnProperty.call(page.data, 'showLabels')
    && !Object.prototype.hasOwnProperty.call(page.data, 'showGuides')
    && !Object.prototype.hasOwnProperty.call(page.data, 'showRightAngle'),
  '页面不再维护三个显示开关状态');
  ['horizontal', 'frontal', 'profile'].forEach((lineType) => {
    [1.2, 3, 3.8].forEach((armLength) => {
      checkSpatialBounds(page, 375, 460, lineType, armLength);
      checkSpatialBounds(page, 900, 420, lineType, armLength);
    });
  });
  page.updateGeometry('horizontal', 3, 3, false);
  check(page.data.selectedLineType === 'horizontal'
    && page._geometry.projectionPerpendicular,
    '页面默认可进入水平线构型');
  page.selectLineType({ currentTarget: { dataset: { type: 'profile' } } });
  check(page.data.selectedLineType === 'profile'
    && page._geometry.projectionPerpendicular,
    '页面可切换到侧平线并保持定理成立');
  page.handleReset();
  check(page.data.selectedLineType === 'horizontal'
    && page._geometry.projectionPerpendicular,
  '重置恢复水平线默认构型');
  close(page._geometry.armLengths.c, 3, 1e-8, '重置恢复 C 端默认长度');
  close(page._geometry.armLengths.d, 3, 1e-8, '重置恢复 D 端默认长度');

  page.canvasWidth = 375;
  page.canvasHeight = 460;
  close(page.getLayout().topHeight, 184, 1e-8,
    '竖屏黑色空间区压缩为画布高度的 40%');
  page.updateGeometry('horizontal', 3, 3, false);
  const fixedAView = page.getProjectionScreenPoints(page._geometry.points.a).top;
  page.handleTouchStart({ touches: [{ x: fixedAView.x, y: fixedAView.y }] });
  check(!page.data.canvasDragging && !page._draggingGeneralPoint,
    '投影面平行线端点不可拖动');

  page.updateGeometry('horizontal', 3, 3, false);
  const edgeStart = page.getProjectionScreenPoints(page._geometry.points.c).top;
  page.handleTouchStart({ touches: [{ x: edgeStart.x, y: edgeStart.y }] });
  page.handleTouchMove({ touches: [{ x: -10000, y: 10000 }] });
  Object.values(page._geometry.points).forEach((point) => {
    if (!point) return;
    check(point.x >= MODEL_MIN && point.x <= MODEL_MAX
      && point.y >= MODEL_MIN && point.y <= MODEL_MAX
      && point.z >= MODEL_MIN && point.z <= MODEL_MAX,
    '拖出投影面板后空间端点仍被限制在边界内');
  });
  page.handleTouchEnd();

  ['front', 'top', 'left'].forEach((viewType, viewIndex) => {
    ['c', 'd'].forEach((endpointKey, endpointIndex) => {
      page.updateGeometry('horizontal', 3, 3, false);
      const geometryBeforeDrag = page._geometry;
      const fixedA = { ...geometryBeforeDrag.points.a };
      const fixedB = { ...geometryBeforeDrag.points.b };
      const otherEndpointKey = endpointKey === 'c' ? 'd' : 'c';
      const fixedOtherEndpoint = { ...geometryBeforeDrag.points[otherEndpointKey] };
      const movingEndpointBefore = { ...geometryBeforeDrag.points[endpointKey] };
      const beforeDirection = { ...geometryBeforeDrag.directions.m };
      const endpointView = page.getProjectionScreenPoints(
        geometryBeforeDrag.points[endpointKey]
      )[viewType];
      page.handleTouchStart({ touches: [{ x: endpointView.x, y: endpointView.y }] });
      check(page.data.canvasDragging && page._draggingGeneralPoint
        && page._draggingView === viewType
        && page._draggingEndpoint === endpointKey,
      `${viewType} 视图命中端点 ${endpointKey.toUpperCase()} 后进入拖动`);
      page.handleTouchMove({
        touches: [{
          x: endpointView.x + 18 + viewIndex * 3,
          y: endpointView.y + 12 + endpointIndex * 4
        }]
      });
      const directionChanged = Math.abs(
        dot(beforeDirection, page._geometry.directions.m) - 1
      ) > 1e-6;
      const movedEndpoint = page._geometry.points[endpointKey];
      const endpointMoved = Math.hypot(
        movedEndpoint.x - movingEndpointBefore.x,
        movedEndpoint.y - movingEndpointBefore.y,
        movedEndpoint.z - movingEndpointBefore.z
      ) > 1e-6;
      check(directionChanged && endpointMoved,
        `${viewType} 视图拖动 ${endpointKey.toUpperCase()} 会改变当前端点及 m 方向`);
      check(page._geometry.points[otherEndpointKey].x === fixedOtherEndpoint.x
        && page._geometry.points[otherEndpointKey].y === fixedOtherEndpoint.y
        && page._geometry.points[otherEndpointKey].z === fixedOtherEndpoint.z,
      `${viewType} 拖动 ${endpointKey.toUpperCase()} 时另一端点 ${otherEndpointKey.toUpperCase()} 完全不动`);
      check(page.data.validationPassed === page._geometry.validationPassed
        && page.data.planeAngleText !== '',
        `${viewType} 拖动 ${endpointKey.toUpperCase()} 时实时更新定理验证`);
      check(page._geometry.points.a.x === fixedA.x
        && page._geometry.points.a.y === fixedA.y
        && page._geometry.points.a.z === fixedA.z
        && page._geometry.points.b.x === fixedB.x
        && page._geometry.points.b.y === fixedB.y
        && page._geometry.points.b.z === fixedB.z,
      `${viewType} 拖动 ${endpointKey.toUpperCase()} 时平行线 l 保持不动`);
      page.handleTouchEnd();
      check(!page.data.canvasDragging && !page._draggingGeneralPoint,
        `${viewType} 拖动 ${endpointKey.toUpperCase()} 松手后解除拖动锁`);
    });
  });

  const drawnText = [];
  const dashPatterns = [];
  const arcCalls = [];
  page.context = makeCanvasContext(drawnText, dashPatterns, arcCalls);
  const projectedPlanes = new Set();
  const drawProjectionOnPlane = page.drawProjectionOnPlane;
  page.drawProjectionOnPlane = function (context, viewDefinition, points, active) {
    projectedPlanes.add(viewDefinition.plane);
    return drawProjectionOnPlane.call(this, context, viewDefinition, points, active);
  };
  const strokeSegments = [];
  const drawLine = page.drawLine;
  page.drawLine = function (context, start, end) {
    strokeSegments.push({
      color: context.strokeStyle,
      dash: context.lineDash.slice()
    });
    return drawLine.call(this, context, start, end);
  };
  page._draggingGeneralPoint = false;
  page.updateGeometry('horizontal', 3, 3, false);
  let correspondenceCalls = 0;
  const drawCorrespondence = page.drawProjectionCorrespondence;
  page.drawProjectionCorrespondence = function (...args) {
    correspondenceCalls += 1;
    return drawCorrespondence.apply(this, args);
  };
  let renderError = null;
  let defaultHasPointLabel = false;
  let defaultHasRightAngle = false;
  let invalidHasRightAngle = null;
  let invalidUsesMutedLine = false;
  let invalidHasPointLabel = null;
  let defaultArcCalls = [];
  try {
    page.drawScene();
    defaultArcCalls = arcCalls.slice();
    defaultHasPointLabel = drawnText.includes('a′');
    defaultHasRightAngle = drawnText.includes('90°');
    check(correspondenceCalls >= 5, '默认绘制 A/B/C/D/P 五点三视图对应线');
    check(strokeSegments.some((segment) => (
      segment.color === 'rgba(255, 179, 71, 0.20)'
    )), '满足定理时绘制 m 的橙色空间高亮轮廓');
    check(strokeSegments.some((segment) => (
      segment.color === 'rgba(116, 229, 157, 0.20)'
    )), '满足定理时绘制 l 的绿色空间高亮轮廓');
    check(!drawnText.includes('水平线 l') && !drawnText.includes('一般位置线'),
      '空间画布不绘制直线中文名称');
    check(drawnText.includes('空间垂直 → 投影出现直角'),
      '空间状态明确说明垂直与投影直角的因果关系');

    const validGeometry = page._geometry;
    const invalidGeometry = buildGeometryFromEndpoint(
      'horizontal',
      'c',
      { x: 5, y: 6, z: 5 },
      validGeometry
    );
    check(!!invalidGeometry && !invalidGeometry.validationPassed,
      '渲染反例构型生成成功');
    page._draggingGeneralPoint = false;
    page._geometry = invalidGeometry;
    drawnText.length = 0;
    strokeSegments.length = 0;
    page.drawScene();
    invalidHasRightAngle = drawnText.includes('90°');
    invalidHasPointLabel = drawnText.includes('a′');
    invalidUsesMutedLine = strokeSegments.some((segment) => (
      segment.color === '#7e858e' || segment.color === '#969ca5'
    ));

    page._geometry = validGeometry;
    page.canvasWidth = 900;
    page.canvasHeight = 420;
    page.updateGeometry('profile', 2.4, 2.4, false);
    page.drawScene();
  } catch (error) {
    renderError = error;
  }
  check(!renderError,
    `竖屏与宽屏 Canvas 绘制路径不抛错${renderError ? `: ${renderError.stack || renderError}` : ''}`);
  check(defaultHasPointLabel, '默认显示三视图端点标注');
  check(defaultHasRightAngle, '默认显示当前投影面的直角高亮');
  const activeEndpointRings = defaultArcCalls.filter((arcCall) => (
    arcCall.lineWidth <= 1.2 && arcCall.radius === 6
  ));
  const inactiveEndpointRings = defaultArcCalls.filter((arcCall) => (
    arcCall.lineWidth <= 1.2 && arcCall.radius === 5
  ));
  check(activeEndpointRings.length === 2 && inactiveEndpointRings.length === 4,
    `C/D 拖动圈使用缩小后的 6px/5px 半径，并与其他点标记保持协调：active=${activeEndpointRings.length}, inactive=${inactiveEndpointRings.length}`);
  check(invalidHasRightAngle === false, 'm 不垂直 l 时不显示直角');
  check(invalidHasPointLabel, 'm 不垂直 l 时仍保留端点标注');
  check(invalidUsesMutedLine, 'm 不垂直 l 时直线与投影使用灰色');
  ['H', 'V', 'W'].forEach((plane) => {
    check(projectedPlanes.has(plane), `三维空间绘制 ${plane} 面上的两条投影线`);
  });
  check(dashPatterns.every((pattern) => pattern.length === 0), '两根直线及投影全部使用实线');
  ['#a8adb5', '#ffb347', '#df5757', '#43a66c', '#3779d0'].forEach((color) => {
    check(strokeSegments.some((segment) => segment.color === color),
      `线段使用约定颜色 ${color}`);
  });
  check(drawnText.includes('空间垂直 → 投影出现直角'), '空间图绘制定理主题');
  ['正投影 V', '水平投影 H', '侧面投影 W'].forEach((viewLabel) => {
    check(drawnText.includes(viewLabel), `三面投影绘制 ${viewLabel}`);
  });
  check(drawnText.includes('90°'), '定理模式绘制投影直角结果');

  console.log(`right-angle-projection-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('right-angle-projection-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
