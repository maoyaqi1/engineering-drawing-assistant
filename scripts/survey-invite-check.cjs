#!/usr/bin/env node
// 问卷邀请状态检查：事件版本、single-flight、失败重试、持久化恢复、
// 进程重启、存储异常、取消/确认和提交清理。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const surveyModulePath = require.resolve('../utils/survey-invite.js');
const suite = createSuite('survey-invite-check');
const api = require('../utils/api.js');
const tracker = require('../utils/session-end-tracker.js');

let surveyInvite = require('../utils/survey-invite.js');
let activePage = null;
let statisticsMode = 'empty';
let statisticsCalls = 0;
let modals = [];
let navigations = [];
let modalEnabled = true;
let storageValues = Object.create(null);
let failRead = false;
let failWriteStatus = '';
let failRemove = false;
let removeCalls = 0;
let sessionSequence = 0;

global.getCurrentPages = () => (activePage ? [activePage] : []);
global.getApp = () => ({ globalData: { user: { openid: 'survey-test-user' } } });
global.wx = {
  cloud: {
    callFunction({ data }) {
      if (data.action === 'session.end') {
        return Promise.resolve({
          result: { ok: true, is_valid: true, already_ended: false }
        });
      }
      if (data.action === 'statistics') {
        statisticsCalls += 1;
        if (statisticsMode === 'fail') {
          return Promise.resolve({ result: { ok: false, code: 'NETWORK' } });
        }
        if (statisticsMode === 'invite') {
          return Promise.resolve({
            result: {
              ok: true,
              can_invite: true,
              survey_completed: false,
              valid_session_count: 5
            }
          });
        }
        if (statisticsMode === 'invite-no-count') {
          return Promise.resolve({
            result: {
              ok: true,
              can_invite: true,
              survey_completed: false
            }
          });
        }
        if (statisticsMode === 'completed') {
          return Promise.resolve({
            result: {
              ok: true,
              can_invite: true,
              survey_completed: true,
              valid_session_count: 5
            }
          });
        }
        return Promise.resolve({
          result: {
            ok: true,
            can_invite: false,
            survey_completed: false,
            valid_session_count: 4
          }
        });
      }
      return Promise.resolve({ result: { ok: true } });
    }
  },
  getStorageSync(key) {
    if (failRead) throw new Error('storage read failed');
    return storageValues[key] || '';
  },
  setStorageSync(key, value) {
    if (failWriteStatus && value && value.status === failWriteStatus) {
      throw new Error('storage write failed');
    }
    storageValues[key] = JSON.stringify(value);
  },
  removeStorageSync(key) {
    removeCalls += 1;
    if (failRemove) throw new Error('storage remove failed');
    delete storageValues[key];
  },
  showModal(options) {
    if (!modalEnabled) throw new Error('modal unavailable');
    modals.push(options);
  },
  navigateTo(options) {
    navigations.push(options.url);
  },
  showToast() {}
};

function page() {
  return { _surveyPrompted: false };
}

function storedInvite() {
  const raw = storageValues[surveyInvite.STORAGE_KEY];
  return raw ? JSON.parse(raw) : null;
}

function seedStoredInvite(overrides) {
  storageValues[surveyInvite.STORAGE_KEY] = JSON.stringify(Object.assign({
    version: 1,
    status: 'pending',
    surveyId: 'geometry_learning_2026',
    surveyVersion: 'v1',
    inviteKey: 'seed-invite',
    createdAt: Date.now()
  }, overrides || {}));
}

function clearStorage() {
  storageValues = Object.create(null);
}

function reset(nextMode, options) {
  surveyInvite.resetForTests();
  statisticsMode = nextMode || 'empty';
  statisticsCalls = 0;
  modals = [];
  navigations = [];
  modalEnabled = !(options && options.disableModal);
  failRead = false;
  failWriteStatus = '';
  failRemove = false;
  removeCalls = 0;
  if (!options || options.clearStorage !== false) clearStorage();
  activePage = page();
}

