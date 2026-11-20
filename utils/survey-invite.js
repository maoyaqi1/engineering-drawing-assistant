// 问卷邀请协调器。
//
// 只有 session-end-tracker 中出现尚未检查的新有效会话结束版本时，才调用
// statistics(true)。首页和旧 pages/index 共用本模块。服务端确认邀请后，
// 客户端使用同步本地存储保存待显示状态，避免进程结束后丢失邀请。
const api = require('./api.js');
const sessionEndTracker = require('./session-end-tracker.js');

const STORAGE_KEY = 'hfjh_survey_invite_v1';
const STORAGE_VERSION = 1;

let activePage = null;
let inFlight = null;
let pendingInvite = null;
let promptVisible = false;
const consumedInviteKeys = new Set();

function getTopPage() {
  if (typeof getCurrentPages !== 'function') return null;
  const pages = getCurrentPages();
  return pages && pages.length ? pages[pages.length - 1] : null;
}

function isActivePage(page) {
  if (!page || activePage !== page) return false;
  const topPage = getTopPage();
  return !topPage || topPage === page;
}

function inviteAlreadyHandled(page) {
  return !!(page && page._surveyPrompted);
}

function hasStorageApi(method) {
  return typeof wx !== 'undefined' && typeof wx[method] === 'function';
}

function isValidInviteRecord(record) {
  return !!record
    && typeof record === 'object'
    && !Array.isArray(record)
    && record.version === STORAGE_VERSION
    && (record.status === 'pending' || record.status === 'consumed')
    && record.surveyId === api.SURVEY_ID
    && record.surveyVersion === api.SURVEY_VERSION
    && typeof record.inviteKey === 'string'
    && record.inviteKey.length > 0
    && Number.isFinite(record.createdAt);
}

