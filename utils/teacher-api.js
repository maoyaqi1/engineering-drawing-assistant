// 教师端 -> teacher 云函数调用封装（小程序端）
// 独立于学生端 api.js；调用云函数 teacher，走账号密码 + token 鉴权。

function cloudAvailable() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

function callTeacher(action, payload, token) {
  if (!cloudAvailable()) {
    return Promise.resolve({ ok: false, code: 'NO_CLOUD', msg: '云能力不可用' });
  }
  const data = Object.assign({ action }, payload || {}, { token: token || '' });
  return wx.cloud.callFunction({ name: 'teacher', data })
    .then((res) => res.result || { ok: false, code: 'EMPTY_RESULT', msg: '空响应' })
    .catch((error) => ({ ok: false, code: 'NETWORK', msg: String(error && error.message || error) }));
}

const TeacherApi = {
  login(username, password) {
    return callTeacher('login', { username, password });
  },
  logout(token) {
    return callTeacher('logout', {}, token);
  },
  me(token) {
    return callTeacher('me', {}, token);
  },
  dashboard(token) {
    return callTeacher('dashboard', {}, token);
  },
  listTeachers(token) {
    return callTeacher('teacher.list', {}, token);
  },
  createTeacher(payload, token) {
    return callTeacher('teacher.create', payload, token);
  },
  updateTeacher(payload, token) {
    return callTeacher('teacher.update', payload, token);
  },
  deleteTeacher(teacherId, token) {
    return callTeacher('teacher.delete', { teacher_id: teacherId }, token);
  }
};

module.exports = TeacherApi;
