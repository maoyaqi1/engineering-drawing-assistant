// AI 教师页 · 准入状态模块。
//
// 对应统一需求：
//   IAM-06 / IAM-09 / IAM-15 / IAM-16 / IAM-27 / IAM-28
//   AI-04
//
// 本模块只把服务端 resolveAccess 的结果转换成页面提示，不放行任何功能。
// 真正权限始终由 api 云函数在每次请求时重新判定。
const api = require('../../utils/api.js');

module.exports = {
  // 云函数拒绝码 → 页面准入原因。保持与 api.accessDeniedResult 一一对应。
  AI_DENY_REASONS: {
    NO_PROFILE: 'no_profile',
    NOT_IN_ROSTER: 'not_in_roster',
    CLASS_ARCHIVED: 'class_archived',
    NO_CLASS: 'no_class',
    ACCESS_CHECK_FAILED: 'check_failed'
  },

  // 主动拉取服务端准入状态。网络失败时不篡改本地状态，
  // 下一次 AI 请求仍会由服务端执行最终校验。
  refreshAccess() {
    api.rosterStatus().then((res) => {
      this.applyAccess(res);
    }).catch(() => {
      this.applyAccess({ ok: false, reason: 'check_failed' });
    });
  },

  // 将服务端结果统一映射为页面字段：
  // student / guest、拒绝原因、测试账号提示、名册资料回显。
  applyAccess(res) {
    const ok = !!(res && res.ok);
    const level = ok ? (res.level || (res.in_roster ? 'student' : 'guest')) : 'guest';
    const reason = ok ? (res.reason || (res.in_roster ? 'ok' : 'not_in_roster')) : 'not_in_roster';
    const name = (res && res.name) || '';
    const studentId = (res && res.student_id) || '';
    const canAsk = level === 'student';
    const testAccount = !!ok && !!res.test_account;
    if (!canAsk) {
      this.setData({
        canAsk: false,
        aiVisible: false,
        accessReason: reason,
        accessName: name,
        accessStudentId: studentId,
        testAccount: false,
        notice: ''
      });
      this.leaveHiddenAiPage();
      return;
    }
    this.setData({
      canAsk: true,
      aiVisible: true,
      accessReason: '',
      accessName: name,
      accessStudentId: studentId,
      testAccount,
      notice: testAccount
        ? '测试账号：全功能开放，本次使用不计入真实学情。'
        : ''
    });
  },

  // AI 教师属于基本立体模式中的隐藏功能；准入失败时不展示提示，
  // 直接静默返回首页。服务端仍会在每次请求上执行最终鉴权。
  leaveHiddenAiPage() {
    if (this._hiddenAiRedirectPending) return;
    this._hiddenAiRedirectPending = true;
    if (typeof wx !== 'undefined' && wx.redirectTo) {
      wx.redirectTo({ url: '/pages/index/index' });
    }
  },

};
