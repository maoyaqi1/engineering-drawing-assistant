// 尺规作图模块移除自测：
//  A. app.json 页面注册 ↔ 文件存在性（双向）
//  B. 所有跳转目标（wx.navigateTo/redirectTo/switchTab/reLaunch、<navigator>）都指向已注册页面
//  C. 真实加载 pages/index/index.js 的 Page 对象：WXML 里每个 bind*/catch* 都能在对象上找到同名方法，且 goRuler 已不存在
//  D. 代码里不再出现 ruler / utils/geo.js 引用
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/(\\|\/)(node_modules|\.git|web-release|geogebra-offline|screen)(\\|\/)/.test(p)) continue;
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const all = walk(ROOT);
const appJson = JSON.parse(read(ROOT + '/app.json'));
const pages = appJson.pages || [];

// ---- A. 页面注册 ↔ 文件 ----
const missing = [];
for (const p of pages) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    if (!fs.existsSync(ROOT + '/' + p + ext)) missing.push(p + ext);
  }
}
check('A1 app.json 注册的 ' + pages.length + ' 个页面文件齐全', missing.length === 0, missing.join(', '));
const pageDirs = fs.readdirSync(ROOT + '/pages', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => 'pages/' + e.name + '/' + e.name);
const unregistered = pageDirs.filter((d) => !pages.includes(d));
check('A2 磁盘上每个页面目录都已注册', unregistered.length === 0, '未注册: ' + unregistered.join(', '));
check('A3 pages/ruler 已从 app.json 与磁盘移除', !pages.some((p) => p.indexOf('ruler') >= 0) && !fs.existsSync(ROOT + '/pages/ruler'));

// ---- B. 跳转目标 ----
const jsFiles = all.filter((p) => p.endsWith('.js'));
const wxmlFiles = all.filter((p) => p.endsWith('.wxml'));
const navTargets = new Set();
for (const f of jsFiles) {
  const t = read(f);
  for (const m of t.matchAll(/url:\s*'([^']+)'/g)) navTargets.add(m[1]);
  for (const m of t.matchAll(/navigateTo\(\{\s*url:\s*'([^']+)'/g)) navTargets.add(m[1]);
}
for (const f of wxmlFiles) {
  const t = read(f);
  for (const m of t.matchAll(/<navigator[^>]*url="([^"]+)"/g)) navTargets.add(m[1]);
}
const badNav = [];
for (const url of navTargets) {
  const clean = url.split('?')[0].replace(/^\//, '');
  if (!clean.startsWith('pages/')) continue;
  if (!pages.includes(clean)) badNav.push(url);
}
check('B1 所有页面跳转目标都已注册（共 ' + navTargets.size + ' 个目标）', badNav.length === 0, '失效目标: ' + badNav.join(', '));

// ---- C. 真实加载首页 Page 对象 ----
let pageObj = null;
const noop = () => {};
global.wx = {
  navigateTo: noop, redirectTo: noop, switchTab: noop, reLaunch: noop, navigateBack: noop,
  setNavigationBarTitle: noop, showToast: noop, showModal: noop, getStorageSync: () => '', setStorageSync: noop,
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3, safeArea: { bottom: 812 } }),
  createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: (cb) => cb([null]) }) }) }),
  cloud: { init: noop, callFunction: async () => ({ result: { ok: true } }) },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3 })
};
global.getApp = () => ({ globalData: { user: { student_id: 'x', openid: 'o' } } });
global.Page = (obj) => { pageObj = obj; };
try {
  delete require.cache[require.resolve(ROOT + '/pages/index/index.js')];
  require(ROOT + '/pages/index/index.js');
  check('C1 index.js 可被加载并注册 Page 对象', !!pageObj);
} catch (e) {
  check('C1 index.js 可被加载并注册 Page 对象', false, e.message);
}
if (pageObj) {
  const wxml = read(ROOT + '/pages/index/index.wxml');
  const bindings = new Set([...wxml.matchAll(/\b(?:bind|catch)[a-z]*="(\w+)"/g)].map((m) => m[1]));
  const missingHandlers = [...bindings].filter((b) => typeof pageObj[b] !== 'function');
  check('C2 WXML 的 ' + bindings.size + ' 个事件绑定在 Page 对象上都有同名方法', missingHandlers.length === 0, '缺失: ' + missingHandlers.join(', '));
  const keys = Object.keys(pageObj);
  const rulerKeys = keys.filter((k) => /ruler/i.test(k));
  check('C3 Page 对象已无 ruler 相关方法', rulerKeys.length === 0, rulerKeys.join(', '));
  const dataRuler = Object.keys(pageObj.data || {}).filter((k) => /ruler/i.test(k));
  check('C4 Page data 已无 ruler 相关字段', dataRuler.length === 0, dataRuler.join(', '));
  const prev = Object.keys(pageObj).length;
  check('C5 首页方法数量合理（' + prev + ' 个）', prev > 80);
  // C6/C7 真实调用跳转方法，确认目标地址正确（尺规入口已移除，AI 入口仍可用）
  const visited = [];
  global.wx.navigateTo = ({ url }) => { visited.push(url); };
  pageObj.goToAi();
  check('C6 点“问老师”仍跳转到 AI 页', visited.includes('/pages/ai/ai'), visited.join(', '));
  visited.length = 0;
  pageObj.goProfile();
  check('C7 点“个人信息”仍跳转到注册/资料页', visited.includes('/pages/register/register'), visited.join(', '));
  check('C8 已无 goRuler 方法（尺规入口彻底移除）', typeof pageObj.goRuler === 'undefined');
}

// ---- D. 残留引用 ----
// 排除 scripts/：开发者脚本不在小程序包内，且需要按名字引用已移除模块（如本文件自身的用法说明）
const codeFiles = all.filter((p) => /\.(js|json|wxml|wxss|html)$/.test(p) && !/[\\/]scripts[\\/]/.test(p));
const dangling = [];
for (const f of codeFiles) {
  const t = read(f);
  if (/ruler/i.test(t)) dangling.push(f.replace(/\\/g, '/').replace(ROOT + '/', '') + '（ruler 字样）');
  if (/utils[\\/]geo(\.js)?/.test(t)) dangling.push(f.replace(/\\/g, '/').replace(ROOT + '/', '') + '（引用 utils/geo）');
}
check('D1 代码中不再出现 ruler / utils/geo 引用', dangling.length === 0, dangling.join(', '));
check('D2 utils/geo.js 已删除', !fs.existsSync(ROOT + '/utils/geo.js'));
check('D3 web/ruler.html 已删除', !fs.existsSync(ROOT + '/web/ruler.html'));

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '  :: ' + r.detail : ''));
console.log('\n合计 ' + results.length + '，通过 ' + (results.length - failed.length) + '，失败 ' + failed.length);
process.exit(failed.length ? 1 : 0);
