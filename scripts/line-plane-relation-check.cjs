#!/usr/bin/env node
// 直线与平面相交求交点：16 种类型组合、双投影面、分步作图与 Canvas 检查。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../pages/line-plane-relation/line-plane-model.js');

const ROOT = path.resolve(__dirname, '..');
const LINE_KINDS = ['general', 'vertical', 'frontProjecting', 'profileProjecting'];
const PLANE_KINDS = ['general', 'vertical', 'frontProjecting', 'profileProjecting'];
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
      Object.keys(patch || {}).forEach((key) => {
        setPath(this.data, key, patch[key]);
      });
      if (typeof callback === 'function') callback();
    },
    scheduleCanvasDraw() {},
    recordInteraction() {
      this._interactionCount += 1;
    }
  });
}

function makeCanvasContext(drawnText, strokeCalls, textCalls) {
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
    translate: noop,
    rotate: noop,
    closePath: noop,
    arcTo: noop,
    fill: noop,
    stroke() {
      if (strokeCalls) {
        strokeCalls.push({
          color: this.strokeStyle,
          lineWidth: this.lineWidth,
          dash: this.lineDash.slice()
        });
      }
    },
    arc: noop,
    fillText(text, x, y) {
      if (drawnText) drawnText.push(String(text));
      if (textCalls) {
        textCalls.push({
          text: String(text),
          x,
          y,
          align: this.textAlign || 'left',
          size: this.font
        });
      }
    },
    setLineDash(pattern) {
      this.lineDash = (pattern || []).slice();
    }
  };
}

function buildCombination(planeKind, lineKind) {
  const plane = model.clonePlane(model.PLANE_PRESETS[planeKind]);
  const line = model.buildLineForCombination(plane, lineKind);
  return model.buildGeometry(plane, line);
}

