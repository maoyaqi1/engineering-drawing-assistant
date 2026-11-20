#!/usr/bin/env node
// pages/index 五模式深链检查：参数白名单、moduleIndex、导航标题、
// 会话模块和章节事件必须与入口参数一致。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('index-mode-route-check');
const indexFile = path.join(ROOT, 'pages', 'index', 'index.js');

const modes = [
  { mode: 'point', moduleIndex: 0, title: '点的三面投影', chapterName: '点的投影' },
  { mode: 'line', moduleIndex: 1, title: '直线的三面投影', chapterName: '直线的投影' },
  { mode: 'plane', moduleIndex: 2, title: '平面的三面投影', chapterName: '平面的投影' },
  { mode: 'solid', moduleIndex: 3, title: '基本立体', chapterName: '基本立体' },
  { mode: 'section', moduleIndex: 4, title: '平面切割立体', chapterName: '平面切割立体' }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePage(definition, eventLog) {
  return Object.assign({}, definition, {
    data: clone(definition.data),
    setData(patch, callback) {
      Object.keys(patch).forEach((key) => {
        this.data[key] = patch[key];
      });
      if (typeof callback === 'function') callback();
    },
    initializeCanvas() {},
    drawScene() {}
  });
}

function createWxStub(eventLog) {
  return {
    setNavigationBarTitle({ title }) {
      eventLog.titles.push(title);
    },
    redirectTo({ url }) {
      eventLog.redirects.push(url);
    },
    showModal() {},
    showToast() {},
    navigateTo() {},
    cloud: {
      callFunction({ data }) {
        eventLog.calls.push(data);
        if (data.action === 'session.start') {
          return Promise.resolve({
            result: { ok: true, session_id: 'session-' + data.module }
          });
        }
        if (data.action === 'session.end') {
          return Promise.resolve({
            result: { ok: true, is_valid: true, already_ended: false }
          });
        }
        if (data.action === 'roster.status') {
          return Promise.resolve({ result: { ok: true, level: 'guest' } });
        }
        if (data.action === 'statistics') {
          return Promise.resolve({
            result: {
              ok: true,
              can_invite: false,
              survey_completed: false,
              valid_session_count: 0
            }
          });
        }
        return Promise.resolve({ result: { ok: true } });
      }
    }
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function loadPageDefinition() {
  let definition = null;
  global.Page = (page) => { definition = page; };
  delete require.cache[require.resolve(indexFile)];
  require(indexFile);
  return definition;
}

async function main() {
suite.section('1. 兼容接口');
const initialEvents = { titles: [], redirects: [], calls: [] };
global.wx = createWxStub(initialEvents);
global.getApp = () => ({
  globalData: { user: { openid: 'route-test', student_id: '20260001' } }
});
const pageDefinition = loadPageDefinition();
suite.check(!!pageDefinition, 'index Page 对象可加载');
suite.equal(typeof pageDefinition.handleModulePicker, 'function',
  '保留 handleModulePicker Web 兼容接口');
suite.equal(typeof pageDefinition.onShow, 'function', '保留原有生命周期');
suite.equal(JSON.stringify(pageDefinition.data.moduleOptions),
  JSON.stringify(['点', '直线', '平面', '基本立体', '平面切割立体']),
  '保留 moduleOptions 及顺序');

suite.section('2. 五种合法模式');
for (const item of modes) {
  const events = { titles: [], redirects: [], calls: [] };
  global.wx = createWxStub(events);
  const page = makePage(pageDefinition, events);
  page.onLoad({ mode: item.mode });
  suite.equal(page.data.mode, item.mode, item.mode + ' 模式写入页面');
  suite.equal(page.data.moduleIndex, item.moduleIndex, item.mode + ' 对应正确 moduleIndex');
  suite.equal(events.titles[events.titles.length - 1], item.title, item.mode + ' 使用正确导航标题');
  page.onShow();
  await flushPromises();
  const start = events.calls.find((call) => call.action === 'session.start');
  suite.check(!!start && start.module === item.mode, item.mode + ' 的 session.module 正确');
  const enter = events.calls.find((call) => call.action === 'record.event'
    && call.event_type === 'chapter_enter');
  suite.check(!!enter && enter.chapter_id === item.mode
    && enter.chapter_name === item.chapterName, item.mode + ' 的章节进入事件正确');
  page.onHide();
  await flushPromises();
  const exit = events.calls.find((call) => call.action === 'record.event'
    && call.event_type === 'chapter_exit');
  suite.check(!!exit && exit.chapter_id === item.mode
    && exit.chapter_name === item.chapterName, item.mode + ' 的章节退出事件正确');
  const end = events.calls.find((call) => call.action === 'session.end');
  suite.check(!!end && end.session_id === 'session-' + item.mode,
    item.mode + ' 的会话结束请求使用对应会话 ID');
}

suite.section('3. 兼容与非法参数回退');
const fallbackCases = [
  { name: '无参数', options: undefined },
  { name: '空对象', options: {} },
  { name: '空参数', options: { mode: '' } },
  { name: '非法参数', options: { mode: 'unknown' } },
  { name: '大写参数', options: { mode: 'LINE' } },
  { name: '带空格参数', options: { mode: 'plane ' } },
  { name: '数字参数', options: { mode: 2 } }
];
fallbackCases.forEach((item) => {
  const events = { titles: [], redirects: [], calls: [] };
  global.wx = createWxStub(events);
  const page = makePage(pageDefinition, events);
  page.onLoad(item.options);
  suite.equal(page.data.mode, 'point', item.name + '回退点模式');
  suite.equal(page.data.moduleIndex, 0, item.name + '回退 moduleIndex=0');
  suite.equal(events.titles[events.titles.length - 1], '点的三面投影',
    item.name + '使用点模式标题');
});

suite.section('4. 模式之外的数据保持原值');
const events = { titles: [], redirects: [], calls: [] };
global.wx = createWxStub(events);
const sectionPage = makePage(pageDefinition, events);
const originalSection = clone(sectionPage.data.section);
const originalSolid = clone(sectionPage.data.solid);
sectionPage.onLoad({ mode: 'section' });
suite.equal(JSON.stringify(sectionPage.data.section), JSON.stringify(originalSection),
  'section 深链不修改现有截平面默认参数');
suite.equal(JSON.stringify(sectionPage.data.solid), JSON.stringify(originalSolid),
  'section 深链不修改基本立体默认状态');
const solidPage = makePage(pageDefinition, events);
solidPage.onLoad({ mode: 'solid', solidType: 'sphere' });
suite.equal(solidPage.data.solid.type, 'prism',
  '不接受 solidType 路由参数，基本立体仍使用页面内部默认类型');

suite.section('5. 旧分享路径不变');
const indexSource = fs.readFileSync(indexFile, 'utf8');
suite.check(indexSource.includes("path: '/pages/index/index'"),
  'index 旧分享路径保持不变');
suite.check(!indexSource.includes('options.solidType'),
  '未新增 solidType 参数解析');

process.exitCode = suite.finish();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
