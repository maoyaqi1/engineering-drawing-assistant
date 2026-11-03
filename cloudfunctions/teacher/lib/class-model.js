// 教师端班级领域模型。
//
// 对应统一需求：IAM-07 / IAM-20–IAM-22 / TCH-10–TCH-21 / DATA-03。
// classes 保存班级实体；students.class_id 是唯一权威归属，
// students.class_name 只是与实体名称同步的兼容展示快照。
const {
  db,
  makeError,
  fetchAll,
  getTeacherById,
  isSuper
} = require('./runtime.js');
const { rosterKey } = require('./identity.js');

const CLASS_STATUS_ACTIVE = 'active';
const CLASS_STATUS_ARCHIVED = 'archived';
const CLASS_NAME_MAX = 40;
const CLASS_SCHOOL_MAX = 60;
const CLASS_NOTE_MAX = 200;
const CLASS_BATCH_MAX = 200;

function normalizeClassName(value) {
  // 班级名只做 trim 和连续空白压缩；重复判定还必须同时比较负责人与学校。
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

// 批量成员接口的 ID 输入去空、去重并保持原顺序，防止一次操作重复计数。
function normalizeDocIds(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const output = [];
  const seen = new Set();
  list.forEach((value) => {
    const id = String(value == null ? '' : value).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    output.push(id);
  });
  return output;
}

async function ensureClassCollection() {
  try {
    await db.collection('classes').limit(1).get();
    return 'exists';
  } catch (error) {
    await db.createCollection('classes').catch(() => null);
    return 'created';
  }
}

function publicClass(classDoc, memberStat) {
  // 班级对外投影不包含数据库内部字段；成员统计由已加载学生集合派生。
  const stat = memberStat || { member_count: 0, registered_count: 0 };
  return {
    id: classDoc._id,
    name: classDoc.name || '',
    school: classDoc.school || '',
    status: classDoc.status || CLASS_STATUS_ACTIVE,
    owner_teacher_id: classDoc.owner_teacher_id || '',
    owner_teacher_name: classDoc.owner_teacher_name || '',
    note: classDoc.note || '',
    is_demo: classDoc.is_demo === true,
    created_at: classDoc.created_at || '',
    updated_at: classDoc.updated_at || '',
    member_count: stat.member_count,
    registered_count: stat.registered_count
  };
}

async function getClassById(id) {
  if (!id) return null;
  try {
    const result = await db.collection('classes').doc(id).get();
    return result.data ? Object.assign({ _id: id }, result.data) : null;
  } catch (error) {
    if (error && (error.errCode === -502004 || /not exists/i.test(String(error.message || '')))) {
      return null;
    }
    // 数据库故障不能伪装成“班级不存在”，否则调用方会误判为普通空态。
    throw error;
  }
}

function canManageClass(teacher, classDoc) {
  // 前端只据此显示按钮；真正写操作在 requireOwnClass 中再次由服务端执行。
  return isSuper(teacher) || classDoc.owner_teacher_id === teacher._id;
}

// 超级管理员对教师业务数据只读；恢复已停用班级是唯一由 archiveClass 单独放行的例外。
function requireOwnClass(teacher, classDoc, action) {
  if (classDoc.owner_teacher_id !== teacher._id) {
    throw makeError('FORBIDDEN', 403,
      '只能' + (action || '管理') + '自己负责的班级（超级管理员对教师班级只读）');
  }
}

async function loadAllStudents() {
  // 名单匹配、班级统计和权限候选都要求完整集合，读取失败必须上抛。
  return await fetchAll('students');
}

// 一次遍历学生集合，按 class_id 汇总成员和注册匹配数；未分班学生不创建统计项。
function buildClassStats(students, registeredMap) {
  const stats = new Map();
  students.forEach((student) => {
    const classId = student.class_id || '';
    if (!classId) return;
    if (!stats.has(classId)) stats.set(classId, { member_count: 0, registered_count: 0 });
    const stat = stats.get(classId);
    stat.member_count += 1;
    if (registeredMap.get(rosterKey(student.student_no, student.name))) stat.registered_count += 1;
  });
  return stats;
}

function classMemberScope(students, classDoc) {
  // 班级成员严格限定为该班负责人自己的名册，防止跨教师班级数据混入。
  return students.filter((student) => student.owner_teacher_id === classDoc.owner_teacher_id);
}

function isClassActive(classDoc) {
  return (classDoc.status || CLASS_STATUS_ACTIVE) === CLASS_STATUS_ACTIVE;
}

async function ensureClassOwnerActive(classDoc) {
  if (!classDoc.owner_teacher_id) {
    throw makeError('CLASS_NO_OWNER', 409, '该班没有负责教师，无法恢复：请先由超管指定负责人');
  }
  const owner = await getTeacherById(classDoc.owner_teacher_id);
  if (!owner || owner.status !== 'active') {
    throw makeError('OWNER_INACTIVE', 409, '该班负责教师账号已停用，请先启用教师账号，再恢复班级');
  }
}

function findDuplicateClass(classes, ownerId, name, school, excludeId) {
  return classes.find((classDoc) => classDoc._id !== excludeId
    && classDoc.owner_teacher_id === ownerId
    && isClassActive(classDoc)
    && normalizeClassName(classDoc.name) === normalizeClassName(name)
    && String(classDoc.school || '').trim() === String(school || '').trim()) || null;
}

async function loadTeacherActiveClasses(teacherId) {
  if (!teacherId) return [];
  const classes = await fetchAll('classes');
  return classes.filter((classDoc) => classDoc.owner_teacher_id === teacherId && isClassActive(classDoc));
}

async function resolveClassForTeacher(teacher, className, classId, noClass) {
  // classId 优先于名称；只有 id/名称都无法唯一确定时，才回退到“该教师只有一个
  // active 班级”的兼容逻辑。多个候选不会猜测，返回 null 交由调用方报错。
  if (noClass) return null;
  const ownerId = teacher ? teacher._id : '';
  const classes = await loadTeacherActiveClasses(ownerId);
  if (classId) return classes.find((classDoc) => classDoc._id === classId) || null;
  const wantedName = normalizeClassName(className);
  if (wantedName) {
    const exact = classes.find((classDoc) => normalizeClassName(classDoc.name) === wantedName);
    if (exact) return exact;
  }
  if (classes.length === 1) return classes[0];
  return null;
}

module.exports = {
  CLASS_STATUS_ACTIVE,
  CLASS_STATUS_ARCHIVED,
  CLASS_NAME_MAX,
  CLASS_SCHOOL_MAX,
  CLASS_NOTE_MAX,
  CLASS_BATCH_MAX,
  normalizeClassName,
  normalizeDocIds,
  ensureClassCollection,
  publicClass,
  getClassById,
  canManageClass,
  requireOwnClass,
  loadAllStudents,
  buildClassStats,
  classMemberScope,
  isClassActive,
  ensureClassOwnerActive,
  findDuplicateClass,
  loadTeacherActiveClasses,
  resolveClassForTeacher
};
