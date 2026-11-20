#!/usr/bin/env node
// 学习页会话生命周期检查：五种 index 模式与各独立知识点页在正常隐藏、
// onHide→onUnload、启动在途、启动失败和重新可见时的行为。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('page-session-lifecycle-check');
const api = require('../utils/api.js');
const originalApi = {
  startSession: api.startSession,
  endSession: api.endSession,
  recordEvent: api.recordEvent,
  rosterStatus: api.rosterStatus,
  statistics: api.statistics
};

let currentPage = null;
let calls = [];
let startDeferred = null;
let startResolvers = [];

global.getCurrentPages = () => (currentPage ? [currentPage] : []);
global.getApp = () => ({
  globalData: { user: { openid: 'lifecycle-user', student_id: '20260001' } }
});
global.wx = {
  cloud: { callFunction: async () => ({ result: { ok: true } }) },
  reLaunch() {},
  redirectTo() {},
  navigateTo() {},
  setNavigationBarTitle() {},
  showModal() {},
  showToast() {}
};

api.startSession = (moduleName) => {
  calls.push({ action: 'session.start', module: moduleName });
  return new Promise((resolve) => {
    startResolvers.push(resolve);
  });
};
api.endSession = (sessionId, duration, interactionCount) => {
  calls.push({
    action: 'session.end',
    session_id: sessionId,
    duration,
    interaction_count: interactionCount
  });
  return Promise.resolve({ ok: true, is_valid: duration > 0, already_ended: false });
};
api.recordEvent = (eventType, payload) => {
  calls.push(Object.assign({ action: 'record.event', event_type: eventType }, payload || {}));
  return Promise.resolve({ ok: true });
};
api.rosterStatus = () => Promise.resolve({ ok: true, level: 'guest' });
api.statistics = () => Promise.resolve({
  ok: true,
  can_invite: false,
  survey_completed: false,
  valid_session_count: 0
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDefinition(relativePath) {
  let definition = null;
  global.Page = (page) => { definition = page; };
  const file = path.join(ROOT, relativePath);
  delete require.cache[require.resolve(file)];
  require(file);
  return definition;
}

function createPage(definition, route) {
  const page = Object.assign({}, definition, {
    route,
    data: clone(definition.data),
    setData(patch, callback) {
      Object.keys(patch).forEach((key) => {
        if (key.indexOf('.') < 0) this.data[key] = patch[key];
      });
      if (typeof callback === 'function') callback();
    },
    initializeCanvas() {},
    drawScene() {},
    scheduleCanvasDraw() {}
  });
  currentPage = page;
  return page;
}

function waitForStart() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function countAction(name, eventType) {
  return calls.filter((call) => call.action === name
    && (!eventType || call.event_type === eventType)).length;
}

async function runNormalCycle(page, startMethod, moduleName, chapterId) {
  calls = [];
  page[startMethod]();
  await waitForStart();
  suite.equal(countAction('session.start'), 1, moduleName + ' 每个可见周期只启动一次');
  const resolveStart = startResolvers.shift();
  resolveStart({ ok: true, session_id: 'session-' + moduleName });
  await flush();
  suite.equal(countAction('record.event', 'chapter_enter'), 1,
    moduleName + ' 启动成功后记录一次 chapter_enter');
  const enter = calls.find((call) => call.action === 'record.event'
    && call.event_type === 'chapter_enter');
  suite.check(!!enter && enter.chapter_id === chapterId,
    moduleName + ' chapter_enter 章节标识不变');

  page.onHide();
  await flush();
  suite.equal(countAction('record.event', 'chapter_exit'), 1,
    moduleName + ' 隐藏时只记录一次 chapter_exit');
  suite.equal(countAction('session.end'), 1, moduleName + ' 只发送一次 session.end');
  page[startMethod]();
  await waitForStart();
  startResolvers.shift()({ ok: true, session_id: 'session-' + moduleName + '-resume' });
  await flush();
  suite.equal(countAction('session.start'), 2, moduleName + ' 重新显示后建立新会话');
  suite.equal(countAction('record.event', 'chapter_enter'), 2,
    moduleName + ' 重新显示后重新记录 chapter_enter');
  page.onHide();
  page.onUnload();
  await flush();
  suite.equal(countAction('record.event', 'chapter_exit'), 2,
    moduleName + ' onHide→onUnload 连续触发只结束当前周期一次');
  suite.equal(countAction('session.end'), 2, moduleName + ' 两个可见周期各结束一次');
}

async function runStartInFlightHide(page, startMethod, moduleName) {
  calls = [];
  page[startMethod]();
  await waitForStart();
  page.onHide();
  page.onUnload();
  const resolveStart = startResolvers.shift();
  resolveStart({ ok: true, session_id: 'late-' + moduleName });
  await flush();
  suite.equal(countAction('record.event', 'chapter_enter'), 0,
    moduleName + ' 在途启动隐藏后不记录 chapter_enter');
  suite.equal(countAction('record.event', 'chapter_exit'), 0,
    moduleName + ' 在途启动隐藏后不记录 chapter_exit');
  const endCalls = calls.filter((call) => call.action === 'session.end');
  suite.equal(endCalls.length, 1, moduleName + ' 在途启动隐藏后只关闭一次晚到会话');
  suite.check(endCalls[0] && endCalls[0].session_id === 'late-' + moduleName
    && endCalls[0].duration === 0, moduleName + ' 晚到会话以 0 秒关闭');
}

async function main() {
  const indexDefinition = loadDefinition('pages/index/index.js');
  const indexModes = [
    ['point', 0],
    ['line', 1],
    ['plane', 2],
    ['solid', 3],
    ['section', 4]
  ];

  suite.section('1. index 五种模式');
  for (const [mode, moduleIndex] of indexModes) {
    const page = createPage(indexDefinition, 'pages/index/index');
    page.data.mode = mode;
    page.data.moduleIndex = moduleIndex;
    await runNormalCycle(page, 'ensureSession', mode, mode);
  }

  suite.section('2. index 在途启动与重新进入');
  let page = createPage(indexDefinition, 'pages/index/index');
  page.data.mode = 'line';
  await runStartInFlightHide(page, 'ensureSession', 'line');

  calls = [];
  page = createPage(indexDefinition, 'pages/index/index');
  page.data.mode = 'point';
  page.ensureSession();
  await waitForStart();
  startResolvers.shift()({ ok: false, code: 'NETWORK' });
  await flush();
  suite.equal(countAction('record.event', 'chapter_enter'), 0,
    'index 启动失败不产生章节进入');
  page.onHide();
  suite.equal(countAction('session.end'), 0, '启动失败后隐藏不结束不存在的会话');
  suite.equal(countAction('record.event', 'chapter_exit'), 0,
    '启动失败后隐藏不产生章节退出');
  page.onShow();
  await waitForStart();
  suite.equal(countAction('session.start'), 2, '启动失败后再次显示可以重试');
  startResolvers.shift()({ ok: true, session_id: 'session-plane-retry' });
  await flush();
  suite.equal(countAction('record.event', 'chapter_enter'), 1,
    '启动失败后的重试成功记录章节进入');
  page.onHide();
  page.onUnload();

  calls = [];
  page = createPage(indexDefinition, 'pages/index/index');
  page.data.mode = 'plane';
  page.ensureSession();
  await waitForStart();
  startResolvers.shift()({ ok: true, session_id: 'session-plane-cycle-1' });
  await flush();
  page.onHide();
  await flush();
  page.ensureSession();
  await waitForStart();
  startResolvers.shift()({ ok: true, session_id: 'session-plane-cycle-2' });
  await flush();
  suite.equal(countAction('session.start'), 2, '重新可见建立新的会话周期');
  suite.equal(countAction('record.event', 'chapter_enter'), 2,
    '重新可见重新记录 chapter_enter');

  suite.section('3. index 内部模式切换');
  calls = [];
  page = createPage(indexDefinition, 'pages/index/index');
  page.data.mode = 'point';
  page.data.moduleIndex = 0;
  page.ensureSession();
  await waitForStart();
  startResolvers.shift()({ ok: true, session_id: 'session-switch' });
  await flush();
  page.handleModulePicker({ detail: { value: 1 } });
  await flush();
  suite.equal(countAction('session.start'), 1, '模式切换不重新启动学习会话');
  suite.equal(countAction('record.event', 'chapter_exit'), 1,
    '模式切换记录一次旧章节退出');
  suite.equal(countAction('record.event', 'chapter_enter'), 2,
    '初始进入与模式切换各记录一次章节进入');

  suite.section('4. 独立知识点页');
  const independentPages = [
    {
      path: 'pages/orthographic-projection/orthographic-projection.js',
      route: 'pages/orthographic-projection/orthographic-projection',
      moduleName: 'orthographic-projection',
      chapterId: 'orthographic-projection'
    },
    {
      path: 'pages/two-line-position/two-line-position.js',
      route: 'pages/two-line-position/two-line-position',
      moduleName: 'two-line-position',
      chapterId: 'two-line-position'
    },
    {
      path: 'pages/triangle-method/triangle-method.js',
      route: 'pages/triangle-method/triangle-method',
      moduleName: 'triangle-method',
      chapterId: 'triangle-method'
    },
    {
      path: 'pages/right-angle-projection/right-angle-projection.js',
      route: 'pages/right-angle-projection/right-angle-projection',
      moduleName: 'right-angle-projection',
      chapterId: 'right-angle-projection'
    },
    {
      path: 'pages/plane-representation/plane-representation.js',
      route: 'pages/plane-representation/plane-representation',
      moduleName: 'plane-representation',
      chapterId: 'plane-representation'
    },
    {
      path: 'pages/maximum-slope-line/maximum-slope-line.js',
      route: 'pages/maximum-slope-line/maximum-slope-line',
      moduleName: 'maximum-slope-line',
      chapterId: 'maximum-slope-line'
    },
    {
      path: 'pages/line-plane-relation/line-plane-relation.js',
      route: 'pages/line-plane-relation/line-plane-relation',
      moduleName: 'line-plane-relation',
      chapterId: 'line-plane-relation'
    },
    {
      path: 'pages/parallel-relations/parallel-relations.js',
      route: 'pages/parallel-relations/parallel-relations',
      moduleName: 'parallel-relations',
      chapterId: 'parallel-relations'
    },
    {
      path: 'pages/intersection-relations/intersection-relations.js',
      route: 'pages/intersection-relations/intersection-relations',
      moduleName: 'intersection-relations',
      chapterId: 'intersection-relations'
    },
    {
      path: 'pages/plane-plane-relation/plane-plane-relation.js',
      route: 'pages/plane-plane-relation/plane-plane-relation',
      moduleName: 'plane-plane-relation',
      chapterId: 'plane-plane-relation'
    }
  ];

  for (const item of independentPages) {
    const definition = loadDefinition(item.path);
    const normalPage = createPage(definition, item.route);
    await runNormalCycle(normalPage, 'startLearningSession',
      item.moduleName, item.chapterId);
  }

  suite.section('4.1 独立知识点页启动失败后可重试');
  {
    const definition = loadDefinition('pages/triangle-method/triangle-method.js');
    const retryPage = createPage(definition, 'pages/triangle-method/triangle-method');
    calls = [];
    retryPage.startLearningSession();
    await waitForStart();
    startResolvers.shift()({ ok: false, code: 'NETWORK' });
    await flush();
    retryPage.onHide();
    retryPage.onShow();
    await waitForStart();
    suite.equal(countAction('session.start'), 2, '独立知识点页启动失败后再次显示重试');
    startResolvers.shift()({ ok: true, session_id: 'triangle-retry' });
    await flush();
    suite.equal(countAction('record.event', 'chapter_enter'), 1,
      '独立知识点页重试成功后记录一次章节进入');
    retryPage.onHide();
    retryPage.onUnload();
  }

  suite.section('5. 独立知识点页启动在途');
  for (const item of independentPages) {
    const definition = loadDefinition(item.path);
    const hiddenPage = createPage(definition, item.route);
    await runStartInFlightHide(hiddenPage, 'startLearningSession', item.moduleName);
  }

  suite.section('6. 投影体系复用会话状态机');
  const projectionDefinition = loadDefinition('pages/projection/projection.js');
  const projectionPage = createPage(projectionDefinition, 'pages/projection/projection');
  await runNormalCycle(
    projectionPage,
    'ensureSession',
    'system',
    'system'
  );

  Object.assign(api, originalApi);
  process.exitCode = suite.finish();
}

main().catch((error) => {
  Object.assign(api, originalApi);
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
