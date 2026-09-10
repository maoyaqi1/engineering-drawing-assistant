// 教师端 Web -> 云函数调用封装
// 页面部署在「微信云开发静态网站托管」官方域名下，使用微信云开发 Web SDK
//（@cloudbase/js-sdk，全局对象 window.cloudbase）调用 teacher 云函数。
// 官方域名下 callFunction 会被授权，无 auth 报错。
// 教师登录采用「账号 + 密码」换取 token，后续请求凭 token 鉴权。
(function () {
  const CFG = window.TEACHER_CONFIG || {};
  let cloudApp = null;

  function initCloud() {
    if (cloudApp) return cloudApp;
    const cb = window.cloudbase;
    if (!cb || !cb.init) {
      throw new Error('cloudbase Web SDK 未加载：请检查网络能否访问 static.cloudbase.net');
    }
    if (!CFG.env) {
      throw new Error('缺少云开发环境 ID，请在 config.js 填写 env');
    }
    cloudApp = cb.init({ env: CFG.env });
    return cloudApp;
  }

  async function callTeacher(action, payload) {
    const token = localStorage.getItem(CFG.tokenKey || 'hfjh_teacher_token') || '';
    const data = Object.assign({}, payload || {}, { action, token });
    const res = await initCloud().callFunction({
      name: CFG.cloudFunction || 'teacher',
      data: data
    });
    const result = (res && res.result) || {};
    if (result && result.ok === false) {
      if (result.code === 'UNAUTHORIZED') {
        localStorage.removeItem(CFG.tokenKey || 'hfjh_teacher_token');
        localStorage.removeItem(CFG.teacherKey || 'hfjh_teacher_info');
      }
    }
    return result;
  }

  const api = {
    login(username, password) {
      return callTeacher('login', { username, password });
    },
    logout() {
      return callTeacher('logout', {});
    },
    me() {
      return callTeacher('me', {});
    },
    dashboard() {
      return callTeacher('dashboard', {});
    },
    listTeachers() {
      return callTeacher('teacher.list', {});
    },
    createTeacher(payload) {
      return callTeacher('teacher.create', payload);
    },
    updateTeacher(payload) {
      return callTeacher('teacher.update', payload);
    },
    deleteTeacher(teacherId) {
      return callTeacher('teacher.delete', { teacher_id: teacherId });
    }
  };

  window.TeacherApi = api;
})();
