#!/usr/bin/env node
// 最大斜度线纯几何、页面接线与 Canvas 绘制检查，不依赖 wx / 网络。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../pages/maximum-slope-line/maximum-slope-model.js');

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

function makeCanvasContext(drawnText, arcCalls, strokeCalls) {
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
    stroke() {
      if (strokeCalls) {
        strokeCalls.push({
          color: this.strokeStyle,
          lineWidth: this.lineWidth,
          dash: this.lineDash.slice()
        });
      }
    },
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
    fillText(text) {
      if (drawnText) drawnText.push(String(text));
    },
    setLineDash(pattern) {
      this.lineDash = (pattern || []).slice();
    }
  };
}

function pointInPolygon2D(point, polygon) {
  const sign = (first, second, third) => (
    (first.u - third.u) * (second.v - third.v)
    - (second.u - third.u) * (first.v - third.v)
  );
  const signs = polygon.map((vertex, index) => sign(
    point,
    vertex,
    polygon[(index + 1) % polygon.length]
  ));
  const hasNegative = signs.some((value) => value < -1e-8);
  const hasPositive = signs.some((value) => value > 1e-8);
  return !(hasNegative && hasPositive);
}

function checkPageBounds(page, width, height, projectionPlane) {
  page.canvasWidth = width;
  page.canvasHeight = height;
  page.updateGeometry(projectionPlane, null, false);
  const layout = page.getLayout();
  const geometry = page._geometry;
  const spatialPoints = [
    ...geometry.patch,
    ...geometry.traces.flatMap((trace) => [trace.start, trace.end]),
    geometry.anchor,
    geometry.candidate.start,
    geometry.candidate.end,
    geometry.helper.start,
    geometry.helper.end
  ];
  spatialPoints.forEach((point) => {
    const screen = page.projectIsometric(point);
    check(screen.x >= 0 && screen.x <= layout.leftWidth
      && screen.y >= 0 && screen.y <= layout.topHeight,
    `${width}x${height} ${projectionPlane} 面空间几何位于画布内`);
  });
  const projectedPoints = spatialPoints.concat(
    spatialPoints.map((point) => model.projectPoint(point, projectionPlane))
  );
  ['front', 'top', 'left'].forEach((viewType) => {
    projectedPoints.forEach((point) => {
      const screen = page.getProjectionScreenPoints(point)[viewType];
      check(screen.x >= layout.projectionLeft
        && screen.x <= layout.projectionLeft + layout.projectionWidth
        && screen.y >= layout.projectionTop
        && screen.y <= layout.projectionTop + layout.projectionHeight,
      `${width}x${height} ${projectionPlane} 面 ${viewType} 投影位于三视图区`);
    });
  });
}