function removeStoredInvite() {
  if (!hasStorageApi('removeStorageSync')) return false;
  try {
    wx.removeStorageSync(STORAGE_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

function readStoredInvite() {
  if (!hasStorageApi('getStorageSync')) return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  try {
    const stored = wx.getStorageSync(STORAGE_KEY);
    if (!stored) return { ok: true, invite: null };
    const record = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (!isValidInviteRecord(record)) {
      removeStoredInvite();
      return { ok: true, invite: null, invalid: true };
    }
    return { ok: true, invite: record };
  } catch (error) {
    return { ok: false, code: 'STORAGE_READ_FAILED' };
  }
}

function writeStoredInvite(invite) {
  if (!hasStorageApi('setStorageSync') || !isValidInviteRecord(invite)) return false;
  try {
    wx.setStorageSync(STORAGE_KEY, invite);
    return true;
  } catch (error) {
    return false;
  }
}

function createInviteRecord() {
  const createdAt = Date.now();
  return {
    version: STORAGE_VERSION,
    status: 'pending',
    surveyId: api.SURVEY_ID,
    surveyVersion: api.SURVEY_VERSION,
    inviteKey: api.SURVEY_ID + ':' + api.SURVEY_VERSION + ':' + createdAt
      + ':' + Math.random().toString(36).slice(2, 10),
    createdAt
  };
}

function restorePendingInvite() {
  if (pendingInvite) return { ok: true, pending: true };
  const stored = readStoredInvite();
  if (!stored.ok) return { ok: false, pending: false, code: stored.code };
  if (!stored.invite) return { ok: true, pending: false };
  if (stored.invite.status === 'consumed') {
    removeStoredInvite();
    return { ok: true, pending: false };
  }
  if (consumedInviteKeys.has(stored.invite.inviteKey)) {
    // consumed 写入失败时，本地仍是 pending；当前进程内也不再展示，
    // 但新进程可以重新恢复这条记录。
    return { ok: true, pending: false, consumedInMemory: true };
  }
  pendingInvite = stored.invite;
  return { ok: true, pending: true };
}

function savePendingInvite() {
  if (pendingInvite) return pendingInvite;
  const stored = readStoredInvite();
  if (stored.ok && stored.invite && stored.invite.status === 'pending'
    && !consumedInviteKeys.has(stored.invite.inviteKey)) {
    pendingInvite = stored.invite;
    return pendingInvite;
  }
  const invite = createInviteRecord();
  pendingInvite = invite;
  if (stored.ok) writeStoredInvite(invite);
  return invite;
}

function markInviteConsumed(invite) {
  if (!invite || !invite.inviteKey) return false;
  consumedInviteKeys.add(invite.inviteKey);
  return writeStoredInvite(Object.assign({}, invite, {
    status: 'consumed',
    consumedAt: Date.now()
  }));
}

function presentPendingInvite(page) {
  if (!pendingInvite || promptVisible || !isActivePage(page)) return false;
  if (inviteAlreadyHandled(page)) return false;
  if (consumedInviteKeys.has(pendingInvite.inviteKey)) return false;
  if (typeof wx === 'undefined' || !wx.showModal) return false;

  const invite = pendingInvite;
  const previousPrompted = !!page._surveyPrompted;
  promptVisible = true;
  page._surveyPrompted = true;
  let handled = false;
  try {
    wx.showModal({
      title: '使用反馈调查',
      content: '你已连续使用工程制图学习助手 5 次。我们希望了解这个工具是否真正帮助了你的学习。',
      confirmText: '开始调查',
      cancelText: '暂时不做',
      success: (res) => {
        handled = true;
        consumedInviteKeys.add(invite.inviteKey);
        const persisted = markInviteConsumed(invite);
        pendingInvite = null;
        if (res && res.confirm) {
          // 用户已作出选择；consumed 保留到问卷成功提交后再删除。
          if (typeof wx.navigateTo === 'function') {
            wx.navigateTo({
              url: '/pages/survey/survey?invite_key=' + encodeURIComponent(invite.inviteKey)
            });
          }
        } else if (persisted) {
          // 必须先成功写入 consumed，再执行删除；删除失败时 consumed 仍保留。
          removeStoredInvite();
        }
      },
      fail: () => {
        if (!handled) page._surveyPrompted = previousPrompted;
      },
      complete: () => {
        promptVisible = false;
      }
    });
  } catch (error) {
    promptVisible = false;
    page._surveyPrompted = previousPrompted;
    return false;
  }
  return true;
}

function checkForSurveyInvite() {
  const page = activePage;
  if (!page || !isActivePage(page)) return Promise.resolve(null);
  const restored = restorePendingInvite();
  if (!restored.ok) {
    // 存储状态未知时暂停恢复和新统计，保留 tracker 事件版本供下次重试。
    return Promise.resolve(null);
  }
  if (pendingInvite) {
    presentPendingInvite(page);
    return Promise.resolve(null);
  }

  const targetRevision = sessionEndTracker.getRevision();
  if (targetRevision <= sessionEndTracker.getCheckedRevision()) return Promise.resolve(null);
  if (inFlight) return inFlight;

  let requestSucceeded = false;
  const request = api.statistics(true).then((result) => {
    if (!result || result.ok !== true) return result;
    requestSucceeded = true;
    sessionEndTracker.markChecked(targetRevision);
    if (!result.survey_completed && result.can_invite) {
      savePendingInvite();
    }
    return result;
  });

  inFlight = request.catch(() => null).then((result) => {
    inFlight = null;
    if (pendingInvite) presentPendingInvite(activePage);
    else if (requestSucceeded && activePage
      && sessionEndTracker.getRevision() > sessionEndTracker.getCheckedRevision()) {
      queuePendingInviteCheck(activePage);
    }
    return result;
  });
  return inFlight;
}

function queuePendingInviteCheck(page) {
  Promise.resolve().then(() => {
    if (activePage === page) checkForSurveyInvite();
  });
}

function onEligiblePageShown(page) {
  activePage = page;
  return checkForSurveyInvite();
}

function onEligiblePageHidden(page) {
  if (activePage === page) activePage = null;
}

function clearAfterSubmit(expectedInviteKey) {
  const expectedKey = String(expectedInviteKey || '');
  if (!expectedKey) return false;
  const stored = readStoredInvite();
  if (!stored.ok || !stored.invite || stored.invite.inviteKey !== expectedKey) return false;
  if (pendingInvite && pendingInvite.inviteKey === expectedKey) pendingInvite = null;
  consumedInviteKeys.add(stored.invite.inviteKey);
  if (stored.invite.status === 'pending' && !markInviteConsumed(stored.invite)) {
    return false;
  }
  return removeStoredInvite();
}

function resetForTests() {
  activePage = null;
  inFlight = null;
  pendingInvite = null;
  promptVisible = false;
  consumedInviteKeys.clear();
  sessionEndTracker.resetForTests();
}

sessionEndTracker.subscribe(() => {
  if (activePage) queuePendingInviteCheck(activePage);
});

module.exports = {
  STORAGE_KEY,
  onEligiblePageShown,
  onEligiblePageHidden,
  checkForSurveyInvite,
  clearAfterSubmit,
  resetForTests
};
