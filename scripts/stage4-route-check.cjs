#!/usr/bin/env node
// 阶段 4 路由检查：登录、注册、课程首页、旧 index、问卷和 AI 的落点。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('stage4-route-check');
const api = require('../utils/api.js');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePage(definition) {
  return Object.assign({}, definition, {
    data: clone(definition.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (typeof callback === 'function') callback();
    }
  });
}

function loadPage(relativePath) {
  let definition = null;
  global.Page = (page) => { definition = page; };
  const file = path.join(ROOT, relativePath);
  delete require.cache[require.resolve(file)];
  require(file);
  return definition;
}

let navigations = [];
let relaunches = [];
let redirects = [];
let appState = null;

global.wx = {
  reLaunch(options) { relaunches.push(options.url); },
  redirectTo(options) { redirects.push(options.url); },
  navigateTo(options) { navigations.push(options.url); },
  showToast() {},
  showModal() {},
  setNavigationBarTitle() {}
};
global.getApp = () => appState;
global.getCurrentPages = () => [];

async function main() {
  suite.section('1. 冷启动与登录分流');
  const appJson = JSON.parse(read('app.json'));
  suite.equal(appJson.pages[0], 'pages/login/login', '登录页仍为第一个页面');
  suite.check(appJson.pages.includes('pages/home/home'), '课程首页已注册');
  suite.check(!read('app.js').includes('onShow()'), 'app.js 未增加强制恢复重定向');

  const loginCases = [
    { name: '无用户', user: null, expected: '' },
    { name: '完整资料', user: { student_id: '20260001' }, expected: '/pages/home/home' },
    { name: '资料不完整', user: { student_id: '' }, expected: '/pages/register/register' }
  ];
  loginCases.forEach((item) => {
    appState = { globalData: { user: item.user } };
    relaunches = [];
    const loginPageDefinition = loadPage('pages/login/login.js');
    const page = makePage(loginPageDefinition);
    page.onLoad();
    suite.equal(relaunches[0] || '', item.expected, item.name + '的冷启动落点');
  });

  const originalLogin = api.login;
  const originalRecordEvent = api.recordEvent;
  api.recordEvent = () => Promise.resolve({ ok: true });
  try {
    appState = {
      globalData: { user: null },
      setUser(user) { this.globalData.user = user; }
    };
    api.login = () => Promise.resolve({
      ok: true,
      registered: true,
      user: { openid: 'u1', student_id: '20260001' }
    });
    relaunches = [];
    const loginPageDefinition = loadPage('pages/login/login.js');
    let page = makePage(loginPageDefinition);
    page.data.agreed = true;
    page.tryLogin();
    await new Promise((resolve) => setTimeout(resolve, 0));
    suite.equal(relaunches[0], '/pages/home/home', '完整资料登录成功进入课程首页');

    appState = {
      globalData: { user: null },
      setUser(user) { this.globalData.user = user; }
    };
    api.login = () => Promise.resolve({
      ok: true,
      registered: false,
      user: { openid: 'u2', student_id: '' }
    });
    relaunches = [];
    const incompleteLoginDefinition = loadPage('pages/login/login.js');
    page = makePage(incompleteLoginDefinition);
    page.data.agreed = true;
    page.tryLogin();
    await new Promise((resolve) => setTimeout(resolve, 0));
    suite.equal(relaunches[0], '/pages/register/register', '资料不完整登录后进入注册页');
  } finally {
    api.login = originalLogin;
    api.recordEvent = originalRecordEvent;
  }

  suite.section('2. 注册与首页守卫');
  const originalRegister = api.register;
  try {
    appState = {
      globalData: { user: { openid: 'u3', student_id: '' } },
      setUser(user) { this.globalData.user = user; }
    };
    const registerDefinition = loadPage('pages/register/register.js');
    api.register = () => Promise.resolve({
      ok: true,
      user: { openid: 'u3', student_id: '20260002' }
    });
    relaunches = [];
    const registerPage = makePage(registerDefinition);
    registerPage.data.school = '安徽建筑大学';
    registerPage.data.name = '测试学生';
    registerPage.data.studentId = '20260002';
    registerPage.submit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    suite.equal(relaunches[0], '/pages/home/home', '注册成功后进入课程首页');
  } finally {
    api.register = originalRegister;
  }

  const homeDefinition = loadPage('pages/home/home.js');
  const homeCases = [
    { name: '无用户', user: null, expected: '/pages/login/login' },
    { name: '资料不完整', user: { student_id: '' }, expected: '/pages/register/register' }
  ];
  homeCases.forEach((item) => {
    appState = { globalData: { user: item.user } };
    relaunches = [];
    const page = makePage(homeDefinition);
    page.onLoad();
    suite.equal(relaunches[0], item.expected, '首页' + item.name + '守卫');
  });
  appState = { globalData: { user: { openid: 'u4', student_id: '20260003' } } };
  relaunches = [];
  const validHome = makePage(homeDefinition);
  validHome.onLoad();
  suite.equal(relaunches.length, 0, '完整资料用户可进入首页');
  suite.equal(validHome.data.chapters.length, 7, '首页目录正常初始化');

  suite.section('3. 旧路由、问卷与 AI 落点');
  suite.check(read('pages/index/index.js').includes("path: '/pages/index/index'"),
    '旧 index 分享路径保持不变');
  suite.check(read('pages/index/index.js').includes("mode: 'point'"),
    '旧 index 无参数默认仍为点模式');
  const surveyDefinition = loadPage('pages/survey/survey.js');
  relaunches = [];
  makePage(surveyDefinition).backHome();
  suite.equal(relaunches[0], '/pages/home/home', '问卷完成返回课程首页');

  const aiAccess = require('../pages/ai/ai-access.js');
  redirects = [];
  aiAccess.leaveHiddenAiPage.call({});
  suite.equal(redirects[0], '/pages/home/home', 'AI 准入失败返回课程首页');
  suite.check(read('pages/ai/ai.js').includes("wx.redirectTo({ url: '/pages/login/login' })"),
    'AI 页面无登录态进入登录页');

  suite.section('4. 后台恢复边界');
  const appSource = read('app.js');
  suite.check(appSource.includes("wx.getStorageSync('hfjh_user')"),
    '冷启动仍从本地缓存恢复用户');
  suite.check(!appSource.includes('pages/home/home'),
    'app.js 不在地点级生命周期强制跳首页');

  process.exitCode = suite.finish();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
