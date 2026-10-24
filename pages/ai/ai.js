// AI 教师页入口。
//
// 对应统一需求：AI-03–AI-10、IAM-24。
// 页面只负责 data、生命周期与分享；准入、隐私、输入和对话分别由
// 同目录模块承担。模块顺序不影响公开事件名，WXML 绑定保持不变。
const access = require('./ai-access.js');
const input = require('./ai-input.js');
const privacy = require('./ai-privacy.js');
const conversation = require('./ai-conversation.js');

Page(Object.assign({
  data: {
    messages: [],
    input: '',
    conversationId: '',
    sending: false,
    scrollTop: 0,
    canAsk: true,
    accessReason: '',
    accessName: '',
    accessStudentId: '',
    testAccount: false,
    notice: '',
    enableImage: true,
    imageDataUrl: '',
    showPrivacy: false,
    privacyName: '隐私政策',
    photoQuota: null,
    suggestions: ['点到平面距离如何求解？', '点的三面投影规律是什么？', '平面与立体相交如何求截交线？', '怎么看截交线的形状和尺寸？']
  },

  // 页面只初始化展示状态并检查登录。
  // 名册、班级、测试账号等判定由 ai-access 向云函数请求。
  onLoad() {
    this.setData({ messages: [] });
    if (typeof wx !== 'undefined' && wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success: (res) => {
          if (res && res.privacyContractName) this.setData({ privacyName: res.privacyContractName });
        }
      });
    }

    const app = getApp();
    if (!app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.refreshAccess();
  },

  // 转发落到首页，让好友先经过统一登录与资料流程。
  onShareAppMessage() {
    return {
      title: '工程制图学习助手 · 让空间投影看得见',
      path: '/pages/index/index'
    };
  }
}, access, input, privacy, conversation));
