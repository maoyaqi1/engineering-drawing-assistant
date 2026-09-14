// 布局改动校验：对比「改前公式」与「改后 getLayout」，并检查绘图内容是否放得下。
// 用法：node scripts/layout-check.cjs  （读取 pages/index/index.js 的 getLayout）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// getLayout 已随拆分移入 pages/index/ 下的模块，这里按目录扫描查找
const indexDir = path.join(ROOT, 'pages', 'index');
const sources = fs.readdirSync(indexDir).filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(indexDir, f), 'utf8'));

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
let m = null;
for (const src of sources) {
  // 容忍缩进（模块文件内的方法比原 index.js 深一层）
  m = src.match(/getLayout\(\) \{[\s\S]*?\n\s*\},/);
  if (m) break;
}
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
console.log('---');
console.log(failures ? ('失败 ' + failures + ' 项') : '全部通过');
process.exit(failures ? 1 : 0);
