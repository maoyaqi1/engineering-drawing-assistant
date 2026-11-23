// 动脑思考 · 空间思维与分析能力介绍页。
//
// 页面只展示静态育人内容，不创建学习会话，也不写入学习记录。
const abilityPages = require('../../config/ability-pages.js');

Page({
  data: {
    pageContent: abilityPages.thinking,
    themeClass: abilityPages.thinking.themeClass
  },

  handleBack() {
    const pageStack = getCurrentPages();
    if (pageStack && pageStack.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => wx.reLaunch({ url: '/pages/home/home' })
      });
      return;
    }
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
