// 布局改动校验：对比「改前公式」与「改后 getLayout」，并检查绘图内容是否放得下。
// 用法：node scripts/layout-check.cjs  （读取 pages/index/index.js 的 getLayout）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 共享布局基准固定从 projection.js 读取；首页直线模式另有页面级包装，后续单独验证。
const indexDir = path.join(ROOT, 'pages', 'index');
const projectionSource = fs.readFileSync(path.join(indexDir, 'projection.js'), 'utf8');

// ---- 改前的布局公式（从改动前的 index.js 复制，用于逐尺寸对比）----
function oldLayout(width, height) {
  const dividerY = height * 0.46;
  const topHeight = dividerY;
  const bottomHeight = height - dividerY;
  return {
    dividerY, topHeight, bottomHeight,
    leftWidth: width, rightWidth: width,
    unit: Math.min(width / 27, topHeight / 24),
    isoOrigin: { x: width * 0.5, y: topHeight * 0.58 },
    projectionOrigin: { x: width * 0.5, y: dividerY + bottomHeight * 0.5 }
  };
}

// ---- 从源文件里取出改后的 getLayout ----
const m = projectionSource.match(/getLayout\(\) \{[\s\S]*?\n\s*\},/);
if (!m) { console.log('FAIL 未找到 getLayout'); process.exit(1); }
const body = m[0].replace(/getLayout\(\) \{/, 'function newLayout() {').replace(/\},$/, '}');
const newLayout = new Function('return (' + body + ')')();

const projectionUnit = (L) => Math.min(L.rightWidth / 21, L.bottomHeight / 23);

// 内容包围盒（以 unit 为倍数，来自投影/轴测公式的极值）
const ISO = { w: 16 * 0.78 + 1, h: (16 * 0.38 + 10) + 1 };   // 斜轴测：x,y ∈[-8,8], z ∈[0,8]
const PROJ = { w: 16 + 1, h: 16 + 1 };                        // 三面投影：±8 展开

const cases = [
  { name: '手机竖屏 iPhone SE', w: 375, h: 640, expectSplit: false, mustMatchOld: true },
  { name: '手机竖屏 iPhone 14', w: 390, h: 660, expectSplit: false, mustMatchOld: true },
  { name: '手机竖屏 Plus', w: 430, h: 700, expectSplit: false, mustMatchOld: true },
  { name: 'iPad 10.2 横屏 · 点/线/面（画布 480）', w: 1053, h: 480, expectSplit: true, mustMatchOld: false },
  { name: 'iPad 10.2 横屏 · 切割（画布 445）', w: 1053, h: 445, expectSplit: true, mustMatchOld: false },
  { name: 'iPad 10.2 横屏 · 立体（画布 420）', w: 1053, h: 420, expectSplit: true, mustMatchOld: false },
  { name: 'iPad Pro 12.9 横屏 · 点/线/面（画布 620）', w: 1339, h: 620, expectSplit: true, mustMatchOld: false },
  { name: 'iPad Pro 12.9 横屏 · 切割（画布 620）', w: 1339, h: 620, expectSplit: true, mustMatchOld: false },
  { name: 'iPad Pro 12.9 横屏 · 立体（画布 620）', w: 1339, h: 620, expectSplit: true, mustMatchOld: false },
  { name: 'iPad 9.7 横屏 · 立体（画布 378，最紧）', w: 997, h: 378, expectSplit: true, mustMatchOld: false },
  { name: 'iPad 10.2 竖屏 · 点/线/面（画布 620）', w: 783, h: 620, expectSplit: true, mustMatchOld: false },
  { name: '折叠屏展开竖屏 · 立体（画布 620）', w: 857, h: 620, expectSplit: true, mustMatchOld: false }
];

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures += 1;
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
}

