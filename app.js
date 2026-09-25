const api = require('./utils/api.js');

App({
  globalData: {
    appName: '工程制图学习助手',
    user: null,
    // 隐私授权暂存：微信触发授权请求时先存下 resolve，由当前页面的合规弹窗回调
    privacyResolve: null
  },

  onLaunch() {
    // 初始化微信云开发。若只有一个云环境可省略 env；多环境请填 env: '你的环境ID'
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
    // 隐私授权：微信触发隐私接口授权请求时，转交当前页面渲染合规弹窗。
    // 注意（2026-09-25 踩过的坑）："同意"必须由 <button open-type="agreePrivacyAuthorization">
    // 触发，resolve 还要带 buttonId；用 wx.showModal 冒充同意按钮时微信不认可，
    // requirePrivacyAuthorize 会直接走 fail，表现就是"点同意也没反应"。
    if (typeof wx !== 'undefined' && wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page && typeof page.onNeedPrivacy === 'function') {
          this.globalData.privacyResolve = resolve;
          page.onNeedPrivacy(eventInfo);
          return;
        }
        console.warn('[隐私授权] 当前页面未接管，已拒绝；触发接口：', eventInfo && eventInfo.referrer);
        resolve({ event: 'disagree' });
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
