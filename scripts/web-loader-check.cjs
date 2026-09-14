// 网页版演示页（web/index.html）模块加载检查。
//
// 背景：web/index.html 直接打开就能跑，没有打包步骤；页面逻辑拆成 pages/index/ 下的多个模块后，
//       由 index.html 里的 CommonJS 垫片按「相对路径 → 导出对象」注册。本脚本在 Node 的 vm 里
//       按同样的顺序执行这些 <script>，验证垫片与模块依赖顺序仍然成立。
//
// 运行：node scripts/web-loader-check.cjs   （或 node scripts/run-all.js 统一运行）
// 边界：只模拟到 pages/index/index.js（含）；web/runtime.js 需要真实 DOM 与 Canvas，不在这里模拟，
//       它未被本次拆分改动。真实浏览器渲染仍需人工打开 web/index.html 核对。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail || '' });

const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');

// 按出现顺序取出 <script src="..."> 与内联 <script>…</script>
const scripts = [];
for (const match of html.matchAll(/<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/g)) {
  scripts.push(match[1] ? { src: match[1] } : { code: match[2] });
}
check('web/index.html 至少有一个 <script>', scripts.length > 0, '共 ' + scripts.length + ' 个');

const sandbox = {
  console,
  document: { title: '工程制图学习助手', getElementById: () => null },
  setTimeout,
  clearTimeout
};
vm.createContext(sandbox);
vm.runInContext('window = this; window.document = document;', sandbox);

const loadedSources = [];
let stoppedAt = '';
for (const script of scripts) {
  if (script.src) {
    const file = path.resolve(path.join(ROOT, 'web'), script.src);
    if (!fs.existsSync(file)) {
      check('脚本文件存在：' + script.src, false, file);
      break;
    }
    // 只模拟到首页逻辑为止；runtime.js 需要真实 DOM
    if (/pages\/index\/index\.js$/.test(script.src)) {
      loadedSources.push({ name: script.src, text: fs.readFileSync(file, 'utf8') });
      vm.runInContext(loadedSources[loadedSources.length - 1].text, sandbox, { filename: file });
      stoppedAt = script.src;
      break;
    }
    loadedSources.push({ name: script.src, text: fs.readFileSync(file, 'utf8') });
    try {
      vm.runInContext(loadedSources[loadedSources.length - 1].text, sandbox, { filename: file });
    } catch (error) {
      check('可执行脚本：' + script.src, false, String(error && error.message || error));
    }
  } else {
    try {
      vm.runInContext(script.code, sandbox);
    } catch (error) {
      check('可执行内联脚本', false, String(error && error.message || error));
      break;
    }
  }
}

check('已按顺序执行到 pages/index/index.js', stoppedAt === '../pages/index/index.js',
  '实际停在：' + (stoppedAt || '未到达'));

const page = vm.runInContext('window.geometryPage', sandbox);
check('垫片注册了页面对象 window.geometryPage', !!page && typeof page === 'object');

// 1) 每个同目录 require 都必须注册到实际模块（旧垫片无视路径，全部返回 section-geometry）
//    注意：session.js 的 require('../../utils/api.js') 被 `wx.cloud` 三元判断挡住，
//    网页版垫片没有 wx.cloud，因此不会执行到，不在本项检查范围内。
const requiredPaths = new Set();
loadedSources.forEach((item) => {
  for (const m of item.text.matchAll(/require\('([^']+)'\)/g)) {
    if (m[1].startsWith('./')) requiredPaths.add(m[1]);
  }
});
const missing = [...requiredPaths].filter((p) => {
  const value = vm.runInContext('require(' + JSON.stringify(p) + ')', sandbox);
  return !value || typeof value !== 'object';
});
check('垫片能按路径解析全部 ' + requiredPaths.size + ' 个同目录模块引用',
  missing.length === 0, missing.join(', '));

const distinct = vm.runInContext("require('./section-geometry.js') !== require('./basic-solid.js')", sandbox);
check('不同路径解析到不同模块（不再是「无视参数」的旧垫片）', distinct === true);
const basicSolid = vm.runInContext("require('./basic-solid.js')", sandbox);
check('basic-solid.js 解析出 drawIso / drawViews / buildSolidGeometry',
  !!basicSolid && typeof basicSolid.drawIso === 'function'
  && typeof basicSolid.drawViews === 'function' && typeof basicSolid.buildSolidGeometry === 'function');

// 2) 页面对象完整性（与小程序端同一份代码）
const wxml = fs.readFileSync(path.join(ROOT, 'pages', 'index', 'index.wxml'), 'utf8');
const handlers = [...new Set([...wxml.matchAll(/\b(?:bind|catch|mut-bind):?[a-zA-Z]+\s*=\s*"([A-Za-z_$][\w$]*)"/g)].map((m) => m[1]))];
const missingHandlers = handlers.filter((name) => typeof page[name] !== 'function');
check('index.wxml 的 ' + handlers.length + ' 个事件处理函数都挂上了', missingHandlers.length === 0, missingHandlers.join(', '));

const expectModules = ['presets', 'session', 'math-utils', 'projection', 'touch', 'draw-helpers',
  'render-scene', 'section-math', 'section-render', 'solid-projection', 'ui-handlers'];
const missingSamples = [];
expectModules.forEach((name) => {
  const source = fs.readFileSync(path.join(ROOT, 'pages', 'index', name + '.js'), 'utf8');
  for (const m of source.matchAll(/^ {2}(?:async )?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (typeof page[m[1]] !== 'function') missingSamples.push(name + ':' + m[1]);
  }
});
check('所有模块导出的方法都挂到了页面对象上', missingSamples.length === 0, missingSamples.join(', '));

check('页面 data 存在且 point 预设为 (4, 3, 5)',
  !!page.data && page.data.point && page.data.point.x === 4 && page.data.point.y === 3 && page.data.point.z === 5,
  JSON.stringify(page.data && page.data.point));

// 3) 浏览器加载路径与 Node require 路径算出的结果必须一致
const viaNode = require(path.join(ROOT, 'pages', 'index', 'projection.js'));
const browserLayout = page.getLayout(375, 667);
const nodeLayout = viaNode.getLayout(375, 667);
check('getLayout(375, 667) 与 Node 端结果一致', JSON.stringify(browserLayout) === JSON.stringify(nodeLayout),
  JSON.stringify(browserLayout) + ' ≠ ' + JSON.stringify(nodeLayout));
const browserIso = page.projectIsometric({ x: 3, y: 5, z: 2 });
const nodeIso = viaNode.projectIsometric({ x: 3, y: 5, z: 2 });
check('projectIsometric 结果一致', JSON.stringify(browserIso) === JSON.stringify(nodeIso),
  JSON.stringify(browserIso) + ' ≠ ' + JSON.stringify(nodeIso));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass || !r.detail ? '' : '  :: ' + r.detail)));
console.log('\n合计 ' + results.length + '，通过 ' + (results.length - failed.length) + '，失败 ' + failed.length);
console.log('（未模拟 web/runtime.js：它需要真实 DOM 与 Canvas，需人工打开 web/index.html 核对）');
process.exitCode = failed.length ? 1 : 0;
