// 宽屏（PAD）「一屏是否放得下」估算：所有数值都从 pages/index/index.wxss 的宽屏媒体块里解析，
// 避免手写常量与样式脱节。用法：node pad-fit-check.cjs
//
// 估算口径（微信小程序默认表现，非精确渲染）：
//   - <text> 行高按 font-size * 1.2
//   - <slider> 高度按 block-size + 12（无 block-size 时按 28）
//   - 页面可用高度 = 窗口高 - 工具栏 - page-shell 底部安全区
//   - 画布高度 = clamp(窗口高 - 扣减值, min-height, max-height)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'pages', 'index', 'index.wxss');
const raw = fs.readFileSync(CSS, 'utf8').replace(/\r\n/g, '\n');

// ---- 取出宽屏媒体块，累积每个选择器的声明（后者覆盖前者）----
const wideStart = raw.indexOf('@media (min-width: 500px)');
const wide = raw.slice(wideStart).replace(/\/\*[\s\S]*?\*\//g, ''); // 去掉注释，避免注释被当成选择器前缀
const decls = {};
for (const m of wide.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().replace(/\s+/g, ' ');
  if (!sel || sel.startsWith('@media')) continue;
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const k = d.slice(0, i).trim();
    const v = d.slice(i + 1).trim();
    decls[sel] = decls[sel] || {};
    decls[sel][k] = v;
  }
}
const get = (sel, prop, fallback = 0) => {
  const v = decls[sel] && decls[sel][prop];
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const boxHeight = (sel, fallback) => {
  const h = get(sel, 'height', NaN);
  const base = Number.isFinite(h) ? h : fallback;
  const bt = get(sel, 'border-top-width', parseFloat(decls[sel]?.border) || 0);
  const bb = get(sel, 'border-bottom-width', parseFloat(decls[sel]?.border) || 0);
  return base + bt + bb;
};
const textH = (sel, fallback) => get(sel, 'font-size', fallback) * 1.2;
// padding: 上 右 下 左（支持 1/2/3/4 值）
const padV = (sel) => {
  const p = (decls[sel] && decls[sel].padding) || '0';
  const parts = p.split(/\s+/).map(parseFloat);
  if (parts.length === 1) return parts[0] * 2;
  if (parts.length === 2) return parts[0] * 2;
  return parts[0] + (parts[2] || 0);
};
const marginV = (sel) => {
  const p = (decls[sel] && decls[sel].margin) || '0';
  const parts = p.split(/\s+/).map(parseFloat);
  if (parts.length === 1) return parts[0] * 2;
  if (parts.length === 2) return parts[0] * 2;
  if (parts.length === 3) return parts[0] + parts[2];
  return parts[0] + (parts[2] || 0);
};

// ---- 画布高度公式：clamp(窗口高 - 扣减, min, max) ----
const canvasRule = (sel) => {
  const h = (decls[sel] && decls[sel].height) || '';
  const m = h.match(/calc\(100vh - (\d+(?:\.\d+)?)px\)/);
  return m ? parseFloat(m[1]) : null;
};
const N = {
  base: canvasRule('.geometry-canvas'),
  section: canvasRule('.page-shell.mode-section .geometry-canvas'),
  solid: canvasRule('.page-shell.mode-solid .geometry-canvas')
};
const CANVAS_MIN = get('.geometry-canvas', 'min-height', 0);
const CANVAS_MAX = get('.geometry-canvas', 'max-height', Infinity);
const canvasH = (winH, mode) => Math.min(Math.max(winH - (mode === 'point' ? N.base : N[mode]), CANVAS_MIN), CANVAS_MAX);

// ---- 画布以外各块的高度 ----
const typePanel = (mode) => {
  const pad = padV('.type-panel') + get('.type-panel', 'border-bottom-width', 0.5);
  const chipRow = boxHeight('.type-chip', 22);
  const label = textH('.type-label', 11) + marginV('.type-label');
  if (mode === 'point' || mode === 'line' || mode === 'plane') return pad + label + chipRow;
  if (mode === 'section') {
    // 立体 6 个 + 截平面 3 个并成一行
    const line = Math.max(chipRow, textH('.type-label', 11));
    const slider = 18 + 12; // block-size=18
    const controls = marginV('.section-controls') + get('.section-controls', 'padding-top', 0)
      + get('.section-controls', 'border-top-width', 0.5) + textH('.control-meta', 11) + slider;
    return pad + line + controls;
  }
  // solid：尺寸三行并一行、姿态（旋转平移 + 坐标轴）并一行
  const pad2 = padV('.type-panel') + get('.type-panel', 'border-bottom-width', 0.5);
  const tabs = boxHeight('.solid-type-chip', 22) + marginV('.solid-type-tabs');
  const groupLabel = textH('.solid-group-label', 10.5) + marginV('.solid-group-label');
  const row = (slider) => Math.max(get('.slider-row', 'min-height', 24), slider || 0, textH('.param-name', 11));
  const sliderRow = row(16 + 12);        // 半径 / 高度 / 旋转角度（block-size=16）
  const plainRow = row(0);               // 棱数（步进器）
  const groupLabelInline = textH('.solid-group-label', 10.5);
  const sizeLine = Math.max(groupLabelInline, plainRow, sliderRow);
  const poseLine = Math.max(groupLabelInline, boxHeight('.pose-tab', 26), boxHeight('.axis-chip', 21), sliderRow);
  // 类型一行 + 尺寸（棱数/半径/高度并排） + 姿态（旋转平移/坐标轴/角度滑块并排）
  return pad2 + tabs + sizeLine + poseLine;
};
const cardChrome = () => {
  const pad = padV('.canvas-card');
  const border = 1;
  const heading = Math.max(textH('.card-title', 13), boxHeight('.ghost-button', 22)) + marginV('.card-heading');
  const legend = textH('.legend-row', 10) + get('.legend-row', 'margin-top', 0);
  return pad + border + heading + legend;
};
const lessonCard = () => {
  const pad = padV('.lesson-card') + 1;
  const index = textH('.lesson-index', 10);
  const title = textH('.lesson-title', 12) + get('.lesson-title', 'margin-top', 0);
  const body = textH('.lesson-body', 10.5) * 1.25 + get('.lesson-body', 'margin-top', 0); // line-height 1.5 相对 font-size
  const chip = textH('.formula-chip', 9.5) + padV('.formula-chip');
  const formula = chip + get('.formula-row', 'margin-top', 0);
  return pad + index + title + body + formula;
};
const intro = () => padV('.mobile-intro') + Math.max(textH('.intro-title', 13), textH('.status-pill', 10) + padV('.status-pill'));
const toolbar = boxHeight('.app-toolbar', 34) + get('.app-toolbar', 'border-bottom-width', 2);
const shellBottom = 12 + 20; // calc(12px + env(safe-area-inset-bottom))，PAD 横屏按 20 计

const margins = marginV('.canvas-card') + marginV('.lesson-card');
const fixed = (mode) => toolbar + typePanel(mode) + intro() + cardChrome() + lessonCard() + margins;

// ---- 设备用例：(窗口宽, 窗口高, 标签) ----
const devices = [
  [1080, 810, 'iPad 10.2 / 9.7 横屏'],
  [1194, 834, 'iPad Pro 11 横屏'],
  [1366, 1024, 'iPad Pro 12.9 横屏'],
  [744, 1133, 'iPad mini 竖屏'],
  [810, 1080, 'iPad 10.2 竖屏'],
  [884, 1104, '折叠屏展开竖屏'],
  [1024, 768, 'iPad 9.7 横屏（最紧）']
];
const modes = [['point', '点/线/面'], ['section', '平面切割立体'], ['solid', '基本立体']];

console.log('扣减值 N: base=' + N.base + 'px   section=' + N.section + 'px   solid=' + N.solid + 'px');
console.log('画布 clamp 区间: ' + CANVAS_MIN + ' ~ ' + CANVAS_MAX + 'px');
console.log('固定高度（不含画布）: base=' + fixed('point').toFixed(1)
  + '  section=' + fixed('section').toFixed(1) + '  solid=' + fixed('solid').toFixed(1) + 'px');
console.log('');
let fail = 0;
for (const [dw, dh, name] of devices) {
  for (const [mode, label] of modes) {
    const ch = canvasH(dh, mode);
    const total = fixed(mode) + ch;
    const avail = dh - toolbar - shellBottom;
    const ok = total <= avail;
    if (!ok) fail += 1;
    console.log((ok ? 'PASS ' : 'WARN ') + name + ' · ' + label
      + ' :: 画布高=' + ch.toFixed(0) + 'px 画布宽≈' + (dw - 27)
      + ' 整页=' + total.toFixed(0) + ' 可用=' + avail.toFixed(0)
      + (ok ? ' 余量=' + (avail - total).toFixed(0) + 'px' : ' 超出=' + (total - avail).toFixed(0) + 'px'));
  }
}
console.log('');
console.log(fail === 0 ? '结论：全部用例一屏放下（估算）' : '结论：有 ' + fail + ' 个用例需要滚动（估算）');
