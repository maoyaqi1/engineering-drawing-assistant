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
  'teacher_notes',
  'maintenance_logs'
];

// ---- 常量 ----
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

// 超级管理员：从云函数环境变量读取（部署时配置 TEACHER_USERNAME / TEACHER_PASSWORD）
const SUPER_USERNAME = (process.env.TEACHER_USERNAME || 'myq').trim();
const SUPER_PASSWORD = (process.env.TEACHER_PASSWORD || '').trim();

// 内部测试账号（微信 openid，逗号 / 分号 / 空格分隔）。
// 用途：把开发者与老师本人的自测数据从"真实学情"里剔除（见 docs/requirements/REQ-003.md D21/D22）。
// 注意：这与小程序端 api 云函数的 ADMIN_OPENIDS 是两套名单，不要混用；人工不可改这里的判定结果。
const INTERNAL_OPENIDS = (process.env.INTERNAL_OPENIDS || '')
  .split(/[,，;；\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

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
  const me = await requireAuth(event);
  const superUser = isSuper(me);

  // ---- 数据分线（见 docs/requirements/REQ-003.md §4）：internal / demo / test 不计入真实学情 ----
  const idx = await buildLineIndex();
  let scopeOpenids = null; // null = 全局（超管）
  if (!superUser) {
    const ownKeys = new Set(idx.students
      .filter((s) => s.owner_teacher_id === me._id)
      .map((s) => rosterKey(s.student_no, s.name)));
    scopeOpenids = new Set();
    idx.users.forEach((u) => {
      if (u.openid && ownKeys.has(rosterKey(u.student_id, u.name))) scopeOpenids.add(String(u.openid));
    });
  }
  const inScope = (record) => {
    if (!scopeOpenids) return true;
    const openid = String((record && record.openid) || '');
    return !!openid && scopeOpenids.has(openid);
  };
  const lineOf = (record) => lineOfRecord(idx, record);

  // 近 7 天学习会话：只统计「在册学情」（student 线）且在本范围内的数据
  const sevenDaysAgo = daysAgoISO(7);
  const allSessions = await fetchAll('learning_sessions',
    db.collection('learning_sessions').where({ created_at: db.command.gte(sevenDaysAgo) }));
  const scopedSessions = allSessions.filter((s) => inScope(s));
  const sessions = scopedSessions.filter((s) => lineOf(s) === 'student');
  const excludedSessionsByLine = { internal: 0, demo: 0, test: 0, guest: 0 };
  scopedSessions.forEach((s) => {
    const line = lineOf(s);
    if (line !== 'student' && excludedSessionsByLine[line] !== undefined) excludedSessionsByLine[line] += 1;
  });
  const excludedSessions = scopedSessions.length - sessions.length;
  const excludedSessionsTest = excludedSessionsByLine.internal + excludedSessionsByLine.demo + excludedSessionsByLine.test;

  const todayKey = dayKey(Date.now());
  const todaySessions = sessions.filter((s) => dayKey(new Date(s.created_at).getTime()) === todayKey);
  const todayActiveUsers = new Set(todaySessions.map((s) => String(s.openid || s.user_id || ''))).size;

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

  // AI 教师提问（ai_messages 里 role=user 的消息）：同样只统计「在册学情」且在本范围内的数据
  let aiToday = 0;
  let aiWeek = 0;
  let aiHot = [];
  let excludedAi = 0;
  let excludedAiTest = 0;
  let excludedAiByLine = { internal: 0, demo: 0, test: 0, guest: 0 };
  try {
    // ai_messages 不存 openid，必须经 ai_conversations 关联到人（再判范围与线）
    const convs = await fetchAll('ai_conversations').catch(() => []);
    const convOwner = new Map(convs.map((c) => [String(c._id), String(c.openid || '')]));
    const lineOfOpenid = (openid) => (openid && idx.byOpenid.has(openid) ? idx.byOpenid.get(openid) : 'guest');
    const allAi = await fetchAll('ai_messages',
      db.collection('ai_messages').where({ role: 'user', created_at: db.command.gte(sevenDaysAgo) }));
    const withOwner = allAi.map((m) => ({ message: m, openid: convOwner.get(String(m.conversation_id)) || '' }));
    const scopedAi = withOwner.filter((x) => !scopeOpenids || (x.openid && scopeOpenids.has(x.openid)));
    const studentAi = scopedAi.filter((x) => lineOfOpenid(x.openid) === 'student');
    excludedAiByLine = { internal: 0, demo: 0, test: 0, guest: 0 };
    scopedAi.forEach((x) => {
      const line = lineOfOpenid(x.openid);
      if (line !== 'student' && excludedAiByLine[line] !== undefined) excludedAiByLine[line] += 1;
    });
    excludedAi = scopedAi.length - studentAi.length;
    excludedAiTest = excludedAiByLine.internal + excludedAiByLine.demo + excludedAiByLine.test;
    const aiMessages = studentAi.map((x) => x.message);
    aiWeek = aiMessages.length;
    aiToday = aiMessages.filter((m) => dayKey(new Date(m.created_at).getTime()) === todayKey).length;
    const kpMap2 = new Map();
    aiMessages.forEach((m) => {
      const k = m.knowledge_point || '（未分类）';
      kpMap2.set(k, (kpMap2.get(k) || 0) + 1);
    });
    aiHot = Array.from(kpMap2.entries())
      .map(([k, n]) => ({ knowledge_point_id: k, count: n }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  } catch (e) {
    // ai_messages 可能尚未创建
  }

  // ---- 名册与班级概况（按 classes 实体分组；演示班不进统计）----
  const regMap = await loadRegisteredMap();
  const rosterItems = idx.students
    .filter((s) => superUser || s.owner_teacher_id === me._id)
    .map((s) => {
      const u = regMap.get(rosterKey(s.student_no, s.name));
      const cid = String(s.class_id || '');
      const cls = idx.classById.get(cid);
      return {
        class_id: cid,
        // 归属只认班级实体（class_id）；class_name 仅作为"名册原文本"保留，用于提示教师去归并
        class_name: cls ? String(cls.name || '') : '',
        class_legacy_name: (!cls && String(s.class_name || '').trim()) ? String(s.class_name).trim() : '',
        class_status: cls ? String(cls.status || 'active') : '',
        is_demo: !!(cls && cls.is_demo === true),
        registered: !!u,
        openid: u ? String(u.openid || '') : ''
      };
    });
  const rosterVisible = rosterItems.filter((r) => !r.is_demo);
  const demoRoster = rosterItems.length - rosterVisible.length;
  const registeredCount = rosterVisible.filter((r) => r.registered).length;

  const classMap = new Map();
  rosterVisible.forEach((r) => {
    const key = r.class_id || '__none__';
    if (!classMap.has(key)) {
      classMap.set(key, {
        class_id: r.class_id,
        class_name: r.class_id ? (r.class_name || '（班级已删除）') : '未分班',
        class_status: r.class_status,
        legacyNames: new Set(),
        is_demo: false, total: 0, registered: 0, active7: new Set()
      });
    }
    const c = classMap.get(key);
    if (r.class_legacy_name) c.legacyNames.add(r.class_legacy_name);
    c.total += 1;
    if (r.registered) c.registered += 1;
  });
  const active7Openids = new Set(sessions.map((s) => String(s.openid || '')).filter(Boolean));
  rosterVisible.forEach((r) => {
    const c = classMap.get(r.class_id || '__none__');
    if (c && r.openid && active7Openids.has(r.openid)) c.active7.add(r.openid);
  });
  const classes = Array.from(classMap.values()).map((c) => ({
    class_id: c.class_id,
    class_name: c.class_name,
    class_status: c.class_status,
    // 未关联班级但在名册里写了班级名的记录：提示教师用「从名册并入」归并
    class_legacy_names: Array.from(c.legacyNames),
    is_demo: false,
    total: c.total,
    registered: c.registered,
    unregistered: c.total - c.registered,
    active7: c.active7.size
  })).sort((a, b) => String(a.class_name).localeCompare(String(b.class_name)));

  // ---- 学情提醒（统计规则，非 AI）----
  const alerts = [];
  // 注意：必须用排除演示班后的口径，否则 unregistered_count 会比 roster_total - registered_count 多
  const unregTotal = rosterVisible.length - registeredCount;
  if (unregTotal > 0) {
    alerts.push({ level: 'info', text: '名册中还有 ' + unregTotal + ' 名学生尚未注册微信' });
  }
  const idleCount = rosterVisible.filter((r) => r.registered && r.openid && !active7Openids.has(r.openid)).length;
  if (idleCount > 0) {
    alerts.push({ level: 'warn', text: '有 ' + idleCount + ' 名已注册学生最近 7 天没有学习记录' });
  }
  if (excludedSessions > 0 || excludedAi > 0 || demoRoster > 0) {
    alerts.push({ level: 'info', text: '已排除非学情数据（测试 / 演示 / 游客）：学习会话 ' + excludedSessions + ' 条、AI 提问 ' + excludedAi + ' 条、演示班名册 ' + demoRoster + ' 人' });
  }
  if (aiHot.length && aiHot[0].count >= 3) {
    alerts.push({ level: 'info', text: '本周 AI 提问最集中的是「' + aiHot[0].knowledge_point_id + '」（' + aiHot[0].count + ' 次）' });
  }

  return {
    ok: true,
    scope: superUser ? 'all' : 'me',
    lines: {
      total: idx.users.length,
      student: idx.counts.student,
      guest: idx.counts.guest,
      test: idx.counts.test + idx.counts.internal + idx.counts.demo
    },
    line_detail: idx.counts,
    excluded: {
      sessions: excludedSessions,
      sessions_test: excludedSessionsTest,
      sessions_guest: excludedSessionsByLine.guest,
      ai: excludedAi,
      ai_test: excludedAiTest,
      ai_guest: excludedAiByLine.guest,
      demo_roster: demoRoster
    },
    total_students: idx.users.length,
    roster_total: rosterVisible.length,
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
      last_login_at: u.last_login_at || '',
      // 数据标记（第一阶段）：production / test / unknown 与来源（auto / manual）
      data_quality: u.data_quality || '',
      data_quality_source: u.data_quality_source || ''
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

// ---- 数据维护（仅超级管理员）----
// 用途：正式发版前清空"测试期产生的过程数据"，让驾驶舱与各分析页从 0 开始。
// 安全约束：
//   1. 只有超管可调用（requireSuper）；
//   2. 只允许清理下面这 6 张过程表，名册与账号类集合（teachers / classes / students /
//      roster / users / teacher_notes / teacher_sessions / schools）传入即 403；
//   3. 默认 dry_run（只统计、不删除），真删必须带 dry_run:false 且 confirm_count 与预览一致；
//   4. 每次清理写入 maintenance_logs 留痕。
const RESETTABLE_COLLECTIONS = [
  { key: 'learning_sessions', label: '学习会话' },
  { key: 'learning_records', label: '学习行为事件' },
  { key: 'ai_conversations', label: 'AI 会话' },
  { key: 'ai_messages', label: 'AI 消息' },
  { key: 'survey_responses', label: '问卷作答' },
  { key: 'survey_invites', label: '问卷邀请' }
];

async function resetProcessData(event) {
  const me = await requireSuper(event);
  const allowed = new Set(RESETTABLE_COLLECTIONS.map((c) => c.key));
  const requested = Array.isArray(event && event.collections) && event.collections.length
    ? event.collections.map((c) => String(c).trim()).filter(Boolean)
    : RESETTABLE_COLLECTIONS.map((c) => c.key);

  const illegal = requested.filter((c) => !allowed.has(c));
  if (illegal.length) {
    throw makeError('FORBIDDEN_COLLECTION', 403,
      '不允许清理：' + illegal.join('、') + '。只允许清理过程数据：' + Array.from(allowed).join('、'));
  }
  const scope = Array.from(new Set(requested));

  // 预览：逐集合统计
  const counts = {};
  let total = 0;
  for (const key of scope) {
    const res = await db.collection(key).count().catch(() => ({ total: 0 }));
    counts[key] = res.total || 0;
    total += counts[key];
  }

  const dryRun = !(event && event.dry_run === false);
  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      collections: scope,
      counts,
      total,
      labels: RESETTABLE_COLLECTIONS.filter((c) => scope.indexOf(c.key) >= 0),
      hint: '确认后用相同 collections 再调用一次，带 dry_run:false 与 confirm_count=' + total + ' 即可清理'
    };
  }

  const confirmCount = Number(event && event.confirm_count);
  if (!Number.isFinite(confirmCount) || confirmCount !== total) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于待清理总条数（当前为 ' + total + '）；请先用 dry_run 预览再提交');
  }

  // 分块清理：服务端 where().remove() 每次有上限，循环到清空为止
  const removed = {};
  for (const key of scope) {
    let done = 0;
    for (let round = 0; round < 200; round += 1) {
      const res = await db.collection(key)
        .where({ _id: db.command.exists(true) })
        .remove()
        .catch(() => ({ stats: { removed: 0 } }));
      const n = (res && res.stats && res.stats.removed) || 0;
      done += n;
      if (n <= 0) break;
    }
    removed[key] = done;
  }

  await db.collection('maintenance_logs').add({ data: {
    action: 'data.reset',
    operator_id: me._id,
    operator_name: me.name || '',
    collections: scope,
    counts,
    removed,
    total,
    created_at: now()
  }}).catch(() => null);

  return { ok: true, mode: 'reset', collections: scope, counts, removed, total };
}

// ---- 数据维护：按人清理（仅超管）----
// 背景：测试数据往往是特定几个人（多数是老师自己）产生的，按"人"清理比按表清空精确得多。
// 规则：
//   1. 只有超管可调用；
//   2. 只删「勾选的这些人」名下的数据，其他人一条都不动（可按人核对，避免误删真实数据）；
//   3. 清理范围三块，默认只清行为数据：
//      behavior（默认开）＝学习会话 / 学习行为事件 / AI 会话与消息 / 问卷作答与邀请
//      account（默认关）＝删除该学生的注册账号（users 记录；删除后该微信号需重新注册）
//      roster（默认关）＝删除名册记录（students）与 AI 白名单（roster），并清理这些学生记录上的教师备注
//   4. 默认 dry_run（只统计不删）；真删需 dry_run:false 且 confirm_count = 选中人数；
//   5. 每次真删写入 maintenance_logs 留痕。
const PURGE_PERSON_MAX = 50;

// 行为数据的归人字段：learning_* 早期记录只有 openid，后来加了 user_id，两个都要匹配
const PERSON_BEHAVIOR_SOURCES = [
  { collection: 'learning_sessions', by: ['openid', 'user_id'] },
  { collection: 'learning_records', by: ['openid', 'user_id'] },
  { collection: 'ai_conversations', by: ['openid'] },
  { collection: 'survey_responses', by: ['user_id'] },
  { collection: 'survey_invites', by: ['user_id'] }
];

const PERSON_COUNT_LABELS = [
  { key: 'learning_sessions', label: '学习会话' },
  { key: 'learning_records', label: '行为事件' },
  { key: 'ai_conversations', label: 'AI 会话' },
  { key: 'ai_messages', label: 'AI 消息' },
  { key: 'survey_responses', label: '问卷作答' },
  { key: 'survey_invites', label: '问卷邀请' }
];

function chunksOf(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function emptyBehaviorCounts() {
  return {
    learning_sessions: 0,
    learning_records: 0,
    ai_conversations: 0,
    ai_messages: 0,
    survey_responses: 0,
    survey_invites: 0
  };
}

async function removeWhereAll(collection, cond) {
  let removed = 0;
  for (let round = 0; round < 50; round += 1) {
    const res = await db.collection(collection).where(cond).remove().catch(() => ({ stats: { removed: 0 } }));
    const n = (res && res.stats && res.stats.removed) || 0;
    removed += n;
    if (n <= 0) break;
  }
  return removed;
}

async function removeWhereIn(collection, field, values) {
  let removed = 0;
  for (const chunk of chunksOf(values, PURGE_CHUNK)) {
    removed += await removeWhereAll(collection, { [field]: db.command.in(chunk) });
  }
  return removed;
}

async function loadBehaviorIndex() {
  const [sessions, records, conversations, messages, responses, invites] = await Promise.all([
    fetchAll('learning_sessions').catch(() => []),
    fetchAll('learning_records').catch(() => []),
    fetchAll('ai_conversations').catch(() => []),
    fetchAll('ai_messages').catch(() => []),
    fetchAll('survey_responses').catch(() => []),
    fetchAll('survey_invites').catch(() => [])
  ]);
  return { sessions, records, conversations, messages, responses, invites };
}

function behaviorCountsFor(user, idx) {
  const openid = String(user.openid || '');
  const uid = String(user._id || '');
  const convIds = new Set(idx.conversations
    .filter((c) => openid && String(c.openid || '') === openid)
    .map((c) => c._id));
  const mine = (row) => (!!openid && String(row.openid || '') === openid)
    || (!!uid && String(row.user_id || '') === uid);
  return {
    learning_sessions: idx.sessions.filter(mine).length,
    learning_records: idx.records.filter(mine).length,
    ai_conversations: convIds.size,
    ai_messages: idx.messages.filter((m) => convIds.has(m.conversation_id)).length,
    survey_responses: idx.responses.filter((r) => uid && String(r.user_id || '') === uid).length,
    survey_invites: idx.invites.filter((r) => uid && String(r.user_id || '') === uid).length
  };
}

// 名册/白名单里没有账号的"残留"记录：只能按 学号+姓名 统计（learning_records 存了这两个字段）
function countRecordsByName(idx, studentNo, name) {
  const no = normalizeStudentNo(studentNo);
  const nm = String(name == null ? '' : name).trim();
  if (!no || !nm) return 0;
  return idx.records.filter((r) => normalizeStudentNo(r.student_id) === no
    && String(r.student_name == null ? '' : r.student_name).trim() === nm).length;
}

// 列出可清理的人：users 账号 ∪ 名册(students) ∪ 白名单(roster)，
// 这样即便某人只有名册/白名单残留（账号已删），也能被找到并清掉。
async function listPurgeCandidates(event) {
  await requireSuper(event);
  const keyword = String((event && event.keyword) || '').trim().toLowerCase();
  const [users, students, roster, idx] = await Promise.all([
    fetchAll('users').catch(() => []),
    loadAllStudents(),
    fetchAll('roster').catch(() => []),
    loadBehaviorIndex()
  ]);
  const rosterKeys = new Set(roster.map((r) => rosterKey(r.student_id, r.name)));
  const studentMap = new Map(students.map((s) => [rosterKey(s.student_no, s.name), s]));

  const byKey = new Map();
  const standalone = [];   // 空账号（无学号无姓名）无法用「学号|姓名」区分，必须各自成行
  const sumCounts = (counts) => Object.keys(counts).reduce((sum, k) => sum + counts[k], 0);
  const emptyCounts = emptyBehaviorCounts;

  // 1) 有账号的学生
  users.filter((u) => u && u.role === 'student').forEach((u) => {
    const key = rosterKey(u.student_id, u.name);
    const counts = behaviorCountsFor(u, idx);
    counts.learning_records = Math.max(counts.learning_records, countRecordsByName(idx, u.student_id, u.name));
    const item = {
      key: 'user:' + u._id,
      user_id: u._id,
      has_account: true,
      openid: String(u.openid || ''),
      unionid: String(u.unionid || ''),
      created_at: u.created_at || '',
      last_login_at: u.last_login_at || '',
      name: u.name || '',
      student_no: u.student_id || '',
      school: u.school || '',
      registered_at: u.updated_at || u.created_at || '',
      in_roster: rosterKeys.has(key),
      in_class_roster: false,
      owner_teacher_name: '',
      counts,
      total: sumCounts(counts)
    };
    if (!normalizeStudentNo(u.student_id) && !String(u.name || '').trim()) {
      standalone.push(item);   // 空账号：每条独立显示，避免与其它空账号共用「|」键被合并
      return;
    }
    byKey.set(key, item);
  });

  // 2) 名册里的记录（可能没有账号：账号已删或从未注册）
  students.forEach((s) => {
    const key = rosterKey(s.student_no, s.name);
    const exist = byKey.get(key);
    if (exist) {
      exist.in_class_roster = true;
      exist.owner_teacher_name = s.owner_teacher_name || '';
      if (!exist.school) exist.school = s.school || '';
      return;
    }
    const counts = emptyCounts();
    counts.learning_records = countRecordsByName(idx, s.student_no, s.name);
    byKey.set(key, {
      key: 'name:' + key,
      user_id: '',
      has_account: false,
      name: s.name || '',
      student_no: s.student_no || '',
      school: s.school || '',
      registered_at: s.created_at || '',
      in_roster: rosterKeys.has(key),
      in_class_roster: true,
      owner_teacher_name: s.owner_teacher_name || '',
      counts,
      total: sumCounts(counts)
    });
  });

  // 3) 白名单里的记录（极端情况下名册也没有，只剩白名单）
  roster.forEach((r) => {
    const key = rosterKey(r.student_id, r.name);
    const nameless = !String(r.name || '').trim();
    const exist = byKey.get(key);
    if (exist) {
      exist.in_roster = true;
      if (nameless) exist.nameless_roster = true;
      return;
    }
    const counts = emptyCounts();
    counts.learning_records = countRecordsByName(idx, r.student_id, r.name);
    byKey.set(key, {
      key: 'name:' + key,
      user_id: '',
      has_account: false,
      nameless_roster: nameless,
      name: r.name || '',
      student_no: normalizeStudentNo(r.student_id),
      school: '',
      registered_at: r.created_at || '',
      in_roster: true,
      in_class_roster: false,
      owner_teacher_name: '',
      counts,
      total: sumCounts(counts)
    });
  });

  let items = Array.from(byKey.values()).concat(standalone);

  // 阶段划分（只描述状态，不做"是不是垃圾"的判断——由使用者按实际情况判断）
  //   有账号：仅登录未注册 / 已注册未入册 / 已入册
  //   无账号：名册已录入·未注册（教师已录名单、学生还没登录过，属正常待激活）
  //           旧白名单残留·无姓名（早期按学号批量导入的 legacy 记录）
  //           白名单残留·无名册（白名单有、名册没有）
  items.forEach((it) => {
    const no = normalizeStudentNo(it.student_no);
    const nm = String(it.name || '').trim();
    if (it.has_account) {
      if (!no && !nm) it.stage = '仅登录未注册';
      else if (it.in_class_roster || it.in_roster) it.stage = '已入册';
      else it.stage = '已注册未入册';
      return;
    }
    if (it.in_class_roster) it.stage = '名册已录入·未注册';
    else if (it.nameless_roster) it.stage = '旧白名单残留·无姓名';
    else if (it.in_roster) it.stage = '白名单残留·无名册';
    else it.stage = '未知';
  });

  if (keyword) {
    items = items.filter((it) => (it.name + ' ' + it.student_no + ' ' + it.school).toLowerCase().indexOf(keyword) >= 0);
  }
  items.sort((a, b) => (b.total - a.total) || String(a.student_no).localeCompare(String(b.student_no)));
  const limit = Math.max(1, Math.min(1000, Number((event && event.limit) || 500)));
  return {
    ok: true,
    total: items.length,
    items: items.slice(0, limit),
    labels: PERSON_COUNT_LABELS
  };
}

// 空账号清理：已微信登录、但从未完成注册的 users 记录（学年/姓名全空）。
// 来源：ensureUser(openid) 在任何人打开小程序登录时自动创建；对方没填学校/姓名/学号就留下这种空行。
// 注意：删除后该微信号下次打开小程序会重新生成一条，因此它更适合"发版前清一次 + 平时用过滤隐藏"。
async function emptyAccountCleanup(event) {
  const me = await requireSuper(event);
  const users = await fetchAll('users').catch(() => []);
  const empties = users.filter((u) => u && u.role === 'student'
    && !normalizeStudentNo(u.student_id)
    && !String(u.name || '').trim());
  const dryRun = !(event && event.dry_run === false);
  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      total: empties.length,
      sample: empties.slice(0, 20).map((u) => ({
        openid_tail: String(u.openid || '').slice(-6),
        created_at: u.created_at || u.updated_at || ''
      })),
      hint: '确认后带 dry_run:false 与 confirm_count=' + empties.length + ' 再次调用即可清理'
    };
  }
  const confirmCount = Number(event && event.confirm_count);
  if (!Number.isFinite(confirmCount) || confirmCount !== empties.length) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于待清理条数（当前为 ' + empties.length + '）');
  }
  const removed = empties.length ? await removeWhereIn('users', '_id', empties.map((u) => u._id)) : 0;
  await db.collection('maintenance_logs').add({ data: {
    action: 'data.emptyAccountCleanup',
    operator_id: me._id,
    operator_name: me.name || '',
    removed,
    total: empties.length,
    created_at: now()
  }}).catch(() => null);
  return { ok: true, mode: 'purge', removed, total: empties.length };
}

