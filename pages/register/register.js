const api = require('../../utils/api.js');
const app = getApp();

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
    const user = app.globalData.user || {};
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
