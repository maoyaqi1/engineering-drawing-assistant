const cloud = require('wx-server-sdk');
const ai = require('./ai/conversation.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
// 说明：roster 集合已下线（REQ-003 D16）；AI 放行判定源 = students 名册 + classes 班级状态。
const COLLECTIONS = ['users', 'learning_sessions', 'survey_responses', 'survey_invites', 'learning_records', 'classes'];
const SURVEY_ID = 'geometry_learning_2026';
const SURVEY_VERSION = 'v1';

// 名单管理员的 openid 列表（逗号分隔），通过云函数环境变量 ADMIN_OPENIDS 配置。
const ADMIN_OPENIDS = (process.env.ADMIN_OPENIDS || '')
  .split(/[,，;；\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

// 内部测试账号（微信 openid，逗号 / 分号 / 空格分隔）。只由环境变量决定，人工不可改（D22）。
// 用途：老师本人的自测数据不进真实学情；与 teacher 云函数的同名变量是两份独立配置，不要混用。
const INTERNAL_OPENIDS = (process.env.INTERNAL_OPENIDS || '')
  .split(/[,，;；\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

// T0 = 正式发布日：之后注册的新账号判为真实用户（data_quality=production），之前判为 unknown
const DATA_QUALITY_T0 = '2026-09-09';
// 名册按键查询的单次上限（B6）：超过需分页或索引改造，不得静默漏人
const ROSTER_QUERY_LIMIT = 2000;

// 已下线的 action（REQ-003 D16）：白名单副本 roster 已废弃，名册只由教师端维护。
// 明确回 ACTION_RETIRED，避免旧客户端只看到"未知操作"。
const RETIRED_ACTIONS = {
  'roster.import': 'roster.import 已下线：名册只能由教师端录入',
  'roster.list': 'roster.list 已下线：名册请在教师端查看',
  'roster.remove': 'roster.remove 已下线：名册请在教师端移除',
  'roster.clear': 'roster.clear 已下线：名册请在教师端管理'
};

function now() {
  return new Date().toISOString();
}

// 学号 / 姓名规范化（R11/D14）。两端必须一致：teacher 云函数有同名实现。
// 学号：trim + 去内部空白 + 全角转半角；大小写敏感（不统一转小写）。
function toHalfWidth(v) {
  return String(v == null ? '' : v)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

function normalizeStudentId(v) {
  return toHalfWidth(v).trim().replace(/\s+/g, '');
}

// 姓名：trim + 压缩连续空白
function normalizeName(v) {
  return toHalfWidth(v).trim().replace(/\s+/g, ' ');
}

function isInternalOpenid(openid) {
  return INTERNAL_OPENIDS.indexOf(String(openid == null ? '' : openid)) >= 0;
}

// 测试账号 = 内部账号（INTERNAL_OPENIDS）或被人工标记为 test 的账号。
// 依据 2026-09-14 用户决策：只要标注为测试账号，**所有功能都可用**（AI 教师、问卷、互动），
// 只是这些使用不计入真实学情——隔离由报表分线完成（internal / is_demo / test 三条线，
// 见 cloudfunctions/teacher 的 buildLineIndex 与 REQ-003 §8），所以鉴权侧不再对它们设门槛。
function isTestAccount(user, internal) {
  if (internal) return true;
  return String((user && user.data_quality) || '') === 'test';
}

// 北京时间日期（YYYY-MM-DD）：T0 比较用，避免 UTC 与发布日错位
function beijingDate(ms) {
  const d = new Date((Number.isFinite(ms) ? ms : Date.now()) + 8 * 60 * 60 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function defaultDataQuality() {
  return beijingDate(Date.now()) < DATA_QUALITY_T0 ? 'unknown' : 'production';
}

async function ensureCollections() {
  await Promise.all(COLLECTIONS.map((name) => db.createCollection(name).catch(() => null)));
}

// 同一 openid 出现多条时的"保留优先级"：填过资料的优先 → 更新时间最新 → 创建时间最早
function pickPrimaryUser(list) {
  return list.slice().sort((a, b) => {
    const pa = a && a.profile_completed ? 1 : 0;
    const pb = b && b.profile_completed ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ua = String((a && (a.updated_at || a.last_login_at)) || '');
    const ub = String((b && (b.updated_at || b.last_login_at)) || '');
    if (ua !== ub) return ub.localeCompare(ua);
    return String((a && a.created_at) || '').localeCompare(String((b && b.created_at) || ''));
  })[0];
}

// 自愈：同一 openid 只保留 keepId 这一条，其余删除（用于兜住并发登录可能产生的重复账号）
async function removeDuplicateUsers(openid, keepId) {
  let removed = 0;
  for (let round = 0; round < 20; round += 1) {
    const res = await db.collection('users')
      .where({ openid, _id: db.command.neq(keepId) })
      .remove()
      .catch(() => ({ stats: { removed: 0 } }));
    const n = (res && res.stats && res.stats.removed) || 0;
    removed += n;
    if (n <= 0) break;
  }
  return removed;
}

async function ensureUser(openid, unionid) {
  const existing = await db.collection('users').where({ openid }).get();
  if (existing.data.length) {
    const user = pickPrimaryUser(existing.data);
    // 若历史上出现了同 openid 的多条（并发登录等），这里顺手收敛为一条
    if (existing.data.length > 1) {
      await removeDuplicateUsers(openid, user._id);
    }
    const patch = { last_login_at: now() };
    // D22：is_internal 只由 INTERNAL_OPENIDS 决定，登录时强制覆盖写（人工不可改）
    const internal = isInternalOpenid(openid);
    if (user.is_internal !== internal) patch.is_internal = internal;
    // R25：登录时补齐 data_quality；已有结论（含人工标记）不覆盖
    if (!user.data_quality) {
      patch.data_quality = defaultDataQuality();
      patch.data_quality_source = 'auto';
    }
    await db.collection('users').doc(user._id).update({ data: patch });
    return Object.assign({}, user, patch);
  }
  const record = {
    openid,
    unionid: unionid || null,
    nickname: '',
    avatar: '',
    role: 'student',
    status: 'active',
    valid_session_count: 0,
    is_internal: isInternalOpenid(openid),
    data_quality: defaultDataQuality(),
    data_quality_source: 'auto',
    created_at: now(),
    last_login_at: now()
  };
  const added = await db.collection('users').add({ data: record });
  // 并发兜底：插入后再查一次，若同 openid 出现多条，只保留一条
  const after = await db.collection('users').where({ openid }).get();
  if (after.data.length > 1) {
    const primary = pickPrimaryUser(after.data);
    await removeDuplicateUsers(openid, primary._id);
    return primary;
  }
  return Object.assign({ _id: added._id }, record);
}

async function validSessionCount(userId) {
  return (await db.collection('learning_sessions').where({ user_id: userId, is_valid: true }).count()).total;
}

async function surveyCompleted(userId) {
  return (await db.collection('survey_responses').where({ user_id: userId }).count()).total > 0;
}

// ---- 学生鉴权（判定源 = students 名册 + classes 班级状态，REQ-003 R3–R9）----

// 按键查询名册（B6）：按规范化学号查，再比对规范化姓名。
// - 同号不同名 → 不命中（否则别人拿同一学号就能冒用）
// - 不同号同名 → 不命中
// - 禁止把全表读当常态（旧实现 limit(1000) 全表读，超限会静默漏人）
async function findRosterRow(studentId, name) {
  const res = await db.collection('students')
    .where({ student_no: studentId })
    .limit(ROSTER_QUERY_LIMIT)
    .get();
  const rows = (res && res.data) || [];
  return rows.find((r) => normalizeName(r && r.name) === name) || null;
}

// 读班级文档：用 where 而不是 doc().get()，让「班级不存在」返回空、而不是抛错
async function readClassDoc(classId) {
  const res = await db.collection('classes').where({ _id: classId }).limit(1).get();
  return ((res && res.data) || [])[0] || null;
}

// 统一鉴权入口：需要「名册权益」的能力（AI 教师相关 action + 问卷）都在此判定，
// 避免各处复制匹配逻辑导致语义分叉。学校字段不参与放行，匹配键恒为「学号 + 姓名」。
//   level  = 'student' 在册学生（名册命中且班级 active，或 internal 豁免班级检查）
//          | 'guest'   其余（未注册游客 / 已注册游客 / 班级停用 / 未分班 / 读库失败）
//   reason = 'ok' | 'no_profile' | 'not_in_roster' | 'class_archived' | 'no_class' | 'check_failed'
// 注意：游客仍可正常使用点/线/面等互动功能与学习埋点（session / record.event / statistics 不被拒）；
//      测试账号（is_internal 或 data_quality=test）全功能开放，是否计入学情由报表分线决定。
async function resolveAccess(user) {
  const studentId = normalizeStudentId(user && user.student_id);
  const name = normalizeName(user && user.name);
  const internal = isInternalOpenid(user && user.openid);
  const base = { in_roster: false, is_internal: internal, class_id: '', class_name: '' };
  // 测试账号（internal 或人工标 test）：全功能开放，不做名册 / 班级门槛；
  // 仍然尽量回报名册命中情况，便于老师核对（不影响放行）。
  if (isTestAccount(user, internal)) {
    let row = null;
    if (studentId && name) {
      try {
        row = await findRosterRow(studentId, name);
      } catch (e) {
        row = null;
      }
    }
    const hit = row
      ? { in_roster: true, class_id: String(row.class_id || ''), class_name: String(row.class_name || '') }
      : {};
    return Object.assign({
      level: 'student',
      reason: 'ok',
      test_account: true,
      bypass: internal ? 'internal' : 'test',
      class_checked: false
    }, base, hit);
  }
  if (!studentId || !name) {
    return Object.assign({ level: 'guest', reason: 'no_profile' }, base);
  }

  let row;
  try {
    row = await findRosterRow(studentId, name);
  } catch (e) {
    // 读库失败 → fail closed（R5）：拒绝 AI，但不得误报「不在名册」
    return Object.assign({ level: 'guest', reason: 'check_failed', retryable: true }, base);
  }
  if (!row) return Object.assign({ level: 'guest', reason: 'not_in_roster' }, base);

  const hit = Object.assign({}, base, {
    in_roster: true,
    class_id: String(row.class_id || ''),
    class_name: String(row.class_name || '')
  });
  if (!hit.class_id) return Object.assign({ level: 'guest', reason: 'no_class' }, hit);

  let cls;
  try {
    cls = await readClassDoc(hit.class_id);
  } catch (e) {
    return Object.assign({ level: 'guest', reason: 'check_failed', retryable: true }, hit);
  }
  if (!cls) return Object.assign({ level: 'guest', reason: 'no_class' }, hit);
  const status = String(cls.status || 'active');
  if (status !== 'active') {
    return Object.assign({ level: 'guest', reason: 'class_archived', class_status: status }, hit);
  }
  return Object.assign({ level: 'student', reason: 'ok', class_status: status, class_checked: true }, hit);
}

// 非在册学生调用 AI 相关 action 时的统一拒绝结果（code 区分原因，前端据此给不同文案）
function accessDeniedResult(access) {
  const reason = access && access.reason;
  if (reason === 'no_profile') {
    return { ok: false, code: 'NO_PROFILE', msg: '请先填写学校、姓名和学号，之后才能使用 AI 教师提问' };
  }
  if (reason === 'class_archived') {
    return {
      ok: false,
      code: 'CLASS_ARCHIVED',
      msg: '你所在班级已停用，暂时不能使用 AI 教师提问，请联系老师恢复班级（投影、立体等互动功能不受影响）'
    };
  }
  if (reason === 'no_class') {
    return { ok: false, code: 'NO_CLASS', msg: '你还没有被分到班级，暂时不能使用 AI 教师提问，请联系老师把你加入班级' };
  }
  if (reason === 'check_failed') {
    return {
      ok: false,
      code: 'ACCESS_CHECK_FAILED',
      retryable: true,
      msg: '系统繁忙，暂时无法确认你的名册与班级信息，请稍后重试'
    };
  }
  return { ok: false, code: 'NOT_IN_ROSTER', msg: '老师还没把你的「姓名 + 学号」录入名册，暂时无法提问' };
}

// 名册权益判定（AI 与问卷共用）：
//   · 名册命中即可用（问卷不看班级状态，见下）；
//   · 测试账号（internal / test）按"全功能可用"处理。
function hasRosterRights(access) {
  if (!access) return false;
  return access.level === 'student' || access.in_roster === true;
}

// 问卷门槛（D15/R31）：邀请与提交均限「已注册学生」= 名册命中。
// 判定用 in_roster 而不是 level：班级停用只关 AI（D3），问卷属于学习反馈，仍应对名册学生开放。
function surveyDeniedResult(access) {
  const reason = access && access.reason;
  if (reason === 'no_profile') {
    return { ok: false, code: 'SURVEY_NO_PROFILE', msg: '请先填写学校、姓名和学号' };
  }
  if (reason === 'check_failed') {
    return { ok: false, code: 'ACCESS_CHECK_FAILED', retryable: true, msg: '系统繁忙，请稍后重试' };
  }
  return {
    ok: false,
    code: 'SURVEY_NOT_IN_ROSTER',
    msg: '问卷面向在册学生，你的「姓名 + 学号」还不在老师名册中'
  };
}

function isAdmin(openid) {
  return ADMIN_OPENIDS.includes(openid);
}

exports.main = async (event) => {
  const { OPENID, UNIONID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, code: 'NO_OPENID', msg: '无法获取用户身份' };
  }

  try {
    await ensureCollections();
    const action = (event && event.action) || '';

    if (action === 'login') {
      const user = await ensureUser(OPENID, UNIONID);
      return { ok: true, user, registered: !!user.student_id };
    }

    if (action === 'register') {
      const user = await ensureUser(OPENID, UNIONID);
      const school = String((event && event.school) || '').trim();
      const name = normalizeName((event && event.name) || '');
      const studentId = normalizeStudentId((event && event.student_id) || (event && event.studentId) || '');
      if (!school || !name || !studentId) {
        return { ok: false, code: 'MISSING_FIELDS', msg: '请完整填写学校、姓名和学号' };
      }
      // 学号 + 姓名 唯一：防止冒用；不同学校学号规则可能相同，因此不能只按学号判重
      const taken = await db.collection('users').where({ student_id: studentId }).get();
      const conflict = taken.data.find((u) => u._id !== user._id
        && normalizeName(u.name) === name);
      if (conflict) {
        return {
          ok: false,
          code: 'STUDENT_ID_TAKEN',
          msg: '该「学号 + 姓名」已被其他账号绑定，请核对学号与姓名是否填错'
        };
      }
      await db.collection('users').doc(user._id).update({ data: {
        school,
        name,
        student_id: studentId,
        profile_completed: true,
        updated_at: now()
      }});
      const updated = await db.collection('users').doc(user._id).get();
      // 带上本次鉴权结果：前端可立即提示「已录入名册」还是「仍是游客」
      return { ok: true, user: updated.data, registered: true, access: await resolveAccess(updated.data) };
    }

    if (action === 'roster.status') {
      const user = await ensureUser(OPENID, UNIONID);
      const access = await resolveAccess(user);
      return {
        ok: true,
        registered: access.reason !== 'no_profile', // 兼容既有字段：是否已填姓名 + 学号
        profile_completed: !!user.profile_completed,
        student_id: user.student_id || '',
        name: user.name || '',
        level: access.level,
        reason: access.reason,
        in_roster: access.in_roster,
        is_internal: access.is_internal,
        test_account: !!access.test_account,
        bypass: access.bypass || '',
        class_name: access.class_name || '',
        retryable: !!access.retryable,
        admin: isAdmin(OPENID)
      };
    }

    // 说明：roster.import / roster.list / roster.remove / roster.clear 已随 roster 集合下线
    // （REQ-003 D16）。学生端不写名册，名册唯一录入端是教师端（teacher 云函数 + 教师 Web）。

    if (action === 'session.start') {
      const user = await ensureUser(OPENID, UNIONID);
      const access = await resolveAccess(user);
      const added = await db.collection('learning_sessions').add({ data: {
        user_id: user._id,
        openid: OPENID,
        start_time: now(),
        end_time: '',
        duration: 0,
        module: String((event && event.module) || 'index'),
        interaction_count: 0,
        is_valid: false,
        // access 快照（R30/D8）：会话开始时刻的状态；写入后永不随后续状态变化更新
        access_level: access.level,
        access_reason: access.reason,
        in_roster: access.in_roster,
        is_internal: access.is_internal,
        // 测试账号标记进快照：便于日后按"当时是否测试账号"过滤，不依赖事后有没有改标记
        access_test_account: !!access.test_account,
        created_at: now()
      }});
      return { ok: true, session_id: added._id, access_level: access.level, access_reason: access.reason };
    }

    if (action === 'session.end') {
      const user = await ensureUser(OPENID, UNIONID);
      const sid = event && event.session_id;
      if (!sid) {
        return { ok: false, code: 'NO_SESSION', msg: '会话不存在' };
      }
      const duration = Math.max(0, Number(event.duration) || 0);
      const interactions = Math.max(0, Number(event.interaction_count) || 0);
      const isValid = duration >= 60 || interactions >= 3;
      await db.collection('learning_sessions').doc(sid).update({ data: {
        end_time: now(),
        duration,
        interaction_count: interactions,
        is_valid: isValid
      }});
      const count = await validSessionCount(user._id);
      await db.collection('users').doc(user._id).update({ data: { valid_session_count: count } });
      return { ok: true, is_valid: isValid, valid_session_count: count };
    }

    // 学习行为事件上报（章节进入/退出、AI 提问等），用于教师端学习轨迹与章节进度
    if (action === 'record.event') {
      const user = await ensureUser(OPENID, UNIONID);
      const eventType = String((event && event.event_type) || '').trim();
      if (!eventType) {
        return { ok: false, code: 'MISSING_EVENT_TYPE', msg: '缺少事件类型' };
      }
      const access = await resolveAccess(user);
      await db.collection('learning_records').add({ data: {
        user_id: user._id,
        openid: OPENID,
        student_id: user.student_id || '',
        student_name: user.name || '',
        session_id: String((event && event.session_id) || ''),
        event_type: eventType,
        chapter_id: String((event && event.chapter_id) || ''),
        chapter_name: String((event && event.chapter_name) || ''),
        knowledge_point_id: String((event && event.knowledge_point_id) || ''),
        knowledge_point_name: String((event && event.knowledge_point_name) || ''),
        page: String((event && event.page) || ''),
        duration: Math.max(0, Number((event && event.duration) || 0)),
        metadata: (event && event.metadata) || null,
        // access 快照（R30）：事件发生时刻的状态；写入后永不更新
        access_level: access.level,
        access_reason: access.reason,
        in_roster: access.in_roster,
        is_internal: access.is_internal,
        access_test_account: !!access.test_account,
        created_at: now()
      }});
      return { ok: true };
    }

    if (action === 'statistics') {
      const user = await ensureUser(OPENID, UNIONID);
      const access = await resolveAccess(user);
      const count = await validSessionCount(user._id);
      const completed = await surveyCompleted(user._id);
      const invite = await db.collection('survey_invites').where({ user_id: user._id }).get();
      const inviteRecord = invite.data[0] || null;
      // 问卷只面向「已注册学生」与测试账号（D15/R31 + 测试账号全功能可用）
      const surveyEligible = hasRosterRights(access);
      let markInvite = false;
      if (event && event.mark_invite && surveyEligible && count >= 5 && !completed) {
        if (!inviteRecord) {
          await db.collection('survey_invites').add({ data: {
            user_id: user._id,
            trigger_count: 1,
            last_trigger_time: now(),
            completed: false
          }});
          markInvite = true;
        } else if (!inviteRecord.completed && count >= 5 + inviteRecord.trigger_count * 2) {
          await db.collection('survey_invites').doc(inviteRecord._id).update({ data: {
            trigger_count: inviteRecord.trigger_count + 1,
            last_trigger_time: now()
          }});
          markInvite = true;
        }
      }
      return {
        ok: true,
        valid_session_count: count,
        survey_required: count >= 5,
        survey_completed: completed,
        survey_eligible: surveyEligible,
        can_invite: markInvite
      };
    }

    if (action === 'survey.submit') {
      const user = await ensureUser(OPENID, UNIONID);
      const access = await resolveAccess(user);
      // 问卷仅限已注册学生与测试账号（D15/R31）：未注册游客与已注册游客都不能提交
      if (!hasRosterRights(access)) return surveyDeniedResult(access);
      const surveyId = (event && event.survey_id) || SURVEY_ID;
      const existing = await db.collection('survey_responses').where({ user_id: user._id, survey_id: surveyId }).count();
      if (existing.total > 0) {
        return { ok: false, code: 'ALREADY_SUBMITTED', msg: '已提交过该问卷' };
      }
      await db.collection('survey_responses').add({ data: {
        user_id: user._id,
        openid: OPENID,
        survey_id: surveyId,
        survey_version: (event && event.survey_version) || SURVEY_VERSION,
        answers: (event && event.answers) || {},
        submitted_at: now()
      }});
      const invite = await db.collection('survey_invites').where({ user_id: user._id }).get();
      if (invite.data[0]) {
        await db.collection('survey_invites').doc(invite.data[0]._id).update({
          data: { completed: true, last_trigger_time: now() }
        });
      }
      return { ok: true, survey_completed: true };
    }

    if (action === 'ai.ask') {
      await ai.ensureCollections();
      const user = await ensureUser(OPENID, UNIONID);
      const access = await resolveAccess(user);
      if (access.level !== 'student') return accessDeniedResult(access);
      return { ok: true, ...(await ai.answerQuestion({
        openid: OPENID,
        conversationId: (event && event.conversation_id) || null,
        message: (event && event.message) || '',
        knowledgePoint: (event && event.knowledge_point) || null,
        imageBase64: (event && event.image_base64) || null
      })) };
    }

    if (action === 'ai.list') {
      await ai.ensureCollections();
      const access = await resolveAccess(await ensureUser(OPENID, UNIONID));
      if (access.level !== 'student') return accessDeniedResult(access);
      return { ok: true, conversations: await ai.listConversations({ openid: OPENID }) };
    }

    if (action === 'ai.detail') {
      await ai.ensureCollections();
      const access = await resolveAccess(await ensureUser(OPENID, UNIONID));
      if (access.level !== 'student') return accessDeniedResult(access);
      const detail = await ai.getConversationDetail({ openid: OPENID, conversationId: (event && event.conversation_id) || '' });
      if (!detail) return { ok: false, code: 'NOT_FOUND', msg: '对话不存在' };
      return { ok: true, conversation: detail };
    }

    if (action === 'ai.feedback') {
      await ai.ensureCollections();
      const access = await resolveAccess(await ensureUser(OPENID, UNIONID));
      if (access.level !== 'student') return accessDeniedResult(access);
      const result = await ai.recordFeedback({
        openid: OPENID,
        messageId: (event && event.message_id) || '',
        rating: (event && event.rating) || '',
        reason: (event && event.reason) || null
      });
      return { ok: true, ...result };
    }

    if (RETIRED_ACTIONS[action]) return { ok: false, code: 'ACTION_RETIRED', msg: RETIRED_ACTIONS[action] };
    return { ok: false, code: 'UNKNOWN_ACTION', msg: '未知操作' };
  } catch (error) {
    return { ok: false, code: 'SERVER_ERROR', msg: String(error && error.message || error) };
  }
};