console.log('尺寸\t模式\t空间unit(改前→改后)\t投影unit(改前→改后)\t空间占用\t投影占用');
for (const c of cases) {
  const oldL = oldLayout(c.w, c.h);
  const newL = newLayout.call({ canvasWidth: c.w, canvasHeight: c.h });
  // 只比较"改前就存在的字段"，验证手机路径的几何数值零变化（新增字段不影响原行为）
  const ORIGINAL_KEYS = ['dividerY', 'topHeight', 'bottomHeight', 'leftWidth', 'rightWidth', 'unit'];
  const pick = (L) => {
    const out = {};
    ORIGINAL_KEYS.forEach((k) => { out[k] = L[k]; });
    out.isoOrigin = L.isoOrigin;
    out.projectionOrigin = L.projectionOrigin;
    return out;
  };
  const oldJ = JSON.stringify(pick(oldL));
  const newJ = JSON.stringify(pick(newL));
  const oldU = projectionUnit(oldL);
  const newU = projectionUnit(newL);
  const split = !!newL.split;
  const isoW = Math.round(ISO.w * newL.unit);
  const isoH = Math.round(ISO.h * newL.unit);
  const prW = Math.round(PROJ.w * newU);
  const prH = Math.round(PROJ.h * newU);
  const panelW = split ? newL.leftWidth : c.w;
  const panelH = split ? c.h : newL.topHeight;
  console.log([c.name, split ? '左右' : '上下', oldL.unit.toFixed(1) + '→' + newL.unit.toFixed(1),
    oldU.toFixed(1) + '→' + newU.toFixed(1),
    isoW + '×' + isoH + '/' + panelW + '×' + panelH,
    prW + '×' + prH + '/' + newL.projectionWidth + '×' + newL.projectionHeight].join('\t'));

  check(c.name + ' 模式正确（' + (c.expectSplit ? '左右' : '上下') + '）', split === c.expectSplit,
    'split=' + split);
  if (c.mustMatchOld) {
    check(c.name + ' 与改前布局数值完全一致', oldJ === newJ,
      oldJ === newJ ? '' : '\n  old=' + oldJ + '\n  new=' + newJ);
  }
  check(c.name + ' 空间图形放得下', isoW <= panelW && isoH <= panelH,
    isoW + '×' + isoH + ' vs ' + panelW + '×' + panelH);
  check(c.name + ' 三面投影放得下', prW <= newL.projectionWidth && prH <= newL.projectionHeight,
    prW + '×' + prH + ' vs ' + newL.projectionWidth + '×' + newL.projectionHeight);
  if (!c.mustMatchOld) {
    check(c.name + ' 左右布局比原上下布局更大（两个 unit 都增大）',
      newL.unit > oldL.unit && newU > oldU,
      'iso ' + oldL.unit.toFixed(1) + '→' + newL.unit.toFixed(1) + '，proj ' + oldU.toFixed(1) + '→' + newU.toFixed(1));
  }
}

