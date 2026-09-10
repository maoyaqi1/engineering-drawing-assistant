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

// ---- 学生名册（教师端） ----
// 教师录入的名册存放在 students 集合；学生微信注册信息存放在 users 集合。
// 两条路径完全独立：教师录名册，学生自己注册。
// 匹配 / 判重键 = 学号 + 姓名（不同学校学号可能重复，故不能只按学号判断）。
function normalizeStudentNo(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, '');
}

function rosterKey(studentNo, name) {
  return normalizeStudentNo(studentNo) + '|' + String(name == null ? '' : name).trim();
}

// 已注册学生匹配表：key = 学号|姓名 → users 记录
async function loadRegisteredMap() {
  const res = await db.collection('users').where({ role: 'student' }).limit(1000).get();
  const map = new Map();
  res.data.forEach((u) => {
    const no = normalizeStudentNo(u.student_id);
    const name = String(u.name || '').trim();
    if (!no || !name) return;
    map.set(rosterKey(no, name), u);
  });
  return map;
}

// 名册记录对外结构；registered 由与 users 的匹配结果决定
function publicRosterStudent(s, matchedUser) {
  return {
    id: s._id,
    school: s.school || '',
    class_name: s.class_name || '',
    name: s.name || '',
    student_no: s.student_no || '',
    owner_teacher_id: s.owner_teacher_id || '',
    owner_teacher_name: s.owner_teacher_name || '',
    registered: !!matchedUser,
    registered_at: matchedUser ? (matchedUser.created_at || '') : '',
    last_login_at: matchedUser ? (matchedUser.last_login_at || '') : ''
  };
}

function buildRosterRecord(row, teacher) {
  return {
    school: String(row.school || '').trim(),
    class_name: String(row.class_name || '').trim(),
    name: String(row.name || '').trim(),
    student_no: normalizeStudentNo(row.student_no),
    owner_teacher_id: teacher ? teacher._id : '',
    owner_teacher_name: teacher ? (teacher.name || teacher.username || '') : '',
    source: 'teacher',
    created_at: now(),
    updated_at: now()
  };
}

