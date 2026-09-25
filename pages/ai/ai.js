const api = require('../../utils/api.js');

Page({
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

  // 云函数拒绝码 → 前端 reason 的映射（与 api 云函数 accessDeniedResult 一一对应）
  AI_DENY_REASONS: {
    NO_PROFILE: 'no_profile',
    NOT_IN_ROSTER: 'not_in_roster',
    CLASS_ARCHIVED: 'class_archived',
    NO_CLASS: 'no_class',
    ACCESS_CHECK_FAILED: 'check_failed'
  },

  onLoad() {
    this.setData({
      messages: []
    });
    // 取后台配置的隐私协议名称用于弹窗文案（取不到就用默认文案）
    if (typeof wx !== 'undefined' && wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success: (res) => {
          if (res && res.privacyContractName) this.setData({ privacyName: res.privacyContractName });
        }
      });
    }
    // R32/D17：AI 页必须先登录（未登录跳登录页，不落进"无提示失败"）
    const app = getApp();
    if (!app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.refreshAccess();
  },

  refreshAccess() {
    api.rosterStatus().then((res) => {
      this.applyAccess(res);
    }).catch(() => {});
  },

  // 统一处理鉴权结果（与云函数 resolveAccess 对应）：
  //   student  → 可提问；
  //   no_profile     → 引导去完善学校/姓名/学号；
  //   not_in_roster  → 说明需教师把「姓名 + 学号」录入名册，并回显当前资料便于核对；
  //   class_archived → 所在班级已停用，需老师恢复班级；
  //   no_class       → 还没被分到班级，需老师加入班级；
  //   check_failed   → 服务端读库失败（fail closed），提示稍后重试。
  // 兼容旧版云函数：没有 level/reason 字段时按 in_roster 推断。
  applyAccess(res) {
    const ok = !!(res && res.ok);
    const level = ok ? (res.level || (res.in_roster ? 'student' : 'guest')) : 'guest';
    const reason = ok ? (res.reason || (res.in_roster ? 'ok' : 'not_in_roster')) : 'not_in_roster';
    const name = (res && res.name) || '';
    const studentId = (res && res.student_id) || '';
    const canAsk = level === 'student';
    const testAccount = !!ok && !!res.test_account;
    this.setData({
      canAsk,
      accessReason: canAsk ? '' : reason,
      accessName: name,
      accessStudentId: studentId,
      testAccount,
      notice: canAsk
        ? (testAccount ? '测试账号：全功能开放，本次使用不计入真实学情。' : '')
        : this.accessNotice(reason, name, studentId)
    });
  },

  accessNotice(reason, name, studentId) {
    if (reason === 'no_profile') {
      return '你还没有填写学校、姓名和学号，填好后才能向 AI 教师提问。点这里完善资料（投影、立体等互动工具不受影响）。';
    }
    if (reason === 'class_archived') {
      return '你所在班级已被老师停用，暂时不能向 AI 教师提问。请联系老师恢复班级（投影、立体等互动工具不受影响）。';
    }
    if (reason === 'no_class') {
      return '你还没有被分到班级，暂时不能向 AI 教师提问。请联系老师把你加入班级（投影、立体等互动工具不受影响）。';
    }
    if (reason === 'check_failed') {
      return '系统繁忙，暂时无法确认你的名册与班级信息。请稍后重试（投影、立体等互动工具不受影响）。';
    }
    const who = name && studentId ? '（当前资料：' + name + ' · ' + studentId + '）' : '';
    return '老师还没把你的「姓名 + 学号」录入名册，暂时不能提问' + who +
      '。点这里核对或修改资料；投影、立体等互动工具不受影响。';
  },

  // 资料类原因（no_profile / not_in_roster）用「核对资料」处理；
  // 班级类原因与读库失败只能等老师处理或稍后重试，不误导学生去改资料。
  handleNoticeTap() {
    // 测试账号的提示只是告知"不计入学情"，不可点（可提问时点击不做任何跳转）
    if (this.data.canAsk) return;
    const reason = this.data.accessReason;
    if (reason === 'class_archived' || reason === 'no_class') {
      wx.showToast({ title: '请联系老师处理班级', icon: 'none' });
      return;
    }
    if (reason === 'check_failed') {
      wx.showToast({ title: '正在重试…', icon: 'none' });
      this.refreshAccess();
      return;
    }
    wx.navigateTo({ url: '/pages/register/register' });
  },

  // 转发给好友：统一落到首页 —— 提问需要名册权限，好友先经过登录/注册更顺；
  // 已登录的同学从首页一键即可回到「问老师」。
  onShareAppMessage() {
    return {
      title: '工程制图学习助手 · 让空间投影看得见',
      path: '/pages/index/index'
    };
  },

  onInput(event) {
    this.setData({ input: event.detail.value });
  },

  onSuggestion(event) {
    this.setData({ input: event.currentTarget.dataset.text });
    this.send();
  },

  pickImage() {
    if (!this.data.enableImage) return;
    const openPicker = () => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          if (!file) return;
          wx.compressImage({
            src: file.tempFilePath,
            quality: 40,
            success: (cres) => {
              const fs = wx.getFileSystemManager();
              fs.readFile({
                filePath: cres.tempFilePath,
                encoding: 'base64',
                success: (r) => {
                  const ext = (file.tempFilePath.split('.').pop() || 'jpg').toLowerCase();
                  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                  this.setData({ imageDataUrl: `data:${mime};base64,${r.data}` });
                },
                fail: (err) => this.reportPickFailure('读取图片失败', err)
              });
            },
            fail: (err) => this.reportPickFailure('图片压缩失败', err)
          });
        },
        fail: (err) => this.reportPickFailure('未能打开相机/相册', err)
      });
    };
    // 主动请求隐私授权：未同意时微信会触发 onNeedPrivacyAuthorization（app.js 里已注册弹窗）。
    // 不做这一步时，隐私接口会静默失败（点"同意/不同意"后都没有反应），排查非常困难。
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: openPicker,
        fail: (err) => this.reportPickFailure('未获得隐私授权，无法拍题', err)
      });
      return;
    }
    openPicker();
  },

  // 拍题失败时必须让用户与开发者都能看到原因，不能静默返回
  reportPickFailure(prefix, err) {
    const detail = (err && (err.errMsg || err.errmsg || err.message)) || '';
    console.error('[AI 拍题] ' + prefix + '：', err);
    wx.showToast({
      title: prefix + (detail ? '（' + detail + '）' : ''),
      icon: 'none',
      duration: 4000
    });
  },

  // —— 隐私授权（微信硬性要求：同意按钮必须是 open-type="agreePrivacyAuthorization"）——
  // 由 app.js 的 onNeedPrivacyAuthorization 转交过来，在本页渲染弹窗
  onNeedPrivacy(eventInfo) {
    console.log('[隐私授权] 触发接口：', eventInfo && eventInfo.referrer);
    this.setData({ showPrivacy: true });
  },

  openPrivacyContract() {
    if (typeof wx === 'undefined' || !wx.openPrivacyContract) return;
    wx.openPrivacyContract({
      fail: (err) => {
        console.error('[隐私授权] 打开隐私协议失败：', err);
        wx.showToast({ title: '暂时打不开隐私协议', icon: 'none' });
      }
    });
  },

  // 只有这个回调（由 agree 按钮触发）才代表用户同意；resolve 必须带 buttonId
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
  },

  clearImage() {
    this.setData({ imageDataUrl: '' });
  },

  // 点击"配套讲解"卡片 → 进入播放页，从片段起点开始播。
  // file_id 由云函数下发（环境变量 VIDEO_PLAYBACK=off 时不带该字段，这里给出提示而不跳转）。
  onPlayVideo(event) {
    const ref = (event && event.currentTarget && event.currentTarget.dataset.ref) || {};
    if (!ref.file_id) {
      wx.showToast({ title: '这段讲解的视频暂未开放', icon: 'none' });
      return;
    }
    const query = [
      'src=' + encodeURIComponent(ref.file_id),
      'title=' + encodeURIComponent(ref.video_title || '课程讲解'),
      'label=' + encodeURIComponent(ref.time_label || ''),
      'start=' + (ref.start || 0)
    ].join('&');
    wx.navigateTo({ url: '/pages/video/video?' + query });
  },

  send() {
    const text = (this.data.input || '').trim();
    const image = this.data.enableImage ? this.data.imageDataUrl : '';
    // 允许"只拍一张题图"直接提问（学生最常见的用法）；文字与图片至少有一个即可
    if (this.data.sending || (!text && !image)) return;
    if (!this.data.canAsk) {
      const titles = {
        no_profile: '请先完善学校、姓名和学号',
        not_in_roster: '你不在名册中，暂时无法提问',
        class_archived: '班级已停用，暂时无法提问',
        no_class: '你还没有被分到班级',
        check_failed: '系统繁忙，请稍后重试'
      };
      wx.showToast({
        title: titles[this.data.accessReason] || '暂时无法提问',
        icon: 'none'
      });
      return;
    }
    if (this.data.messages.length >= 60) {
      wx.showToast({ title: '对话较长，请点“新对话”', icon: 'none' });
      return;
    }
    const userMsg = { role: 'user', content: text || '（上传了一张图片）' };
    if (image) userMsg.image = image;
    this.setData({
      messages: this.data.messages.concat([userMsg]),
      input: '',
      imageDataUrl: '',
      sending: true,
      scrollTop: this.data.scrollTop + 10000
    });
    api.aiAsk(text, this.data.conversationId, null, image).then((res) => {
      // 拍照提问每日限额（服务端判定）：超额时给出明确提示，并清掉待发送的图片
      if (res && res.ok === false && res.code === 'IMAGE_QUOTA_EXCEEDED') {
        this.setData({
          sending: false,
          imageDataUrl: '',
          photoQuota: res.photo_quota || { limit: 2, used: 2, remaining: 0, unlimited: false },
          messages: this.data.messages.concat([{
            role: 'assistant',
            content: (res && res.msg) || '今天的拍照提问已用完，可以直接用文字描述问题。'
          }]),
          scrollTop: this.data.scrollTop + 10000
        });
        wx.showModal({
          title: '今天的拍照次数已用完',
          content: (res && res.msg) || '每天可以拍照提问 2 次，可以直接用文字描述问题。',
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      if (res && res.ok) {
        // 埋点：AI 提问（仅记录事件与知识点，不重复保存问答正文）
        api.recordEvent('ai_question', {
          page: 'ai',
          knowledge_point_id: (res && res.knowledge_point) || '',
          metadata: { has_image: !!image }
        });
      }
      // 服务端再校验：名册被删除 / 改名后，这里会立刻把权限收回并更新提示
      if (res && res.ok === false && this.AI_DENY_REASONS[res.code]) {
        this.applyAccess({
          ok: true,
          level: 'guest',
          reason: this.AI_DENY_REASONS[res.code],
          in_roster: false,
          name: this.data.accessName,
          student_id: this.data.accessStudentId
        });
      }
      const content = (res && res.ok && res.message && res.message.content)
        ? res.message.content
        : (res && res.msg) || '暂时无法回答，请稍后重试。';
      // 千问侧服务返回的讲解片段与知识来源（契约 §3/§2.2）。字段缺失时退化为空数组，
      // 老版本云函数（未部署接入版）仍能正常工作。
      const videoRefs = (res && res.ok && Array.isArray(res.video_refs)) ? res.video_refs : [];
      const sources = (res && res.ok && Array.isArray(res.sources)) ? res.sources : [];
      if (videoRefs.length) {
        // 埋点：本条回答带有可推送的讲解片段；用于统计"可推送比例"，
        // 为视频播放是否开放、以及视频上传批次提供依据（不改 ai_messages 结构）
        api.recordEvent('ai_video_push', {
          page: 'ai',
          knowledge_point_id: (res && res.knowledge_point) || '',
          metadata: {
            count: videoRefs.length,
            video_id: videoRefs[0].video_id || '',
            video_title: videoRefs[0].video_title || '',
            score: videoRefs[0].score || 0
          }
        });
      }
      const sourceText = sources.map((s) => s && s.doc).filter(Boolean).slice(0, 3).join('、');
      this.setData({
        sending: false,
        messages: this.data.messages.concat([{ role: 'assistant', content, videoRefs, sourceText }]),
        conversationId: (res && res.conversation_id) || this.data.conversationId,
        photoQuota: (res && res.photo_quota) || this.data.photoQuota,
        scrollTop: this.data.scrollTop + 10000
      });
    }).catch(() => {
      this.setData({
        sending: false,
        messages: this.data.messages.concat([{ role: 'assistant', content: '网络异常，请稍后重试。' }]),
        scrollTop: this.data.scrollTop + 10000
      });
    });
  },

  newConversation() {
    this.setData({
      messages: [],
      conversationId: '',
      scrollTop: 0
    });
  }
});
