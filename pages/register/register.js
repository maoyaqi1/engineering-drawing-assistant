const api = require('../../utils/api.js');
const app = getApp();

// 实名资料页（冻结 F5）。页面只收集学校、姓名和学号，并负责提交中的防重；
// 学号冲突、名册命中、班级状态和测试账号判定全部以 api 云函数返回为准。
Page({
  data: {
    isEdit: false,
    school: '',
    name: '',
    studentId: '',
    submitting: false,
    error: ''
  },

  onLoad() {
    const user = app.globalData.user;
    if (!user || !user.openid) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({
      isEdit: !!user.student_id,
      school: user.school || '',
      name: user.name || '',
      studentId: user.student_id || ''
    });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value, error: '' });
  },

  // 客户端非空校验只用于快速反馈；服务端 register action 会再次规范化和校验身份。
  // 成功后将服务端返回的用户快照写回 app.globalData，随后再进入互动首页。
  submit() {
    if (this.data.submitting) return;
    const school = (this.data.school || '').trim();
    const name = (this.data.name || '').trim();
    const studentId = (this.data.studentId || '').trim();
    if (!school || !name || !studentId) {
      this.setData({ error: '请完整填写学校、姓名和学号' });
      return;
    }
    this.setData({ submitting: true, error: '' });
    api.register({ school, name, studentId }).then((res) => {
      if (res && res.ok && res.user) {
        app.setUser(res.user);
        wx.redirectTo({ url: '/pages/index/index' });
        return;
      }
      this.setData({ submitting: false, error: (res && res.msg) || '提交失败，请重试' });
    }).catch(() => {
      this.setData({ submitting: false, error: '网络异常，请重试' });
    });
  }
});
