// 关于我们 · 产品定位、版本和联系渠道。
//
// 本页是产品说明页，不创建学习会话，也不写入学习记录。
const productInfo = require('../../config/product-info.js');
const { resolveRuntimeVersion } = require('../../utils/app-update.js');

function copyContactValue(value, toastTitle) {
  wx.setClipboardData({
    data: value,
    success: () => {
      wx.showToast({ title: toastTitle, icon: 'none' });
    },
    fail: () => {
      wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' });
    }
  });
}

function buildContactChannels() {
  return productInfo.contactChannels.map((item) => {
    const isConfigured = !!String(item.value || '').trim();
    return {
      key: item.key,
      title: item.title,
      description: item.description,
      action: item.action,
      directId: item.directId || '',
      value: item.value,
      isConfigured,
      isActionable: isConfigured && item.action === 'official-account',
      isOfficialAccount: item.action === 'official-account',
      actionLabel: item.action === 'official-account'
        ? (item.directId ? '打开公众号' : '复制公众号名称')
        : '',
      statusText: isConfigured ? '可联系' : '公开渠道待补充'
    };
  });
}

Page({
  data: {
    product: productInfo,
    displayVersion: resolveRuntimeVersion(productInfo.version),
    contactChannels: buildContactChannels(),
    hasUnconfiguredContacts: productInfo.contactChannels.some(
      (item) => !String(item.value || '').trim()
    )
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
  },

  handleContactTap(event) {
    const contactKey = event && event.currentTarget
      && event.currentTarget.dataset
      && event.currentTarget.dataset.contactKey;
    const contact = this.data.contactChannels.find((item) => item.key === contactKey);
    if (!contact || !contact.isActionable || !contact.isOfficialAccount) return;

    if (contact.action === 'official-account') {
      if (!contact.directId) {
        copyContactValue(contact.value, '公众号名称已复制，请在微信中搜索');
        return;
      }
      if (typeof wx.openOfficialAccountProfile !== 'function') {
        copyContactValue(contact.value, '当前微信版本不支持直达，名称已复制');
        return;
      }
      wx.openOfficialAccountProfile({
        username: contact.directId,
        fail: () => {
          copyContactValue(contact.value, '公众号打开失败，名称已复制');
        }
      });
    }
  }
});