// ---- AI 教师提问权限（roster 学号白名单）----
// 名册中的学生即为系统已录入学号的学生，自动获得 AI 教师提问权限。
async function grantAiAccess(studentNo) {
  const no = normalizeStudentNo(studentNo);
  if (!no) return false;
  try {
    const cnt = await db.collection('roster').where({ student_id: no }).count();
    if (cnt.total > 0) return false;
    await db.collection('roster').add({
      data: { student_id: no, source: 'teacher_roster', created_at: now() }
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function revokeAiAccess(studentNo) {
  const no = normalizeStudentNo(studentNo);
  if (!no) return 0;
  try {
    const res = await db.collection('roster').where({ student_id: no }).get();
    let removed = 0;
    for (const r of res.data) {
      await db.collection('roster').doc(r._id).remove();
      removed++;
    }
    return removed;
  } catch (e) {
    return 0;
  }
}

// 未入册的自主注册学生（仅超级管理员可见）：已用微信注册、但不在任何教师名册中的学生
async function listRegisteredStudents(event, me) {
  if (!isSuper(me)) throw makeError('FORBIDDEN', 403, '仅超级管理员可查看未入册的自主注册学生');
  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const school = String((event && event.school) || '').trim();

  const [usersRes, rosterRes] = await Promise.all([
    db.collection('users').where({ role: 'student' }).limit(1000).get(),
    db.collection('students').limit(1000).get().catch(() => ({ data: [] }))
  ]);
  const inRoster = new Set(rosterRes.data.map((s) => rosterKey(s.student_no, s.name)));

  let items = usersRes.data
    .filter((u) => u.student_id && u.name && !inRoster.has(rosterKey(u.student_id, u.name)))
    .map((u) => ({
      id: u._id,
      school: u.school || '',
      class_name: u.className || '',
      name: u.name || '',
      student_no: u.student_id || '',
      owner_teacher_id: '',
      owner_teacher_name: '未入册（自主注册）',
      registered: true,
      registered_at: u.created_at || '',
      last_login_at: u.last_login_at || ''
    }))
    .sort((a, b) => String(b.registered_at || '').localeCompare(String(a.registered_at || '')));

  const schools = Array.from(new Set(items.map((s) => s.school).filter(Boolean))).sort();
  if (school) items = items.filter((s) => s.school === school);
  if (keyword) {
    items = items.filter((s) =>
      s.name.toLowerCase().includes(keyword) || s.student_no.toLowerCase().includes(keyword));
  }

  return {
    ok: true,
    source: 'registered',
    total: items.length,
    summary: { total: items.length, registered: items.length, unregistered: 0 },
    items,
    schools,
    classes: [],
    owners: [],
    is_super: true
  };
}

async function listStudents(event) {
  const me = await requireAuth(event);
  const superUser = isSuper(me);
  const source = String((event && event.source) || 'roster').trim();
  if (source === 'registered') return await listRegisteredStudents(event, me);

  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const school = String((event && event.school) || '').trim();
  const className = String((event && event.class_name) || '').trim();
  const regFilter = String((event && event.registered) || '').trim(); // '' | 'yes' | 'no'
  const ownerFilter = String((event && event.owner_teacher_id) || '').trim(); // 仅超级管理员有效

  const rosterRes = await db.collection('students').limit(1000).get().catch(() => ({ data: [] }));
  const regMap = await loadRegisteredMap();

  // 权限：普通教师只能看自己录入的学生；超级管理员可看全部（可按录入教师筛选）
  let scoped = rosterRes.data;
  if (!superUser) scoped = scoped.filter((s) => s.owner_teacher_id === me._id);
  else if (ownerFilter) scoped = scoped.filter((s) => s.owner_teacher_id === ownerFilter);

  const all = scoped
    .map((s) => publicRosterStudent(s, regMap.get(rosterKey(s.student_no, s.name))))
    .sort((a, b) => String(b.registered_at || '').localeCompare(String(a.registered_at || '')) ||
      String(a.student_no).localeCompare(String(b.student_no)));

  const schools = Array.from(new Set(all.map((s) => s.school).filter(Boolean))).sort();
  const classes = Array.from(new Set(all.map((s) => s.class_name).filter(Boolean))).sort();
  const owners = superUser
    ? Array.from(new Map(all.filter((s) => s.owner_teacher_id)
        .map((s) => [s.owner_teacher_id, s.owner_teacher_name || s.owner_teacher_id])).entries())
        .map(([id, name]) => ({ id, name }))
    : [];

  let items = all;
  if (school) items = items.filter((s) => s.school === school);
  if (className) items = items.filter((s) => s.class_name === className);
  if (regFilter === 'yes') items = items.filter((s) => s.registered);
  if (regFilter === 'no') items = items.filter((s) => !s.registered);
  if (keyword) {
    items = items.filter((s) =>
      s.name.toLowerCase().includes(keyword) || s.student_no.toLowerCase().includes(keyword));
  }

  const summary = {
    total: all.length,
    registered: all.filter((s) => s.registered).length,
    unregistered: all.filter((s) => !s.registered).length
  };

  return { ok: true, source: 'roster', total: items.length, summary, items, schools, classes, owners, is_super: superUser };
}

async function updateStudent(event) {
  const me = await requireAuth(event);
  const docId = String((event && event.doc_id) || '');
  if (!docId) throw makeError('MISSING_ID', 400, '缺少学生记录 ID');

  const target = await db.collection('students').doc(docId).get().catch(() => null);
  if (!target || !target.data) throw makeError('NOT_FOUND', 404, '名册中没有该学生');
  const current = target.data;
  if (!isSuper(me) && current.owner_teacher_id !== me._id) {
    throw makeError('FORBIDDEN', 403, '只能修改自己录入的学生');
  }

  const patch = { updated_at: now() };
  if (event.class_name !== undefined) patch.class_name = String(event.class_name).trim();
  if (event.name !== undefined) patch.name = String(event.name).trim();
  if (event.school !== undefined) patch.school = String(event.school).trim();
  if (event.student_no !== undefined) patch.student_no = normalizeStudentNo(event.student_no);
  if (Object.keys(patch).length <= 1) throw makeError('NO_CHANGE', 400, '没有需要更新的内容');

  // 判重键 = 学号 + 姓名（不同学校学号可能重复，故不能只按学号）
  const nextNo = patch.student_no !== undefined ? patch.student_no : current.student_no;
  const nextName = patch.name !== undefined ? patch.name : current.name;
  if (!nextNo || !nextName) throw makeError('MISSING_FIELDS', 400, '学号和姓名不能为空');
  const key = rosterKey(nextNo, nextName);
  const others = await db.collection('students').limit(1000).get();
  const dup = others.data.find((s) => s._id !== docId && rosterKey(s.student_no, s.name) === key);
  if (dup) throw makeError('DUPLICATE_STUDENT', 409, '名册中已存在同学号同姓名的学生');

  await db.collection('students').doc(docId).update({ data: patch });
  // 学号变更时同步 AI 白名单（旧学号撤销、新学号开通）
  if (patch.student_no !== undefined && normalizeStudentNo(current.student_no) !== patch.student_no) {
    await revokeAiAccess(current.student_no);
    await grantAiAccess(patch.student_no);
  }
  const updated = Object.assign({ _id: docId }, current, patch);
  const regMap = await loadRegisteredMap();
  return { ok: true, student: publicRosterStudent(updated, regMap.get(rosterKey(updated.student_no, updated.name))) };
}

// 从名册中删除一条学生记录
async function deleteStudent(event) {
  const me = await requireAuth(event);
  const docId = String((event && event.doc_id) || '');
  if (!docId) throw makeError('MISSING_ID', 400, '缺少学生记录 ID');
  const target = await db.collection('students').doc(docId).get().catch(() => null);
  if (!target || !target.data) throw makeError('NOT_FOUND', 404, '名册中没有该学生');
  if (!isSuper(me) && target.data.owner_teacher_id !== me._id) {
    throw makeError('FORBIDDEN', 403, '只能移除自己录入的学生');
  }
  await revokeAiAccess(target.data.student_no);
  await db.collection('students').doc(docId).remove();
  return { ok: true };
}

// 把一名「未入册的已注册学生」收进当前教师的名册，并指定班级
async function adoptStudent(event) {
  const me = await requireAuth(event);
  const userId = String((event && event.user_id) || '');
  const className = String((event && event.class_name) || '').trim();
  if (!userId) throw makeError('MISSING_ID', 400, '缺少学生记录 ID');

  const userRes = await db.collection('users').doc(userId).get().catch(() => null);
  if (!userRes || !userRes.data) throw makeError('NOT_FOUND', 404, '学生不存在');
  const u = userRes.data;
  const no = normalizeStudentNo(u.student_id);
  const name = String(u.name || '').trim();
  if (!no || !name) throw makeError('INCOMPLETE', 400, '该学生尚未完成实名注册');

  const all = await db.collection('students').limit(1000).get();
  if (all.data.some((s) => rosterKey(s.student_no, s.name) === rosterKey(no, name))) {
    throw makeError('ALREADY_IN_ROSTER', 409, '该学生已在名册中');
  }

  const record = buildRosterRecord({
    school: u.school,
    class_name: className,
    name,
    student_no: no
  }, me);
  const added = await db.collection('students').add({ data: record });
  await grantAiAccess(no);
  const updated = Object.assign({ _id: added._id }, record);
  const regMap = await loadRegisteredMap();
  return { ok: true, student: publicRosterStudent(updated, regMap.get(rosterKey(no, name))) };
}

// 某名册学生的学习行为事件流（学习轨迹 / 章节进度用）
async function studentRecords(event) {
  const me = await requireAuth(event);
  const docId = String((event && event.doc_id) || '');
  if (!docId) throw makeError('MISSING_ID', 400, '缺少学生记录 ID');
  const limit = Math.min(200, Math.max(1, Number((event && event.limit) || 100)));

  const rosterDoc = await db.collection('students').doc(docId).get().catch(() => null);
  if (!rosterDoc || !rosterDoc.data) throw makeError('NOT_FOUND', 404, '名册中没有该学生');
  const s = rosterDoc.data;
  if (!isSuper(me) && s.owner_teacher_id !== me._id) {
    throw makeError('FORBIDDEN', 403, '只能查看自己录入的学生');
  }

  const regMap = await loadRegisteredMap();
  const u = regMap.get(rosterKey(s.student_no, s.name));
  if (!u) return { ok: true, registered: false, records: [] };

  // 按 openid 取该学生事件（避免 where+orderBy 复合索引要求，改在内存排序）
  const res = await db.collection('learning_records')
    .where({ openid: u.openid })
    .limit(200)
    .get()
    .catch(() => ({ data: [] }));

  const records = res.data
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map((r) => ({
      id: r._id,
      event_type: r.event_type || '',
      chapter_id: r.chapter_id || '',
      chapter_name: r.chapter_name || '',
      knowledge_point_id: r.knowledge_point_id || '',
      page: r.page || '',
      duration: r.duration || 0,
      created_at: r.created_at || ''
    }));

  return { ok: true, registered: true, records };
}

async function createStudent(event) {
  const me = await requireAuth(event);
  const row = {
    school: event && event.school,
    class_name: event && event.class_name,
    name: event && event.name,
    student_no: (event && (event.student_no || event.student_id)) || ''
  };
  if (!String(row.school || '').trim()) throw makeError('MISSING_SCHOOL', 400, '请填写学校');
  if (!String(row.name || '').trim()) throw makeError('MISSING_NAME', 400, '请填写姓名');
  if (!normalizeStudentNo(row.student_no)) throw makeError('MISSING_STUDENT_NO', 400, '请填写学号');

  // 判重键 = 学号 + 姓名
  const key = rosterKey(row.student_no, row.name);
  const all = await db.collection('students').limit(1000).get();
  if (all.data.some((s) => rosterKey(s.student_no, s.name) === key)) {
    throw makeError('DUPLICATE_STUDENT', 409, '名册中已存在同学号同姓名的学生：' + normalizeStudentNo(row.student_no));
  }

  const record = buildRosterRecord(row, me);
  const added = await db.collection('students').add({ data: record });
  await grantAiAccess(record.student_no);
  return { ok: true, student: publicRosterStudent(Object.assign({ _id: added._id }, record), null) };
}

// 批量导入：mode = 'validate'（预览校验，不写库）| 'commit'（正式写入）
async function importStudents(event) {
  const me = await requireAuth(event);
  const mode = String((event && event.mode) || 'validate');
  const rows = Array.isArray(event && event.rows) ? event.rows : [];
  if (!rows.length) throw makeError('EMPTY_ROWS', 400, '没有可导入的数据');
  if (rows.length > 1000) throw makeError('TOO_MANY_ROWS', 400, '单次最多导入 1000 条');

  // 名册中已有记录：判重键 = 学号 + 姓名
  const existing = await db.collection('students').limit(1000).get();
  const existSet = new Set(
    existing.data.map((s) => rosterKey(s.student_no, s.name)).filter((k) => k !== '|'));

  const errors = [];
  const valid = [];
  const seen = new Set();
  let missing = 0;
  let duplicate = 0;

  rows.forEach((row, index) => {
    const line = index + 2; // 第 1 行是表头
    const no = normalizeStudentNo(row && (row.student_no || row.student_id));
    const name = String((row && row.name) || '').trim();
    const school = String((row && row.school) || '').trim();

    if (!no) { errors.push({ line, field: '学号', reason: '学号为空' }); missing++; return; }
    if (!name) { errors.push({ line, field: '姓名', reason: '姓名为空' }); missing++; return; }
    if (!school) { errors.push({ line, field: '学校', reason: '学校为空' }); missing++; return; }

    const key = rosterKey(no, name);
    if (seen.has(key)) {
      errors.push({ line, field: '学号+姓名', reason: '本次导入中重复：' + no + ' ' + name });
      duplicate++; return;
    }
    if (existSet.has(key)) {
      errors.push({ line, field: '学号+姓名', reason: '名册中已存在：' + no + ' ' + name });
      duplicate++; return;
    }

    seen.add(key);
    valid.push({
      line,
      school,
      class_name: String((row && row.class_name) || '').trim(),
      name,
      student_no: no
    });
  });

  const summary = { total: rows.length, valid: valid.length, missing, duplicate, invalid: errors.length };

  if (mode !== 'commit') {
    return { ok: true, mode: 'validate', summary, errors: errors.slice(0, 100), preview: valid.slice(0, 50) };
  }

  let added = 0;
  for (const r of valid) {
    await db.collection('students').add({ data: buildRosterRecord(r, me) });
    await grantAiAccess(r.student_no);
    added++;
  }
  return { ok: true, mode: 'commit', added, summary, errors: errors.slice(0, 100) };
}

// 学生详情：基本信息 + 核心统计 + 章节进度 + 学习轨迹 + AI 问答
async function studentDetail(event) {
  const me = await requireAuth(event);
  const docId = String((event && event.doc_id) || '');
  if (!docId) throw makeError('MISSING_ID', 400, '缺少学生记录 ID');

  const rosterDoc = await db.collection('students').doc(docId).get().catch(() => null);
  if (!rosterDoc || !rosterDoc.data) throw makeError('NOT_FOUND', 404, '名册中没有该学生');
  const s = rosterDoc.data;
  if (!isSuper(me) && s.owner_teacher_id !== me._id) {
    throw makeError('FORBIDDEN', 403, '只能查看自己录入的学生');
  }

  const regMap = await loadRegisteredMap();
  const u = regMap.get(rosterKey(s.student_no, s.name));
  const info = publicRosterStudent(Object.assign({ _id: docId }, s), u);

  if (!u) {
    return {
      ok: true, student: info, registered: false,
      stats: { total_duration: 0, session_count: 0, ai_count: 0, event_count: 0 },
      chapters: [], records: [], ai: []
    };
  }

  const openid = u.openid;

  const sesRes = await db.collection('learning_sessions')
    .where({ openid }).limit(1000).get().catch(() => ({ data: [] }));
  const totalDuration = sesRes.data.reduce((sum, x) => sum + (Number(x.duration) || 0), 0);
  const sessionCount = sesRes.data.filter((x) => x.is_valid).length;

  const recRes = await db.collection('learning_records')
    .where({ openid }).limit(1000).get().catch(() => ({ data: [] }));
  const recs = recRes.data
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const chapterMap = new Map();
  recs.forEach((r) => {
    const cid = r.chapter_id;
    if (!cid || (r.event_type !== 'chapter_enter' && r.event_type !== 'chapter_exit')) return;
    if (!chapterMap.has(cid)) {
      chapterMap.set(cid, { chapter_id: cid, chapter_name: r.chapter_name || cid, visits: 0, duration: 0, last_at: '' });
    }
    const c = chapterMap.get(cid);
    if (r.event_type === 'chapter_enter') c.visits += 1;
    if (r.event_type === 'chapter_exit') c.duration += Number(r.duration) || 0;
    if (String(r.created_at) > c.last_at) c.last_at = r.created_at;
  });
  const chapters = Array.from(chapterMap.values())
    .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));

  const convRes = await db.collection('ai_conversations')
    .where({ openid }).limit(100).get().catch(() => ({ data: [] }));
  const convIds = convRes.data
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20)
    .map((c) => c._id);

  let ai = [];
  if (convIds.length) {
    const msgRes = await db.collection('ai_messages')
      .where({ conversation_id: db.command.in(convIds) })
      .limit(1000).get().catch(() => ({ data: [] }));
    const byConv = new Map();
    msgRes.data.forEach((m) => {
      if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []);
      byConv.get(m.conversation_id).push(m);
    });
    byConv.forEach((list) => {
      const sorted = list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      for (let i = 0; i < sorted.length; i += 1) {
        if (sorted[i].role !== 'user') continue;
        const next = sorted[i + 1];
        ai.push({
          id: sorted[i]._id,
          question: sorted[i].content || '',
          answer: (next && next.role === 'assistant') ? (next.content || '') : '',
          knowledge_point_id: sorted[i].knowledge_point || '',
          created_at: sorted[i].created_at || ''
        });
      }
    });
    ai.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  return {
    ok: true,
    student: info,
    registered: true,
    stats: {
      total_duration: totalDuration,
      session_count: sessionCount,
      ai_count: ai.length,
      event_count: recs.length
    },
    chapters,
    records: recs.slice(0, 100).map((r) => ({
      id: r._id,
      event_type: r.event_type || '',
      chapter_id: r.chapter_id || '',
      chapter_name: r.chapter_name || '',
      knowledge_point_id: r.knowledge_point_id || '',
      duration: r.duration || 0,
      created_at: r.created_at || ''
    })),
    ai: ai.slice(0, 50)
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
    else if (action === 'student.list') result = await listStudents(input);
    else if (action === 'student.update') result = await updateStudent(input);
    else if (action === 'student.create') result = await createStudent(input);
    else if (action === 'student.import') result = await importStudents(input);
    else if (action === 'student.delete') result = await deleteStudent(input);
    else if (action === 'student.adopt') result = await adoptStudent(input);
    else if (action === 'student.records') result = await studentRecords(input);
    else if (action === 'student.detail') result = await studentDetail(input);
    else result = { ok: false, code: 'UNKNOWN_ACTION', msg: '未知操作' };

    return result;
  } catch (error) {
    return { ok: false, code: error.code || 'SERVER_ERROR', msg: error.message || '服务器错误' };
  }
};