function main() {
  let uniqueCount = 0;
  let noUniqueCount = 0;
  LINE_KINDS.forEach((lineKind) => {
    PLANE_KINDS.forEach((planeKind) => {
      const geometry = buildCombination(planeKind, lineKind);
      check(!!geometry, `${lineKind}/${planeKind} 组合可生成几何`);
      check(geometry.plane.patch.length === 3,
        `${lineKind}/${planeKind} 使用三角形显示平面`);
      check(geometry.plane.vertices.every((point, index) => (
        model.length(model.subtract(point, geometry.plane.patch[index])) <= 1e-8
      )), `${lineKind}/${planeKind} 的 A/B/C 正是三角形三个端点`);
      const patchExtents = ['x', 'y', 'z'].map((axis) => (
        Math.max(...geometry.plane.patch.map((point) => point[axis]))
        - Math.min(...geometry.plane.patch.map((point) => point[axis]))
      ));
      check(Math.max(...patchExtents) >= 3.8,
        `${lineKind}/${planeKind} 平面显示尺寸明显扩大`);
      geometry.plane.patch.forEach((point) => {
        ['x', 'y', 'z'].forEach((axis) => {
          check(point[axis] >= model.PLANE_PATCH_MARGIN - 1e-8
            && point[axis] <= 8 - model.PLANE_PATCH_MARGIN + 1e-8,
          `${lineKind}/${planeKind} 平面显示片与投影面保持间距`);
        });
      });
      geometry.plane.patch.forEach((point, index) => {
        const next = geometry.plane.patch[
          (index + 1) % geometry.plane.patch.length
        ];
        const edge = model.subtract(next, point);
        check(Math.abs(edge.x) > 1e-6
          && Math.abs(edge.y) > 1e-6
          && Math.abs(edge.z) > 1e-6,
        `${lineKind}/${planeKind} 平面边缘不平行于任一投影面`);
      });
      const intersection = geometry.relation.intersection;
      if (lineKind === planeKind && lineKind !== 'general') {
        noUniqueCount += 1;
        check(geometry.relation.kind === 'inPlane',
          `${lineKind}/${planeKind} 同向积聚组合识别为直线在平面内`);
        check(!intersection,
          `${lineKind}/${planeKind} 不伪造唯一交点`);
      } else {
        uniqueCount += 1;
        check(geometry.relation.kind === 'intersect' && !!intersection,
          `${lineKind}/${planeKind} 得到唯一点`);
        check(intersection.isOnSegment,
          `${lineKind}/${planeKind} 交点位于可视线段 EF 内`);
        close(model.signedDistance(
          geometry.plane,
          intersection.point
        ), 0, 1e-8,
        `${lineKind}/${planeKind} 交点属于已知平面`);
      }
    });
  });
  check(uniqueCount === 13, '四种直线与四种平面共有 13 个唯一交点组合');
  check(noUniqueCount === 3, '同向铅垂/正垂/侧垂组合正确识别为三类无唯一交点');

  const generalGeneral = buildCombination('general', 'general');
  check(generalGeneral.plane.patch.length === 3,
    '一般位置平面使用大三角形显示');
  check(Math.min(
    ...['x', 'y', 'z'].map((axis) => (
      Math.max(...generalGeneral.plane.patch.map((point) => point[axis]))
      - Math.min(...generalGeneral.plane.patch.map((point) => point[axis]))
    ))
  ) > 5.6,
  '一般位置三角形尺寸尽量放大');
  check(generalGeneral.methodKind === 'auxiliary',
    '一般线与一般面使用辅助平面法');
  check(!!generalGeneral.auxiliaryPlane && !!generalGeneral.sectionLine,
    '辅助平面组合生成辅助面 Q 和交线 12');
  check(generalGeneral.auxiliaryPlane.recommendedProjectionPlane === 'H',
    '一般线作投影面垂直面时推荐铅垂面');
  check(!!generalGeneral.auxiliaryPlane.trace,
    '辅助平面只生成有积聚性投影的迹线');
  ['x', 'y', 'z'].forEach((axis) => {
    check(generalGeneral.auxiliaryPlane.trace.start[axis] >= -1e-8
      && generalGeneral.auxiliaryPlane.trace.start[axis] <= 8 + 1e-8
      && generalGeneral.auxiliaryPlane.trace.end[axis] >= -1e-8
      && generalGeneral.auxiliaryPlane.trace.end[axis] <= 8 + 1e-8,
    `辅助平面 ${axis} 方向迹线位于 0～8 教学范围内`);
  });
  const sectionDirection = model.subtract(
    generalGeneral.sectionLine.end,
    generalGeneral.sectionLine.start
  );
  const toIntersection = model.subtract(
    generalGeneral.relation.intersection.point,
    generalGeneral.sectionLine.start
  );
  const parameter = model.dot(toIntersection, sectionDirection)
    / model.dot(sectionDirection, sectionDirection);
  const onSection = model.add(
    generalGeneral.sectionLine.start,
    model.scale(sectionDirection, parameter)
  );
  close(model.length(model.subtract(
    generalGeneral.relation.intersection.point,
    onSection
  )), 0, 1e-8, '辅助平面法交点位于交线 12 上');

  const lineAccumulation = buildCombination('general', 'vertical');
  check(lineAccumulation.methodKind === 'line'
    && lineAccumulation.lineAccumulationPlane === 'H',
  '铅垂线与一般面利用 H 面积聚点');
  check(!!lineAccumulation.lineAccumulationSection,
    '铅垂线求交生成 ce 延长线与点 1');
  close(
    lineAccumulation.lineAccumulationSection.segmentParameter,
    0.5,
    1e-8,
    'ce 延长线与 ab 的交点 1 位于 ab 中点'
  );
  close(model.signedDistance(
    lineAccumulation.plane,
    lineAccumulation.lineAccumulationSection.end
  ), 0, 1e-8, '点 1 位于平面 ABC 内');
  const planeAccumulation = buildCombination('frontProjecting', 'general');
  check(planeAccumulation.methodKind === 'plane'
    && planeAccumulation.planeAccumulationPlane === 'V',
  '一般线与正垂面利用 V 面积聚线');
  const bothAccumulation = buildCombination('frontProjecting', 'vertical');
  check(bothAccumulation.methodKind === 'both',
    '铅垂线与正垂面识别双重积聚');

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes(
    'pages/line-plane-relation/line-plane-relation'
  ), '页面已注册到 app.json');
  const homeWxml = fs.readFileSync(
    path.join(ROOT, 'pages/index/index.wxml'),
    'utf8'
  );
  const linePanel = homeWxml.slice(
    homeWxml.indexOf("mode === 'line'"),
    homeWxml.indexOf("mode === 'plane'")
  );
  const planePanel = homeWxml.slice(
    homeWxml.indexOf("mode === 'plane'"),
    homeWxml.indexOf("mode === 'solid'")
  );
  check(!linePanel.includes('/pages/line-plane-relation/line-plane-relation'),
    '首页直线模式不显示该入口');
  check(planePanel.includes('/pages/line-plane-relation/line-plane-relation'),
    '首页平面模式显示该入口');

  const pageDir = path.join(ROOT, 'pages/line-plane-relation');
  const wxml = fs.readFileSync(
    path.join(pageDir, 'line-plane-relation.wxml'),
    'utf8'
  );
  const wxss = fs.readFileSync(
    path.join(pageDir, 'line-plane-relation.wxss'),
    'utf8'
  );
  const renderSource = fs.readFileSync(
    path.join(pageDir, 'line-plane-render.js'),
    'utf8'
  );
  check((wxml.match(/<picker/g) || []).length === 2,
    '顶部只保留直线与平面两个下拉选择器');
  check(wxml.includes('bindchange="handleLinePicker"')
    && wxml.includes('bindchange="handlePlanePicker"'),
  '两个下拉选择器均有独立事件');
  check(!wxml.includes('判位置')
    && !wxml.includes('作垂线'),
  '页面只保留相交求交点互动');
  check(!wxml.includes('当前求交方法')
    && !wxml.includes('选择规律'),
  '已删除当前求交方法与选择规律卡片');
  check(wxml.includes('引导作图')
    && wxml.includes('第 {{currentStep}} 步')
    && wxml.includes('bindtap="handleStepTap"')
    && wxml.includes('appliedStep >= index + 1'),
  '页面底部采用单步引导并保留步骤进度');
  check(wxml.includes('线面相交求交点')
    && !wxml.includes('{{selectionText}}'),
  '标题改为线面相交求交点并删除标题下说明');
  check(renderSource.includes("'rgba(50, 184, 110, 0.19)'")
    && renderSource.includes("'rgba(52, 132, 246, 0.18)'")
    && renderSource.includes("'rgba(245, 196, 55, 0.16)'"),
  '空间图恢复 H/V/W 三块投影面');
  check(!renderSource.includes('drawSpatialProjectedLine'),
    '三维图不再额外绘制 EF 的三个坐标面投影线');
  check(renderSource.includes('drawAuxiliaryTracesInProjection')
    && renderSource.includes('trace.label')
    && renderSource.includes('drawTraceEndCaps')
    && renderSource.includes('COLORS.auxiliaryTrace, 14, 5')
    && !renderSource.includes('drawAuxiliaryTracesInSpace')
    && !renderSource.includes('setLineDash([7, 4])'),
  '辅助平面仅在投影图显示单条实线迹线，空间图不再重复画迹线');
  check(renderSource.includes('strong ? 3.5 : 3')
    && renderSource.includes("'#ff777b'")
    && renderSource.includes('2.8')
    && renderSource.includes('2.6'),
  '控制点与最终交点尺寸已缩小');
  check(renderSource.includes("context.strokeStyle = COLORS.line;")
    && renderSource.includes('context.lineWidth = 3.4;')
    && !renderSource.includes('drawSpatialProjectionConnections'),
  '空间 EF 使用单一橙色主线，不再附加投影连线');
  check(wxss.includes('height: 460px;')
    && wxss.includes('height: 420px;'),
  '页面沿用知识点页 460/420 画布高度');

  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    require(path.join(pageDir, 'line-plane-relation.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '页面通过 Page() 注册');
  check(pageDefinition.data.lineOptions.length === 4
    && pageDefinition.data.planeOptions.length === 4,
  '直线与平面下拉各提供四种类型');
  check(pageDefinition.data.lineOptions.includes('铅垂线')
    && pageDefinition.data.lineOptions.includes('正垂线')
    && pageDefinition.data.lineOptions.includes('侧垂线'),
  '直线下拉覆盖三种有积聚性投影的直线');
  check(pageDefinition.data.planeOptions.includes('铅垂面')
    && pageDefinition.data.planeOptions.includes('正垂面')
    && pageDefinition.data.planeOptions.includes('侧垂面'),
  '平面下拉覆盖三种有积聚性投影的平面');
  const handlers = Array.from(
    wxml.matchAll(/bind[a-z]+="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  handlers.forEach((handler) => {
    check(typeof pageDefinition[handler] === 'function',
      `WXML 事件 ${handler} 有实现`);
  });

  const page = makePageInstance(pageDefinition);
  page.updateGeometry(page.data.line, false);
  check(page.data.methodKind === 'auxiliary' && page.data.steps.length === 3,
    '默认一般线×一般面显示辅助平面三步骤');
  check(page.data.currentStep === 1
    && page.data.appliedStep === 0
    && page.data.currentStepTitle === '作 Q，并求平面内交线 12',
  '默认只显示第 1 步引导，尚未作图');
  check(page.data.auxiliaryProjectionPlane === 'H'
    && page.data.recommendedAuxiliaryProjectionPlane === 'H',
  '默认推荐 H 面垂直面');
  page.selectAuxiliaryPlane({
    currentTarget: { dataset: { plane: 'V' } }
  });
  check(page.data.auxiliaryProjectionPlane === 'V'
    && page._geometry.auxiliaryPlane.projectionPlane === 'V'
    && page._geometry.auxiliaryPlane.trace.label === 'Q_V',
  '可改选 V 面垂直面并同步更新唯一迹线');
  page.selectAuxiliaryPlane({
    currentTarget: { dataset: { plane: 'H' } }
  });
  check(page.data.resultPointText === '按步骤完成作图',
    '完成步骤前不提前显示交点坐标');
  const lineViews = page.getProjectionScreenPoints(page._geometry.line.e);
  const projectionMetrics = page.getProjectionMetrics();
  close(lineViews.front.x,
    projectionMetrics.origin.x - page._geometry.line.e.x * projectionMetrics.unit,
    1e-8, '空间 E 点与正面投影 e′ 使用同一 x 坐标');
  close(lineViews.front.y,
    projectionMetrics.origin.y - page._geometry.line.e.z * projectionMetrics.unit,
    1e-8, '空间 E 点与正面投影 e′ 使用同一 z 坐标');
  close(lineViews.top.x, lineViews.front.x, 1e-8,
    'e 与 e′ 满足长对正');
  close(lineViews.left.y, lineViews.front.y, 1e-8,
    'e″ 与 e′ 满足高平齐');
  const spatialLineStart = page.projectIsometric(page._geometry.line.e);
  const spatialLineEnd = page.projectIsometric(page._geometry.line.f);
  check(Math.hypot(
    spatialLineEnd.x - spatialLineStart.x,
    spatialLineEnd.y - spatialLineStart.y
  ) >= 50,
  '一般位置 EF 在轴测图中具有足够可见长度');
  [page._geometry.line.e, page._geometry.line.f].forEach((point, index) => {
    check(['x', 'y', 'z'].every((axis) => (
      point[axis] >= 0.5 - 1e-8 && point[axis] <= 7.5 + 1e-8
    )), `EF 端点 ${index ? 'F' : 'E'} 位于教学范围内`);
  });

  const drawnText = [];
  const strokeCalls = [];
  const textCalls = [];
  page.context = makeCanvasContext(drawnText, strokeCalls, textCalls);
  page.canvasWidth = 375;
  page.canvasHeight = 460;
  let renderError = null;
  try {
    page.drawScene();
    check(drawnText.includes('辅助面 Q') === false,
      '第 0 步不提前绘制辅助平面');
    check(drawnText.includes('V')
      && drawnText.includes('W')
      && drawnText.includes('H'),
    '下方保持过去的 V/H/W 三面投影画布');
    ['a′', 'b′', 'c′', 'a', 'b', 'c', 'a″', 'b″', 'c″'].forEach((label) => {
      check(drawnText.includes(label),
        `投影图准确绘制顶点标签 ${label}`);
    });
    const origin = page.getProjectionMetrics().origin;
    const labelBox = (label) => {
      const record = textCalls.find((item) => item.text === label);
      const width = label.length * 6.1;
      return {
        left: record.align === 'right' ? record.x - width : record.x,
        right: record.align === 'right' ? record.x : record.x + width,
        top: record.y - 6.5,
        bottom: record.y + 6.5
      };
    };
    ['a′', 'b′', 'c′'].forEach((label) => {
      const box = labelBox(label);
      check(box.right < origin.x && box.bottom < origin.y,
        `${label} 保持在 V 面投影区`);
    });
    ['a″', 'b″', 'c″'].forEach((label) => {
      const box = labelBox(label);
      check(box.left > origin.x && box.bottom < origin.y,
        `${label} 保持在 W 面投影区`);
    });
    ['a', 'b', 'c'].forEach((label) => {
      const box = labelBox(label);
      check(box.right < origin.x && box.top > origin.y,
        `${label} 保持在 H 面投影区且不跨轴`);
    });
    const ePrimeLabel = textCalls.find((item) => item.text === 'e′');
    check(ePrimeLabel.x === origin.x - 7
      && ePrimeLabel.y === origin.y - 11
      && ePrimeLabel.align === 'right',
    'e′ 固定在 OX/OZ 交点左上方');
    const cPrimeLabel = textCalls.find((item) => item.text === 'c′');
    check(cPrimeLabel.x === origin.x - 2
      && cPrimeLabel.align === 'right',
    'c′ 向右贴近 V 面投影边界且不越轴');
    check(!drawnText.includes('A′')
      && !drawnText.includes('B′')
      && !drawnText.includes('C′'),
    '投影图不再用大写标注平面顶点');
    page.handleStepTap({});
    check(page.data.appliedStep === 1
      && page.data.guideActionText === '进入下一步',
    '执行第 1 步后作图出现并提示进入下一步');
    drawnText.length = 0;
    strokeCalls.length = 0;
    page.drawScene();
    check(drawnText.includes('辅助面 Q'),
      '步骤 1 绘制辅助平面 Q');
    check(drawnText.some((text) => text.startsWith('Q_')),
      '步骤 1 在投影图绘制辅助平面迹线');
    check(drawnText.includes('1') && drawnText.includes('2')
      && strokeCalls.some((stroke) => stroke.color === '#d99a00'),
    '步骤 1 高亮平面内交线 12 并标出点 1、2');
    check(strokeCalls.some((stroke) => stroke.color === '#6d28d9')
      && strokeCalls.some((stroke) => stroke.color === '#ffb02e')
      && strokeCalls.some((stroke) => stroke.color === '#d99a00'),
    '辅助面、EF 与作图交线使用三个不同颜色');
    const point1Label = textCalls.filter((item) => item.text === '1').pop();
    const point2Label = textCalls.filter((item) => item.text === '2').pop();
    check(point1Label.x < origin.x && point1Label.y > origin.y
      && point2Label.x < origin.x && point2Label.x > point1Label.x,
    'H 面 1 点向左上、2 点向右靠近 Y 轴空白处');
    check(textCalls.some((item) => (
      item.text === 'e'
      && item.x === origin.x - 2
    )),
      `H 面 e 标签向右靠近 Y 轴：`
      + JSON.stringify(textCalls.filter((item) => item.text === 'e')));
    page.handleStepTap({});
    check(page.data.currentStep === 2
      && page.data.appliedStep === 1,
    '进入第 2 步时只出现新一步引导');
    page.handleStepTap({});
    drawnText.length = 0;
    strokeCalls.length = 0;
    page.drawScene();
    check(drawnText.includes('1′') && drawnText.includes('1″')
      && drawnText.includes('2′') && drawnText.includes('2″'),
    '步骤 2 补齐点 1、2 的另外两面投影');
    const pointProjectionLink = strokeCalls.find(
      (stroke) => stroke.color === '#a27b36'
    );
    check(!!pointProjectionLink && pointProjectionLink.dash.length === 0,
      `步骤 2 使用细实线显示点 1、2 的投影连线：${strokeCalls.map((stroke) => stroke.color).join(',')}`);
    check(!strokeCalls.some((stroke) => stroke.color === '#9b8148'),
      '三维图不重复绘制点 1、2 的投影接线');
    page.handleStepTap({});
    page.handleStepTap({});
    check(page.data.isComplete && page.data.resultPointText.startsWith('K('),
      '最后一步完成并显示交点坐标');
    drawnText.length = 0;
    strokeCalls.length = 0;
    page.drawScene();
    check(drawnText.includes('K'), '最后一步绘制交点 K');
    check(drawnText.includes('k′') && drawnText.includes('k″'),
      '最后一步补齐交点三面投影');
    const resultProjectionLink = strokeCalls.find(
      (stroke) => stroke.color === '#d06c66'
    );
    check(!!resultProjectionLink && resultProjectionLink.dash.length === 0,
      '最后一步使用细实线显示交点 K 的投影连线');

    page.handlePlanePicker({ detail: { value: 2 } });
    check(page.data.planeKind === 'frontProjecting'
      && page.data.methodKind === 'plane'
      && page.data.currentStep === 1
      && page.data.appliedStep === 0,
    '切换类型后重置为平面积聚法第 1 步');
    page.handleStepTap({});
    page.handleStepTap({});
    page.handleStepTap({});
    drawnText.length = 0;
    page.drawScene();
    check(drawnText.includes('k′'),
      '平面积聚法第 2 步只绘制先求出的 k′');
    page.handleStepTap({});
    page.handleStepTap({});
    check(page.data.isComplete, '平面积聚法步骤 3 完成');

    page.handleLinePicker({ detail: { value: 1 } });
    check(page.data.methodKind === 'both',
      '铅垂线与正垂面识别双重积聚');
    page.handleLinePicker({ detail: { value: 0 } });
    page.handlePlanePicker({ detail: { value: 3 } });
    check(page.data.methodKind === 'plane',
      '一般线与侧垂面利用平面积聚性');
    page.handleLinePicker({ detail: { value: 2 } });
    check(page.data.methodKind === 'both',
      '正垂线与侧垂面识别双重积聚');
    page.canvasWidth = 900;
    page.canvasHeight = 420;
    page.drawScene();

    page.handlePlanePicker({ detail: { value: 0 } });
    page.handleLinePicker({ detail: { value: 1 } });
    check(page.data.methodKind === 'line'
      && page.data.steps[0].title === '连接 ce，延长交 ab 于 1'
      && page.data.steps[1].title === '求 c1 的三面投影'
      && page.data.steps[2].title === '求交点 K 并连接投影',
    '铅垂线与一般面按 ce 延长到 ab 的步骤引导');
    page.handleStepTap({});
    drawnText.length = 0;
    strokeCalls.length = 0;
    page.drawScene();
    check(drawnText.includes('1'),
      '第 1 步绘制 ce 延长线并标出点 1');
    page.handleStepTap({});
    page.handleStepTap({});
    drawnText.length = 0;
    strokeCalls.length = 0;
    page.drawScene();
    check(drawnText.includes('1′') && drawnText.includes('1″'),
      '第 2 步补齐 c1 与点 1 的三面投影');
    check(strokeCalls.some((stroke) => stroke.color === '#a27b36'),
      '第 2 步显示点 1 的投影连线');
  } catch (error) {
    renderError = error;
  }
  check(!renderError,
    `四组合与宽屏 Canvas 绘制不抛错${renderError ? `: ${renderError.stack || renderError}` : ''}`);

  const lineBeforeReset = JSON.stringify(page.data.line);
  const planeBeforeReset = JSON.stringify(page.data.plane);
  page.handleReset();
  check(page.data.lineKind === 'vertical'
    && page.data.planeKind === 'general'
    && JSON.stringify(page.data.line) === lineBeforeReset
    && JSON.stringify(page.data.plane) === planeBeforeReset
    && page.data.currentStep === 1
    && page.data.appliedStep === 0,
  '重置保留当前选择与几何，只恢复未作图状态');

  console.log(`line-plane-relation-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('line-plane-relation-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
