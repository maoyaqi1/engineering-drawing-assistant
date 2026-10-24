// 教师云函数的共享运行环境。
//
// 对应统一需求：SYS-04 / SYS-18 / IAM-03 / IAM-19 / DATA-09 / DATA-26。
// 本模块统一拥有云开发初始化、数据库句柄、环境变量、密码哈希、token
// 和分页查询；领域模块不得各自再初始化一套运行时。
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = [
  'teachers',
  'teacher_sessions',
  'schools',
  'classes',
  'students',
  'teacher_classes',
  'teacher_notes',
  'maintenance_logs'
];

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const SUPER_USERNAME = (process.env.TEACHER_USERNAME || 'myq').trim();
const SUPER_PASSWORD = (process.env.TEACHER_PASSWORD || '').trim();
const INTERNAL_OPENIDS = (process.env.INTERNAL_OPENIDS || '')
  .split(/[,，;；\s]+/)
  .map((value) => value.trim())
  .filter(Boolean);

function now() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function makeError(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeUsername(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function publicTeacher(teacher) {
  return {
    id: teacher._id,
    username: teacher.username || '',
    name: teacher.name,
    role: teacher.role,
    schoolId: teacher.schoolId || '',
    schoolName: teacher.schoolName || '',
    status: teacher.status,
    createdAt: teacher.created_at,
    lastLoginAt: teacher.last_login_at || ''
  };
}

function isSuper(teacher) {
  return teacher && teacher.role === 'super_admin' && teacher.status === 'active';
}

async function ensureCollections() {
  await Promise.all(COLLECTIONS.map((name) => db.createCollection(name).catch(() => null)));
}

// 首次启动只创建超级管理员；已有超级管理员时绝不覆盖密码或状态。
async function ensureSuperAdmin() {
  if (!SUPER_PASSWORD) return null;
  const existing = await db.collection('teachers').where({ role: 'super_admin' }).limit(1).get();
  if (existing.data.length) return existing.data[0];
  const salt = makeSalt();
  const passwordHash = await hashPassword(SUPER_PASSWORD, salt);
  const record = {
    username: normalizeUsername(SUPER_USERNAME),
    name: '超级管理员',
    password_hash: passwordHash,
    salt,
    role: 'super_admin',
    schoolId: '',
    schoolName: '',
    status: 'active',
    created_at: now(),
    updated_at: now(),
    last_login_at: ''
  };
  const added = await db.collection('teachers').add({ data: record });
  return Object.assign({ _id: added._id }, record);
}

async function getTeacherById(id) {
  try {
    const result = await db.collection('teachers').doc(id).get();
    return result.data ? Object.assign({ _id: id }, result.data) : null;
  } catch (error) {
    return null;
  }
}

async function authByToken(token) {
  if (!token) return null;
  const result = await db.collection('teacher_sessions').where({ token }).limit(1).get();
  const session = result.data[0];
  if (!session || session.expires_at < nowMs()) return null;
  const teacher = await getTeacherById(session.teacher_id);
  return teacher && teacher.status === 'active' ? teacher : null;
}

// 所有业务 action 都必须通过 token 恢复服务端教师身份。
async function requireAuth(event) {
  const teacher = await authByToken((event && event.token) || '');
  if (!teacher) throw makeError('UNAUTHORIZED', 401, '未登录或登录已过期');
  return teacher;
}

async function requireSuper(event) {
  const teacher = await requireAuth(event);
  if (!isSuper(teacher)) throw makeError('FORBIDDEN', 403, '仅超级管理员可执行此操作');
  return teacher;
}

// 教师端统计统一按北京时间（UTC+8）切日。
function dayKey(ms) {
  const date = new Date(ms + 8 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysAgoISO(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// 云数据库单次查询最多 100 条；这里只负责稳定分页，不改变调用方查询条件。
async function fetchAll(collection, query) {
  const pageSize = 100;
  const result = [];
  let offset = 0;
  const safeQuery = query || db.collection(collection);
  while (true) {
    const batch = await (typeof safeQuery.skip === 'function'
      ? safeQuery.skip(offset).limit(pageSize).get()
      : db.collection(collection).skip(offset).limit(pageSize).get());
    result.push(...batch.data);
    if (batch.data.length < pageSize) break;
    offset += pageSize;
  }
  return result;
}

module.exports = {
  db,
  COLLECTIONS,
  TOKEN_TTL_MS,
  INTERNAL_OPENIDS,
  now,
  nowMs,
  makeError,
  hashPassword,
  makeSalt,
  makeToken,
  normalizeUsername,
  publicTeacher,
  isSuper,
  ensureCollections,
  ensureSuperAdmin,
  getTeacherById,
  authByToken,
  requireAuth,
  requireSuper,
  dayKey,
  daysAgoISO,
  fetchAll
};