// ---- 首页五种空间对象：共用紧凑画布与轴线边界 ----
const previousPage = global.Page;
const previousWx = global.wx;
let pageDefinition = null;
global.Page = (definition) => { pageDefinition = definition; };
global.wx = { cloud: undefined };
try {
  Object.keys(require.cache).forEach((key) => {
    if (key.indexOf(indexDir) === 0) delete require.cache[key];
  });
  require(path.join(indexDir, 'index.js'));
} finally {
  global.Page = previousPage;
  global.wx = previousWx;
}
check('首页紧凑画布布局包装可加载', !!pageDefinition);
if (pageDefinition) {
  const canvasWidth = 360.4;
  const canvasHeight = 540;
  const expectedUnit = oldLayout(canvasWidth, 641.6).unit;
  ['point', 'line', 'plane', 'solid', 'section'].forEach((mode) => {
    const page = Object.assign({}, pageDefinition, {
      data: Object.assign({}, pageDefinition.data, { mode }),
      canvasWidth,
      canvasHeight
    });
    const layout = page.getLayout();
    const projectionMetrics = page.getProjectionMetrics();
    const zTop = page.projectIsometric({ x: 0, y: 0, z: 10 }).y;
    const hBottom = layout.isoOrigin.y + layout.unit * 9 * 1.08;
    check(`${mode} 模式保持原三维 unit`,
      Math.abs(layout.unit - expectedUnit) < 0.01,
      `unit=${layout.unit}, legacy=${expectedUnit}`);
    check(`${mode} 模式黑底高度缩小`,
      layout.topHeight < oldLayout(canvasWidth, canvasHeight).topHeight,
      `${layout.topHeight}`);
    check(`${mode} 模式 Z 箭头顶在黑边内 2px`,
      Math.abs(zTop - 2) < 1e-9, `zTop=${zTop}`);
    check(`${mode} 模式 H 面底边贴住黑边内 2px`,
      Math.abs(hBottom - (layout.topHeight - 2)) < 1e-9,
      `hBottom=${hBottom}, top=${layout.topHeight}`);
    check(`${mode} 模式投影区上下留白收紧`,
      Math.abs(projectionMetrics.origin.y - 8 * projectionMetrics.unit
        - (layout.projectionTop + 26)) < 1e-9
      && Math.abs(projectionMetrics.origin.y + 8 * projectionMetrics.unit
        - (layout.projectionTop + layout.projectionHeight - 8)) < 1e-9,
    `origin=${projectionMetrics.origin.y}, unit=${projectionMetrics.unit}`);
    check(`${mode} 模式可见轴线与投影原点完全重合`,
      Math.abs(layout.projectionOrigin.x - projectionMetrics.origin.x) < 1e-9
      && Math.abs(layout.projectionOrigin.y - projectionMetrics.origin.y) < 1e-9,
    `layout=${layout.projectionOrigin.y}, metrics=${projectionMetrics.origin.y}`);
  });
  const interactionPage = Object.assign({}, pageDefinition, {
    data: Object.assign({}, pageDefinition.data, { mode: 'line' }),
    canvasWidth,
    canvasHeight
  });
  const metrics = interactionPage.getProjectionMetrics();
  const beyondAxis = interactionPage.screenToModel(-metrics.unit * 100, metrics.unit);
  const farPositive = interactionPage.screenToModel(metrics.unit * 100, metrics.unit);
  const axisReach = interactionPage.screenToModel(0, metrics.unit);
  check('拖动越轴时停在坐标轴且可精确到达坐标轴',
    beyondAxis === 0 && farPositive === 8 && axisReach === 0,
  `negative=${beyondAxis}, positive=${farPositive}, reach=${axisReach}`);
  check('所有模式投影 OZ 从黑边开始',
    fs.readFileSync(path.join(indexDir, 'render-scene.js'), 'utf8')
      .includes('const projectionZTop = layout.projectionTop;'));
  check('手机五种模式画布共用紧凑高度',
    fs.readFileSync(path.join(ROOT, 'pages', 'index', 'index.wxss'), 'utf8')
      .includes('.page-shell .geometry-canvas')
    && fs.readFileSync(path.join(ROOT, 'pages', 'index', 'index.wxss'), 'utf8')
      .includes('height: calc(100vw * 1.44);'));
}

