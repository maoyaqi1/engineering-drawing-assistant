const api = require('../../utils/api.js');

Page({
  data: {
    messages: [],
    input: '',
    conversationId: '',
    sending: false,
    scrollTop: 0,
    canAsk: true,
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
      const canAsk = !!(res && res.ok && res.in_roster);
      this.setData({
        canAsk,
        notice: canAsk ? '' : '你不在名单中，暂时无法使用提问。你仍可使用投影、立体等互动工具。'
      });
    }).catch(() => {});
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
      wx.showToast({ title: '你不在名单中，暂时无法提问', icon: 'none' });
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