// 历史遗留清理：只有学号、没有姓名的白名单记录。
// 来源：早期"按学号批量导入名单"入口（api 云函数 roster.import，写入 name:'' 且 source:'legacy_import'）。
// 在"学号 + 姓名"核对规则下这类记录不再有任何放行作用，属于可安全清除的垃圾数据。
async function legacyRosterCleanup(event) {
  const me = await requireSuper(event);
  const all = await fetchAll('roster').catch(() => []);
  const legacy = all.filter((r) => !String(r.name || '').trim() && normalizeStudentNo(r.student_id));
  const bySource = legacy.reduce((acc, r) => {
    const key = r.source || '(无 source)';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const dryRun = !(event && event.dry_run === false);
  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      total: legacy.length,
      by_source: bySource,
      sample: legacy.slice(0, 20).map((r) => normalizeStudentNo(r.student_id)),
      hint: '确认后带 dry_run:false 与 confirm_count=' + legacy.length + ' 再次调用即可清理'
    };
  }

  const confirmCount = Number(event && event.confirm_count);
  if (!Number.isFinite(confirmCount) || confirmCount !== legacy.length) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于待清理条数（当前为 ' + legacy.length + '）');
  }
  const removed = legacy.length
    ? await removeWhereIn('roster', '_id', legacy.map((r) => r._id))
    : 0;
  await db.collection('maintenance_logs').add({ data: {
    action: 'data.legacyRosterCleanup',
    operator_id: me._id,
    operator_name: me.name || '',
    removed,
    total: legacy.length,
    by_source: bySource,
    created_at: now()
  }}).catch(() => null);
  return { ok: true, mode: 'purge', removed, total: legacy.length, by_source: bySource };
}

