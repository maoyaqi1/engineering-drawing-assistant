const cloud = require('wx-server-sdk');
const crypto = require('crypto');

// 教师端云函数：独立于学生端 api，只服务教师 Web 后台。
// 账号密码登录：登录以 username/password 换取 token，后续所有请求凭 token 鉴权。
// 超级管理员（环境变量初始化）可对教师账号增删改查。
// 已实现：登录/登出/鉴权、教师管理、学生名册与学情（REQ-001）；
// 班级管理按 REQ-002 第一阶段实现（classes 实体 + students.class_id 权威关联 + students.class_name 兼容快照）。
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = [
  'teachers',
  'teacher_sessions',
  'schools',
  'classes',
  'students',
  'teacher_classes',
  'teacher_notes'
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
  // 按北京时间（UTC+8）生成 YYYY-MM-DD
  const d = new Date(ms + 8 * 60 * 60 * 1000);
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

  // ---- 名册与班级概况 ----
  const rosterRes = await db.collection('students').limit(1000).get().catch(() => ({ data: [] }));
  const regMap = await loadRegisteredMap();
  const rosterItems = rosterRes.data.map((s) => {
    const u = regMap.get(rosterKey(s.student_no, s.name));
    return { class_name: s.class_name || '未分班', registered: !!u, openid: u ? u.openid : '' };
  });
  const registeredCount = rosterItems.filter((r) => r.registered).length;

  const classMap = new Map();
  rosterItems.forEach((r) => {
    if (!classMap.has(r.class_name)) {
      classMap.set(r.class_name, { class_name: r.class_name, total: 0, registered: 0, active7: new Set() });
    }
    const c = classMap.get(r.class_name);
    c.total += 1;
    if (r.registered) c.registered += 1;
  });
  const active7Openids = new Set(sessions.map((s) => s.openid).filter(Boolean));
  rosterItems.forEach((r) => {
    if (r.openid && active7Openids.has(r.openid)) {
      const c = classMap.get(r.class_name);
      if (c) c.active7.add(r.openid);
    }
  });
  const classes = Array.from(classMap.values()).map((c) => ({
    class_name: c.class_name,
    total: c.total,
    registered: c.registered,
    unregistered: c.total - c.registered,
    active7: c.active7.size
  })).sort((a, b) => String(a.class_name).localeCompare(String(b.class_name)));

  // ---- 学情提醒（统计规则，非 AI）----
  const alerts = [];
  const unregTotal = rosterItems.length - registeredCount;
  if (unregTotal > 0) {
    alerts.push({ level: 'info', text: '名册中还有 ' + unregTotal + ' 名学生尚未注册微信' });
  }
  const idleCount = rosterItems.filter((r) => r.registered && r.openid && !active7Openids.has(r.openid)).length;
  if (idleCount > 0) {
    alerts.push({ level: 'warn', text: '有 ' + idleCount + ' 名已注册学生最近 7 天没有学习记录' });
  }

  // ---- 本周 AI 提问热点 ----
  let aiHot = [];
  try {
    const aiMsgs = await fetchAll('ai_messages',
      db.collection('ai_messages').where({ role: 'user', created_at: db.command.gte(sevenDaysAgo) }));
    const kpMap2 = new Map();
    aiMsgs.forEach((m) => {
      const k = m.knowledge_point || '（未分类）';
      kpMap2.set(k, (kpMap2.get(k) || 0) + 1);
    });
    aiHot = Array.from(kpMap2.entries())
      .map(([k, n]) => ({ knowledge_point_id: k, count: n }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    if (aiHot.length && aiHot[0].count >= 3) {
      alerts.push({ level: 'info', text: '本周 AI 提问最集中的是「' + aiHot[0].knowledge_point_id + '」（' + aiHot[0].count + ' 次）' });
    }
  } catch (e) {}

  return {
    ok: true,
    total_students: totalStudents,
    roster_total: rosterItems.length,
    registered_count: registeredCount,
    unregistered_count: unregTotal,
    today_active_students: todayActiveUsers,
    plp_today: plpToday,
    plp_week: plpWeek,
    ai_today: aiToday,
    ai_week: aiWeek,
    trend,
    module_distribution: moduleDistribution,
    classes,
    ai_hot: aiHot,
    alerts
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

// 学号与姓名的格式校验（防止「姓名/学号填反」这类录入错误）。
// 学号按字符串校验：允许前导零（0301010…），因此不做数值转换。
const STUDENT_NO_MIN = 4;
const STUDENT_NO_MAX = 20;
const STUDENT_NAME_MAX = 20;

function validateStudentIdentity(studentNo, name) {
  const no = normalizeStudentNo(studentNo);
  const nm = String(name == null ? '' : name).trim();
  if (!no) return { code: 'MISSING_STUDENT_NO', msg: '请填写学号' };
  if (!/^[0-9]+$/.test(no)) {
    return {
      code: 'STUDENT_NO_NOT_NUMERIC',
      msg: '学号必须是纯数字（当前为「' + no + '」）；请检查是否把姓名填到了学号栏'
    };
  }
  if (no.length < STUDENT_NO_MIN || no.length > STUDENT_NO_MAX) {
    return {
      code: 'STUDENT_NO_LENGTH',
      msg: '学号位数应为 ' + STUDENT_NO_MIN + '–' + STUDENT_NO_MAX + ' 位（当前 ' + no.length + ' 位）'
    };
  }
  if (!nm) return { code: 'MISSING_NAME', msg: '请填写姓名' };
  if (/[0-9]/.test(nm)) {
    return {
      code: 'NAME_HAS_DIGIT',
      msg: '姓名不能包含数字（当前为「' + nm + '」）；请检查是否把学号填到了姓名栏'
    };
  }
  if (nm.length > STUDENT_NAME_MAX) {
    return { code: 'NAME_TOO_LONG', msg: '姓名过长（最多 ' + STUDENT_NAME_MAX + ' 个字符）' };
  }
  return null;
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
    class_id: s.class_id || '',
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
    class_id: String(row.class_id || '').trim(),
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

// ---- 学生 ←→ 班级 归并（REQ-003）----
// 学生名册与班级管理合并为一条链路：班级关系只认 classes 实体（students.class_id），
// class_name 始终写成实体名，避免"学生页写的班级名"与"班级页建的班级"各说一套。
// 解析规则：
// 1) 明确给出 class_id → 校验归属后直接使用；
// 2) 给出班级名且与同教师的某个活动班级同名 → 归入该班；
// 3) 名称不一致或为空，但该教师只有一个活动班级 → 归入该班（教师建的那个班）；
// 4) 其他情况 → 保持未分班（class_id 为空），保留原始班级名文本，由界面提示教师处理。
async function loadTeacherActiveClasses(teacherId) {
  if (!teacherId) return [];
  const all = await fetchAll('classes').catch(() => []);
  return all.filter((c) => c.owner_teacher_id === teacherId && isClassActive(c));
}

async function resolveClassForTeacher(teacher, className, classId, noClass) {
  if (noClass) return null; // 显式选择「未分班」：跳过自动归并
  const ownerId = teacher ? teacher._id : '';
  const classes = await loadTeacherActiveClasses(ownerId);
  if (classId) return classes.find((c) => c._id === classId) || null;
  const want = normalizeClassName(className);
  if (want) {
    const exact = classes.find((c) => normalizeClassName(c.name) === want);
    if (exact) return exact;
  }
  if (classes.length === 1) return classes[0];
  return null;
}

// ---- AI 教师提问权限（roster 白名单，键 = 学号 + 姓名）----
// 名册中的学生即为系统已录入的学生，自动获得 AI 教师提问权限。
// 不同学校的学号规则可能相同，因此判重与撤销一律按「学号 + 姓名」，不能只按学号。
async function grantAiAccess(studentNo, name) {
  const no = normalizeStudentNo(studentNo);
  const nm = String(name == null ? '' : name).trim();
  if (!no) return false;
  try {
    const res = await db.collection('roster').where({ student_id: no }).get();
    if (res.data.some((r) => String(r.name || '').trim() === nm)) return false;
    await db.collection('roster').add({
      data: { student_id: no, name: nm, source: 'teacher_roster', created_at: now() }
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function revokeAiAccess(studentNo, name) {
  const no = normalizeStudentNo(studentNo);
  const nm = String(name == null ? '' : name).trim();
  if (!no) return 0;
  try {
    const res = await db.collection('roster').where({ student_id: no }).get();
    let removed = 0;
    for (const r of res.data) {
      const recordName = String(r.name || '').trim();
      // 只撤销「同号同名」；历史记录没有姓名（迁移前的旧数据）按兼容处理一并撤销
      if (recordName && recordName !== nm) continue;
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
      // 白名单以外的人：不属于任何教师，界面显示「无」
      owner_teacher_name: '',
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

  // 候选班级：名册中已出现过的班级去重排序。本视图仅超管可见，可见范围即全部名册，
  // 与「名册学生」视图筛选栏「全部班级」的候选口径一致（同一份数据、同样排序）。
  const classes = Array.from(new Set(rosterRes.data.map((s) => s.class_name).filter(Boolean))).sort();

  return {
    ok: true,
    source: 'registered',
    total: items.length,
    summary: { total: items.length, registered: items.length, unregistered: 0 },
    items,
    schools,
    classes,
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
  // 班级归并：改班级时同样解析到班级实体（class_id 与 class_name 一起写，保持同源）
  if (event.class_id !== undefined || event.class_name !== undefined || event.no_class !== undefined) {
    const owner = await getTeacherById(current.owner_teacher_id) || me;
    const noClass = !!(event && event.no_class);
    const wantedName = noClass ? '' : (event.class_name !== undefined ? event.class_name : current.class_name);
    const cls = await resolveClassForTeacher(owner, wantedName, event.class_id, noClass);
    patch.class_id = cls ? cls._id : '';
    patch.class_name = cls ? cls.name : String(wantedName || '').trim();
  }
  if (event.name !== undefined) patch.name = String(event.name).trim();
  if (event.school !== undefined) patch.school = String(event.school).trim();
  if (event.student_no !== undefined) patch.student_no = normalizeStudentNo(event.student_no);
  if (Object.keys(patch).length <= 1) throw makeError('NO_CHANGE', 400, '没有需要更新的内容');

  // 判重键 = 学号 + 姓名（不同学校学号可能重复，故不能只按学号）
  const nextNo = patch.student_no !== undefined ? patch.student_no : current.student_no;
  const nextName = patch.name !== undefined ? patch.name : current.name;
  if (!nextNo || !nextName) throw makeError('MISSING_FIELDS', 400, '学号和姓名不能为空');
  const badIdentity = validateStudentIdentity(nextNo, nextName);
  if (badIdentity) throw makeError(badIdentity.code, 400, badIdentity.msg);
  const key = rosterKey(nextNo, nextName);
  const others = await db.collection('students').limit(1000).get();
  const dup = others.data.find((s) => s._id !== docId && rosterKey(s.student_no, s.name) === key);
  if (dup) throw makeError('DUPLICATE_STUDENT', 409, '名册中已存在同学号同姓名的学生');

  await db.collection('students').doc(docId).update({ data: patch });
  // 学号或姓名变更时同步 AI 白名单（旧的「学号+姓名」撤销、新的开通）
  const noChanged = patch.student_no !== undefined
    && normalizeStudentNo(current.student_no) !== patch.student_no;
  const nameChanged = patch.name !== undefined && String(current.name || '').trim() !== patch.name;
  if (noChanged || nameChanged) {
    const nextNo = patch.student_no !== undefined ? patch.student_no : current.student_no;
    const nextName = patch.name !== undefined ? patch.name : current.name;
    await revokeAiAccess(current.student_no, current.name);
    await grantAiAccess(nextNo, nextName);
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
  await revokeAiAccess(target.data.student_no, target.data.name);
  await db.collection('students').doc(docId).remove();
  return { ok: true };
}

// ---- 白名单姓名补齐（一次性迁移工具，仅超级管理员）----
// 背景：早期 roster 记录只存学号；白名单改为「学号 + 姓名」后需要补齐姓名，否则跨校同号无法区分。
// 规则：按学号在名册(students)中反查姓名；唯一命中才补；多命中（歧义）或查不到则保持原样，不静默改动。
async function backfillRosterNames(event) {
  await requireSuper(event);
  const dryRun = !(event && event.dry_run === false);

  const [rosterAll, students] = await Promise.all([
    fetchAll('roster').catch(() => []),
    loadAllStudents()
  ]);
  const namesByNo = new Map();
  students.forEach((s) => {
    const no = normalizeStudentNo(s.student_no);
    const nm = String(s.name || '').trim();
    if (!no || !nm) return;
    if (!namesByNo.has(no)) namesByNo.set(no, new Set());
    namesByNo.get(no).add(nm);
  });

  const fillable = [];
  const ambiguous = [];
  const unmatched = [];
  let alreadyNamed = 0;
  rosterAll.forEach((r) => {
    const no = normalizeStudentNo(r.student_id);
    if (String(r.name || '').trim()) { alreadyNamed += 1; return; }
    const names = Array.from(namesByNo.get(no) || []);
    if (names.length === 1) fillable.push({ doc_id: r._id, student_id: no, name: names[0] });
    else if (names.length > 1) ambiguous.push({ doc_id: r._id, student_id: no, names });
    else unmatched.push({ doc_id: r._id, student_id: no });
  });

  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      roster_total: rosterAll.length,
      already_named: alreadyNamed,
      fillable: fillable.length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
      preview: fillable.slice(0, 50),
      ambiguous_preview: ambiguous.slice(0, 20),
      unmatched_preview: unmatched.slice(0, 20),
      hint: '确认后带 dry_run:false 与 confirm_count=' + fillable.length + ' 再次调用即可补齐姓名'
    };
  }

  const confirmCount = Number(event && event.confirm_count);
  if (!confirmCount || confirmCount !== fillable.length) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于本次可补齐的条数（当前为 ' + fillable.length + '）');
  }

  let updated = 0;
  const errors = [];
  for (const t of fillable) {
    try {
      await db.collection('roster').doc(t.doc_id).update({ data: { name: t.name } });
      updated += 1;
    } catch (e) {
      errors.push({ doc_id: t.doc_id, code: 'BACKFILL_FAILED', msg: String((e && e.message) || e) });
    }
  }
  return {
    ok: true,
    mode: 'commit',
    fillable: fillable.length,
    updated,
    ambiguous: ambiguous.length,
    unmatched: unmatched.length,
    errors
  };
}

// ---- 名册批量清理（临时维护工具，仅超级管理员）----
// 用途：一次性清理误导入／误录入的名册记录，并同步撤销这些学号的 AI 提问白名单。
// 安全约束：
// 1) 仅超级管理员可用（requireSuper），前端隐藏不作为安全手段；
// 2) 必须至少提供一个筛选条件，禁止无条件全量删除；
// 3) 默认 dry_run=true，只预览不删除；提交时必须回传与预览一致的 confirm_count；
// 4) 单次最多处理 PURGE_MAX_BATCH 条，未处理完的部分需再次调用（返回 remaining）；
// 5) 只删除 students（可选 teacher_notes），不触碰 users / learning_records / ai_* / roster 之外的集合。
const PURGE_DEFAULT_BATCH = 50;
const PURGE_MAX_BATCH = 100;
const PURGE_CHUNK = 50;

function matchPurgeFilters(s, f, regMap) {
  const no = normalizeStudentNo(s.student_no);
  const name = String(s.name || '').trim();
  if (f.school && String(s.school || '').trim() !== f.school) return false;
  if (f.class_name && String(s.class_name || '').trim() !== f.class_name) return false;
  if (f.owner_teacher_id && String(s.owner_teacher_id || '') !== f.owner_teacher_id) return false;
  if (f.keyword && !(name.toLowerCase().includes(f.keyword) || no.toLowerCase().includes(f.keyword))) return false;
  const created = String(s.created_at || '');
  if (f.created_from && created < f.created_from) return false;
  if (f.created_to && created > f.created_to) return false;
  if (f.registered === 'yes' && !regMap.get(rosterKey(no, name))) return false;
  if (f.registered === 'no' && regMap.get(rosterKey(no, name))) return false;
  // 未分班：用于把"挂在某位教师名下但没进任何班级"的记录筛出来（例如误收编到超管名下的）
  if (f.no_class && String(s.class_id || '')) return false;
  return true;
}

async function purgeStudents(event) {
  await requireSuper(event);

  const filters = {
    school: String((event && event.school) || '').trim(),
    class_name: String((event && event.class_name) || '').trim(),
    owner_teacher_id: String((event && event.owner_teacher_id) || '').trim(),
    keyword: String((event && event.keyword) || '').trim().toLowerCase(),
    created_from: String((event && event.created_from) || '').trim(),
    created_to: String((event && event.created_to) || '').trim(),
    registered: String((event && event.registered) || '').trim(), // '' | 'yes' | 'no'
    no_class: !!(event && event.no_class) // true = 只看未分班（挂在教师名下但没进班）
  };
  // 显式勾选模式：前端在表格里逐条选中后按 doc_ids 删除；
  // 该模式下"选择"本身就是预览，因此不要求 confirm_count，也不要求其它筛选条件。
  const docIds = normalizeDocIds(event && (event.doc_ids || event.doc_id));
  const idSet = new Set(docIds);
  const explicitSelection = idSet.size > 0;

  if (!Object.keys(filters).some((k) => !!filters[k]) && !explicitSelection) {
    throw makeError('NO_FILTER', 400,
      '必须至少提供一个筛选条件：doc_ids / school / class_name / owner_teacher_id / keyword / created_from / created_to / registered');
  }

  const batch = Math.min(PURGE_MAX_BATCH, Math.max(1, Number((event && event.limit) || PURGE_DEFAULT_BATCH)));
  const dryRun = !(event && event.dry_run === false);
  const revokeRoster = !(event && event.also_revoke_roster === false);
  const purgeNotes = !!(event && event.purge_notes);

  const [students, regMap] = await Promise.all([loadAllStudents(), loadRegisteredMap()]);
  const matched = students
    .filter((s) => (explicitSelection ? idSet.has(s._id) : true) && matchPurgeFilters(s, filters, regMap))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const targets = matched.slice(0, batch);

  const preview = targets.slice(0, 50).map((s) => ({
    doc_id: s._id,
    name: s.name || '',
    student_no: s.student_no || '',
    school: s.school || '',
    class_name: s.class_name || '',
    owner_teacher_name: s.owner_teacher_name || '',
    registered: !!regMap.get(rosterKey(s.student_no, s.name)),
    created_at: s.created_at || ''
  }));

  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      matched: matched.length,
      batch,
      preview,
      remaining_after_batch: Math.max(0, matched.length - batch),
      will_revoke_roster: revokeRoster,
      purge_notes: purgeNotes,
      filters,
      selection: docIds.length,
      hint: explicitSelection
        ? '已按勾选结果匹配到 ' + matched.length + ' 条；确认无误后带 dry_run:false 再次调用即可删除'
        : '确认预览无误后，用相同筛选条件再次调用，并带上 dry_run:false 与 confirm_count=' + matched.length
    };
  }

  if (!explicitSelection) {
    const confirmCount = Number(event && event.confirm_count);
    if (!confirmCount || confirmCount !== matched.length) {
      throw makeError('CONFIRM_MISMATCH', 400,
        'confirm_count 必须等于本次匹配到的条数（当前为 ' + matched.length + '）；请先用 dry_run 预览再提交');
    }
  }

  // 批量删除：先取一次白名单快照，再按块用 where(_id in ...).remove() 删除。
  // 逐条删除 50 名学生约需 150 次数据库往返，会触发云函数超时；改为分块批量后约 5 次。
  const rosterAll = revokeRoster ? await fetchAll('roster').catch(() => []) : [];
  const rosterIdsByNo = new Map();
  rosterAll.forEach((r) => {
    const no = normalizeStudentNo(r.student_id);
    if (!no) return;
    if (!rosterIdsByNo.has(no)) rosterIdsByNo.set(no, []);
    rosterIdsByNo.get(no).push(r._id);
  });

  const studentIds = targets.map((s) => s._id);
  const rosterIds = [];
  if (revokeRoster) {
    targets.forEach((s) => {
      (rosterIdsByNo.get(normalizeStudentNo(s.student_no)) || []).forEach((id) => rosterIds.push(id));
    });
  }

  const errors = [];
  const removedCount = (r, fallback) =>
    (r && r.stats && typeof r.stats.removed === 'number') ? r.stats.removed : fallback;

  let removedStudents = 0;
  for (let i = 0; i < studentIds.length; i += PURGE_CHUNK) {
    const chunk = studentIds.slice(i, i + PURGE_CHUNK);
    try {
      const r = await db.collection('students').where({ _id: db.command.in(chunk) }).remove();
      removedStudents += removedCount(r, chunk.length);
    } catch (e) {
      errors.push({ code: 'REMOVE_FAILED', count: chunk.length, msg: String((e && e.message) || e) });
    }
  }

  let revokedRoster = 0;
  for (let i = 0; i < rosterIds.length; i += PURGE_CHUNK) {
    const chunk = rosterIds.slice(i, i + PURGE_CHUNK);
    try {
      const r = await db.collection('roster').where({ _id: db.command.in(chunk) }).remove();
      revokedRoster += removedCount(r, chunk.length);
    } catch (e) {
      errors.push({ code: 'ROSTER_REVOKE_FAILED', count: chunk.length, msg: String((e && e.message) || e) });
    }
  }

  let removedNotes = 0;
  if (purgeNotes && studentIds.length) {
    for (let i = 0; i < studentIds.length; i += PURGE_CHUNK) {
      const chunk = studentIds.slice(i, i + PURGE_CHUNK);
      try {
        const r = await db.collection('teacher_notes').where({ student_doc_id: db.command.in(chunk) }).remove();
        removedNotes += removedCount(r, 0);
      } catch (e) {
        errors.push({ code: 'NOTE_REMOVE_FAILED', count: chunk.length, msg: String((e && e.message) || e) });
      }
    }
  }

  return {
    ok: true,
    mode: 'commit',
    matched: matched.length,
    processed: targets.length,
    selection: docIds.length,
    not_found: explicitSelection ? Math.max(0, docIds.length - matched.length) : 0,
    removed_students: removedStudents,
    removed_student_ids: studentIds,
    revoked_roster: revokedRoster,
    removed_notes: removedNotes,
    remaining: Math.max(0, matched.length - targets.length),
    hint: Math.max(0, matched.length - targets.length) > 0
      ? '还有剩余记录未处理，请再次执行（建议重新 dry_run 核对）'
      : '本次筛选范围内的记录已全部处理',
    errors
  };
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

  // 班级归并：收编时同样把班级名解析到班级实体
  const cls = await resolveClassForTeacher(me, className, event && event.class_id, !!(event && event.no_class));
  const record = buildRosterRecord({
    school: u.school,
    class_id: cls ? cls._id : '',
    class_name: cls ? cls.name : className,
    name,
    student_no: no
  }, me);
  const added = await db.collection('students').add({ data: record });
  await grantAiAccess(no, name);
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
  const badIdentity = validateStudentIdentity(row.student_no, row.name);
  if (badIdentity) throw makeError(badIdentity.code, 400, badIdentity.msg);

  // 班级归并：把班级名解析到班级实体（同教师同名优先，只有一个班级则归入该班）
  const cls = await resolveClassForTeacher(me, row.class_name, event && event.class_id, !!(event && event.no_class));
  row.class_id = cls ? cls._id : '';
  row.class_name = cls ? cls.name : String(row.class_name || '').trim();

  // 判重键 = 学号 + 姓名
  const key = rosterKey(row.student_no, row.name);
  const all = await db.collection('students').limit(1000).get();
  if (all.data.some((s) => rosterKey(s.student_no, s.name) === key)) {
    throw makeError('DUPLICATE_STUDENT', 409, '名册中已存在同学号同姓名的学生：' + normalizeStudentNo(row.student_no));
  }

  const record = buildRosterRecord(row, me);
  const added = await db.collection('students').add({ data: record });
  await grantAiAccess(record.student_no, record.name);
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

    // 格式校验：学号必须纯数字、姓名不得含数字（拦截"姓名与学号填反"）
    const badIdentity = validateStudentIdentity(no, name);
    if (badIdentity) {
      errors.push({ line, field: '学号/姓名', reason: badIdentity.msg });
      return;
    }

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

  // 班级归并：把每行的班级名解析到班级实体。
  // 支持两种用法：① 导入时指定 class_id（在班级页导入）→ 全部归入该班；
  // ② 不指定 → 同名优先；若该教师只有一个活动班级，则统一归入该班（教师建的那个班）。
  const forcedClassId = String((event && event.class_id) || '').trim();
  const noClass = !!(event && event.no_class); // 显式要求「全部保持未分班」
  const teacherClasses = await loadTeacherActiveClasses(me._id);
  const resolveFromList = (className) => {
    const want = normalizeClassName(className);
    if (want) {
      const exact = teacherClasses.find((c) => normalizeClassName(c.name) === want);
      if (exact) return exact;
    }
    if (teacherClasses.length === 1) return teacherClasses[0];
    return null;
  };
  let classAssigned = 0;
  let classUnmatched = 0;
  let assignedClassName = '';
  for (const v of valid) {
    const cls = noClass
      ? null
      : (forcedClassId
        ? (teacherClasses.find((c) => c._id === forcedClassId) || null)
        : resolveFromList(v.class_name));
    if (cls) {
      v.class_id = cls._id;
      v.class_name = cls.name;
      classAssigned += 1;
      assignedClassName = cls.name;
    } else {
      v.class_id = '';
      classUnmatched += 1;
    }
  }

  const summary = {
    total: rows.length,
    valid: valid.length,
    missing,
    duplicate,
    invalid: errors.length,
    class_assigned: classAssigned,
    class_unmatched: classUnmatched,
    class_name: assignedClassName
  };

  if (mode !== 'commit') {
    return { ok: true, mode: 'validate', summary, errors: errors.slice(0, 100), preview: valid.slice(0, 50) };
  }

  let added = 0;
  for (const r of valid) {
    await db.collection('students').add({ data: buildRosterRecord(r, me) });
    await grantAiAccess(r.student_no, r.name);
    added++;
  }
  return { ok: true, mode: 'commit', added, summary, errors: errors.slice(0, 100) };
}

// ---- 教师备注（仅教师端可见）----
async function addStudentNote(event) {
  const me = await requireAuth(event);
  const docId = String((event && event.doc_id) || '');
  const content = String((event && event.content) || '').trim();
  if (!docId) throw makeError('MISSING_ID', 400, '缺少学生记录 ID');
  if (!content) throw makeError('EMPTY_NOTE', 400, '备注内容不能为空');

  const rosterDoc = await db.collection('students').doc(docId).get().catch(() => null);
  if (!rosterDoc || !rosterDoc.data) throw makeError('NOT_FOUND', 404, '名册中没有该学生');
  if (!isSuper(me) && rosterDoc.data.owner_teacher_id !== me._id) {
    throw makeError('FORBIDDEN', 403, '只能给自己录入的学生写备注');
  }

  const record = {
    student_doc_id: docId,
    teacher_id: me._id,
    teacher_name: me.name || me.username || '',
    content,
    created_at: now()
  };
  const added = await db.collection('teacher_notes').add({ data: record });
  return { ok: true, note: Object.assign({ id: added._id }, record) };
}

async function deleteStudentNote(event) {
  const me = await requireAuth(event);
  const noteId = String((event && event.note_id) || '');
  if (!noteId) throw makeError('MISSING_ID', 400, '缺少备注 ID');
  const doc = await db.collection('teacher_notes').doc(noteId).get().catch(() => null);
  if (!doc || !doc.data) throw makeError('NOT_FOUND', 404, '备注不存在');
  if (!isSuper(me) && doc.data.teacher_id !== me._id) {
    throw makeError('FORBIDDEN', 403, '只能删除自己的备注');
  }
  await db.collection('teacher_notes').doc(noteId).remove();
  return { ok: true };
}

// 当前教师可见的学生范围：超级管理员=全部名册；普通教师=自己录入的名册
async function visibleStudents(me) {
  const superUser = isSuper(me);
  const rosterRes = await db.collection('students').limit(1000).get().catch(() => ({ data: [] }));
  const scoped = superUser ? rosterRes.data : rosterRes.data.filter((s) => s.owner_teacher_id === me._id);
  const regMap = await loadRegisteredMap();
  const items = scoped.map((s) => {
    const u = regMap.get(rosterKey(s.student_no, s.name));
    return {
      doc_id: s._id,
      name: s.name || '',
      student_no: s.student_no || '',
      school: s.school || '',
      class_name: s.class_name || '',
      owner_teacher_name: s.owner_teacher_name || '',
      registered: !!u,
      openid: u ? u.openid : ''
    };
  });
  const openids = Array.from(new Set(items.map((i) => i.openid).filter(Boolean)));
  const byOpenid = new Map(items.filter((i) => i.openid).map((i) => [i.openid, i]));
  return { superUser, items, openids, byOpenid };
}

// 按 openid 分批查询（规避 in 查询条数上限）
async function fetchByOpenids(collection, openids, perBatch, perQuery) {
  const out = [];
  for (let i = 0; i < openids.length; i += perBatch) {
    const batch = openids.slice(i, i + perBatch);
    const res = await db.collection(collection)
      .where({ openid: db.command.in(batch) })
      .limit(perQuery)
      .get()
      .catch(() => ({ data: [] }));
    out.push(...res.data);
  }
  return out;
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

  const noteRes = await db.collection('teacher_notes')
    .where({ student_doc_id: docId }).limit(100).get().catch(() => ({ data: [] }));
  const notes = noteRes.data
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((n) => ({
      id: n._id,
      teacher_name: n.teacher_name || '',
      content: n.content || '',
      created_at: n.created_at || ''
    }));

  if (!u) {
    return {
      ok: true, student: info, registered: false,
      stats: { total_duration: 0, session_count: 0, ai_count: 0, event_count: 0 },
      chapters: [], records: [], ai: [], notes
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
    ai: ai.slice(0, 50),
    notes
  };
}

// 学习记录：教师可见范围内的全体学习行为事件流
async function listLearningRecords(event) {
  const me = await requireAuth(event);
  const scope = await visibleStudents(me);
  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const classFilter = String((event && event.class_name) || '').trim();
  const typeFilter = String((event && event.event_type) || '').trim();
  const limit = Math.min(500, Math.max(1, Number((event && event.limit) || 200)));

  let all = [];
  if (scope.superUser) {
    const res = await db.collection('learning_records').limit(1000).get().catch(() => ({ data: [] }));
    all = res.data;
  } else if (scope.openids.length) {
    all = await fetchByOpenids('learning_records', scope.openids, 50, 500);
  }

  const classes = Array.from(new Set(scope.items.map((i) => i.class_name).filter(Boolean))).sort();

  let items = all
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => {
      const info = scope.byOpenid.get(r.openid);
      return {
        id: r._id,
        student_name: r.student_name || (info ? info.name : ''),
        student_no: r.student_id || (info ? info.student_no : ''),
        class_name: info ? info.class_name : '',
        event_type: r.event_type || '',
        chapter_name: r.chapter_name || '',
        knowledge_point_id: r.knowledge_point_id || '',
        duration: r.duration || 0,
        created_at: r.created_at || ''
      };
    });

  if (typeFilter) items = items.filter((r) => r.event_type === typeFilter);
  if (classFilter) items = items.filter((r) => r.class_name === classFilter);
  if (keyword) {
    items = items.filter((r) =>
      String(r.student_name).toLowerCase().includes(keyword) ||
      String(r.student_no).toLowerCase().includes(keyword));
  }

  return { ok: true, total: items.length, items: items.slice(0, limit), classes, is_super: scope.superUser };
}

// AI 问答：教师可见范围内的提问（配成 问/答）+ 统计 + 高频知识点
async function listAiQuestions(event) {
  const me = await requireAuth(event);
  const scope = await visibleStudents(me);
  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const limit = Math.min(300, Math.max(1, Number((event && event.limit) || 100)));

  let convs = [];
  if (scope.superUser) {
    const res = await db.collection('ai_conversations').limit(1000).get().catch(() => ({ data: [] }));
    convs = res.data;
  } else if (scope.openids.length) {
    convs = await fetchByOpenids('ai_conversations', scope.openids, 50, 500);
  }

  const convById = new Map(convs.map((c) => [c._id, c]));
  const convIds = convs
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 80)
    .map((c) => c._id);

  let msgs = [];
  for (let i = 0; i < convIds.length; i += 50) {
    const batch = convIds.slice(i, i + 50);
    const res = await db.collection('ai_messages')
      .where({ conversation_id: db.command.in(batch) })
      .limit(1000).get().catch(() => ({ data: [] }));
    msgs.push(...res.data);
  }

  const byConv = new Map();
  msgs.forEach((m) => {
    if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []);
    byConv.get(m.conversation_id).push(m);
  });

  let items = [];
  byConv.forEach((list, cid) => {
    const conv = convById.get(cid);
    const sorted = list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i].role !== 'user') continue;
      const next = sorted[i + 1];
      const info = conv ? scope.byOpenid.get(conv.openid) : null;
      items.push({
        id: sorted[i]._id,
        student_name: info ? info.name : '',
        student_no: info ? info.student_no : '',
        class_name: info ? info.class_name : '',
        question: sorted[i].content || '',
        answer: (next && next.role === 'assistant') ? (next.content || '') : '',
        knowledge_point_id: sorted[i].knowledge_point || '',
        created_at: sorted[i].created_at || ''
      });
    }
  });
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const todayKey = dayKey(Date.now());
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const todayCount = items.filter((q) => dayKey(new Date(q.created_at).getTime()) === todayKey).length;
  const weekCount = items.filter((q) => new Date(q.created_at).getTime() >= weekAgoMs).length;

  const kpMap = new Map();
  items.filter((q) => new Date(q.created_at).getTime() >= weekAgoMs).forEach((q) => {
    const k = q.knowledge_point_id || '（未分类）';
    kpMap.set(k, (kpMap.get(k) || 0) + 1);
  });
  const hot = Array.from(kpMap.entries())
    .map(([k, n]) => ({ knowledge_point_id: k, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  let filtered = items;
  if (keyword) {
    filtered = filtered.filter((q) =>
      String(q.student_name).toLowerCase().includes(keyword) ||
      String(q.question).toLowerCase().includes(keyword));
  }

  return {
    ok: true,
    total: filtered.length,
    items: filtered.slice(0, limit),
    summary: { today: todayCount, week: weekCount, total: items.length },
    hot,
    is_super: scope.superUser
  };
}

// ---- 班级管理（REQ-002 第一阶段）----
// 数据模型：classes 集合保存班级实体；students.class_id → classes._id 是唯一权威关联；
// students.class_name 是现有页面（驾驶舱班级概况、学习记录筛选、AI 分析、学生管理）所需的兼容展示快照。
// 边界：本节的任何写操作都不得触碰 roster（AI 白名单），也不得修改 students.owner_teacher_id（名册归属）。
const CLASS_STATUS_ACTIVE = 'active';
const CLASS_STATUS_ARCHIVED = 'archived';
const CLASS_NAME_MAX = 40;
const CLASS_SCHOOL_MAX = 60;
const CLASS_NOTE_MAX = 200;
const CLASS_BATCH_MAX = 200;

function normalizeClassName(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

function normalizeDocIds(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const out = [];
  const seen = new Set();
  list.forEach((v) => {
    const id = String(v == null ? '' : v).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

// classes 集合在 COLLECTIONS 中已声明，ensureCollections() 会幂等建表；
// 这里再做一次显式探测，便于在日志中区分「已存在」与「本次创建」（REQ-002 §23 第 1 项）。
async function ensureClassCollection() {
  try {
    await db.collection('classes').limit(1).get();
    return 'exists';
  } catch (e) {
    await db.createCollection('classes').catch(() => null);
    return 'created';
  }
}

function publicClass(c, memberStat) {
  const stat = memberStat || { member_count: 0, registered_count: 0 };
  return {
    id: c._id,
    name: c.name || '',
    school: c.school || '',
    status: c.status || CLASS_STATUS_ACTIVE,
    owner_teacher_id: c.owner_teacher_id || '',
    owner_teacher_name: c.owner_teacher_name || '',
    note: c.note || '',
    created_at: c.created_at || '',
    updated_at: c.updated_at || '',
    member_count: stat.member_count,
    registered_count: stat.registered_count
  };
}

async function getClassById(id) {
  if (!id) return null;
  try {
    const res = await db.collection('classes').doc(id).get();
    return res.data ? Object.assign({ _id: id }, res.data) : null;
  } catch (e) {
    return null;
  }
}

// 可见与可管理范围：超级管理员=全部班级；普通教师=自己创建的班级
function canManageClass(me, classDoc) {
  return isSuper(me) || classDoc.owner_teacher_id === me._id;
}

async function loadAllStudents() {
  return await fetchAll('students').catch(() => []);
}

// 班级成员统计：成员数与已注册人数（注册判定沿用「学号 + 姓名」匹配 users 的既有口径）
function buildClassStats(students, regMap) {
  const stats = new Map();
  students.forEach((s) => {
    const cid = s.class_id || '';
    if (!cid) return;
    if (!stats.has(cid)) stats.set(cid, { member_count: 0, registered_count: 0 });
    const stat = stats.get(cid);
    stat.member_count += 1;
    if (regMap.get(rosterKey(s.student_no, s.name))) stat.registered_count += 1;
  });
  return stats;
}

// 成员操作范围 = 该班负责教师名册中的学生。超级管理员同样遵守该范围，
// 以保证「班级管理不得改变学生名册归属、不做跨教师调班」。
function classMemberScope(students, classDoc) {
  return students.filter((s) => s.owner_teacher_id === classDoc.owner_teacher_id);
}

function isClassActive(classDoc) {
  return (classDoc.status || CLASS_STATUS_ACTIVE) === CLASS_STATUS_ACTIVE;
}

// 同一负责教师下「班级名 + 学校」在活动班级中必须唯一
function findDuplicateClass(classes, ownerId, name, school, excludeId) {
  return classes.find((c) => c._id !== excludeId
    && c.owner_teacher_id === ownerId
    && isClassActive(c)
    && normalizeClassName(c.name) === normalizeClassName(name)
    && String(c.school || '').trim() === String(school || '').trim()) || null;
}

// 班级列表：普通教师=自己的班级；超管=全部（可按负责教师筛选）
async function listClasses(event) {
  const me = await requireAuth(event);
  const superUser = isSuper(me);
  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const statusFilter = String((event && event.status) || '').trim(); // '' = 只看进行中；'archived' = 已停用；'all' = 全部
  const ownerFilter = String((event && event.owner_teacher_id) || '').trim(); // 仅超管有效
  const limit = Math.min(200, Math.max(1, Number((event && event.limit) || 100)));

  const [classes, students, regMap] = await Promise.all([
    fetchAll('classes').catch(() => []),
    loadAllStudents(),
    loadRegisteredMap()
  ]);

  let scoped = classes;
  if (!superUser) scoped = scoped.filter((c) => c.owner_teacher_id === me._id);
  else if (ownerFilter) scoped = scoped.filter((c) => c.owner_teacher_id === ownerFilter);

  const stats = buildClassStats(students, regMap);
  let items = scoped.map((c) => publicClass(c, stats.get(c._id)));

  const summary = {
    total: items.length,
    active: items.filter((c) => c.status === CLASS_STATUS_ACTIVE).length,
    archived: items.filter((c) => c.status === CLASS_STATUS_ARCHIVED).length
  };

  if (statusFilter === 'all') { /* 不按状态过滤 */ }
  else if (statusFilter === CLASS_STATUS_ARCHIVED) items = items.filter((c) => c.status === CLASS_STATUS_ARCHIVED);
  else items = items.filter((c) => c.status === CLASS_STATUS_ACTIVE);

  if (keyword) {
    items = items.filter((c) =>
      String(c.name).toLowerCase().includes(keyword) || String(c.school).toLowerCase().includes(keyword));
  }

  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const owners = superUser
    ? Array.from(new Map(scoped.filter((c) => c.owner_teacher_id)
        .map((c) => [c.owner_teacher_id, c.owner_teacher_name || c.owner_teacher_id])).entries())
        .map(([id, name]) => ({ id, name }))
    : [];

  return { ok: true, total: items.length, items: items.slice(0, limit), summary, owners, is_super: superUser };
}

// 新建班级：归属创建者本人
async function createClass(event) {
  const me = await requireAuth(event);
  await ensureClassCollection();

  const name = normalizeClassName(event && event.name);
  const school = String((event && event.school) || '').trim();
  const note = String((event && event.note) || '').trim();
  if (!name) throw makeError('MISSING_CLASS_NAME', 400, '请填写班级名称');
  if (name.length > CLASS_NAME_MAX) throw makeError('CLASS_NAME_TOO_LONG', 400, '班级名称过长');
  if (school.length > CLASS_SCHOOL_MAX) throw makeError('SCHOOL_TOO_LONG', 400, '学校名称过长');
  if (note.length > CLASS_NOTE_MAX) throw makeError('CLASS_NOTE_TOO_LONG', 400, '备注过长');

  const existing = await fetchAll('classes').catch(() => []);
  if (findDuplicateClass(existing, me._id, name, school, '')) {
    throw makeError('DUPLICATE_CLASS', 409, '已存在同名班级：' + name + (school ? '（' + school + '）' : ''));
  }

  const record = {
    name,
    school,
    status: CLASS_STATUS_ACTIVE,
    owner_teacher_id: me._id,
    owner_teacher_name: me.name || me.username || '',
    note,
    created_at: now(),
    updated_at: now()
  };
  const added = await db.collection('classes').add({ data: record });
  return { ok: true, class: publicClass(Object.assign({ _id: added._id }, record)) };
}

// 编辑班级（名称 / 学校 / 备注）。重命名时必须同步所属学生的兼容快照 class_name。
async function updateClass(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能管理自己负责的班级');

  const patch = {};
  if (event && event.name !== undefined) {
    const name = normalizeClassName(event.name);
    if (!name) throw makeError('MISSING_CLASS_NAME', 400, '请填写班级名称');
    if (name.length > CLASS_NAME_MAX) throw makeError('CLASS_NAME_TOO_LONG', 400, '班级名称过长');
    patch.name = name;
  }
  if (event && event.school !== undefined) {
    const school = String(event.school || '').trim();
    if (school.length > CLASS_SCHOOL_MAX) throw makeError('SCHOOL_TOO_LONG', 400, '学校名称过长');
    patch.school = school;
  }
  if (event && event.note !== undefined) {
    const note = String(event.note || '').trim();
    if (note.length > CLASS_NOTE_MAX) throw makeError('CLASS_NOTE_TOO_LONG', 400, '备注过长');
    patch.note = note;
  }
  if (!Object.keys(patch).length) throw makeError('EMPTY_PATCH', 400, '没有需要修改的内容');

  if (patch.name !== undefined || patch.school !== undefined) {
    const nextName = patch.name !== undefined ? patch.name : normalizeClassName(current.name);
    const nextSchool = patch.school !== undefined ? patch.school : String(current.school || '').trim();
    const all = await fetchAll('classes').catch(() => []);
    if (findDuplicateClass(all, current.owner_teacher_id, nextName, nextSchool, classId)) {
      throw makeError('DUPLICATE_CLASS', 409, '已存在同名班级：' + nextName + (nextSchool ? '（' + nextSchool + '）' : ''));
    }
  }

  patch.updated_at = now();
  await db.collection('classes').doc(classId).update({ data: patch });

  let renamed = 0;
  if (patch.name !== undefined) {
    const members = await fetchAll('students', db.collection('students').where({ class_id: classId })).catch(() => []);
    for (const s of members) {
      if (String(s.class_name || '') === patch.name) continue;
      await db.collection('students').doc(s._id)
        .update({ data: { class_name: patch.name, updated_at: now() } })
        .catch(() => null);
      renamed += 1;
    }
  }

  return { ok: true, class: publicClass(Object.assign({}, current, patch)), renamed_members: renamed };
}

// 班级详情：班级信息 + 成员名单（普通教师仅限自己的班级，超管可查看全部）
async function classDetail(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能查看自己负责的班级');

  const [students, regMap] = await Promise.all([loadAllStudents(), loadRegisteredMap()]);
  const members = students
    .filter((s) => s.class_id === classId)
    .map((s) => {
      const u = regMap.get(rosterKey(s.student_no, s.name));
      return {
        doc_id: s._id,
        name: s.name || '',
        student_no: s.student_no || '',
        school: s.school || '',
        owner_teacher_name: s.owner_teacher_name || '',
        class_id: s.class_id || '',
        class_name: s.class_name || '',
        registered: !!u,
        registered_at: u ? (u.created_at || '') : '',
        last_login_at: u ? (u.last_login_at || '') : ''
      };
    })
    .sort((a, b) => String(a.student_no).localeCompare(String(b.student_no)));

  const summary = { member_count: members.length, registered_count: members.filter((m) => m.registered).length };
  return { ok: true, class: publicClass(current, summary), members, summary, is_super: isSuper(me) };
}

// 候选学生：本班负责教师名册中尚未加入本班的学生（已在其他活动班级的会标注 in_other_class）
async function classCandidates(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能管理自己负责的班级');

  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const [students, classes, regMap] = await Promise.all([
    loadAllStudents(),
    fetchAll('classes').catch(() => []),
    loadRegisteredMap()
  ]);
  const classById = new Map(classes.map((c) => [c._id, c]));

  let items = classMemberScope(students, current)
    .filter((s) => s.class_id !== classId)
    .map((s) => {
      const u = regMap.get(rosterKey(s.student_no, s.name));
      const other = s.class_id ? classById.get(s.class_id) : null;
      return {
        doc_id: s._id,
        name: s.name || '',
        student_no: s.student_no || '',
        school: s.school || '',
        registered: !!u,
        current_class_id: s.class_id || '',
        current_class_name: (other && other.name) || s.class_name || '',
        in_other_class: !!(other && isClassActive(other))
      };
    })
    .sort((a, b) => String(a.student_no).localeCompare(String(b.student_no)));

  if (keyword) {
    items = items.filter((s) =>
      String(s.name).toLowerCase().includes(keyword) || String(s.student_no).toLowerCase().includes(keyword));
  }

  return { ok: true, total: items.length, items };
}

// 加入班级：只写 students.class_id 与兼容快照 students.class_name。
// 不写 roster、不触发 AI 白名单变化、不修改 owner_teacher_id。
async function addClassMembers(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能管理自己负责的班级');
  if (!isClassActive(current)) throw makeError('CLASS_ARCHIVED', 409, '班级已停用，请先恢复后再调整成员');

  const docIds = normalizeDocIds(event && (event.doc_ids || event.doc_id));
  if (!docIds.length) throw makeError('MISSING_STUDENT_IDS', 400, '请选择要加入班级的学生');
  if (docIds.length > CLASS_BATCH_MAX) throw makeError('TOO_MANY_ITEMS', 400, '单次最多处理 ' + CLASS_BATCH_MAX + ' 名学生');

  const [students, classes] = await Promise.all([loadAllStudents(), fetchAll('classes').catch(() => [])]);
  const byId = new Map(classMemberScope(students, current).map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));

  const added = [];
  const failed = [];
  for (const docId of docIds) {
    const s = byId.get(docId);
    if (!s) {
      failed.push({ doc_id: docId, code: 'NOT_IN_SCOPE', msg: '该学生不在本班级负责教师的名册中' });
      continue;
    }
    if (s.class_id === classId) {
      failed.push({ doc_id: docId, code: 'ALREADY_IN_CLASS', msg: '该学生已在本班' });
      continue;
    }
    if (s.class_id) {
      const other = classById.get(s.class_id);
      if (other && isClassActive(other)) {
        failed.push({ doc_id: docId, code: 'IN_OTHER_CLASS', msg: '该学生已在班级「' + (other.name || '') + '」中，请先移出' });
        continue;
      }
    }
    await db.collection('students').doc(docId).update({
      data: { class_id: classId, class_name: current.name || '', updated_at: now() }
    });
    added.push(docId);
  }

  const memberCount = classMemberScope(students, current).filter((s) => s.class_id === classId).length + added.length;
  return { ok: true, added: added.length, added_ids: added, failed, member_count: memberCount };
}

// 移出班级：同时清空 class_id 与 class_name；学生记录本身保留。
// 移出按「该学生当前是否属于本班」判定，避免历史数据导致无法清理。
async function removeClassMembers(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能管理自己负责的班级');
  if (!isClassActive(current)) throw makeError('CLASS_ARCHIVED', 409, '班级已停用，请先恢复后再调整成员');

  const docIds = normalizeDocIds(event && (event.doc_ids || event.doc_id));
  if (!docIds.length) throw makeError('MISSING_STUDENT_IDS', 400, '请选择要移出班级的学生');
  if (docIds.length > CLASS_BATCH_MAX) throw makeError('TOO_MANY_ITEMS', 400, '单次最多处理 ' + CLASS_BATCH_MAX + ' 名学生');

  const students = await loadAllStudents();
  const byId = new Map(students.map((s) => [s._id, s]));

  const removed = [];
  const failed = [];
  for (const docId of docIds) {
    const s = byId.get(docId);
    if (!s) {
      failed.push({ doc_id: docId, code: 'NOT_FOUND', msg: '名册中没有该学生' });
      continue;
    }
    if (s.class_id !== classId) {
      failed.push({ doc_id: docId, code: 'NOT_IN_CLASS', msg: '该学生不在本班' });
      continue;
    }
    await db.collection('students').doc(docId).update({
      data: { class_id: '', class_name: '', updated_at: now() }
    });
    removed.push(docId);
  }

  const memberCount = students.filter((s) => s.class_id === classId).length - removed.length;
  return { ok: true, removed: removed.length, removed_ids: removed, failed, member_count: memberCount };
}

// 把名册中已存在、但尚未关联到班级实体的学生并进来。
// 用途：修复"从学生页录入/导入 → 班级页显示 0 人"的历史数据（class_name 有值但 class_id 为空）。
// 规则：class_name 与本班同名 → 并入；adopt_unmatched=true 且该教师只有一个活动班级 → 名称不一致的也并入。
async function syncClassMembers(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能管理自己负责的班级');

  const dryRun = !(event && event.dry_run === false);
  const adoptUnmatched = !!(event && event.adopt_unmatched);

  const [students, teacherClasses] = await Promise.all([
    loadAllStudents(),
    loadTeacherActiveClasses(current.owner_teacher_id)
  ]);
  const wantName = normalizeClassName(current.name);
  const singleClass = teacherClasses.length === 1;
  const scoped = students.filter((s) => s.owner_teacher_id === current.owner_teacher_id);

  const targets = scoped.filter((s) => {
    if (s.class_id === classId) return false;
    if (s.class_id) return adoptUnmatched && singleClass;
    if (normalizeClassName(s.class_name) === wantName) return true;
    return adoptUnmatched && singleClass;
  });

  const preview = targets.slice(0, 50).map((s) => ({
    doc_id: s._id,
    name: s.name || '',
    student_no: s.student_no || '',
    class_name: s.class_name || '',
    class_id: s.class_id || ''
  }));

  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      matched: targets.length,
      preview,
      adopt_unmatched: adoptUnmatched,
      single_class: singleClass,
      hint: '确认后带 dry_run:false 与 confirm_count=' + targets.length + ' 再次调用即可并入本班'
    };
  }

  const confirmCount = Number(event && event.confirm_count);
  if (!confirmCount || confirmCount !== targets.length) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于本次匹配到的条数（当前为 ' + targets.length + '）；请先预览再提交');
  }

  const ids = targets.map((s) => s._id);
  let updated = 0;
  const errors = [];
  for (let i = 0; i < ids.length; i += CLASS_BATCH_MAX) {
    const chunk = ids.slice(i, i + CLASS_BATCH_MAX);
    try {
      const r = await db.collection('students').where({ _id: db.command.in(chunk) })
        .update({ data: { class_id: classId, class_name: current.name || '', updated_at: now() } });
      updated += (r && r.stats && typeof r.stats.updated === 'number') ? r.stats.updated : chunk.length;
    } catch (e) {
      errors.push({ code: 'SYNC_FAILED', count: chunk.length, msg: String((e && e.message) || e) });
    }
  }

  return { ok: true, mode: 'commit', matched: targets.length, updated, errors };
}

// 停用/恢复班级：软删除。归档时成员关系与历史数据完全不动。
async function archiveClass(event) {
  const me = await requireAuth(event);
  const classId = String((event && event.class_id) || '');
  if (!classId) throw makeError('MISSING_CLASS_ID', 400, '缺少班级 ID');

  const current = await getClassById(classId);
  if (!current) throw makeError('NOT_FOUND', 404, '班级不存在');
  if (!canManageClass(me, current)) throw makeError('FORBIDDEN', 403, '只能管理自己负责的班级');

  const archived = !(event && event.archived === false);
  const nextStatus = archived ? CLASS_STATUS_ARCHIVED : CLASS_STATUS_ACTIVE;
  if ((current.status || CLASS_STATUS_ACTIVE) === nextStatus) {
    return { ok: true, unchanged: true, class: publicClass(current) };
  }

  if (!archived) {
    const all = await fetchAll('classes').catch(() => []);
    if (findDuplicateClass(all, current.owner_teacher_id, current.name, current.school, classId)) {
      throw makeError('DUPLICATE_CLASS', 409, '已存在同名活动班级，无法恢复');
    }
  }

  const updatedAt = now();
  await db.collection('classes').doc(classId).update({ data: { status: nextStatus, updated_at: updatedAt } });
  return { ok: true, class: publicClass(Object.assign({}, current, { status: nextStatus, updated_at: updatedAt })) };
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
    else if (action === 'student.purge') result = await purgeStudents(input);
    else if (action === 'roster.backfill') result = await backfillRosterNames(input);
    else if (action === 'student.adopt') result = await adoptStudent(input);
    else if (action === 'student.records') result = await studentRecords(input);
    else if (action === 'student.detail') result = await studentDetail(input);
    else if (action === 'note.add') result = await addStudentNote(input);
    else if (action === 'note.delete') result = await deleteStudentNote(input);
    else if (action === 'learning.list') result = await listLearningRecords(input);
    else if (action === 'ai.questions') result = await listAiQuestions(input);
    else if (action === 'class.list') result = await listClasses(input);
    else if (action === 'class.create') result = await createClass(input);
    else if (action === 'class.update') result = await updateClass(input);
    else if (action === 'class.detail') result = await classDetail(input);
    else if (action === 'class.candidates') result = await classCandidates(input);
    else if (action === 'class.syncMembers') result = await syncClassMembers(input);
    else if (action === 'class.members.add') result = await addClassMembers(input);
    else if (action === 'class.members.remove') result = await removeClassMembers(input);
    else if (action === 'class.archive') result = await archiveClass(input);
    else result = { ok: false, code: 'UNKNOWN_ACTION', msg: '未知操作' };

    return result;
  } catch (error) {
    return { ok: false, code: error.code || 'SERVER_ERROR', msg: error.message || '服务器错误' };
  }
};
