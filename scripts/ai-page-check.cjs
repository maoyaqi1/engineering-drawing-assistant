#!/usr/bin/env node
// AI 教师页面结构检查（开发者只读工具）。
//
// 目标：确认 ai.js 只做页面装配，四个职责模块仍向同一个 Page 对象提供方法，
// 且 ai.wxml 的全部事件绑定都能在运行期解析。脚本不调用云函数，不替代真机回归。
const fs = require('fs');
const path = require('path');

global.wx = {
  cloud: {
    callFunction: async () => ({ result: { ok: true } })
  },
  getPrivacySetting: () => {},
  setNavigationBarTitle: () => {}
};
global.getApp = () => ({ globalData: { user: { _id: 'check-user' } } });

let page = null;
global.Page = (definition) => {
  page = definition;
};

const aiRoot = path.join(__dirname, '..', 'pages', 'ai');
require(path.join(aiRoot, 'ai.js'));

const moduleMethods = {
  'ai-access.js': ['refreshAccess', 'applyAccess', 'accessNotice', 'handleNoticeTap'],
  'ai-input.js': ['onInput', 'onSuggestion', 'pickImage', 'reportPickFailure', 'clearImage'],
  'ai-privacy.js': ['onNeedPrivacy', 'openPrivacyContract', 'handleAgreePrivacyAuthorization', 'handleRefusePrivacy'],
  'ai-conversation.js': ['send', 'newConversation']
};

const failures = [];
if (!page) {
  failures.push('Page() 未注册页面对象');
} else {
  Object.entries(moduleMethods).forEach(([file, methods]) => {
    const definition = require(path.join(aiRoot, file));
    methods.forEach((name) => {
      if (typeof definition[name] !== 'function') failures.push(file + ' 缺少方法 ' + name);
      if (typeof page[name] !== 'function') failures.push('Page 对象缺少方法 ' + name);
    });
  });

  const wxml = fs.readFileSync(path.join(aiRoot, 'ai.wxml'), 'utf8');
  const handlers = Array.from(new Set(
    [...wxml.matchAll(/\b(?:bind|catch)[a-z]*\s*=\s*"([A-Za-z_$][\w$]*)"/g)].map((match) => match[1])
  ));
  const missingHandlers = handlers.filter((name) => typeof page[name] !== 'function');
  if (missingHandlers.length) failures.push('WXML 事件未接线：' + missingHandlers.join(', '));

  const expectedDenyReasons = {
    NO_PROFILE: 'no_profile',
    NOT_IN_ROSTER: 'not_in_roster',
    CLASS_ARCHIVED: 'class_archived',
    NO_CLASS: 'no_class',
    ACCESS_CHECK_FAILED: 'check_failed'
  };
  Object.entries(expectedDenyReasons).forEach(([code, reason]) => {
    if (!page.AI_DENY_REASONS || page.AI_DENY_REASONS[code] !== reason) {
      failures.push('AI_DENY_REASONS 映射错误：' + code);
    }
  });

  console.log('AI 页面模块：' + Object.keys(moduleMethods).length + ' 个');
  console.log('WXML 事件：' + handlers.length + ' 个');
  console.log('页面 data：' + Object.keys(page.data || {}).length + ' 个字段');
}

if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exitCode = 1;
} else {
  console.log('AI 教师页面结构检查：通过');
}