function main() {
  ['H', 'V', 'W'].forEach((projectionPlane) => {
    const geometry = model.buildGeometryFromOrientation(
      model.DEFAULT_PLANE,
      projectionPlane
    );
    check(!!geometry, `${projectionPlane} 面几何可生成`);
    close(Math.max(...geometry.patch.map((point) => point.z)), 8, 1e-8,
      `${projectionPlane} 面平面与 Z 轴方向最高点达到 z=8`);
    close(Math.max(...geometry.patch.map((point) => point.x)), 8, 1e-8,
      `${projectionPlane} 面平面与 X 轴方向最远点达到 x=8`);
    close(Math.max(...geometry.patch.map((point) => point.y)), 8, 1e-8,
      `${projectionPlane} 面平面与 Y 轴方向最远点达到 y=8`);
    close(model.dot(geometry.candidateDirection, geometry.normal), 0, 1e-8,
      `${projectionPlane} 面候选线属于平面`);
    close(model.dot(geometry.maximumDirection, geometry.normal), 0, 1e-8,
      `${projectionPlane} 面最大斜度线属于平面`);
    close(model.dot(geometry.helperDirection, geometry.normal), 0, 1e-8,
      `${projectionPlane} 面辅助线属于平面`);
    close(model.dot(
      geometry.helperDirection,
      model.PROJECTION_DEFINITIONS[projectionPlane].normal
    ), 0, 1e-8, `${projectionPlane} 面辅助线平行所选投影面`);
    close(model.dot(
      geometry.maximumDirection,
      geometry.helperDirection
    ), 0, 1e-8, `${projectionPlane} 面最大斜度线垂直辅助线`);
    check(
      geometry.angleVertex === geometry.candidate.start
      || geometry.angleVertex === geometry.candidate.end,
      `${projectionPlane} 面倾角辅助线与最大斜度线共用一个端点`
    );
    const vertexProjection = model.projectPoint(
      geometry.angleVertex,
      projectionPlane
    );
    close(Math.hypot(
      vertexProjection.x - geometry.angleVertex.x,
      vertexProjection.y - geometry.angleVertex.y,
      vertexProjection.z - geometry.angleVertex.z
    ), 0, 1e-8,
    `${projectionPlane} 面倾角顶点位于投影面上`);
    const otherProjection = model.projectPoint(
      geometry.lineOtherPoint,
      projectionPlane
    );
    close(Math.hypot(
      otherProjection.x - geometry.projectedLineOtherPoint.x,
      otherProjection.y - geometry.projectedLineOtherPoint.y,
      otherProjection.z - geometry.projectedLineOtherPoint.z
    ), 0, 1e-8,
    `${projectionPlane} 面投影辅助线来自直线的正交投影`);
    check(geometry.isMaximum, `${projectionPlane} 面默认显示最大斜度线`);
    close(geometry.angleDegrees, geometry.maximumAngleDegrees, 1e-8,
      `${projectionPlane} 面默认直线倾角等于平面倾角`);
    close(
      geometry.maximumAngleDegrees,
      Math.acos(Math.min(1, Math.abs(model.dot(
        model.PROJECTION_DEFINITIONS[projectionPlane].normal,
        geometry.normal
      )))) * 180 / Math.PI,
      1e-8,
      `${projectionPlane} 面最大斜度线倾角等于平面倾角`
    );

    const maximum = model.buildGeometryFromOrientation(
      model.DEFAULT_PLANE,
      projectionPlane,
      geometry.maximumOrientation
    );
    check(maximum.isMaximum, `${projectionPlane} 面最大方向进入最大值状态`);
    close(maximum.angleDegrees, maximum.maximumAngleDegrees, 1e-8,
      `${projectionPlane} 面最大方向倾角精确匹配`);
    close(maximum.orientationDifference, 0, 1e-8,
      `${projectionPlane} 面最大方向角差为零`);

    const snapped = model.buildGeometryFromOrientation(
      model.DEFAULT_PLANE,
      projectionPlane,
      geometry.maximumOrientation + 1.5 * Math.PI / 180
    );
    check(snapped.isMaximum, `${projectionPlane} 面接近最大值时吸附`);

    const notSnapped = model.buildGeometryFromOrientation(
      model.DEFAULT_PLANE,
      projectionPlane,
      geometry.maximumOrientation + 3 * Math.PI / 180
    );
    check(!notSnapped.isMaximum, `${projectionPlane} 面离开吸附区后不伪装最大值`);

    const projectedMaximum = model.viewVector(
      geometry.maximumDirection,
      projectionPlane
    );
    const recovered = model.orientationFromViewVector(
      geometry.basis,
      projectionPlane,
      projectedMaximum
    );
    const difference = Math.abs((() => {
      let value = recovered - geometry.maximumOrientation;
      while (value > Math.PI / 2) value -= Math.PI;
      while (value < -Math.PI / 2) value += Math.PI;
      return value;
    })());
    close(difference, 0, 1e-7,
      `${projectionPlane} 面投影方向可还原平面方向`);

    const patch2D = geometry.patch.map((point) => model.viewVector(
      model.subtract(point, geometry.anchor),
      projectionPlane
    ));
    [geometry.candidate.start, geometry.candidate.end].forEach((point) => {
      const local = model.viewVector(
        model.subtract(point, geometry.anchor),
        projectionPlane
      );
      check(pointInPolygon2D(local, patch2D),
        `${projectionPlane} 面候选线端点位于三角平面内`);
    });
    check(geometry.patch.length >= 3,
      `${projectionPlane} 面显示扩展后的平面块`);
    check(geometry.traces.length === 3,
      `${projectionPlane} 面绘制 H/V/W 三条迹线`);
    geometry.traces.forEach((trace) => {
      check(Math.abs(
        (trace.projectionPlane === 'H' ? trace.start.z : 0)
        + (trace.projectionPlane === 'V' ? trace.start.y : 0)
        + (trace.projectionPlane === 'W' ? trace.start.x : 0)
      ) <= 1e-8, `${projectionPlane} 面 ${trace.label} 起点位于对应投影面`);
      check(trace.start.x >= 0 && trace.start.x <= 8
        && trace.start.y >= 0 && trace.start.y <= 8
        && trace.start.z >= 0 && trace.start.z <= 8,
      `${projectionPlane} 面 ${trace.label} 位于教学范围内`);
    });
  });

  const horizontalPlane = {
    a: { x: 2, y: 2, z: 4 },
    b: { x: 6, y: 3, z: 4 },
    c: { x: 4, y: 7, z: 4 }
  };
  const parallelGeometry = model.buildGeometryFromOrientation(
    horizontalPlane,
    'H'
  );
  check(!!parallelGeometry && !parallelGeometry.hasUniqueMaximum,
    '平面平行 H 面时识别为无唯一最大斜度线');
  close(parallelGeometry.maximumAngleDegrees, 0, 1e-8,
    '平面平行 H 面时最大倾角为零');

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes(
    'pages/maximum-slope-line/maximum-slope-line'
  ), '最大斜度线页面已注册到 app.json');
  const homeWxml = fs.readFileSync(
    path.join(ROOT, 'pages/index/index.wxml'),
    'utf8'
  );
  check(homeWxml.includes(
    'url="/pages/maximum-slope-line/maximum-slope-line"'
  ), '首页平面模式入口已连接最大斜度线页面');

  const pageDir = path.join(ROOT, 'pages/maximum-slope-line');
  const wxml = fs.readFileSync(
    path.join(pageDir, 'maximum-slope-line.wxml'),
    'utf8'
  );
  const wxss = fs.readFileSync(
    path.join(pageDir, 'maximum-slope-line.wxss'),
    'utf8'
  );
  const renderSource = fs.readFileSync(
    path.join(pageDir, 'maximum-slope-render.js'),
    'utf8'
  );
  ['H', 'V', 'W'].forEach((plane) => {
    check(wxml.includes(`data-plane="${plane}"`),
      `页面提供 ${plane} 投影面页签`);
  });
  ['α', 'β', 'γ'].forEach((symbol) => {
    check(wxml.includes(`>${symbol}</text>`),
      `顶部仅使用符号 ${symbol}`);
  });
  check(!wxml.includes('result-card')
    && !wxml.includes('theorem-card')
    && !wxml.includes('formula-chip'),
  '页面不增加结果卡、定理卡或公式条');
  check((wxml.match(/class="lesson-card"/g) || []).length === 1
    && wxml.includes('定义：平面上对投影面倾角最大的直线称为该平面的最大斜度线；'
      + '最大斜度线垂直于属于平面的投影面平行线，并属于该平面。'
      + '最大斜度线对投影面的夹角最大且反映该平面对投影面的倾角。'),
  '最下方只增加一张指定文案的最大斜度线知识卡');
  check(wxml.includes('class="angle-card {{isMaximum ? \'maximum\' : \'\'}}"')
    && wxml.includes('平面与 {{projectionAngleSymbol}} 面夹角')
    && wxml.includes('直线与当前 {{projectionAngleSymbol}} 面夹角')
    && wxml.includes("{{isMaximum ? '=' : '>'}}")
    && wxml.includes('最大斜度线状态')
    && wxml.includes('{{planeAngleText}}')
    && wxml.includes('{{lineAngleText}}'),
  '页面包含平面夹角、当前直线夹角和最大值状态数据栏');
  check(wxss.includes('height: 460px;')
    && wxss.includes('height: 420px;'),
  '页面沿用两个知识点页的 460/420 画布高度');
  check(renderSource.includes('const PROJECTION_LINE_WIDTH = 3;')
    && (renderSource.match(/lineWidth = PROJECTION_LINE_WIDTH/g) || []).length >= 3,
  '三个投影视图中的迹线、平行线和最大斜度线统一使用相同粗实线');
  check(renderSource.includes("'V', left + 17, top + 52")
    && renderSource.includes("'W', left + width - 17, top + 52")
    && renderSource.includes("'H', left + 17, top + height - 25"),
  'H/V/W 固定标注在投影区域的左上、右上和左下角');
  check(!renderSource.includes("'90°'")
    && (renderSource.match(/this\.drawRightAngle\(/g) || []).length >= 1
    && (renderSource.match(/this\.drawPlaneRightAngle\(/g) || []).length >= 1,
  '空间与投影图使用直角方框符号且不重复显示 90°文字');
  check(renderSource.includes('layout.leftWidth - 12')
    && renderSource.includes("'#ffffff'")
    && renderSource.includes("geometry.isMaximum ? COLORS.maximum : '#202124'")
    && renderSource.includes('lineWidth = 1.5')
    && renderSource.includes('lineWidth = 1.4')
    && renderSource.includes('left + width - 16')
    && renderSource.includes('top + height - 36'),
  '空间角度值固定白色，投影角度值固定右下并按时变红');
  check(!renderSource.includes('drawPoint(context, anchor')
    && renderSource.includes('const step = 0.55;')
    && renderSource.includes('context.lineWidth = 3;')
    && /COLORS\.maximum,\s+14\s+\);/.test(renderSource),
  '删除空间交点圆点并放大空间与投影直角符号');

  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    require(path.join(pageDir, 'maximum-slope-line.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '最大斜度线页面通过 Page() 注册');
  const handlers = Array.from(
    wxml.matchAll(/bind[a-z]+="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  handlers.forEach((handler) => {
    check(typeof pageDefinition[handler] === 'function',
      `WXML 事件 ${handler} 有实现`);
  });

  const page = makePageInstance(pageDefinition);
  ['H', 'V', 'W'].forEach((projectionPlane) => {
    checkPageBounds(page, 375, 460, projectionPlane);
    checkPageBounds(page, 900, 420, projectionPlane);
  });
  page.canvasWidth = 375;
  page.canvasHeight = 460;
  page.updateGeometry('H', null, false);
  check(page.data.selectedPlane === 'H' && !!page._geometry,
    '页面默认进入 H 面候选线互动');
  check(page._geometry.isMaximum && page.data.isMaximum
    && page.data.projectionAngleSymbol === 'α'
    && page.data.planeAngleText === page.data.lineAngleText,
  '页面默认显示最大斜度线并满足两角相等');
  close(page.getLayout().topHeight, 184, 1e-8,
    '竖屏空间区与其他知识点页一样占 40%');

  const initialHandle = page.getProjectionScreenPoints(
    page._geometry.candidate.positiveEnd
  ).top;
  page.handleTouchStart({ touches: [initialHandle] });
  check(page.data.canvasDragging && page._draggingDirectionHandle,
    '命中方向点后进入拖动并锁滚动');
  const offMaximumGeometry = model.buildGeometryFromOrientation(
    model.DEFAULT_PLANE,
    'H',
    page._geometry.maximumOrientation + 35 * Math.PI / 180
  );
  const offMaximumHandle = page.getProjectionScreenPoints(
    offMaximumGeometry.candidate.positiveEnd
  ).top;
  const beforeAngle = page._geometry.angleDegrees;
  page.handleTouchMove({ touches: [offMaximumHandle] });
  check(page._geometry.angleDegrees < beforeAngle && !page._geometry.isMaximum,
    '拖动离开最大方向后直线倾角减小');
  check(!page.data.isMaximum
    && page.data.planeAngleText !== page.data.lineAngleText,
  '数据栏实时显示两个不同夹角并取消最大值状态');
  const maximumGeometry = model.buildGeometryFromOrientation(
    model.DEFAULT_PLANE,
    'H',
    page._geometry.maximumOrientation
  );
  const maximumHandle = page.getProjectionScreenPoints(
    maximumGeometry.candidate.positiveEnd
  ).top;
  page.handleTouchMove({ touches: [maximumHandle] });
  check(page._geometry.isMaximum,
    '拖到最大方向时吸附并进入最大值状态');
  check(page.data.isMaximum
    && page.data.planeAngleText === page.data.lineAngleText,
  '拖到最大值时数据栏两角重新相等');
  page.handleTouchEnd();
  check(!page.data.canvasDragging && !page._draggingDirectionHandle,
    '松手后解除拖动状态与滚动锁');

  page.selectPlane({ currentTarget: { dataset: { plane: 'V' } } });
  check(page.data.selectedPlane === 'V' && page._geometry.viewType === 'front',
    '可切换到 V 面并从正视方向拖动');
  page.handleReset();
  check(page.data.selectedPlane === 'H' && page._geometry.viewType === 'top'
    && page._geometry.isMaximum && page.data.isMaximum,
  '重置恢复 H 面和最大斜度线默认位置');

  const drawnText = [];
  const arcCalls = [];
  const strokeCalls = [];
  page.context = makeCanvasContext(drawnText, arcCalls, strokeCalls);
  page.canvasWidth = 375;
  page.canvasHeight = 460;
  page.updateGeometry('H', null, false);
  let renderError = null;
  try {
    page.drawScene();
    check(drawnText.some((text) => text.startsWith('αmax=')),
      '默认画布显示最大斜度线倾角');
    check(strokeCalls.some((stroke) => (
      stroke.color === '#000000'
      && stroke.dash.length === 0
    )), '投影面平行线使用黑色实线');
    check(drawnText.includes('已达最大值'),
      '默认画布显示最大斜度线状态');
    ['V', 'W', 'H'].forEach((planeLabel) => {
      check(drawnText.includes(planeLabel),
        `投影图角落标注 ${planeLabel}`);
    });
    ['正投影 V', '水平投影 H', '侧面投影 W'].forEach((longLabel) => {
      check(!drawnText.includes(longLabel),
        `不再绘制冗长投影面名称 ${longLabel}`);
    });
    check(strokeCalls.some((stroke) => stroke.color === '#e53935'),
      '默认最大斜度线为红色');
    drawnText.length = 0;
    strokeCalls.length = 0;
    page.updateGeometry(
      'H',
      page._geometry.maximumOrientation + 35 * Math.PI / 180,
      false
    );
    page.drawScene();
    check(drawnText.some((text) => text.startsWith('α=')),
      '拖离最大值后画布恢复普通倾角显示');
    check(strokeCalls.some((stroke) => stroke.color === '#ff9f1c'),
      '拖离最大值后直线恢复橙色');
    page.canvasWidth = 900;
    page.canvasHeight = 420;
    page.selectPlane({ currentTarget: { dataset: { plane: 'W' } } });
    page.drawScene();
  } catch (error) {
    renderError = error;
  }
  check(!renderError,
    `手机和宽屏 Canvas 绘制不抛错${renderError ? `: ${renderError.stack || renderError}` : ''}`);

  console.log(`maximum-slope-line-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('maximum-slope-line-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