function restartSurveyRuntime() {
  surveyInvite.resetForTests();
  delete require.cache[surveyModulePath];
  surveyInvite = require('../utils/survey-invite.js');
  activePage = page();
  modals = [];
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function triggerInvite() {
  activePage = page();
  surveyInvite.onEligiblePageShown(activePage);
  sessionSequence += 1;
  await api.endSession('session-' + sessionSequence, 90, 5);
  await flush();
}

async function main() {
  suite.section('1. 无新会话时零统计请求');
  reset('empty');
  let homeDefinition = null;
  global.Page = (definition) => { homeDefinition = definition; };
  delete require.cache[require.resolve('../pages/home/home.js')];
  require('../pages/home/home.js');
  const homePage = Object.assign({}, homeDefinition, {
    _accessReady: true,
    data: JSON.parse(JSON.stringify(homeDefinition.data)),
    setData(patch) { Object.assign(this.data, patch); }
  });
  activePage = homePage;
  for (let index = 0; index < 10; index += 1) {
    homePage.onShow();
  }
  await flush();
  suite.equal(statisticsCalls, 0, '连续 10 次 onShow 且无新会话时不调用 statistics');
  suite.equal(modals.length, 0, '无新会话且无 pending 时不显示邀请');

  suite.section('2. 有效会话事件、single-flight 与幂等');
  reset('empty');
  surveyInvite.onEligiblePageShown(activePage);
  await api.endSession('session-a', 90, 5);
  await flush();
  suite.equal(statisticsCalls, 1, '新有效会话结束后只检查一次邀请');
  suite.equal(tracker.getRevision(), 1, '有效会话结束产生一个事件版本');
  await api.endSession('session-a', 90, 5);
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(statisticsCalls, 1, '同一 session_id 重试不重复检查');
  const beforeInvalid = tracker.getRevision();
  tracker.recordSessionEnd('session-invalid-direct', { ok: true, is_valid: false });
  suite.equal(tracker.getRevision(), beforeInvalid, '无效会话结束不产生事件版本');

  suite.section('3. 统计失败重试与无邀请消费');
  reset('fail');
  surveyInvite.onEligiblePageShown(activePage);
  await api.endSession('session-fail', 90, 5);
  await flush();
  suite.equal(statisticsCalls, 1, '统计失败时尝试一次');
  suite.check(tracker.getCheckedRevision() < tracker.getRevision(),
    '统计失败不消费事件版本');
  statisticsMode = 'empty';
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(statisticsCalls, 2, '下次可见时重试统计');
  const checkedAfterSuccess = tracker.getCheckedRevision();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(statisticsCalls, 2, '成功但无邀请后不再重复请求');
  suite.equal(tracker.getCheckedRevision(), checkedAfterSuccess, '无邀请结果正常消费版本');

  suite.section('4. can_invite=true 的持久化和取消清理');
  reset('invite');
  await triggerInvite();
  suite.equal(statisticsCalls, 1, '服务端确认邀请后立即进入显示流程');
  suite.equal(modals.length, 1, '服务端确认邀请后正常显示一次');
  let stored = storedInvite();
  suite.check(!!stored && stored.status === 'pending', '弹窗展示期间本地保持 pending');
  suite.check(!!stored && stored.surveyId === 'geometry_learning_2026'
    && stored.surveyVersion === 'v1' && !!stored.inviteKey
    && Number.isFinite(stored.createdAt), 'pending 记录字段完整');
  suite.equal(stored && stored.validSessionCount, undefined,
    'pending 记录不保存有效会话数');
  modals[0].success({ confirm: false, cancel: true });
  modals[0].complete();
  suite.equal(storedInvite(), null, '用户取消后删除已消费邀请');
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 1, '用户取消后同一进程不重复弹出');

  suite.section('4.1 客户端资格判断只依赖服务端 can_invite');
  reset('invite-no-count');
  await triggerInvite();
  suite.equal(modals.length, 1, '缺少 valid_session_count 时仍按 can_invite 创建 pending');
  suite.check(!!storedInvite() && storedInvite().status === 'pending',
    '无会话数字段时 pending 持久化成功');

  reset('empty');
  await triggerInvite();
  suite.equal(modals.length, 0, 'can_invite=false 时不展示邀请');
  suite.equal(storedInvite(), null, 'can_invite=false 时不创建 pending');

  suite.section('5. 弹窗前进程结束与恢复');
  reset('invite', { disableModal: true });
  await triggerInvite();
  suite.equal(modals.length, 0, '模拟弹窗不可用时未实际展示');
  stored = storedInvite();
  suite.check(!!stored && stored.status === 'pending', '弹窗前邀请已持久化为 pending');
  const callsBeforeRestart = statisticsCalls;
  restartSurveyRuntime();
  modalEnabled = true;
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(statisticsCalls, callsBeforeRestart, '恢复 pending 时不重复调用 statistics');
  suite.equal(modals.length, 1, '进程重启后恢复并显示 pending 邀请');

  suite.section('6. 弹窗期间进程结束允许再次展示');
  reset('invite');
  await triggerInvite();
  suite.equal(modals.length, 1, '首次展示弹窗');
  stored = storedInvite();
  suite.check(!!stored && stored.status === 'pending', '弹窗未处理时本地仍为 pending');
  const callsDuringModal = statisticsCalls;
  restartSurveyRuntime();
  modalEnabled = true;
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 1, '弹窗展示期间进程结束后允许再次展示');
  suite.equal(statisticsCalls, callsDuringModal, '再次展示不重复调用 statistics');

  suite.section('7. pending 读取失败会暂缓检查');
  reset('empty');
  surveyInvite.onEligiblePageHidden(activePage);
  await api.endSession('session-read-failure', 90, 5);
  await flush();
  failRead = true;
  activePage = page();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(statisticsCalls, 0, '读取失败时不发起新统计');
  suite.check(tracker.getCheckedRevision() < tracker.getRevision(),
    '读取失败不消费会话结束事件版本');
  failRead = false;
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(statisticsCalls, 1, '后续页面可见时可重试并恢复事件检查');

  suite.section('8. pending 写入失败降级');
  reset('invite');
  failWriteStatus = 'pending';
  await triggerInvite();
  suite.equal(modals.length, 1, 'pending 写入失败时当前已确认邀请仍可展示一次');
  suite.equal(storedInvite(), null, 'pending 写入失败不产生伪造持久状态');
  modals[0].success({ confirm: false, cancel: true });
  modals[0].complete();
  const callsAfterWriteFailure = statisticsCalls;
  restartSurveyRuntime();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 0, 'pending 写入失败后重启不生成错误邀请');
  suite.equal(statisticsCalls, callsAfterWriteFailure, '重启不补猜统计资格');

  suite.section('9. consumed 写入失败与当前进程防重');
  reset('invite');
  await triggerInvite();
  stored = storedInvite();
  failWriteStatus = 'consumed';
  removeCalls = 0;
  modals[0].success({ confirm: false, cancel: true });
  modals[0].complete();
  suite.check(!!storedInvite() && storedInvite().status === 'pending',
    'consumed 写入失败时不删除、不覆盖原 pending');
  suite.equal(removeCalls, 0, 'consumed 写入失败时不执行删除');
  activePage = page();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 1, '同一进程依靠内存消费记录防止重复展示');
  const callsBeforeConsumedRetry = statisticsCalls;
  failWriteStatus = '';
  restartSurveyRuntime();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 1, 'consumed 未持久化时重启后允许恢复同一邀请');
  suite.equal(statisticsCalls, callsBeforeConsumedRetry, '重启恢复不重复调用 statistics');

  suite.section('10. consumed 删除失败');
  reset('invite');
  await triggerInvite();
  failRemove = true;
  modals[0].success({ confirm: false, cancel: true });
  modals[0].complete();
  suite.check(!!storedInvite() && storedInvite().status === 'consumed',
    '删除失败时保留 consumed');
  const callsBeforeRemoveRetry = statisticsCalls;
  failRemove = false;
  restartSurveyRuntime();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 0, 'consumed 删除失败后重启不再展示');
  suite.equal(statisticsCalls, callsBeforeRemoveRetry, 'consumed 恢复不调用统计');

  suite.section('11. 损坏数据和版本不匹配');
  reset('empty');
  storageValues[surveyInvite.STORAGE_KEY] = '{bad json';
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 0, '损坏 JSON 不展示');
  suite.equal(statisticsCalls, 0, '损坏数据不自行生成邀请');
  reset('empty');
  seedStoredInvite({ surveyVersion: 'old-version' });
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 0, '问卷版本不匹配不展示');
  suite.equal(statisticsCalls, 0, '问卷版本不匹配不调用统计');

  suite.section('12. 已存在的 pending 不被覆盖');
  reset('empty');
  seedStoredInvite({ inviteKey: 'older-pending' });
  const earlierInvite = storedInvite();
  surveyInvite.onEligiblePageShown(activePage);
  await flush();
  suite.equal(modals.length, 1, '启动时恢复已有 pending');
  suite.equal(storedInvite().inviteKey, earlierInvite.inviteKey,
    '页面初始化不覆盖较早 pending');
  suite.equal(statisticsCalls, 0, '恢复已有 pending 不调用统计');

  suite.section('13. 确认、提交与完成清理');
  reset('invite');
  await triggerInvite();
  modals[0].success({ confirm: true, cancel: false });
  modals[0].complete();
  stored = storedInvite();
  suite.check(!!stored && stored.status === 'consumed',
    '确认后保留 consumed 等待提交');
  suite.equal(navigations[0],
    '/pages/survey/survey?invite_key=' + encodeURIComponent(stored.inviteKey),
    '确认后携带对应 inviteKey 进入问卷页');
  suite.equal(surveyInvite.clearAfterSubmit('different-invite'), false,
    'inviteKey 不匹配时清理函数拒绝处理');
  suite.equal(storedInvite().inviteKey, stored.inviteKey,
    'inviteKey 不匹配时不修改其他邀请');
  suite.equal(surveyInvite.clearAfterSubmit(''), false,
    'expectedInviteKey 为空时拒绝清理');
  suite.equal(storedInvite().inviteKey, stored.inviteKey,
    'expectedInviteKey 为空时保留本地邀请');

  let surveyDefinition = null;
  global.Page = (definition) => { surveyDefinition = definition; };
  const originalSubmitSurvey = api.submitSurvey;
  api.submitSurvey = () => Promise.resolve({ ok: true, survey_completed: true });
  try {
    delete require.cache[require.resolve('../pages/survey/survey.js')];
    require('../pages/survey/survey.js');
    const directSurveyPage = Object.assign({}, surveyDefinition, {
      data: Object.assign({}, surveyDefinition.data, {
        q1: 1,
        q2: 1,
        q3: 1,
        q4: 0,
        q5: '',
        q6: '',
        q7: []
      }),
      setData(patch) { Object.assign(this.data, patch); }
    });
    directSurveyPage.onLoad({});
    suite.equal(directSurveyPage._expectedInviteKey, '',
      '其他入口打开问卷页时 inviteKey 为空');
    directSurveyPage.submit();
    await flush();
    suite.equal(storedInvite().inviteKey, stored.inviteKey,
      '无 inviteKey 的问卷提交不清理本地邀请');

    const surveyPage = Object.assign({}, surveyDefinition, {
      data: Object.assign({}, surveyDefinition.data, {
        q1: 1,
        q2: 1,
        q3: 1,
        q4: 0,
        q5: '',
        q6: '',
        q7: []
      }),
      setData(patch) { Object.assign(this.data, patch); }
    });
    surveyPage.onLoad({ invite_key: encodeURIComponent(stored.inviteKey) });
    suite.equal(surveyPage._expectedInviteKey, stored.inviteKey,
      '问卷页保存从邀请入口传入的 inviteKey');
    surveyPage.submit();
    await flush();
    suite.equal(storedInvite(), null, 'inviteKey 匹配时问卷提交后清理本地邀请状态');
  } finally {
    api.submitSurvey = originalSubmitSurvey;
  }

  reset('completed');
  await triggerInvite();
  suite.equal(modals.length, 0, '已完成问卷不再邀请');
  suite.equal(tracker.getCheckedRevision(), tracker.getRevision(), '已完成结果消费事件版本');

  suite.section('14. 共用逻辑与首页边界');
  const indexSession = fs.readFileSync(path.join(ROOT, 'pages/index/session.js'), 'utf8');
  const homeSource = fs.readFileSync(path.join(ROOT, 'pages/home/home.js'), 'utf8');
  suite.check(indexSession.includes("require('../../utils/survey-invite.js')"),
    '旧 index 使用共享问卷模块');
  suite.check(homeSource.includes("require('../../utils/survey-invite.js')"),
    '课程首页使用同一问卷模块');
  suite.check(!indexSession.includes('statistics(true)'),
    '旧 index 不再直接调用 statistics(true)');
  suite.check(!homeSource.includes('statistics('),
    '首页不直接调用统计接口');
  suite.check(!homeSource.includes('startSession(')
    && !homeSource.includes('recordEvent('),
  '首页不创建学习会话或学习记录');

  process.exitCode = suite.finish();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
