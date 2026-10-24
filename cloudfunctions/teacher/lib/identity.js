// 教师名册的身份规范化与公开数据适配。
//
// 对应统一需求：IAM-01 / IAM-05 / IAM-07 / TCH-04 / TCH-08 / DATA-04。
// 名册匹配键恒为“规范化学号 + 规范化姓名”；学校不参与匹配。
// 本模块与学生端 api 的规范化实现必须保持同步。
const { db, now } = require('./runtime.js');

function toHalfWidth(value) {
  return String(value == null ? '' : value)
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

function normalizeStudentNo(value) {
  return toHalfWidth(value).trim().replace(/\s+/g, '');
}

function normalizeName(value) {
  return toHalfWidth(value).trim().replace(/\s+/g, ' ');
}

function rosterKey(studentNo, name) {
  return normalizeStudentNo(studentNo) + '|' + normalizeName(name);
}

const STUDENT_NO_MIN = 4;
const STUDENT_NO_MAX = 20;
const STUDENT_NAME_MAX = 20;

function validateStudentIdentity(studentNo, name) {
  const normalizedNo = normalizeStudentNo(studentNo);
  const normalizedName = normalizeName(name);
  if (!normalizedNo) return { code: 'MISSING_STUDENT_NO', msg: '请填写学号' };
  if (!/^[0-9]+$/.test(normalizedNo)) {
    return {
      code: 'STUDENT_NO_NOT_NUMERIC',
      msg: '学号必须是纯数字（当前为「' + normalizedNo + '」）；请检查是否把姓名填到了学号栏'
    };
  }
  if (normalizedNo.length < STUDENT_NO_MIN || normalizedNo.length > STUDENT_NO_MAX) {
    return {
      code: 'STUDENT_NO_LENGTH',
      msg: '学号位数应为 ' + STUDENT_NO_MIN + '–' + STUDENT_NO_MAX + ' 位（当前 ' + normalizedNo.length + ' 位）'
    };
  }
  if (!normalizedName) return { code: 'MISSING_NAME', msg: '请填写姓名' };
  if (/[0-9]/.test(normalizedName)) {
    return {
      code: 'NAME_HAS_DIGIT',
      msg: '姓名不能包含数字（当前为「' + normalizedName + '」）；请检查是否把学号填到了姓名栏'
    };
  }
  if (normalizedName.length > STUDENT_NAME_MAX) {
    return { code: 'NAME_TOO_LONG', msg: '姓名过长（最多 ' + STUDENT_NAME_MAX + ' 个字符）' };
  }
  return null;
}

async function loadRegisteredMap() {
  const result = await db.collection('users').where({ role: 'student' }).limit(1000).get();
  const map = new Map();
  result.data.forEach((user) => {
    const studentNo = normalizeStudentNo(user.student_id);
    const name = normalizeName(user.name);
    if (!studentNo || !name) return;
    map.set(rosterKey(studentNo, name), user);
  });
  return map;
}

function publicRosterStudent(student, matchedUser) {
  return {
    id: student._id,
    school: student.school || '',
    class_name: student.class_name || '',
    class_id: student.class_id || '',
    name: student.name || '',
    student_no: student.student_no || '',
    owner_teacher_id: student.owner_teacher_id || '',
    owner_teacher_name: student.owner_teacher_name || '',
    registered: !!matchedUser,
    registered_at: matchedUser ? (matchedUser.created_at || '') : '',
    last_login_at: matchedUser ? (matchedUser.last_login_at || '') : ''
  };
}

function buildRosterRecord(row, teacher) {
  return {
    school: String(row.school || '').trim(),
    class_id: String(row.class_id || '').trim(),
    class_name: String(row.class_name || '').trim(),
    name: normalizeName(row.name),
    student_no: normalizeStudentNo(row.student_no),
    owner_teacher_id: teacher ? teacher._id : '',
    owner_teacher_name: teacher ? (teacher.name || teacher.username || '') : '',
    source: 'teacher',
    created_at: now(),
    updated_at: now()
  };
}

module.exports = {
  toHalfWidth,
  normalizeStudentNo,
  normalizeName,
  rosterKey,
  validateStudentIdentity,
  loadRegisteredMap,
  publicRosterStudent,
  buildRosterRecord
};