// ---- 数据标记：回填 / 人工修改（第一阶段：标记 + 回填，见 docs/requirements/REQ-003-phase1-plan.md）----
// 用户确认的显式测试账号（学号 + 姓名，已按 normalizeStudentNo + trim 归一）。
// 说明：这是一次性种子名单；今后新增的测试账号请用「数据标记」人工标为 test。
const TEST_ACCOUNT_KEYS = ['86804388|csj', '0000001|无敌大野牛', '23210010119|王硕'];
// T0 = 正式发布日（2026-09-09）：当天及之后注册的非 internal/test 账号视为真实数据
const DATA_QUALITY_T0 = '2026-09-09';

// 回填只写 data_quality / data_quality_source，不动 is_internal（它由环境变量决定）、不动其它字段
async function backfillDataQuality(event) {
  const me = await requireSuper(event);
  const dryRun = !(event && event.dry_run === false);
  const idx = await buildLineIndex();
  const testOpenids = new Set();
  idx.users.forEach((u) => {
    if (TEST_ACCOUNT_KEYS.indexOf(rosterKey(u.student_id, u.name)) >= 0) testOpenids.add(String(u.openid || ''));
  });

  const targets = [];
  const skipped = { internal: 0, manual: 0, unchanged: 0 };
  idx.users.forEach((u) => {
    const openid = String(u.openid || '');
    if (openid && idx.byOpenid.get(openid) === 'internal') { skipped.internal += 1; return; }
    if (String(u.data_quality_source || '') === 'manual') { skipped.manual += 1; return; }
    let quality = 'production';
    if (openid && testOpenids.has(openid)) quality = 'test';
    else if (String(u.created_at || '').slice(0, 10) < DATA_QUALITY_T0) quality = 'unknown';
    if (String(u.data_quality || '') === quality) { skipped.unchanged += 1; return; }
    targets.push({ user_id: String(u._id), name: u.name || '', student_id: u.student_id || '', quality });
  });

  const categories = targets.reduce((acc, t) => {
    acc[t.quality] = (acc[t.quality] || 0) + 1;
    return acc;
  }, {});

  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run',
      total_users: idx.users.length,
      pending: targets.length,
      categories,
      skipped,
      preview: targets.slice(0, 50),
      hint: '确认后带 dry_run:false 与 confirm_count=' + targets.length + ' 再次调用即可写入'
    };
  }

  const confirmCount = Number(event && event.confirm_count);
  if (!Number.isFinite(confirmCount) || confirmCount !== targets.length) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于待写入条数（当前为 ' + targets.length + '）；请先预览');
  }

  let updated = 0;
  const errors = [];
  for (const t of targets) {
    try {
      await db.collection('users').doc(t.user_id).update({
        data: { data_quality: t.quality, data_quality_source: 'auto', updated_at: now() }
      });
      updated += 1;
    } catch (e) {
      errors.push({ user_id: t.user_id, code: 'UPDATE_FAILED', msg: String((e && e.message) || e) });
    }
  }
  await db.collection('maintenance_logs').add({ data: {
    action: 'data.backfillQuality',
    operator_id: me._id,
    operator_name: me.name || '',
    categories,
    updated,
    skipped,
    total_users: idx.users.length,
    errors: errors.length,
    created_at: now()
  }}).catch(() => null);
  return { ok: true, mode: 'commit', updated, categories, skipped, errors: errors.slice(0, 50) };
}

