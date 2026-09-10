const cloud = require('wx-server-sdk');
const crypto = require('crypto');

// 教师端云函数：独立于学生端 api，只服务教师 Web 后台。
// 账号密码登录：登录以 username/password 换取 token，后续所有请求凭 token 鉴权。
// 超级管理员（环境变量初始化）可对教师账号增删改查。
// Phase 3+ 实现：登录/登出/鉴权、教师管理；其余（班级/学生/学情）后续 Phase 逐步实现。
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = [
  'teachers',
  'teacher_sessions',
  'schools',
  'classes',
  'students',
  'teacher_classes'
];

// ---- 常量 ----
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

// 超级管理员：从云函数环境变量读取（部署时配置 TEACHER_USERNAME / TEACHER_PASSWORD）
const SUPER_USERNAME = (process.env.TEACHER_USERNAME || 'myq').trim();
const SUPER_PASSWORD = (process.env.TEACHER_PASSWORD || '').trim();

// ---- 工具 ----
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

function normalizeUsername(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function publicTeacher(t) {
  return {
    id: t._id,
    username: t.username || '',
    name: t.name,
    role: t.role,
    schoolId: t.schoolId || '',
    schoolName: t.schoolName || '',
    status: t.status,
    createdAt: t.created_at,
    lastLoginAt: t.last_login_at || ''
  };
}

function isSuper(teacher) {
  return teacher && teacher.role === 'super_admin' && teacher.status === 'active';
}

// ---- collection 初始化 ----
async function ensureCollections() {
  await Promise.all(COLLECTIONS.map((name) => db.createCollection(name).catch(() => null)));
}

// 确保超级管理员存在（幂等）。从环境变量读取，仅首次创建；已存在则不覆盖。
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
    const res = await db.collection('teachers').doc(id).get();
    return res.data ? Object.assign({ _id: id }, res.data) : null;
  } catch (e) {
    return null;
  }
}

// ---- 鉴权 ----
async function authByToken(token) {
  if (!token) return null;
  const res = await db.collection('teacher_sessions').where({ token }).limit(1).get();
  const session = res.data[0];
  if (!session) return null;
  if (session.expires_at < nowMs()) return null;
  const teacher = await getTeacherById(session.teacher_id);
  if (!teacher || teacher.status !== 'active') return null;
  return teacher;
}

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

