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
    }).catch(() => {});
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
    this.setData({
      canAsk,
      accessReason: canAsk ? '' : reason,
      accessName: name,
      accessStudentId: studentId,
      testAccount,
      notice: canAsk
        ? (testAccount ? '测试账号：全功能开放，本次使用不计入真实学情。' : '')
        : this.accessNotice(reason, name, studentId)
    });
  },

  // 拒绝原因对应不同修复路径：只有资料类问题才引导去注册页。
  accessNotice(reason, name, studentId) {
    if (reason === 'no_profile') {
      return '你还没有填写学校、姓名和学号，填好后才能向 AI 教师提问。点这里完善资料（投影、立体等互动工具不受影响）。';
    }
    if (reason === 'class_archived') {
      return '你所在班级已被老师停用，暂时不能向 AI 教师提问。请联系老师恢复班级（投影、立体等互动工具不受影响）。';
    }
    if (reason === 'no_class') {
      return '你还没有被分到班级，暂时不能向 AI 教师提问。请联系老师把你加入班级（投影、立体等互动工具不受影响）。';
    }
    if (reason === 'check_failed') {
      return '系统繁忙，暂时无法确认你的名册与班级信息。请稍后重试（投影、立体等互动工具不受影响）。';
    }
    const who = name && studentId ? '（当前资料：' + name + ' · ' + studentId + '）' : '';
    return '老师还没把你的「姓名 + 学号」录入名册，暂时不能提问' + who +
      '。点这里核对或修改资料；投影、立体等互动工具不受影响。';
  },

  // 资料类原因可进入资料页；班级类原因只提示联系老师；
  // 读库失败执行一次显式重试，不误导学生修改个人资料。
  handleNoticeTap() {
    if (this.data.canAsk) return;
    const reason = this.data.accessReason;
    if (reason === 'class_archived' || reason === 'no_class') {
      wx.showToast({ title: '请联系老师处理班级', icon: 'none' });
      return;
    }
    if (reason === 'check_failed') {
      wx.showToast({ title: '正在重试…', icon: 'none' });
      this.refreshAccess();
      return;
    }
    wx.navigateTo({ url: '/pages/register/register' });
  }
};
