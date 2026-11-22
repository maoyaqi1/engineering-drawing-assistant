// 学习行为埋点与云函数会话：只追加事件记录，不改变既有交互与渲染逻辑。
// api 在非小程序环境（无 wx.cloud）下为 null，所有上报静默跳过——与拆分前完全一致。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const api = (typeof wx !== 'undefined' && wx.cloud) ? require('../../utils/api.js') : null;
  const surveyInvite = api ? require('../../utils/survey-invite.js') : null;
  const SURVEY_LEARNING_PAGES = Object.freeze([
    'pages/index/index',
    'pages/plane-solid-projection/plane-solid-projection',
    'pages/curved-solid-projection/curved-solid-projection',
    'pages/plane-solid-intersection/plane-solid-intersection',
    'pages/curved-solid-intersection/curved-solid-intersection'
  ]);

  function isSurveyLearningPage(page) {
    return !!page && SURVEY_LEARNING_PAGES.indexOf(page.route) >= 0;
  }

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
      if (this._pageVisible && (this._sessionStartPending || this._sessionId)) return;
      if (this.data.aiEntryEnabled) this.refreshAiEntrance();
      else if (this.data.canUseAi) this.setData({ canUseAi: false });
      this._pageVisible = true;
      this._sessionCycle = (this._sessionCycle || 0) + 1;
      this._sessionStart = Date.now();
      this._interactionCount = 0;
      this._sessionEnded = false;
      this._sessionStartPending = true;
      this._sessionId = null;
      this._chapterStart = null;
      const sessionCycle = this._sessionCycle;
      api.startSession(this.data.mode).then((res) => {
        const sessionId = res && res.ok ? res.session_id : '';
        if (sessionCycle !== this._sessionCycle) {
          if (sessionId) api.endSession(sessionId, 0, 0);
          return;
        }
        this._sessionStartPending = false;
        if (!sessionId) return;
        if (!this._pageVisible || this._sessionEnded) {
          api.endSession(sessionId, 0, 0);
          return;
        }
        this._sessionId = sessionId;
        this.trackChapterEnter();
      }).catch(() => {
        if (sessionCycle === this._sessionCycle) this._sessionStartPending = false;
      });
      if (surveyInvite && isSurveyLearningPage(this)) {
        surveyInvite.onEligiblePageShown(this);
      }
    },

    // AI 教师是基本立体模式中的隐藏功能：只有服务端确认当前账号
    // 具备 student 级准入时才显示入口，失败或游客状态保持隐藏。
    refreshAiEntrance() {
      if (!api || !api.rosterStatus) return;
      api.rosterStatus().then((res) => {
        const canUseAi = !!(res && res.ok && res.level === 'student');
        if (this.data.canUseAi !== canUseAi) {
          this.setData({ canUseAi });
        }
      }).catch(() => {
        if (this.data.canUseAi) this.setData({ canUseAi: false });
      });
    },

    endSession() {
      this._pageVisible = false;
      if (surveyInvite && isSurveyLearningPage(this)) {
        surveyInvite.onEligiblePageHidden(this);
      }
      if (!api || this._sessionEnded) return;
      if (!this._sessionId && !this._sessionStartPending) return;
      this._sessionEnded = true;
      if (this._sessionId) {
        this.trackChapterExit();
        const duration = Math.max(0, Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000));
        api.endSession(this._sessionId, duration, this._interactionCount || 0);
        this._sessionId = null;
      }
    },

    trackEvent(eventType, payload) {
      if (!api || !api.recordEvent) return;
      const names = {
        point: '点的投影',
        line: '直线的投影',
        plane: '平面的投影',
        solid: '基本立体',
        section: this.data.learningChapterName || '平面切割立体'
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
      if (!this._pageVisible || !this._sessionId) return;
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
      if (surveyInvite) surveyInvite.checkForSurveyInvite();
    }
  };
})();
