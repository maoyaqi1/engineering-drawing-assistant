// 手机端（<500px）参数面板折行估算：数值从 index.wxss 的基础样式段（rpx，按 1rpx=0.5px）解析。
// 用法：node phone-fit-check.cjs
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'pages', 'index', 'index.wxss');
const raw = fs.readFileSync(CSS, 'utf8').replace(/\r\n/g, '\n');
const base = raw.slice(0, raw.indexOf('@media (max-width: 520px)')).replace(/\/\*[\s\S]*?\*\//g, '');

const decls = {};
for (const m of base.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().replace(/\s+/g, ' ');
  if (!sel) continue;
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    decls[sel] = decls[sel] || {};
    decls[sel][d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
}
// rpx → px（手机：750rpx = 窗口宽；375px 宽手机 1rpx = 0.5px）
const px = (v, unit = 0.5) => {
  if (v === undefined) return NaN;
  const m = String(v).match(/(-?\d+(?:\.\d+)?)rpx/);
  if (m) return Number(m[1]) * unit;
  const n = parseFloat(v);   // 无单位的 0 / px 值按原值处理
  return Number.isFinite(n) ? n : NaN;
};
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
const get = (sel, prop = 'width') => px(decls[sel] && decls[sel][prop]);
const flexOf = (sel, prop) => {
  const v = decls[sel] && decls[sel][prop];
  if (!v) return null;
  const m = v.match(/^\s*(\S+)\s+(\S+)\s+(\S+)\s*$/);
  if (m) return { grow: Number(m[1]), shrink: Number(m[2]), basis: px(m[3]) };
  const m2 = v.match(/^\s*(\S+)\s+(\S+)\s*$/);
  if (m2) return { grow: Number(m2[1]), shrink: Number(m2[2]), basis: px(m2[2]) };
  return null;
};
const textH = (sel, fallback) => { const f = get(sel, 'font-size'); return (Number.isFinite(f) ? f : fallback) * 1.2; };
const gapOf = (sel) => { const g = decls[sel] && decls[sel].gap; return g ? px(g) : 0; };
const padV = (sel) => { const p = decls[sel] && decls[sel].padding; if (!p) return 0; const a = p.split(/\s+/).map((x) => px(x)); return a.length <= 2 ? a[0] * 2 : a[0] + (a[2] || 0); };
const marginV = (sel) => { const p = decls[sel] && decls[sel].margin; if (!p) return 0; const a = p.split(/\s+/).map((x) => px(x)); if (a.length === 1) return a[0] * 2; if (a.length === 2) return a[0] * 2; if (a.length === 3) return a[0] + a[2]; return a[0] + (a[2] || 0); };

// 简易 flex 折行：返回每一行的可用宽度
function flexLines(container, items, gap) {
  const lines = [];
  let cur = [];
  let used = 0;
  for (const it of items) {
    const need = cur.length ? gap + it.basis : it.basis;
    if (cur.length && used + need > container + 0.01) { lines.push(cur); cur = [it]; used = it.basis; }
    else { cur.push(it); used += need; }
  }
  if (cur.length) lines.push(cur);
  return lines.map((line) => {
    const totalBasis = line.reduce((s, it) => s + it.basis, 0) + gap * (line.length - 1);
    const free = container - totalBasis;
    const growSum = line.reduce((s, it) => s + it.grow, 0);
    return line.map((it) => it.basis + (growSum > 0 ? (free * it.grow) / growSum : 0));
  });
}

const devices = [[320, 'iPhone SE 320'], [360, '安卓 360'], [375, 'iPhone 375'], [390, 'iPhone 14 390'], [414, 'Plus 414'], [430, 'Max 430']];
const panelPad = 12 * 0.5 * 2;              // .type-panel padding 左右 12rpx
const labelW = 23 * 0.5 * 2 + 12 * 0.5 + 6 * 0.5; // 两字标签 + padding-left + border-left
const chipRow = 50 * 0.5;                   // ≤520px 媒体块里 .type-chip height: 50rpx
const pick = (a, b) => (Number.isFinite(a) ? a : b);
const nameW = pick(get('.solid-size-row .param-name'), get('.param-name'));              // 46px
const valW = pick(get('.solid-size-row .param-val', 'min-width'), get('.param-val', 'min-width')); // 20px
const sliderRowGap = 8 * 0.5;               // .slider-row gap 8rpx

console.log('手机 尺寸行：param-name=' + nameW + 'px param-val=' + valW + 'px 行间距=' + sliderRowGap + 'px');
console.log('设备      面板宽  尺寸行数  每行滑块宽   姿态行数  切割-类型行数');
for (const [w, name] of devices) {
  const panel = w - panelPad;
  const inner = panel - labelW - gapOf('.solid-group');
  const sizeRowItems = [
    { basis: flexOf('.solid-size-row > .slider-row', 'flex').basis, grow: 1 },
    { basis: flexOf('.solid-size-row > .slider-row', 'flex').basis, grow: 1 },
    { basis: flexOf('.solid-size-row > .slider-row', 'flex').basis, grow: 1 }
  ];
  const sizeLines = flexLines(inner, sizeRowItems, gapOf('.solid-size-row'));
  const sliderW = sizeLines[0].map((rw) => rw - nameW - valW - sliderRowGap).map((v) => Math.round(v));

  // 姿态行：pose-tabs(2 个) + 坐标轴 + 角度滑块
  const poseTabW = flexOf('.solid-group .pose-tab', 'flex').basis;
  const poseItems = [
    { basis: poseTabW * 2 + gapOf('.pose-tabs'), grow: 0 },
    null,
    { basis: flexOf('.pose-line > .slider-row', 'flex').basis, grow: 1 }
  ];
  // 姿态行第 1 行：旋转/平移 + 坐标轴 X Y Z + 旋转90°
  // 旋转90° 按钮必须用显式 flex-basis 计算（小程序里按钮 width:auto 会吃掉整行剩余宽度）
  const rot90Flex = flexOf('.rot90-chip', 'flex');
  const rot90W = rot90Flex.basis + (get('.axis-row .rot90-chip', 'margin-left') || 0);
  const rot90Min = get('.rot90-chip', 'min-width') || rot90Flex.basis;
  const axisRowW = get('.axis-row .param-name') + flexOf('.axis-chip', 'flex').basis * 3 + gapOf('.axis-row') * 3 + rot90W;
  const poseFixed = poseItems[0].basis + axisRowW;
  const poseLines = flexLines(inner, [{ basis: poseFixed, grow: 0 }, { basis: poseItems[2].basis, grow: 1 }], gapOf('.pose-line'));
  const poseSliderRowW = poseLines.length > 1 ? poseLines[1][0] : poseLines[0][1];
  const angleSliderW = Math.round(poseSliderRowW - nameW - valW - sliderRowGap);
  // 姿态第 1 行是否能容下「tabs + 坐标轴 X Y Z + 旋转90°」（按钮最多收缩到 min-width）
  const tabsW = flexOf('.solid-group .pose-tab', 'flex').basis * 2 + gapOf('.pose-tabs');
  const line1With = tabsW + gapOf('.pose-line') + axisRowW;
  const line1Min = line1With - (rot90Flex.basis - rot90Min);

  // 平面切割：立体工具栏（3 个/行）+ 截平面工具栏
  const typeInner = panel - labelW - gapOf('.section-type-line');
  const solidToolbarW = typeInner;
  const chipsPerRow = 3;
  const solidChipRows = Math.ceil(6 / chipsPerRow);
  const sectionTypeRows = solidChipRows + 1;

  console.log(name.padEnd(9) + String(w).padEnd(8) + String(sizeLines.length).padEnd(10)
    + (sliderW.join(' / ') + 'px').padEnd(15) + String(poseLines.length).padEnd(10) + sectionTypeRows
    + '     角度滑块 ' + angleSliderW + 'px'
    + '     姿态首行需 ' + Math.round(line1With) + 'px' + (line1With <= inner + 0.01 ? '（放得下）' : (line1Min <= inner + 0.01 ? '（收缩后放得下）' : '（换行）')));
}
console.log('');
console.log('说明：');
console.log('- 尺寸行每行最多 2 个滑块（basis=' + flexOf('.solid-size-row > .slider-row', 'flex').basis + 'px），宽度不够时自动变 1 个/行');
console.log('- 姿态行第 1 行放「旋转/平移 + 坐标轴 X Y Z」，角度滑块放不下时自动折到第 2 行');

// ---- 面板高度：合并前 / 合并后（手机 375px 宽）----
const sliderH = 28;                                        // <slider> 组件高度估算
const stepperRowH = Math.max(marginV('.stepper') + 21, 24); // 棱数行：步进器 42rpx
const tabsRowH = get('.solid-type-chip', 'height') + marginV('.solid-type-tabs');
const labelH = textH('.solid-group-label', 11.5) + marginV('.solid-group-label');
const poseTabRowH = get('.pose-tab', 'height') + marginV('.pose-tabs');
const axisRowH = get('.axis-chip', 'height') + marginV('.axis-row');
const sectionChipH = chipRow;                              // ≤520px 媒体块：50rpx
const sectionControlsH = marginV('.section-controls') + get('.section-controls', 'padding-top')
  + 0.5 + textH('.control-meta', 10.5) + sliderH;

const solidSizeCount = { 棱柱: 3, 棱锥: 3, 圆柱: 2, 圆锥: 2, 圆球: 1, 圆环: 2 };
console.log('');
console.log('面板高度对比（手机 375px 宽，估算）');
console.log('模式/立体     合并前   合并后   节省');
for (const [k, n] of Object.entries(solidSizeCount)) {
  const before = tabsRowH + labelH + (n === 3 ? stepperRowH : 0) + sliderH * Math.min(n, 3)
    + labelH + poseTabRowH + axisRowH + sliderH;
  // 合并后：尺寸按每行 2 个折行，姿态 = 一行（tabs+坐标轴）+ 一行（角度滑块）
  const sizeRows = Math.min(2, Math.ceil(n / 2));
  const after = tabsRowH + sliderH * sizeRows + poseTabRowH + sliderH;
  console.log(('基本立体·' + k).padEnd(14) + String(before).padEnd(9) + String(after).padEnd(9) + (before - after));
}
const secBefore = textH('.type-label', 11.5) + marginV('.type-label') + (sectionChipH * 2 + 4)
  + get('.section-plane-label', 'margin-top') + textH('.type-label', 11.5) + marginV('.type-label')
  + sectionChipH + sectionControlsH;
const secAfter = (sectionChipH * 2 + 4) + sectionChipH + sectionControlsH;
console.log('平面切割立体'.padEnd(13) + String(Math.round(secBefore)).padEnd(9) + String(Math.round(secAfter)).padEnd(9) + Math.round(secBefore - secAfter));
