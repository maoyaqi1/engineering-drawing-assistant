const api = require('./utils/api.js');

App({
  globalData: {
    appName: '工程制图学习助手',
    user: null
  },

  onLaunch() {
    // 初始化微信云开发。若只有一个云环境可省略 env；多环境请填 env: '你的环境ID'
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
    // 隐私授权：当需要调用微信隐私接口时，引导用户确认《用户协议》《隐私政策》
    if (typeof wx !== 'undefined' && wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        wx.showModal({
          title: '隐私保护提示',
          content: '为提供本功能，我们需要处理您的部分个人信息（详见《隐私政策》）。是否同意？',
          confirmText: '同意',
          cancelText: '不同意',
          success: (res) => {
            resolve({ event: res.confirm ? 'agree' : 'disagree' });
          }
        });
      });
    }
    const cachedUser = wx.getStorageSync('hfjh_user');
    if (cachedUser) {
      this.globalData.user = cachedUser;
    }
  },

  setUser(user) {
    this.globalData.user = user;
    wx.setStorageSync('hfjh_user', user);
  },

  clearUser() {
    this.globalData.user = null;
    wx.removeStorageSync('hfjh_user');
  }
});
