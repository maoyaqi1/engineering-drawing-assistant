// 学习行为埋点与云函数会话：只追加事件记录，不改变既有交互与渲染逻辑。
// api 在非小程序环境（无 wx.cloud）下为 null，所有上报静默跳过——与拆分前完全一致。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const api = (typeof wx !== 'undefined' && wx.cloud) ? require('../../utils/api.js') : null;

  module.exports = {
    ensureSession() {
      if (!api) return;
      const app = getApp();
      // R32/D17：首页只要求「已登录」（未注册游客也能用互动功能）；
      // 填资料（学校/姓名/学号）不再是进入互动的前提——它只影响 AI 与问卷。
      if (!app.globalData.user) {
        wx.redirectTo({ url: '/pages/login/login' });
        return;
      }
      this._sessionStart = Date.now();
      this._interactionCount = 0;
      this._sessionEnded = false;
      api.startSession(this.data.mode).then((res) => {
        if (res && res.ok) this._sessionId = res.session_id;
        this.trackChapterEnter();
      });
      api.statistics(true).then((res) => {
        if (res && res.ok && !res.survey_completed && res.can_invite && res.valid_session_count >= 5) {
          this.inviteSurvey();
        }
      });
    },

    endSession() {
      if (!api || !this._sessionId || this._sessionEnded) return;
      this._sessionEnded = true;
      this.trackChapterExit();
      const duration = Math.max(0, Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000));
      api.endSession(this._sessionId, duration, this._interactionCount || 0);
      this._sessionId = null;
    },

    trackEvent(eventType, payload) {
      if (!api || !api.recordEvent) return;
      const names = {
        point: '点的投影',
        line: '直线的投影',
        plane: '平面的投影',
        solid: '基本立体',
        section: '平面切割立体'
      };
      const chapterId = this.data.mode;
      api.recordEvent(eventType, Object.assign({
        session_id: this._sessionId || '',
        chapter_id: chapterId,
        chapter_name: names[chapterId] || chapterId,
        page: 'index'
      }, payload || {}));
    },

    trackChapterEnter() {
      this._chapterStart = Date.now();
      this.trackEvent('chapter_enter');
    },

    trackChapterExit() {
      if (!this._chapterStart) return;
      const duration = Math.max(0, Math.floor((Date.now() - this._chapterStart) / 1000));
      this._chapterStart = null;
      this.trackEvent('chapter_exit', { duration });
    },

    recordInteraction() {
      if (!api) return;
      this._interactionCount = (this._interactionCount || 0) + 1;
    },

    inviteSurvey() {
      if (this._surveyPrompted) return;
      this._surveyPrompted = true;
      wx.showModal({
        title: '使用反馈调查',
        content: '你已连续使用工程制图学习助手 5 次。我们希望了解这个工具是否真正帮助了你的学习。',
        confirmText: '开始调查',
        cancelText: '暂时不做',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/survey/survey' });
        }
      });
    }
  };
})();
