// 学生端课程首页：课程目录、知识点搜索和真实学习页面导航。
//
// 课程目录统一使用实际可用的页面路由。pages/index 的五种模式通过
// 深链参数区分，旧版无参数点模式仍作为兼容入口。
const catalog = require('../../config/course-catalog.js');
const homeSearch = require('./home-search.js');
const surveyInvite = require('../../utils/survey-invite.js');

const SUPPORTED_ROUTE_KINDS = Object.freeze(['page', 'legacy-page', 'index-mode']);

function findKnowledgePoint(pointId) {
  for (const chapter of catalog.chapters) {
    const point = chapter.points.find((item) => item.id === pointId);
    if (point) return point;
  }
  return null;
}

function getDisplayChapters(expandedChapterId) {
  return homeSearch.buildHomeChapters(
    catalog,
    expandedChapterId,
    SUPPORTED_ROUTE_KINDS
  );
}

Page({
  data: {
    chapters: [],
    expandedChapterId: catalog.defaultExpandedChapterId,
    query: '',
    searchResults: [],
    hasQuery: false
  },

  onLoad() {
    const app = getApp();
    const user = app && app.globalData && app.globalData.user;
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    if (!user.student_id) {
      wx.reLaunch({ url: '/pages/register/register' });
      return;
    }
    this._accessReady = true;
    this.setData({
      chapters: getDisplayChapters(this.data.expandedChapterId)
    });
  },

  onShow() {
    if (!this._accessReady) return;
    surveyInvite.onEligiblePageShown(this);
  },

  onHide() {
    surveyInvite.onEligiblePageHidden(this);
  },

  onUnload() {
    surveyInvite.onEligiblePageHidden(this);
  },

  onShareAppMessage() {
    return {
      title: '工程制图学习助手 · 让空间投影看得见',
      path: '/pages/home/home'
    };
  },

  toggleChapter(event) {
    const chapterId = event.currentTarget.dataset.id;
    const chapter = this.data.chapters.find((item) => item.id === chapterId);
    if (chapter && !chapter.hasMultiplePoints) return;
    const nextExpandedId = this.data.expandedChapterId === chapterId ? '' : chapterId;
    this.setData({
      expandedChapterId: nextExpandedId,
      chapters: getDisplayChapters(nextExpandedId)
    });
  },

  handleSearchInput(event) {
    this.updateSearch(event.detail && event.detail.value);
  },

  clearSearch() {
    this.updateSearch('');
  },

  updateSearch(rawQuery) {
    const query = String(rawQuery || '');
    const hasQuery = !!homeSearch.normalizeQuery(query);
    this.setData({
      query,
      hasQuery,
      searchResults: hasQuery
        ? homeSearch.searchKnowledgePoints(catalog, query, SUPPORTED_ROUTE_KINDS)
        : []
    });
  },

  openKnowledgePoint(event) {
    const pointId = event.currentTarget.dataset.id;
    const point = findKnowledgePoint(pointId);
    if (!point || !homeSearch.supportsRoute(point, SUPPORTED_ROUTE_KINDS)) {
      wx.showToast({ title: '该知识点暂未开放', icon: 'none' });
      return;
    }
    const url = homeSearch.getRouteUrl(point);
    if (!url) {
      wx.showToast({ title: '学习页面暂不可用', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' })
    });
  }
});
