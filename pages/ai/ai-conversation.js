// AI 教师页 · 对话发送模块。
//
// 对应统一需求：
//   AI-05–AI-10 / AI-17–AI-20 / AI-23–AI-31
//   IAM-16 / IAM-27
//
// 页面只负责组织消息和处理服务端结果；权限、配额、检索和回答生成
// 都由 api 云函数完成。发送状态必须在每个终止分支恢复。
const api = require('../../utils/api.js');

// 图片请求的客户端幂等键。只保证同一页面发送会话内足够唯一；
// 服务端还会按 request_id/图片哈希校验预占租约，不能把随机数当安全凭证。
function createImageRequestId() {
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

module.exports = {
  // AI 对话发送主流程。所有终止分支都必须恢复 sending=false；页面 canAsk 只是提示，
  // 真正的名册、班级、配额和内容边界由云函数再次校验。
  // 顺序：本地门禁 -> 乐观插入用户消息 -> ai.ask -> 错误/降级映射 -> 追加助手消息。
  send() {
    const text = (this.data.input || '').trim();
    const image = this.data.enableImage ? this.data.imageDataUrl : '';
    if (this.data.sending || (!text && !image)) return;
    if (!this.data.canAsk) return;
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

    // 同一次图片发送在重试时必须复用 request_id；服务端还会对旧客户端使用图片哈希回退。
    const requestId = image ? createImageRequestId() : '';
    api.aiAsk(text, this.data.conversationId, null, image, requestId).then((res) => {
      // 图片配额由服务端原子预占；成功后仍写入 learning_records.ai_photo_ask 作为审计事件。
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

      if (res && res.ok === false &&
          (res.code === 'PHOTO_REQUEST_IN_PROGRESS' || res.code === 'PHOTO_REQUEST_ALREADY_COMPLETED')) {
        this.setData({
          sending: false,
          imageDataUrl: '',
          photoQuota: res.photo_quota || this.data.photoQuota,
          messages: this.data.messages.concat([{
            role: 'assistant',
            content: (res && res.msg) || '这张图片正在处理中，请稍后查看已有回答。'
          }]),
          scrollTop: this.data.scrollTop + 10000
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
        this.setData({ sending: false });
        return;
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

  // 新对话只清空页面会话引用，不删除服务端历史；下次提问会创建新的 conversation。
  newConversation() {
    this.setData({
      messages: [],
      conversationId: '',
      scrollTop: 0
    });
  }
};