// ---- 投影体系页：压缩画布但完整容纳旋转与展开的极限姿态 ----
const projectionPagePath = path.join(ROOT, 'pages', 'projection', 'projection.js');
let projectionPageDefinition = null;
global.Page = (definition) => { projectionPageDefinition = definition; };
global.wx = { cloud: undefined };
try {
  Object.keys(require.cache).forEach((key) => {
    if (key.indexOf(path.join(ROOT, 'pages', 'projection')) === 0) delete require.cache[key];
  });
  require(projectionPagePath);
} finally {
  global.Page = previousPage;
  global.wx = previousWx;
}
check('投影体系页面布局包装可加载', !!projectionPageDefinition);
if (projectionPageDefinition) {
  const projectionCanvasWidth = 360.4;
  const projectionCanvasHeight = 546;
  const projectionPage = Object.assign({}, projectionPageDefinition, {
    data: Object.assign({}, projectionPageDefinition.data),
    canvasWidth: projectionCanvasWidth,
    canvasHeight: projectionCanvasHeight,
    viewAngle: 0,
    unfoldAngle: 0
  });
  const layout = projectionPage.getLayout();
  const metrics = projectionPage.getProjectionMetrics();
  const legacyLayout = oldLayout(projectionCanvasWidth, 641.6);
  check('投影体系保持原三维 unit',
    Math.abs(layout.unit - legacyLayout.unit) < 0.01,
  `unit=${layout.unit}`);
  check('投影体系黑底高度缩小',
    layout.topHeight < legacyLayout.topHeight,
    `${legacyLayout.topHeight.toFixed(1)} → ${layout.topHeight.toFixed(1)}`);
  check('投影体系下方展开区收紧',
    layout.projectionHeight < legacyLayout.bottomHeight,
    `${legacyLayout.bottomHeight.toFixed(1)} → ${layout.projectionHeight.toFixed(1)}`);
  check('投影体系可见轴线与投影原点重合',
    Math.abs(layout.projectionOrigin.x - metrics.origin.x) < 1e-9
    && Math.abs(layout.projectionOrigin.y - metrics.origin.y) < 1e-9,
  `layout=${layout.projectionOrigin.y}, metrics=${metrics.origin.y}`);

  const extent = 7;
  const spans = {
    first: [[0, extent]],
    octants: [[-extent, 0], [0, extent]]
  };
  let boundsFailure = '';
  ['first', 'octants'].forEach((scope) => {
    [0, 90, 180, 270].forEach((viewAngle) => {
      [0, 45, 90].forEach((unfoldAngle) => {
        projectionPage.data.scope = scope;
        projectionPage.viewAngle = viewAngle;
        projectionPage.unfoldAngle = unfoldAngle;
        const points = [];
        spans[scope].forEach((spanA) => {
          spans[scope].forEach((spanB) => {
            points.push(
              { x: spanA[0], y: 0, z: spanB[0] },
              { x: spanA[1], y: 0, z: spanB[0] },
              { x: spanA[1], y: 0, z: spanB[1] },
              { x: spanA[0], y: 0, z: spanB[1] },
              projectionPage.unfoldHPoint({ x: spanA[0], y: spanB[0], z: 0 }, unfoldAngle),
              projectionPage.unfoldHPoint({ x: spanA[1], y: spanB[1], z: 0 }, unfoldAngle),
              projectionPage.unfoldWPoint({ x: 0, y: spanA[0], z: spanB[0] }, unfoldAngle),
              projectionPage.unfoldWPoint({ x: 0, y: spanA[1], z: spanB[1] }, unfoldAngle)
            );
          });
        });
        points.forEach((point) => {
          const screen = projectionPage.projectIsometric(
            projectionPage.rotateViewPoint(point)
          );
          if (screen.x < 0 || screen.x > layout.leftWidth
            || screen.y < 0 || screen.y > layout.topHeight) {
            boundsFailure = `${scope}/view${viewAngle}/unfold${unfoldAngle} `
              + `(${screen.x.toFixed(1)}, ${screen.y.toFixed(1)})`;
          }
        });
      });
    });
  });
  check('投影体系三维内容在各种旋转与展开姿态下均不裁切',
    boundsFailure === '', boundsFailure);
  const projectionSource = fs.readFileSync(
    path.join(ROOT, 'pages', 'projection', 'unfold.js'),
    'utf8'
  );
  const projectionWxss = fs.readFileSync(
    path.join(ROOT, 'pages', 'projection', 'projection.wxss'),
    'utf8'
  );
  check('投影体系展开图 OZ 从黑边开始且 Z 在右侧',
    projectionSource.includes('{ x: origin.x, y: top }, { x: origin.x, y: top + height - 18 }')
    && projectionSource.includes("this.drawText(context, 'Z', origin.x + 8, top + 8"));
  check('投影体系手机画布使用紧凑高度',
    projectionWxss.includes('height: calc(100vw * 1.4);')
    && projectionWxss.includes('min-height: 500px;')
    && !projectionWxss.includes('height: 640px;'));
}

console.log('---');
console.log(failures ? ('失败 ' + failures + ' 项') : '全部通过');
process.exit(failures ? 1 : 0);