// ---- 数据统计工具 ----
function dayKey(ms) {
  // 按本地日期(Asia/Shanghai 由 UTC+8)生成 YYYY-MM-DD
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoISO(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchAll(collection, query) {
  // 分批拉取（云开发单次 100 条上限）
  const MAX = 100;
  const result = [];
  let offset = 0;
  const safeQuery = query || db.collection(collection);
  while (true) {
    const batch = await (typeof safeQuery.skip === 'function'
      ? safeQuery.skip(offset).limit(MAX).get()
      : db.collection(collection).skip(offset).limit(MAX).get());
    result.push(...batch.data);
    if (batch.data.length < MAX) break;
    offset += MAX;
  }
  return result;
}

// 从 users 表中统计学生
async function countStudents() {
  const res = await db.collection('users').where({ role: 'student' }).count();
  return res.total;
}

// ---- 登录 / 登出 / 身份 ----
async function login(event) {
  const username = normalizeUsername((event && event.username) || '');
  const password = String((event && event.password) || '');
  if (!username || !password) throw makeError('MISSING_CREDENTIALS', 400, '请输入账号和密码');
  const res = await db.collection('teachers').where({ username }).limit(1).get();
  const teacher = res.data[0];
  if (!teacher) throw makeError('BAD_CREDENTIALS', 401, '账号或密码错误');
  if (teacher.status !== 'active') throw makeError('ACCOUNT_DISABLED', 403, '账号已停用');
  const hash = await hashPassword(password, teacher.salt);
  if (hash !== teacher.password_hash) throw makeError('BAD_CREDENTIALS', 401, '账号或密码错误');

  const token = makeToken();
  const expiresAt = nowMs() + TOKEN_TTL_MS;
  await db.collection('teacher_sessions').add({ data: {
    teacher_id: teacher._id,
    token,
    expires_at: expiresAt,
    created_at: nowMs()
  }});
  await db.collection('teachers').doc(teacher._id).update({ data: { last_login_at: now() } }).catch(() => null);
  return { ok: true, token, expires_at: expiresAt, teacher: publicTeacher(teacher) };
}

async function logout(event) {
  const token = (event && event.token) || '';
  if (token) await db.collection('teacher_sessions').where({ token }).remove().catch(() => null);
  return { ok: true };
}

async function me(event) {
  const teacher = await requireAuth(event);
  return { ok: true, teacher: publicTeacher(teacher) };
}

// ---- 超级管理员：教师账号管理 ----
async function listTeachers(event) {
  await requireSuper(event);
  const res = await db.collection('teachers').orderBy('created_at', 'desc').limit(100).get();
  return { ok: true, items: res.data.map((t) => publicTeacher(t)) };
}

async function createTeacher(event) {
  await requireSuper(event);
  const username = normalizeUsername((event && event.username) || '');
  const password = String((event && event.password) || '');
  const name = String((event && event.name) || '').trim();
  const schoolName = String((event && event.school_name) || '').trim();
  if (!username || !password) throw makeError('MISSING_FIELDS', 400, '请填写账号和初始密码');
  if (password.length < 6) throw makeError('WEAK_PASSWORD', 400, '密码至少 6 位');
  const dup = await db.collection('teachers').where({ username }).limit(1).get();
  if (dup.data.length) throw makeError('USERNAME_TAKEN', 409, '该账号已存在');
  const salt = makeSalt();
  const passwordHash = await hashPassword(password, salt);
  const record = {
    username,
    name: name || username,
    password_hash: passwordHash,
    salt,
    role: 'teacher',
    schoolId: '',
    schoolName,
    status: 'active',
    created_at: now(),
    updated_at: now(),
    last_login_at: ''
  };
  const added = await db.collection('teachers').add({ data: record });
  return { ok: true, teacher: publicTeacher(Object.assign({ _id: added._id }, record)) };
}

async function updateTeacher(event) {
  await requireSuper(event);
  const id = String((event && event.teacher_id) || '');
  if (!id) throw makeError('MISSING_ID', 400, '缺少教师 ID');
  const teacher = await getTeacherById(id);
  if (!teacher) throw makeError('NOT_FOUND', 404, '教师不存在');
  const patch = { updated_at: now() };
  if (event.name !== undefined) patch.name = String(event.name).trim() || teacher.name;
  if (event.school_name !== undefined) patch.schoolName = String(event.school_name).trim();
  if (event.username !== undefined) {
    const username = normalizeUsername(event.username);
    if (!username) throw makeError('BAD_USERNAME', 400, '账号不能为空');
    const dup = await db.collection('teachers').where({ username }).limit(1).get();
    if (dup.data.length && dup.data[0]._id !== id) throw makeError('USERNAME_TAKEN', 409, '该账号已存在');
    patch.username = username;
  }
  if (event.status !== undefined) {
    const status = String(event.status);
    if (!['active', 'inactive'].includes(status)) throw makeError('BAD_STATUS', 400, '无效的状态');
    patch.status = status;
  }
  if (event.password) {
    const password = String(event.password);
    if (password.length < 6) throw makeError('WEAK_PASSWORD', 400, '密码至少 6 位');
    const salt = makeSalt();
    patch.salt = salt;
    patch.password_hash = await hashPassword(password, salt);
  }
  if (teacher.role === 'super_admin' && patch.status === 'inactive') {
    throw makeError('CANNOT_DISABLE_SUPER', 400, '不能停用超级管理员');
  }
  await db.collection('teachers').doc(id).update({ data: patch });
  const updated = await getTeacherById(id);
  return { ok: true, teacher: publicTeacher(updated) };
}

async function deleteTeacher(event) {
  await requireSuper(event);
  const id = String((event && event.teacher_id) || '');
  if (!id) throw makeError('MISSING_ID', 400, '缺少教师 ID');
  const teacher = await getTeacherById(id);
  if (!teacher) throw makeError('NOT_FOUND', 404, '教师不存在');
  if (teacher.role === 'super_admin') throw makeError('CANNOT_DELETE_SUPER', 403, '不能删除超级管理员账号');
  await db.collection('teacher_sessions').where({ teacher_id: id }).remove().catch(() => null);
  await db.collection('teacher_classes').where({ teacher_id: id }).remove().catch(() => null);
  await db.collection('teachers').doc(id).remove();
  return { ok: true };
}

// ---- 教学驾驶舱统计 ----
async function dashboard(event) {
  await requireAuth(event);

  // 学生总数
  const totalStudents = await countStudents();

  // 近 7 天学习会话（learning_sessions 按 created_at 且 is_valid 为真）
  const sevenDaysAgo = daysAgoISO(7);
  const sessions = await fetchAll('learning_sessions',
    db.collection('learning_sessions').where({ created_at: db.command.gte(sevenDaysAgo) }));

  const todayKey = dayKey(Date.now());
  const todaySessions = sessions.filter((s) => dayKey(new Date(s.created_at).getTime()) === todayKey);
  const todayActiveUsers = new Set(todaySessions.map((s) => s.openid || s.user_id)).size;

  // 点线面使用次数：module 属于 point/line/plane
  const plpModules = new Set(['point', 'line', 'plane']);
  const plpToday = todaySessions.filter((s) => plpModules.has(s.module)).length;
  const plpWeek = sessions.filter((s) => plpModules.has(s.module)).length;

  // 近 7 天每日趋势
  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const start = Date.now() - i * 24 * 60 * 60 * 1000;
    const key = dayKey(start);
    const daySessions = sessions.filter((s) => dayKey(new Date(s.created_at).getTime()) === key);
    trend.push({
      date: key.slice(5), // MM-DD
      active: new Set(daySessions.map((s) => s.openid || s.user_id)).size,
      plp: daySessions.filter((s) => plpModules.has(s.module)).length
    });
  }

  // 模块分布（近 7 天）
  const moduleMap = {};
  sessions.forEach((s) => {
    if (!moduleMap[s.module]) moduleMap[s.module] = 0;
    moduleMap[s.module] += 1;
  });
  const moduleDistribution = Object.keys(moduleMap).map((key) => ({ module: key, count: moduleMap[key] }));

  // AI 教师提问（ai_messages 里 role=user 的消息）
  let aiToday = 0;
  let aiWeek = 0;
  try {
    const aiMessages = await fetchAll('ai_messages',
      db.collection('ai_messages').where({ role: 'user', created_at: db.command.gte(sevenDaysAgo) }));
    aiWeek = aiMessages.length;
    aiToday = aiMessages.filter((m) => dayKey(new Date(m.created_at).getTime()) === todayKey).length;
  } catch (e) {
    // ai_messages 可能尚未创建
  }

  return {
    ok: true,
    total_students: totalStudents,
    today_active_students: todayActiveUsers,
    plp_today: plpToday,
    plp_week: plpWeek,
    ai_today: aiToday,
    ai_week: aiWeek,
    trend,
    module_distribution: moduleDistribution
  };
}

// ---- 入口 ----
// 兼容两种调用方式：
// 1) 传统 wx.cloud.callFunction / 小程序 SDK 调用：event 直接是对象。
// 2) HTTP 触发：event 可能是 JSON 字符串、或带 body 的对象、或带 httpMethod 的对象。
function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event === 'string') {
    try { return JSON.parse(event); } catch (e) { return {}; }
  }
  // HTTP 触发常见包装：{ body: '...', httpMethod, ... }
  if (event.body && typeof event.body === 'string') {
    try {
      const parsed = JSON.parse(event.body);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {}
  } else if (event.body && typeof event.body === 'object') {
    return event.body;
  }
  return event;
}

exports.main = async (event) => {
  const input = normalizeEvent(event);
  try {
    await ensureCollections();
    await ensureSuperAdmin();
    const action = (input && input.action) || '';

    let result;
    if (action === 'login') result = await login(input);
    else if (action === 'logout') result = await logout(input);
    else if (action === 'me') result = await me(input);
    else if (action === 'teacher.list') result = await listTeachers(input);
    else if (action === 'teacher.create') result = await createTeacher(input);
    else if (action === 'teacher.update') result = await updateTeacher(input);
    else if (action === 'teacher.delete') result = await deleteTeacher(input);
    else if (action === 'dashboard') result = await dashboard(input);
    else result = { ok: false, code: 'UNKNOWN_ACTION', msg: '未知操作' };

    return result;
  } catch (error) {
    return { ok: false, code: error.code || 'SERVER_ERROR', msg: error.message || '服务器错误' };
  }
};