// 人工标记：只改 data_quality（manual 优先级高于回填的 auto），不改 is_internal（D22）
async function markDataQuality(event) {
  const me = await requireSuper(event);
  const userIds = Array.isArray(event && event.user_ids)
    ? event.user_ids.map((v) => String(v).trim()).filter(Boolean)
    : [];
  const quality = String((event && event.quality) || '').trim();
  if (!userIds.length) throw makeError('MISSING_USER_IDS', 400, '请选择要标记的账号');
  if (['production', 'test', 'unknown'].indexOf(quality) < 0) {
    throw makeError('BAD_QUALITY', 400, '数据标记只能是 production / test / unknown');
  }
  let updated = 0;
  const failed = [];
  for (const id of userIds) {
    try {
      await db.collection('users').doc(id).update({
        data: { data_quality: quality, data_quality_source: 'manual', updated_at: now() }
      });
      updated += 1;
    } catch (e) {
      failed.push({ user_id: id, code: 'UPDATE_FAILED', msg: String((e && e.message) || e) });
    }
  }
  await db.collection('maintenance_logs').add({ data: {
    action: 'data.markQuality',
    operator_id: me._id,
    operator_name: me.name || '',
    user_ids: userIds.slice(0, 200),
    quality,
    updated,
    failed: failed.length,
    created_at: now()
  }}).catch(() => null);
  return { ok: true, quality, updated, failed: failed.slice(0, 50) };
}

