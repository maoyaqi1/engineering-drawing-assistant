const cloud = require('wx-server-sdk');
const ai = require('./ai/conversation.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = ['users', 'learning_sessions', 'survey_responses', 'survey_invites', 'roster', 'learning_records'];
const SURVEY_ID = 'geometry_learning_2026';
const SURVEY_VERSION = 'v1';

// 名单管理员的 openid 列表（逗号分隔），通过云函数环境变量 ADMIN_OPENIDS 配置。
const ADMIN_OPENIDS = (process.env.ADMIN_OPENIDS || '')
  .split(/[,，;；\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

function now() {
  return new Date().toISOString();
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
    await db.collection('users').doc(user._id).update({ data: { last_login_at: now() } });
    return user;
  }
  const record = {
    openid,
    unionid: unionid || null,
    nickname: '',
    avatar: '',
    role: 'student',
    status: 'active',
    valid_session_count: 0,
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

// ---- 学生名单与管理员 ----
function normalizeStudentId(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, '');
}

const ROSTER_HEADER_TOKENS = new Set([
  'student_id', 'studentid', 'studentid', '学号', '学号id', '学号id',
  'id', '编号', '序号'
]);

function isRosterHeaderToken(s) {
  return ROSTER_HEADER_TOKENS.has(String(s).toLowerCase());
}

// 白名单键 = 学号 + 姓名（不同学校的学号规则可能相同，不能只按学号判断）
// legacy = 迁移前只有学号、没有姓名的旧记录；仅用于 roster.import 的去重，不再参与放行判定
async function loadRosterSet() {
  const res = await db.collection('roster').field({ student_id: true, name: true }).limit(1000).get();
  const pairs = new Set();
  const legacy = new Set();
  res.data.forEach((r) => {
    const sid = normalizeStudentId(r.student_id);
    if (!sid) return;
    const nm = String(r.name || '').trim();
    if (nm) pairs.add(sid + '|' + nm);
    else legacy.add(sid);
  });
  return { pairs, legacy };
}

async function isInRoster(studentId, name) {
  const sid = normalizeStudentId(studentId);
  const nm = String(name == null ? '' : name).trim();
  // 学号与姓名「两项都要对上」才算在白名单：
  // - 同号不同名 → 不放行（否则别人拿同一学号就能冒用）
  // - 不同号同名 → 不放行
  // - 旧记录（无姓名）不再按学号兜底放行；需先用教师端 roster.backfill 补齐姓名
  if (!sid || !nm) return false;
  const set = await loadRosterSet();
  return set.pairs.has(sid + '|' + nm);
}

// 统一鉴权入口：需要「名册权益」的能力（AI 教师相关 action）都在此判定，
// 避免各处复制匹配逻辑导致语义分叉。学校字段不参与放行，匹配键恒为「学号 + 姓名」。
//   level  = 'student' 名册内的正式学生 | 'guest' 游客
//   reason = 'no_profile' 还没填姓名/学号 | 'not_in_roster' 填了但不在名册 | 'ok'
// 注意：游客仍可正常使用点/线/面等互动功能与学习埋点（session / record.event / statistics 不做鉴权）。
async function resolveAccess(user) {
  const studentId = normalizeStudentId(user && user.student_id);
  const name = String((user && user.name) || '').trim();
  if (!studentId || !name) return { level: 'guest', reason: 'no_profile', in_roster: false };
  if (!(await isInRoster(studentId, name))) return { level: 'guest', reason: 'not_in_roster', in_roster: false };
  return { level: 'student', reason: 'ok', in_roster: true };
}

// 非正式学生调用 AI 相关 action 时的统一拒绝结果（code 区分「没填资料」与「不在名册」）
function accessDeniedResult(access) {
  if (access && access.reason === 'no_profile') {
    return { ok: false, code: 'NO_PROFILE', msg: '请先填写学校、姓名和学号，之后才能使用 AI 教师提问' };
  }
  return { ok: false, code: 'NOT_IN_ROSTER', msg: '老师还没把你的「姓名 + 学号」录入名册，暂时无法提问' };
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
      const name = String((event && event.name) || '').trim();
      const studentId = normalizeStudentId((event && event.student_id) || (event && event.studentId) || '');
      if (!school || !name || !studentId) {
        return { ok: false, code: 'MISSING_FIELDS', msg: '请完整填写学校、姓名和学号' };
      }
      // 学号 + 姓名 唯一：防止冒用；不同学校学号规则可能相同，因此不能只按学号判重
      const taken = await db.collection('users').where({ student_id: studentId }).get();
      const conflict = taken.data.find((u) => u._id !== user._id
        && String(u.name || '').trim() === name);
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
        admin: isAdmin(OPENID)
      };
    }

    if (action === 'roster.import') {
      if (!isAdmin(OPENID)) return { ok: false, code: 'FORBIDDEN', msg: '无名单管理权限' };
      let ids = (event && event.student_ids) || [];
      if (!Array.isArray(ids)) ids = String(ids).split(/[\n,，;；]+/);
      const clean = Array.from(new Set(ids.map(normalizeStudentId).filter((s) => s && !isRosterHeaderToken(s))));
      const existing = await loadRosterSet();
      let added = 0;
      let duplicate = 0;
      for (const sid of clean) {
        if (existing.legacy.has(sid)) { duplicate++; continue; }
        // 双保险：逐条确认该学号尚未入库，防止一次性查询漏失/时序问题导致重复
        const cnt = await db.collection('roster').where({ student_id: sid }).count();
        if (cnt.total > 0) { duplicate++; existing.legacy.add(sid); continue; }
        // 该入口是历史遗留（按学号批量导入，页面已删除）：写入时姓名留空，按 legacy 记录处理
        await db.collection('roster').add({ data: { student_id: sid, name: '', source: 'legacy_import', created_at: now() } });
        added++;
        existing.legacy.add(sid);
      }
      return { ok: true, added, duplicate, total: clean.length };
    }

    if (action === 'roster.list') {
      if (!isAdmin(OPENID)) return { ok: false, code: 'FORBIDDEN', msg: '无名单管理权限' };
      const res = await db.collection('roster').orderBy('created_at', 'desc').limit(1000).get();
      return {
        ok: true,
        items: res.data.map((r) => ({
          _id: r._id,
          student_id: r.student_id,
          name: r.name || '',
          created_at: r.created_at
        }))
      };
    }

    if (action === 'roster.remove') {
      if (!isAdmin(OPENID)) return { ok: false, code: 'FORBIDDEN', msg: '无名单管理权限' };
      const docId = (event && event._id) ? String(event._id) : '';
      const sid = normalizeStudentId((event && event.student_id) || (event && event.studentId) || '');
      // 优先按记录 _id 精确删除（避免同学号多条被误删或匹配不到）
      if (docId) {
        try {
          await db.collection('roster').doc(docId).remove();
          return { ok: true, removed: 1 };
        } catch (e) {
          return { ok: false, msg: '移除失败，请重试' };
        }
      }
      if (!sid) return { ok: false, code: 'MISSING_ID', msg: '学号不能为空' };
      const name = String((event && event.name) || '').trim();
      const res = await db.collection('roster').where({ student_id: sid }).get();
      let removed = 0;
      for (const r of res.data) {
        // 传了姓名则只删同号同名；未传姓名保持旧的"按学号全删"行为（历史入口，页面已删除）
        if (name && String(r.name || '').trim() && String(r.name || '').trim() !== name) continue;
        await db.collection('roster').doc(r._id).remove();
        removed++;
      }
      return { ok: true, removed };
    }

    if (action === 'roster.clear') {
      if (!isAdmin(OPENID)) return { ok: false, code: 'FORBIDDEN', msg: '无名单管理权限' };
      const removed = await db.collection('roster').where({ _id: db.command.exists(true) }).remove();
      return { ok: true, removed: (removed.stats && removed.stats.removed) || 0 };
    }

    if (action === 'session.start') {
      const user = await ensureUser(OPENID, UNIONID);
      const added = await db.collection('learning_sessions').add({ data: {
        user_id: user._id,
        openid: OPENID,
        start_time: now(),
        end_time: '',
        duration: 0,
        module: String((event && event.module) || 'index'),
        interaction_count: 0,
        is_valid: false,
        created_at: now()
      }});
      return { ok: true, session_id: added._id };
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
        created_at: now()
      }});
      return { ok: true };
    }

    if (action === 'statistics') {
      const user = await ensureUser(OPENID, UNIONID);
      const count = await validSessionCount(user._id);
      const completed = await surveyCompleted(user._id);
      const invite = await db.collection('survey_invites').where({ user_id: user._id }).get();
      const inviteRecord = invite.data[0] || null;
      let markInvite = false;
      if (event && event.mark_invite && count >= 5 && !completed) {
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
        can_invite: markInvite
      };
    }

    if (action === 'survey.submit') {
      const user = await ensureUser(OPENID, UNIONID);
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

    return { ok: false, code: 'UNKNOWN_ACTION', msg: '未知操作' };
  } catch (error) {
    return { ok: false, code: 'SERVER_ERROR', msg: String(error && error.message || error) };
  }
};
