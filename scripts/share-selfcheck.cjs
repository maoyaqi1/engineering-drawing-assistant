// 转发能力自测：
//  A. 声明了转发的页面能被真实加载，且 onShareAppMessage 返回合法内容（标题与登录页文案一致、path 已注册）
//  B. 未声明转发的页面保持原样（不误加）
//  C. 未启用朋友圈分享（onShareTimeline 不存在）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const appJson = JSON.parse(read(ROOT + '/app.json'));
const pages = appJson.pages || [];
const noop = () => {};
global.wx = {
  navigateTo: noop, redirectTo: noop, reLaunch: noop, switchTab: noop, navigateBack: noop,
  setNavigationBarTitle: noop, showToast: noop, showModal: noop, getStorageSync: () => '', setStorageSync: noop,
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3, safeArea: { bottom: 812 } }),
  createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: (cb) => cb([null]) }) }) }),
  cloud: { init: noop, callFunction: async () => ({ result: { ok: true } }) }
};
global.getApp = () => ({ globalData: { user: null } });

function loadPage(rel) {
  let captured = null;
  global.Page = (obj) => { captured = obj; };
  const full = ROOT + '/' + rel;
  delete require.cache[require.resolve(full)];
  require(full);
  return captured;
}

// 登录页可见文案（分享标题应与之对应）
const loginWxml = read(ROOT + '/pages/login/login.wxml');
const visibleTitle = (loginWxml.match(/class="login-title">([^<]+)</) || [])[1] || '';
const visibleSub = (loginWxml.match(/class="login-sub">([^<]+)</) || [])[1] || '';
check('A0 登录页可见文案可提取', !!visibleTitle && !!visibleSub, visibleTitle + ' / ' + visibleSub);

const withShare = ['pages/login/login.js', 'pages/index/index.js', 'pages/ai/ai.js'];
for (const rel of withShare) {
  let page = null;
  try { page = loadPage(rel); } catch (e) { check('加载 ' + rel, false, e.message); continue; }
  check('A1 可加载 ' + rel, !!page);
  const fn = page && page.onShareAppMessage;
  check('A2 ' + rel + ' 实现 onShareAppMessage', typeof fn === 'function');
  if (typeof fn === 'function') {
    const info = fn.call({ data: {} }) || {};
    const titleOk = typeof info.title === 'string'
      && info.title.includes(visibleTitle) && info.title.includes(visibleSub);
    check('A3 ' + rel + ' 分享标题含登录页标题与副标题', titleOk, String(info.title));
    const p = String(info.path || '').replace(/^\//, '');
    check('A4 ' + rel + ' 分享 path 指向已注册页面', pages.includes(p), String(info.path));
    const hasTimeline = typeof page.onShareTimeline === 'function';
    check('A5 ' + rel + ' 未启用朋友圈分享', !hasTimeline);
  }
}

const withoutShare = ['pages/register/register.js', 'pages/survey/survey.js', 'pages/terms/terms.js'];
for (const rel of withoutShare) {
  let page = null;
  try { page = loadPage(rel); } catch (e) { check('加载 ' + rel, false, e.message); continue; }
  check('B1 ' + rel + ' 仍可正常加载', !!page);
  check('B2 ' + rel + ' 未声明转发（保持原样）', !page || typeof page.onShareAppMessage !== 'function');
}

// 全仓不应出现 onShareTimeline / showShareMenu（本次范围只做"转发给好友"）
const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/(\\|\/)(node_modules|\.git|web-release|geogebra-offline|screen)(\\|\/)/.test(p)) continue;
    if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) jsFiles.push(p);
  }
})(ROOT);
const timeline = jsFiles.filter((f) => /onShareTimeline|showShareMenu/.test(read(f)));
check('C1 全仓未启用朋友圈分享接口', timeline.length === 0, timeline.map((f) => f.replace(/\\/g, '/').replace(ROOT + '/', '')).join(', '));

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '  :: ' + r.detail : ''));
console.log('\n合计 ' + results.length + '，通过 ' + (results.length - failed.length) + '，失败 ' + failed.length);
process.exit(failed.length ? 1 : 0);