async function purgePersonData(event) {
  const me = await requireSuper(event);
  // 入参：targets = ['user:<账号文档id>', 'name:<学号>|<姓名>']（推荐）；也兼容旧版 user_ids
  const rawTargets = Array.isArray(event && event.targets) && event.targets.length
    ? event.targets.map((t) => String(t).trim()).filter(Boolean)
    : (Array.isArray(event && event.user_ids)
      ? event.user_ids.map((id) => 'user:' + String(id).trim()).filter((t) => t !== 'user:')
      : []);
  if (!rawTargets.length) throw makeError('NO_SELECTION', 400, '请先勾选要清理的人');
  if (rawTargets.length > PURGE_PERSON_MAX) {
    throw makeError('TOO_MANY_SELECTED', 400, '一次最多清理 ' + PURGE_PERSON_MAX + ' 人，请分批操作');
  }

  const scopeInput = (event && event.scope) || {};
  const scope = {
    behavior: scopeInput.behavior !== false,   // 默认清理行为数据
    account: scopeInput.account === true,      // 默认不删注册账号
    roster: scopeInput.roster === true         // 默认不删名册与白名单
  };
  if (!scope.behavior && !scope.account && !scope.roster) {
    throw makeError('NO_SCOPE', 400, '请至少选择一项要清理的内容');
  }

  const idx = await loadBehaviorIndex();
  const targets = [];
  for (const raw of rawTargets) {
    if (raw.indexOf('user:') === 0) {
      const res = await db.collection('users').doc(raw.slice(5)).get().catch(() => null);
      const user = res && res.data;
      if (!user || user.role !== 'student') continue;
      const counts = behaviorCountsFor(user, idx);
      counts.learning_records = Math.max(counts.learning_records, countRecordsByName(idx, user.student_id, user.name));
      targets.push({
        key: raw, kind: 'user', user_id: user._id, openid: String(user.openid || ''),
        name: user.name || '', student_no: normalizeStudentNo(user.student_id), school: user.school || '', counts
      });
      continue;
    }
    if (raw.indexOf('name:') === 0) {
      const key = raw.slice(5);
      const parts = key.split('|');
      const no = normalizeStudentNo(parts[0]);
      const nm = String(parts[1] == null ? '' : parts[1]).trim();
      // 允许"只有学号、没有姓名"的历史白名单记录（早期按学号批量导入产生）
      if (!no) continue;
      const counts = emptyBehaviorCounts();
      counts.learning_records = countRecordsByName(idx, no, nm);
      targets.push({ key: raw, kind: 'name', user_id: '', openid: '', name: nm, student_no: no, school: '', counts });
    }
  }
  if (!targets.length) throw makeError('NOT_FOUND', 404, '选中的记录已不存在（可能刚被清理过）');

  const sumCounts = (counts) => Object.keys(counts).reduce((sum, k) => sum + counts[k], 0);
  const preview = targets.map((t) => ({
    key: t.key,
    kind: t.kind,
    user_id: t.user_id,
    name: t.name,
    student_no: t.student_no,
    school: t.school,
    counts: t.counts,
    total: sumCounts(t.counts)
  }));
  const totalRecords = preview.reduce((sum, p) => sum + p.total, 0);
  const accountTargets = targets.filter((t) => t.kind === 'user');

  if (!(event && event.dry_run === false)) {
    return {
      ok: true,
      mode: 'dry_run',
      scope,
      people: preview,
      people_count: targets.length,
      account_count: accountTargets.length,
      total_records: totalRecords,
      labels: PERSON_COUNT_LABELS,
      hint: '确认后带 dry_run:false 与 confirm_count=' + targets.length + '（选中人数）再次调用即可清理'
    };
  }

  const confirmCount = Number(event && event.confirm_count);
  if (!Number.isFinite(confirmCount) || confirmCount !== targets.length) {
    throw makeError('CONFIRM_MISMATCH', 400,
      'confirm_count 必须等于选中人数（当前为 ' + targets.length + '）；请先预览再提交');
  }

  const openids = accountTargets.map((t) => t.openid).filter(Boolean);
  const userIds = accountTargets.map((t) => t.user_id);
  const removed = {};

  if (scope.behavior) {
    // AI 消息没有 openid，只能按"这些人的会话 id"删
    const convIds = idx.conversations
      .filter((c) => openids.indexOf(String(c.openid || '')) >= 0)
      .map((c) => c._id);
    removed.ai_messages = convIds.length ? await removeWhereIn('ai_messages', 'conversation_id', convIds) : 0;

    for (const source of PERSON_BEHAVIOR_SOURCES) {
      let count = 0;
      for (const field of source.by) {
        const values = field === 'openid' ? openids : userIds;
        if (!values.length) continue;
        count += await removeWhereIn(source.collection, field, values);
      }
      removed[source.collection] = count;
    }
    // 只按 openid/user_id 可能漏掉早期只写了 学号+姓名 的行为记录，这里按「学号+姓名」再兜一遍
    let byName = 0;
    for (const t of targets) {
      if (!t.student_no || !t.name) continue;
      byName += await removeWhereAll('learning_records', { student_id: t.student_no, student_name: t.name });
    }
    removed.learning_records += byName;
  }

  if (scope.roster) {
    const students = await loadAllStudents();
    const studentIds = [];
    targets.forEach((t) => {
      const key = rosterKey(t.student_no, t.name);
      students.filter((s) => rosterKey(s.student_no, s.name) === key).forEach((s) => studentIds.push(s._id));
    });
    removed.students = studentIds.length ? await removeWhereIn('students', '_id', studentIds) : 0;
    removed.teacher_notes = studentIds.length ? await removeWhereIn('teacher_notes', 'doc_id', studentIds) : 0;

    // 白名单按「学号 + 姓名」精确匹配删除
    const rosterAll = await fetchAll('roster').catch(() => []);
    const keys = new Set(targets.map((t) => rosterKey(t.student_no, t.name)));
    const rosterIds = rosterAll.filter((r) => keys.has(rosterKey(r.student_id, r.name))).map((r) => r._id);
    removed.roster = rosterIds.length ? await removeWhereIn('roster', '_id', rosterIds) : 0;
  }

  if (scope.account && userIds.length) {
    removed.users = await removeWhereIn('users', '_id', userIds);
  }

  await db.collection('maintenance_logs').add({ data: {
    action: 'data.personPurge',
    operator_id: me._id,
    operator_name: me.name || '',
    scope,
    people: preview.map((p) => ({ key: p.key, kind: p.kind, name: p.name, student_no: p.student_no, total: p.total })),
    removed,
    created_at: now()
  }}).catch(() => null);

  return {
    ok: true,
    mode: 'purge',
    scope,
    people: preview,
    people_count: targets.length,
    account_count: accountTargets.length,
    total_records: totalRecords,
    removed,
    labels: PERSON_COUNT_LABELS
  };
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

// ---- 数据分线（真实学情 / 游客漏斗 / 测试）----
// 单一实现：所有报表口径都必须经过这里，避免各处自行判断（见 docs/requirements/REQ-003.md §4、§8）。
// 优先级：internal > demo > test > guest > student；每个用户唯一归属，三条线求和 = 总用户数。
const EXCLUDED_LINES = ['internal', 'demo', 'test'];

function isExcludedLine(line) {
  return EXCLUDED_LINES.indexOf(line) >= 0;
}

//   internal：openid 命中 INTERNAL_OPENIDS（环境变量，人工不可改）
//   demo    ：该用户命中的名册行所在班级被标记为演示班（classes.is_demo）
//   test    ：users.data_quality === 'test'（回填或超管人工结论）
//   guest   ：未命中名册（含未填资料者）
//   student ：命中名册且不属上述
async function buildLineIndex() {
  const [users, students, classes] = await Promise.all([
    fetchAll('users').catch(() => []),
    loadAllStudents(),
    fetchAll('classes').catch(() => [])
  ]);
  const classById = new Map(classes.map((c) => [String(c._id), c]));
  const demoClassIds = new Set(classes.filter((c) => c.is_demo === true).map((c) => String(c._id)));
  const internalSet = new Set(INTERNAL_OPENIDS);
  const studentClassByKey = new Map();
  students.forEach((s) => {
    studentClassByKey.set(rosterKey(s.student_no, s.name), String(s.class_id || ''));
  });
  const counts = { internal: 0, demo: 0, test: 0, guest: 0, student: 0 };
  const byOpenid = new Map();
  const byUserId = new Map();
  const scopedUsers = users.filter((u) => String(u.role || 'student') === 'student');
  scopedUsers.forEach((u) => {
    const openid = String(u.openid || '');
    const key = rosterKey(u.student_id, u.name);
    const hasRoster = studentClassByKey.has(key);
    let line = 'guest';
    if (openid && internalSet.has(openid)) line = 'internal';
    else if (hasRoster && demoClassIds.has(studentClassByKey.get(key))) line = 'demo';
    else if (String(u.data_quality || '') === 'test') line = 'test';
    else if (hasRoster) line = 'student';
    counts[line] += 1;
    if (openid) byOpenid.set(openid, line);
    byUserId.set(String(u._id), line);
  });
  return { counts, byOpenid, byUserId, demoClassIds, classById, users: scopedUsers, students };
}

// 取某条数据记录所属的线：优先按 openid，其次按 user_id；无法判定时按 guest 处理（不计入学情）
function lineOfRecord(idx, record) {
  const openid = String((record && record.openid) || '');
  if (openid && idx.byOpenid.has(openid)) return idx.byOpenid.get(openid);
  const uid = String((record && record.user_id) || '');
  if (uid && idx.byUserId.has(uid)) return idx.byUserId.get(uid);
  return 'guest';
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

  // 默认只保留真实学情（student 线）：internal / demo / test / guest 一并排除（见 REQ-003 §8）
  const lineIdx = await buildLineIndex();
  const beforeExclude = all.length;
  const guestCount = all.filter((r) => lineOfRecord(lineIdx, r) === 'guest').length;
  all = all.filter((r) => lineOfRecord(lineIdx, r) === 'student');
  const excluded = beforeExclude - all.length - guestCount;
  const excludedGuest = guestCount;

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

  return {
    ok: true,
    total: items.length,
    items: items.slice(0, limit),
    classes,
    is_super: scope.superUser,
    excluded_test: excluded,
    excluded_guest: excludedGuest
  };
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

  // 默认只保留真实学情：对话按 openid 归线，测试 / 演示 / 游客一并排除（见 REQ-003 §8）
  const lineIdx = await buildLineIndex();
  const beforeExclude = convs.length;
  const guestCount = convs.filter((c) => lineOfRecord(lineIdx, c) === 'guest').length;
  convs = convs.filter((c) => lineOfRecord(lineIdx, c) === 'student');
  const excluded = beforeExclude - convs.length - guestCount;
  const excludedGuest = guestCount;

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
    is_super: scope.superUser,
    excluded_test: excluded,
    excluded_guest: excludedGuest
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
    // 演示/内部班标记（仅超管可改）：报表与班级统计会排除演示班，鉴权不受影响
    is_demo: c.is_demo === true,
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
  // 演示班标记：只有超级管理员可以改（教师连自己的班也不能自行标记，见 docs/requirements/REQ-003.md D20）
  if (event && event.is_demo !== undefined) {
    if (!isSuper(me)) throw makeError('FORBIDDEN', 403, '只有超级管理员可以标记演示班');
    patch.is_demo = event.is_demo === true;
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
    else if (action === 'data.reset') result = await resetProcessData(input);
    else if (action === 'data.personList') result = await listPurgeCandidates(input);
    else if (action === 'data.personPurge') result = await purgePersonData(input);
    else if (action === 'data.legacyRoster') result = await legacyRosterCleanup(input);
    else if (action === 'data.emptyAccounts') result = await emptyAccountCleanup(input);
    else if (action === 'data.backfillQuality') result = await backfillDataQuality(input);
    else if (action === 'data.markQuality') result = await markDataQuality(input);
    else result = { ok: false, code: 'UNKNOWN_ACTION', msg: '未知操作' };

    return result;
  } catch (error) {
    return { ok: false, code: error.code || 'SERVER_ERROR', msg: error.message || '服务器错误' };
  }
};
