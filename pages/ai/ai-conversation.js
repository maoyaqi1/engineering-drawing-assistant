// AI 教师页 · 对话发送模块。
//
// 对应统一需求：
//   AI-05–AI-10 / AI-17–AI-20 / AI-23–AI-31
//   IAM-16 / IAM-27
//
// 页面只负责组织消息和处理服务端结果；权限、配额、检索和回答生成
// 都由 api 云函数完成。发送状态必须在每个终止分支恢复。
const api = require('../../utils/api.js');

module.exports = {
  send() {
    const text = (this.data.input || '').trim();
    const image = this.data.enableImage ? this.data.imageDataUrl : '';
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
      // 图片配额由服务端按 learning_records.ai_photo_ask 计算；
      // 超额时回到文字提问能力，不进入视觉模型。
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
        // 学习埋点与 AI 正文分离，只记录知识点和是否带图。
        api.recordEvent('ai_question', {
          page: 'ai',
          knowledge_point_id: (res && res.knowledge_point) || '',
          metadata: { has_image: !!image }
        });
      }

      // 服务端可能发现名册变更或班级停用，立即收回页面发送能力。
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
      const videoRefs = (res && res.ok && Array.isArray(res.video_refs)) ? res.video_refs : [];
      const sources = (res && res.ok && Array.isArray(res.sources)) ? res.sources : [];

      // 推荐视频只记录为参考，不作为回答主体；当前页面不提供播放入口。
      if (videoRefs.length) {
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

      const sourceText = sources.map((source) => source && source.doc)
        .filter(Boolean).slice(0, 3).join('、');
      const convId = (res && res.conversation_id) || this.data.conversationId;
      this.setData({
        sending: false,
        messages: this.data.messages.concat([{ role: 'assistant', content, videoRefs, sourceText }]),
        conversationId: convId,
        photoQuota: (res && res.photo_quota) || this.data.photoQuota,
        scrollTop: this.data.scrollTop + 10000
      });
    }).catch(() => {
      // 网络失败保留用户消息，恢复发送状态并给出可读提示。
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
};
