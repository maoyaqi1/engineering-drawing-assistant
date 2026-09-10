const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    loading: false,
    error: '',
    agreed: false
  },

  onLoad() {
    // 已登录则跳过登录页：已实名注册直接进首页；登录过但未填学号的去补注册。
    const user = app.globalData.user;
    if (user && user.student_id) {
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    if (user) {
      wx.reLaunch({ url: '/pages/register/register' });
      return;
    }
    this.setData({ loading: false, error: '' });
  },

  tryLogin() {
    if (this.data.loading) return;
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return;
    }
    this.setData({ loading: true, error: '' });
    api.login().then((res) => {
      if (res && res.ok && res.user) {
        app.setUser(res.user);
        const registered = !!(res.registered && res.user.student_id);
        wx.redirectTo({ url: registered ? '/pages/index/index' : '/pages/register/register' });
        return;
      }
      this.setData({ loading: false, error: (res && res.msg) || '登录失败，请稍后重试' });
    }).catch(() => {
      this.setData({ loading: false, error: '网络异常，请重试' });
    });
  },

  toggleAgreed() {
    this.setData({ agreed: !this.data.agreed });
  },

  openTerms(event) {
    const type = event.currentTarget.dataset.type === 'privacy' ? 'privacy' : 'user';
    wx.navigateTo({ url: '/pages/terms/terms?type=' + type });
  }
});
