const api = require('./utils/api.js');

// 小程序全局入口。这里只保存跨页面共享且生命周期短的状态：
//   user：当前登录学生快照，同时持久化到本地缓存；
//   privacyResolve：微信隐私接口等待当前页面弹窗回填的 Promise resolve。
// 具体业务状态仍由各 Page 自己持有，不通过 app 实例互相传递。
App({
  globalData: {
    appName: '工程制图学习助手',
    user: null,
    // 微信一次只等待一个隐私授权结果；当前页面接管后必须调用并清空该 resolve，
    // 否则后续隐私接口会继续等待旧页面，形成看似“点了按钮没反应”的状态。
    privacyResolve: null
  },

  onLaunch() {
    // 初始化微信云开发。若只有一个云环境可省略 env；多环境请填 env: '你的环境ID'。
    // wx 在 Node 自检或极早期环境中可能不存在，因此先做能力检测，保持模块可静态加载。
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
    // 隐私授权：微信触发隐私接口授权请求时，转交当前页面渲染合规弹窗。
    // 注意（2026-09-25 踩过的坑）："同意"必须由 <button open-type="agreePrivacyAuthorization">
    // 触发，resolve 还要带 buttonId；用 wx.showModal 冒充同意按钮时微信不认可，
    // requirePrivacyAuthorize 会直接走 fail，表现就是"点同意也没反应"。
    if (typeof wx !== 'undefined' && wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
        // 隐私请求由触发它的最上层页面渲染合规弹窗。页面无法接管时必须明确拒绝，
        // 不能让微信侧请求永久悬挂。
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
    // 本地缓存只用于减少重复登录体验；真正身份仍由云函数根据 openid 与名册重新确认。
    const cachedUser = wx.getStorageSync('hfjh_user');
    if (cachedUser) {
      this.globalData.user = cachedUser;
    }
  },

  // setUser / clearUser 是小程序内唯一的登录态写入点，保证内存与缓存同步更新。
  setUser(user) {
    this.globalData.user = user;
    wx.setStorageSync('hfjh_user', user);
  },

  clearUser() {
    this.globalData.user = null;
    wx.removeStorageSync('hfjh_user');
  }
});
