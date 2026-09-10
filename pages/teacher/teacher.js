const TeacherApi = require('../../utils/teacher-api.js');

const TOKEN_KEY = 'hfjh_teacher_token';
const TEACHER_KEY = 'hfjh_teacher_info';

Page({
  data: {
    loggedIn: false,
    loading: false,
    error: '',
    username: '',
    password: '',
    teacher: null,
    isSuper: false,
    // 当前页 view
    view: 'dashboard',
    navItems: [
      { key: 'dashboard', label: '驾驶舱' },
      { key: 'students', label: '学生' },
      { key: 'plp', label: '点线面' },
      { key: 'ai', label: 'AI 教师' },
      { key: 'teachers', label: '教师管理' },
      { key: 'settings', label: '设置' }
    ],
    // 驾驶舱
    dash: null,
    // 教师管理
    teachers: [],
    // 输入弹层
    promptVisible: false,
    promptTitle: '',
    promptValue: ''
  },

  onLoad() {
    const token = wx.getStorageSync(TOKEN_KEY);
    const teacher = wx.getStorageSync(TEACHER_KEY);
    if (token && teacher) {
      this.setData({ loggedIn: true, teacher, isSuper: teacher.role === 'super_admin' });
      this.loadDashboard();
      this.loadTeachers();
    }
  },

  onUsername(e) { this.setData({ username: e.detail.value, error: '' }); },
  onPassword(e) { this.setData({ password: e.detail.value, error: '' }); },

  async doLogin() {
    if (this.data.loading) return;
    const username = (this.data.username || '').trim();
    const password = this.data.password;
    if (!username || !password) {
      this.setData({ error: '请输入账号和密码' });
      return;
    }
    this.setData({ loading: true, error: '' });
    const res = await TeacherApi.login(username, password);
    if (res && res.ok && res.token) {
      wx.setStorageSync(TOKEN_KEY, res.token);
      wx.setStorageSync(TEACHER_KEY, res.teacher);
      this.setData({
        loading: false,
        loggedIn: true,
        password: '',
        teacher: res.teacher,
        isSuper: res.teacher.role === 'super_admin',
        view: 'dashboard'
      });
      this.loadDashboard();
      this.loadTeachers();
    } else {
      this.setData({ loading: false, error: (res && res.msg) || '登录失败，请重试' });
    }
  },

  doLogout() {
    const token = wx.getStorageSync(TOKEN_KEY);
    const finish = () => {
      wx.removeStorageSync(TOKEN_KEY);
      wx.removeStorageSync(TEACHER_KEY);
      this.setData({ loggedIn: false, teacher: null, isSuper: false, teachers: [], dash: null });
    };
    if (token) TeacherApi.logout(token).then(() => finish()).catch(() => finish());
    else finish();
  },

  switchView(e) {
    const view = e.currentTarget.dataset.view;
    this.setData({ view });
    if (view === 'dashboard') this.loadDashboard();
    if (view === 'teachers' && this.data.isSuper) this.loadTeachers();
  },

  async loadDashboard() {
    const token = wx.getStorageSync(TOKEN_KEY);
    if (!token) return;
    const res = await TeacherApi.dashboard(token);
    if (res && res.ok) {
      this.setData({ dash: res });
    }
  },

  async loadTeachers() {
    const token = wx.getStorageSync(TOKEN_KEY);
    if (!token) return;
    const res = await TeacherApi.listTeachers(token);
    if (res && res.ok) {
      this.setData({ teachers: res.items || [] });
    } else if (res && res.code === 'UNAUTHORIZED') {
      wx.removeStorageSync(TOKEN_KEY);
      wx.removeStorageSync(TEACHER_KEY);
      this.setData({ loggedIn: false, teacher: null, isSuper: false, teachers: [], error: '登录已过期，请重新登录' });
    } else {
      wx.showToast({ title: (res && res.msg) || '加载失败', icon: 'none' });
    }
  },

  // ---- 输入弹层 ----
  showPrompt(title) {
    this.setData({ promptVisible: true, promptTitle: title, promptValue: '' });
  },
  onPromptInput(e) { this.setData({ promptValue: e.detail.value }); },
  cancelPrompt() { this.setData({ promptVisible: false, promptValue: '' }); this._promptResolve(''); },
  confirmPrompt() { this.setData({ promptVisible: false, promptValue: '' }); this._promptResolve(this.data.promptValue); },
  async promptText(title) {
    return new Promise((resolve) => {
      this._promptResolve = resolve;
      this.showPrompt(title);
    });
  },

  async addTeacher() {
    if (!this.data.isSuper) return;
    const token = wx.getStorageSync(TOKEN_KEY);
    const username = await this.promptText('教师登录账号（唯一）');
    if (!username.trim()) return;
    const name = await this.promptText('教师姓名');
    if (!name.trim()) return;
    const password = await this.promptText('初始密码（至少6位）');
    if (!password.trim()) return;
    wx.showLoading({ title: '创建中' });
    const res = await TeacherApi.createTeacher({ username: username.trim(), name: name.trim(), password }, token);
    wx.hideLoading();
    wx.showToast({ title: (res && res.ok) ? '创建成功' : ((res && res.msg) || '创建失败'), icon: 'none' });
    if (res && res.ok) this.loadTeachers();
  },

  async toggleTeacher(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    const next = status === 'active' ? 'inactive' : 'active';
    const token = wx.getStorageSync(TOKEN_KEY);
    wx.showLoading({ title: '更新中' });
    const res = await TeacherApi.updateTeacher({ teacher_id: id, status: next }, token);
    wx.hideLoading();
    wx.showToast({ title: (res && res.ok) ? '已更新' : ((res && res.msg) || '失败'), icon: 'none' });
    if (res && res.ok) this.loadTeachers();
  },

  async resetTeacherPassword(e) {
    const id = e.currentTarget.dataset.id;
    const password = await this.promptText('新密码（至少6位）');
    if (!password.trim()) return;
    const token = wx.getStorageSync(TOKEN_KEY);
    wx.showLoading({ title: '重置中' });
    const res = await TeacherApi.updateTeacher({ teacher_id: id, password }, token);
    wx.hideLoading();
    wx.showToast({ title: (res && res.ok) ? '密码已重置' : ((res && res.msg) || '失败'), icon: 'none' });
    if (res && res.ok) this.loadTeachers();
  },

  async deleteTeacher(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    const conf = await this.confirmBox('删除教师', `确定删除「${name}」吗？`);
    if (!conf) return;
    const token = wx.getStorageSync(TOKEN_KEY);
    wx.showLoading({ title: '删除中' });
    const res = await TeacherApi.deleteTeacher(id, token);
    wx.hideLoading();
    wx.showToast({ title: (res && res.ok) ? '已删除' : ((res && res.msg) || '删除失败'), icon: 'none' });
    if (res && res.ok) this.loadTeachers();
  },

  confirmBox(title, content) {
    return new Promise((resolve) => {
      wx.showModal({ title, content, success: (r) => resolve(!!r.confirm) });
    });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
