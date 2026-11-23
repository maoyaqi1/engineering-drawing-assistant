#!/usr/bin/env node
// 小程序版本显示与主动更新提醒检查。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('update-reminder-check');
const read = (relativePath) => fs
  .readFileSync(path.join(ROOT, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');
const update = require('../utils/app-update.js');

function createUpdateHarness() {
  const calls = [];
  const handlers = {};
  const manager = {
    onCheckForUpdate(callback) { handlers.check = callback; },
    onUpdateReady(callback) { handlers.ready = callback; },
    onUpdateFailed(callback) { handlers.failed = callback; },
    applyUpdate() { calls.push('applyUpdate'); }
  };
  global.wx = {
    getUpdateManager() { return manager; },
    showModal(options) {
      calls.push({ type: 'modal', title: options.title, content: options.content });
      if (typeof options.success === 'function') {
        options.success({ confirm: false, cancel: true });
      }
    }
  };
  return { manager, calls, handlers };
}

suite.section('1. 更新管理器接线');
const appSource = read('app.js');
suite.check(appSource.includes("require('./utils/app-update.js')"),
  'app.js 加载更新模块');
suite.check(appSource.includes('setupMiniProgramUpdate()'),
  'app.js 启动时执行版本更新检查');

suite.section('2. 新版本下载完成提醒');
{
  const harness = createUpdateHarness();
  const manager = update.setupMiniProgramUpdate();
  suite.equal(manager, harness.manager, '返回微信更新管理器');
  suite.check(typeof harness.handlers.check === 'function'
    && typeof harness.handlers.ready === 'function'
    && typeof harness.handlers.failed === 'function',
  '注册检查、就绪和失败三类回调');
  harness.handlers.ready();
  suite.check(harness.calls.some((call) => call.type === 'modal'
    && call.title === '发现新版本'),
  '新版本下载完成后主动弹窗');
  suite.equal(harness.calls.filter((call) => call === 'applyUpdate').length, 0,
    '用户选择稍后时不立即重启');
}

suite.section('3. 用户确认更新');
{
  const calls = [];
  const manager = {
    onCheckForUpdate() {},
    onUpdateReady(callback) { this.ready = callback; },
    onUpdateFailed() {},
    applyUpdate() { calls.push('applyUpdate'); }
  };
  global.wx = {
    getUpdateManager() { return manager; },
    showModal(options) {
      if (typeof options.success === 'function') options.success({ confirm: true });
    }
  };
  update.setupMiniProgramUpdate();
  manager.ready();
  suite.equal(calls.join(','), 'applyUpdate', '确认后调用 applyUpdate 重启更新');
}

suite.section('4. 新版本下载失败');
{
  const harness = createUpdateHarness();
  update.setupMiniProgramUpdate();
  harness.handlers.failed();
  const modal = harness.calls.find((call) => call.type === 'modal'
    && call.title === '更新下载失败');
  suite.check(!!modal && modal.content.includes('关闭小程序后重新打开'),
    '下载失败时提示重新打开');
}

suite.section('5. 当前安装包版本');
global.wx = {
  getAccountInfoSync() {
    return { miniProgram: { version: '1.9.0', envVersion: 'release' } };
  }
};
suite.equal(update.resolveRuntimeVersion('v1.8.0'), 'v1.9.0',
  '正式版读取当前安装包版本');
global.wx = {
  getAccountInfoSync() {
    return { miniProgram: { version: '1.9.0', envVersion: 'trial' } };
  }
};
suite.equal(update.resolveRuntimeVersion('v1.8.0'), 'v1.9.0（体验版）',
  '体验版显示环境标识');
global.wx = {
  getAccountInfoSync() {
    return { miniProgram: { version: '1.9.0', envVersion: 'develop' } };
  }
};
suite.equal(update.resolveRuntimeVersion('v1.8.0'), 'v1.9.0（开发版）',
  '开发版显示环境标识');
global.wx = {
  getAccountInfoSync() {
    return { miniProgram: { version: '', envVersion: 'develop' } };
  }
};
suite.equal(update.resolveRuntimeVersion('v1.8.0'), 'v1.8.0',
  '缺少安装包版本时使用集中配置回退');

suite.section('6. 关于页实时版本接线');
const aboutSource = read('pages/about/about.js');
const aboutWxml = read('pages/about/about.wxml');
suite.check(aboutSource.includes('resolveRuntimeVersion(productInfo.version)'),
  '关于页读取当前安装包版本');
suite.check(aboutWxml.includes('{{displayVersion}}')
  && aboutWxml.includes('版本和功能随小程序更新同步刷新'),
'关于页显示实时版本和更新说明');

process.exitCode = suite.finish();
