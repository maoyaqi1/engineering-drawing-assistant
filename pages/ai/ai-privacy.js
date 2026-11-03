// AI 教师页 · 隐私授权模块。
//
// 对应统一需求：
//   IAM-23 / IAM-25
//   AI-21 / AI-22
//
// 微信要求隐私同意必须由 agreePrivacyAuthorization 按钮触发；
// 本模块只桥接 app.js 保存的 resolve，不记录或持久化图片。
module.exports = {
  // app.js 收到隐私请求后转交当前页面渲染合规弹窗；这里仅保存待处理上下文，
  // 真正 resolve 必须等待平台专用同意按钮。
  onNeedPrivacy(eventInfo) {
    console.log('[隐私授权] 触发接口：', eventInfo && eventInfo.referrer);
    this.setData({ showPrivacy: true });
  },

  // 隐私协议由微信平台页面展示，应用不缓存协议正文。
  openPrivacyContract() {
    if (typeof wx === 'undefined' || !wx.openPrivacyContract) return;
    wx.openPrivacyContract({
      fail: (err) => {
        console.error('[隐私授权] 打开隐私协议失败：', err);
        wx.showToast({ title: '暂时打不开隐私协议', icon: 'none' });
      }
    });
  },

  // 只有 open-type="agreePrivacyAuthorization" 触发的回调才代表同意。
  // resolve 必须携带按钮 ID，否则微信不会认可授权结果。
  handleAgreePrivacyAuthorization() {
    const app = getApp();
    const resolve = app && app.globalData && app.globalData.privacyResolve;
    if (app && app.globalData) app.globalData.privacyResolve = null;
    this.setData({ showPrivacy: false });
    if (typeof resolve === 'function') resolve({ buttonId: 'agree-btn', event: 'agree' });
  },

  handleRefusePrivacy() {
    const app = getApp();
    const resolve = app && app.globalData && app.globalData.privacyResolve;
    if (app && app.globalData) app.globalData.privacyResolve = null;
    this.setData({ showPrivacy: false });
    if (typeof resolve === 'function') resolve({ event: 'disagree' });
  }
};
