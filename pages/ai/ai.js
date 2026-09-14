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
    notice: '',
    enableImage: false,
    imageDataUrl: '',
    suggestions: ['点到平面距离如何求解？', '点的三面投影规律是什么？', '平面与立体相交如何求截交线？', '怎么看截交线的形状和尺寸？']
  },

  onLoad() {
    this.setData({
      messages: []
    });
    api.rosterStatus().then((res) => {
      this.applyAccess(res);
    }).catch(() => {});
  },

  // 统一处理鉴权结果（与云函数 resolveAccess 对应）：
  //   student  → 可提问；
  //   no_profile     → 引导去完善学校/姓名/学号；
  //   not_in_roster  → 说明需教师把「姓名 + 学号」录入名册，并回显当前资料便于核对。
  // 兼容旧版云函数：没有 level/reason 字段时按 in_roster 推断。
  applyAccess(res) {
    const ok = !!(res && res.ok);
    const level = ok ? (res.level || (res.in_roster ? 'student' : 'guest')) : 'guest';
    const reason = ok ? (res.reason || (res.in_roster ? 'ok' : 'not_in_roster')) : 'not_in_roster';
    const name = (res && res.name) || '';
    const studentId = (res && res.student_id) || '';
    const canAsk = level === 'student';
    this.setData({
      canAsk,
      accessReason: canAsk ? '' : reason,
      accessName: name,
      accessStudentId: studentId,
      notice: canAsk ? '' : this.accessNotice(reason, name, studentId)
    });
  },

  accessNotice(reason, name, studentId) {
    if (reason === 'no_profile') {
      return '你还没有填写学校、姓名和学号，填好后才能向 AI 教师提问。点这里完善资料（投影、立体等互动工具不受影响）。';
    }
    const who = name && studentId ? '（当前资料：' + name + ' · ' + studentId + '）' : '';
    return '老师还没把你的「姓名 + 学号」录入名册，暂时不能提问' + who +
      '。点这里核对或修改资料；投影、立体等互动工具不受影响。';
  },

  // 两种情况都用「核对资料」即可处理；是否放行仍由教师端录入的名册决定
  handleNoticeTap() {
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
              }
            });
          }
        });
      }
    });
  },

  clearImage() {
    this.setData({ imageDataUrl: '' });
  },

  send() {
    const text = (this.data.input || '').trim();
    const image = this.data.enableImage ? this.data.imageDataUrl : '';
    if (!text || this.data.sending) return;
    if (!this.data.canAsk) {
      wx.showToast({
        title: this.data.accessReason === 'no_profile' ? '请先完善学校、姓名和学号' : '你不在名册中，暂时无法提问',
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
      if (res && res.ok) {
        // 埋点：AI 提问（仅记录事件与知识点，不重复保存问答正文）
        api.recordEvent('ai_question', {
          page: 'ai',
          knowledge_point_id: (res && res.knowledge_point) || ''
        });
      }
      // 服务端再校验：名册被删除 / 改名后，这里会立刻把权限收回并更新提示
      if (res && res.ok === false && (res.code === 'NO_PROFILE' || res.code === 'NOT_IN_ROSTER')) {
        this.applyAccess({
          ok: true,
          level: 'guest',
          reason: res.code === 'NO_PROFILE' ? 'no_profile' : 'not_in_roster',
          in_roster: false,
          name: this.data.accessName,
          student_id: this.data.accessStudentId
        });
      }
      const content = (res && res.ok && res.message && res.message.content)
        ? res.message.content
        : (res && res.msg) || '暂时无法回答，请稍后重试。';
      this.setData({
        sending: false,
        messages: this.data.messages.concat([{ role: 'assistant', content }]),
        conversationId: (res && res.conversation_id) || this.data.conversationId,
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
