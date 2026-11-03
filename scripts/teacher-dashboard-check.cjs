#!/usr/bin/env node
// 教师网页驾驶舱失败态行为检查。
//
// 直接执行真实的 teacher-web/js/app.js，用最小 DOM 桩触发 dashboard 路由：
//   1. 接口失败时不得渲染 0 值统计，必须显示错误和重试入口；
//   2. 点击重试后成功响应应替换为正常数据；
//   3. partial=true 时 AI 指标显示 “—”，并保留其他已成功统计。
//
// 这是开发者只读检查，不替代真实浏览器、网关和教师账号验收。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP_JS = path.join(ROOT, 'teacher-web', 'js', 'app.js');

function createClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function createElement(id) {
  const listeners = {};
  return {
    id: id || '',
    textContent: '',
    disabled: false,
    checked: false,
    value: '',
    href: '',
    className: '',
    dataset: {},
    classList: createClassList(),
    children: [],
    _html: '',
    addEventListener(name, handler) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(handler);
    },
    async fire(name, event) {
      for (const handler of listeners[name] || []) await handler(event || {});
    },
    appendChild(child) { this.children.push(child); },
    insertAdjacentHTML() {},
    querySelector(selector) {
      if (selector === '#dashboardRetry' && this._html.includes('id="dashboardRetry"')) {
        if (!this._retry) this._retry = createElement('dashboardRetry');
        return this._retry;
      }
      return null;
    },
    querySelectorAll() { return []; },
    get innerHTML() { return this._html; },
    set innerHTML(value) {
      this._html = String(value);
      this._retry = null;
    }
  };
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 15));
}

async function runScenario(responses) {
  const ids = [
    'loginView', 'appView', 'nav', 'teacherName', 'teacherRole', 'avatarLetter',
    'loginBtn', 'loginPassword', 'logoutBtn', 'gatewayLink', 'pageTitle', 'pageSub', 'content'
  ];
  const elements = {};
  ids.forEach((id) => { elements[id] = createElement(id); });
  let domReady;
  let dashboardIndex = 0;
  const context = {
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return createElement(); },
      addEventListener(name, handler) { if (name === 'DOMContentLoaded') domReady = handler; }
    },
    location: { hash: '#/dashboard' },
    localStorage: {
      getItem(key) { return key === 'hfjh_teacher_token' ? 'tok-test' : null; },
      setItem() {},
      removeItem() {}
    },
    TeacherApi: {
      async me() {
        return {
          ok: true,
          teacher: { id: 'T1', username: 't1', name: '测试教师', role: 'teacher' }
        };
      },
      async dashboard() {
        const value = responses[Math.min(dashboardIndex, responses.length - 1)];
        dashboardIndex += 1;
        if (value instanceof Error) throw value;
        return value;
      },
      async logout() { return { ok: true }; }
    }
  };
  context.window = context;
  context.window.addEventListener = () => {};

  vm.runInNewContext(fs.readFileSync(APP_JS, 'utf8'), context, { filename: APP_JS });
  if (!domReady) throw new Error('app.js 未注册 DOMContentLoaded');
  await domReady();
  await flushAsync();
  return { content: elements.content };
}

function check(name, pass, detail) {
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
  return pass ? 0 : 1;
}

(async () => {
  let failures = 0;

  const failureThenSuccess = await runScenario([
    { ok: false, code: 'SERVER_ERROR', msg: '统计读取失败', retryable: true },
    { ok: true, partial: false, warnings: [], total_students: 0, today_active_students: 0,
      plp_today: 0, ai_today: 0, roster_total: 0, registered_count: 0, unregistered_count: 0,
      ai_week: 0, lines: { total: 0, student: 0, guest: 0, test: 0 }, excluded: {},
      alerts: [], classes: [], trend: [], ai_hot: [] }
  ]);
  const failedHtml = failureThenSuccess.content.innerHTML;
  failures += check('驾驶舱接口失败不渲染 0 值卡片', failedHtml.includes('统计加载失败') && !failedHtml.includes('学生总数'),
    failedHtml);
  failures += check('驾驶舱接口失败提供重试入口', failedHtml.includes('id="dashboardRetry"'), failedHtml);
  const retry = failureThenSuccess.content.querySelector('#dashboardRetry');
  if (retry) {
    await retry.fire('click');
    await flushAsync();
  }
  const recoveredHtml = failureThenSuccess.content.innerHTML;
  failures += check('重试成功后恢复合法空态',
    recoveredHtml.includes('学生总数') && recoveredHtml.includes('暂无班级数据')
      && !recoveredHtml.includes('统计加载失败'), recoveredHtml);

  const partial = await runScenario([{
    ok: true, partial: true,
    warnings: [{ code: 'AI_STATS_UNAVAILABLE', msg: 'AI 提问统计加载失败，可重试', retryable: true }],
    total_students: 12, today_active_students: 3, plp_today: 4, ai_today: null,
    roster_total: 10, registered_count: 8, unregistered_count: 2, ai_week: null,
    lines: { total: 12, student: 10, guest: 1, test: 1 }, excluded: {},
    alerts: [], classes: [], trend: [], ai_hot: []
  }]);
  const partialHtml = partial.content.innerHTML;
  failures += check('部分统计失败显示 warning 和重试入口',
    partialHtml.includes('部分统计不可用') && partialHtml.includes('AI 提问统计加载失败')
      && partialHtml.includes('id="dashboardRetry"'), partialHtml);
  failures += check('部分统计失败时 AI 指标显示破折号而不是 0',
    partialHtml.includes('>—</div><div class="stat-label">AI提问今日') ||
      partialHtml.includes('>—</div><div class="stat-label">近7天AI提问'), partialHtml);

  console.log('---');
  console.log('总计=5 通过=' + (5 - failures) + ' 失败=' + failures);
  process.exitCode = failures ? 1 : 0;
})().catch((error) => {
  console.log('HARNESS_ERROR ' + (error && error.stack ? error.stack : error));
  process.exitCode = 2;
});
