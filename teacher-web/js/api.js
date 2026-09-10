// 教师端 Web -> 云函数调用封装
// 通过「腾讯云 CloudBase HTTP 网关」以普通 HTTPS POST 调用 teacher 云函数。
// 不使用云 SDK，不依赖云端登录态；身份校验由 teacher 云函数按 账号密码 -> token 完成。
// 前置条件：网关「跨域设置」中已授权页面来源域名（否则浏览器会拦截跨域请求）。
(function () {
  const CFG = window.TEACHER_CONFIG || {};

  function gatewayUrl() {
    const url = CFG.gatewayUrl || (new URLSearchParams(location.search).get('api') || '');
    if (!url) throw new Error('缺少网关地址：请在 config.js 填写 gatewayUrl');
    return url;
  }

  async function callTeacher(action, payload) {
    const token = localStorage.getItem(CFG.tokenKey || 'hfjh_teacher_token') || '';
    const data = Object.assign({}, payload || {}, { action, token });
    const url = gatewayUrl();
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      // 浏览器层失败：跨域被拦、网络不通，或首次访问尚未通过网关的「页面访问提示」
      const err = new Error('无法连接服务器');
      err.code = 'NETWORK';
      err.gateway = url;
      throw err;
    }
    let result;
    try {
      result = await res.json();
    } catch (e) {
      result = { ok: false, code: 'BAD_RESPONSE', msg: '服务返回异常（HTTP ' + res.status + '）' };
    }
    if (result && result.ok === false && result.code === 'UNAUTHORIZED') {
      localStorage.removeItem(CFG.tokenKey || 'hfjh_teacher_token');
      localStorage.removeItem(CFG.teacherKey || 'hfjh_teacher_info');
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
    listStudents(filter) {
      return callTeacher('student.list', filter || {});
    },
    updateStudent(payload) {
      return callTeacher('student.update', payload);
    },
    createStudent(payload) {
      return callTeacher('student.create', payload);
    },
    importStudents(payload) {
      return callTeacher('student.import', payload);
    },
    deleteStudent(docId) {
      return callTeacher('student.delete', { doc_id: docId });
    },
    adoptStudent(payload) {
      return callTeacher('student.adopt', payload);
    },
    studentDetail(docId) {
      return callTeacher('student.detail', { doc_id: docId });
    },
    // 教师备注（仅教师端可见，学生端不可见）
    addNote(docId, content) {
      return callTeacher('note.add', { doc_id: docId, content });
    },
    deleteNote(noteId) {
      return callTeacher('note.delete', { note_id: noteId });
    },
    // 学习记录（按教师可见范围过滤）
    listLearningRecords(filter) {
      return callTeacher('learning.list', filter || {});
    },
    // AI 问答（按教师可见范围过滤）
    listAiQuestions(filter) {
      return callTeacher('ai.questions', filter || {});
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
