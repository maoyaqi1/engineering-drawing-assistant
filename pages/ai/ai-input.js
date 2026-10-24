// AI 教师页 · 输入与图片模块。
//
// 对应统一需求：
//   AI-05 / AI-06 / AI-10 / AI-21 / AI-22 / AI-26 / AI-38
//
// 输入模块只准备文字草稿和待发送图片，不在本地判定权限或配额。
module.exports = {
  onInput(event) {
    this.setData({ input: event.detail.value });
  },

  // 点击建议问题等价于填入文本并立即发送。
  onSuggestion(event) {
    this.setData({ input: event.currentTarget.dataset.text });
    this.send();
  },

  // 图片提问链路：
  // 隐私授权 → 选图 → 压缩 → base64 → 暂存页面内存。
  // 图片不写数据库、不写云存储；配额和服务端视觉开关在云函数执行。
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

    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: openPicker,
        fail: (err) => this.reportPickFailure('未获得隐私授权，无法拍题', err)
      });
      return;
    }
    openPicker();
  },

  // 图片处理失败必须反馈原因，不能静默返回。
  reportPickFailure(prefix, err) {
    const detail = (err && (err.errMsg || err.errmsg || err.message)) || '';
    console.error('[AI 拍题] ' + prefix + '：', err);
    wx.showToast({
      title: prefix + (detail ? '（' + detail + '）' : ''),
      icon: 'none',
      duration: 4000
    });
  },

  clearImage() {
    this.setData({ imageDataUrl: '' });
  }
};
