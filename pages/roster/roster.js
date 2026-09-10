const api = require('../../utils/api.js');

Page({
  data: {
    admin: false,
    checking: true,
    studentId: '',
    inRoster: false,
    input: '',
    importing: false,
    result: '',
    items: []
  },

  onLoad() {
    this.load();
  },

  load() {
    api.rosterStatus().then((res) => {
      const admin = !!(res && res.ok && res.admin);
      this.setData({
        admin,
        checking: false,
        studentId: (res && res.student_id) || '',
        inRoster: !!(res && res.ok && res.in_roster)
      });
      if (admin) this.loadList();
    }).catch(() => {
      this.setData({ checking: false });
    });
  },

  loadList() {
    api.rosterList().then((res) => {
      if (res && res.ok) this.setData({ items: res.items || [] });
    });
  },

  onInput(event) {
    this.setData({ input: event.detail.value, result: '' });
  },

  doImport() {
    if (this.data.importing) return;
    const headers = ['student_id', 'studentid', 'studentid', '学号', '学号id', '学号id', 'id', '编号', '序号'];
    const lines = (this.data.input || '')
      .split(/[\r\n,，;；]+/)
      .map((s) => s.trim())
      .filter((s) => s && !headers.includes(s.toLowerCase()));
    if (lines.length === 0) {
      wx.showToast({ title: '请先粘贴学号', icon: 'none' });
      return;
    }
    this.setData({ importing: true, result: '' });
    api.rosterImport(lines).then((res) => {
      if (res && res.ok) {
        this.setData({
          importing: false,
          result: `导入完成：新增 ${res.added} 条，重复 ${res.duplicate} 条`,
          input: ''
        });
        this.loadList();
      } else {
        this.setData({ importing: false, result: (res && res.msg) || '导入失败' });
      }
    }).catch(() => {
      this.setData({ importing: false, result: '网络异常，请重试' });
    });
  },

  removeOne(event) {
    const id = event.currentTarget.dataset.id;
    const no = event.currentTarget.dataset.no;
    wx.showModal({
      title: '移除名单',
      content: `确定将学号 ${no} 移出名单吗？`,
      success: (r) => {
        if (r.confirm) {
          api.rosterRemove(id).then((res) => {
            if (res && res.ok) {
              wx.showToast({ title: '已移除', icon: 'success' });
              this.loadList();
            } else {
              wx.showToast({ title: (res && res.msg) || '移除失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '网络异常，请重试', icon: 'none' });
          });
        }
      }
    });
  },

  clearAll() {
    wx.showModal({
      title: '清空名单',
      content: '确定要清空全部名单吗？清空后学生将无法使用 AI 教师提问。',
      confirmText: '清空',
      confirmColor: '#e04444',
      success: (r) => {
        if (r.confirm) {
          api.rosterClear().then((res) => {
            if (res && res.ok) {
              this.setData({ items: [], result: '名单已清空' });
              wx.showToast({ title: '已清空', icon: 'success' });
            } else {
              wx.showToast({ title: (res && res.msg) || '清空失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '网络异常，请重试', icon: 'none' });
          });
        }
      }
    });
  }
});
