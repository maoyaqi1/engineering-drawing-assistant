// 教师名册的身份规范化与公开数据适配。
//
// 对应统一需求：IAM-01 / IAM-05 / IAM-07 / TCH-04 / TCH-08 / DATA-04。
// 名册匹配键恒为“规范化学号 + 规范化姓名”；学校不参与匹配。
// 本模块与学生端 api 的规范化实现必须保持同步。
const { db, now, fetchAll } = require('./runtime.js');

function toHalfWidth(value) {
  // 与学生端使用同一规则：全角 ASCII 转半角、全角空格转普通空格。
  // 两端规则不一致会导致“姓名 + 学号”看起来相同却匹配失败。
  return String(value == null ? '' : value)
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

function normalizeStudentNo(value) {
  // 学号去首尾空白和全部内部空白，但保留数字字符串，不做数值转换。
  return toHalfWidth(value).trim().replace(/\s+/g, '');
}

function normalizeName(value) {
  // 姓名保留单个词间空格，用于兼容少数非中文姓名；连续空白压缩为一个。
  return toHalfWidth(value).trim().replace(/\s+/g, ' ');
}

// 稳定匹配键只由规范化学号和姓名组成；学校是展示字段，不参与准入匹配。
function rosterKey(studentNo, name) {
  return normalizeStudentNo(studentNo) + '|' + normalizeName(name);
}

const STUDENT_NO_MIN = 4;
const STUDENT_NO_MAX = 20;
const STUDENT_NAME_MAX = 20;

function validateStudentIdentity(studentNo, name) {
  // 返回 null 表示通过；否则返回业务 code/msg，不抛异常。
  // 数字规则和长度限制同时用于防止学号/姓名字段互换。
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
  // 注册匹配必须使用完整集合；fetchAll 每页 100 条可靠分页，避免第 1001 个用户消失。
  const users = await fetchAll('users', db.collection('users').where({ role: 'student' }));
  const map = new Map();
  users.forEach((user) => {
    const studentNo = normalizeStudentNo(user.student_id);
    const name = normalizeName(user.name);
    if (!studentNo || !name) return;
    map.set(rosterKey(studentNo, name), user);
  });
  return map;
}

function publicRosterStudent(student, matchedUser) {
  // registered 由 users 集合的“学号 + 姓名”匹配结果派生，不存进 students，
  // 防止名册快照与学生自主注册资料形成第二事实来源。
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
  // 写名册时统一规范化学号和姓名，并写入服务端恢复出的 owner teacher 身份；
  // class_name 只作为 classes 实体的兼容展示快照。
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
