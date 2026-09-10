const cloud = require('wx-server-sdk');
const ai = require('./ai/conversation.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = ['users', 'learning_sessions', 'survey_responses', 'survey_invites', 'roster'];
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

async function ensureUser(openid, unionid) {
  const existing = await db.collection('users').where({ openid }).get();
  if (existing.data.length) {
    const user = existing.data[0];
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

async function isInRoster(studentId) {
  const sid = normalizeStudentId(studentId);
  if (!sid) return false;
  const set = await loadRosterSet();
  return set.has(sid);
}

async function loadRosterSet() {
  const res = await db.collection('roster').field({ student_id: true }).limit(1000).get();
  return new Set(res.data.map((r) => normalizeStudentId(r.student_id)).filter(Boolean));
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
      // 学号唯一：防止不同微信号冒用同一学号
      const taken = await db.collection('users').where({ student_id: studentId }).get();
      const conflict = taken.data.find((u) => u._id !== user._id);
      if (conflict) {
        return { ok: false, code: 'STUDENT_ID_TAKEN', msg: '该学号已被其他账号绑定，请核对或联系老师' };
      }
      await db.collection('users').doc(user._id).update({ data: {
        school,
        name,
        student_id: studentId,
        profile_completed: true,
        updated_at: now()
      }});
      const updated = await db.collection('users').doc(user._id).get();
      return { ok: true, user: updated.data, registered: true };
    }

    if (action === 'roster.status') {
      const user = await ensureUser(OPENID, UNIONID);
      const registered = !!user.student_id;
      return {
        ok: true,
        registered,
        student_id: user.student_id || '',
        in_roster: registered ? await isInRoster(user.student_id) : false,
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
        if (existing.has(sid)) { duplicate++; continue; }
        // 双保险：逐条确认该学号尚未入库，防止一次性查询漏失/时序问题导致重复
        const cnt = await db.collection('roster').where({ student_id: sid }).count();
        if (cnt.total > 0) { duplicate++; existing.add(sid); continue; }
        await db.collection('roster').add({ data: { student_id: sid, created_at: now() } });
        added++;
        existing.add(sid);
      }
      return { ok: true, added, duplicate, total: clean.length };
    }

    if (action === 'roster.list') {
      if (!isAdmin(OPENID)) return { ok: false, code: 'FORBIDDEN', msg: '无名单管理权限' };
      const res = await db.collection('roster').orderBy('created_at', 'desc').limit(1000).get();
      return { ok: true, items: res.data.map((r) => ({ _id: r._id, student_id: r.student_id, created_at: r.created_at })) };
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
      const res = await db.collection('roster').where({ student_id: sid }).get();
      let removed = 0;
      for (const r of res.data) {
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
      const canAsk = user.student_id ? await isInRoster(user.student_id) : false;
      if (!canAsk) {
        return { ok: false, code: 'NOT_IN_ROSTER', msg: '你不在名单中，暂时无法使用提问' };
      }
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
      return { ok: true, conversations: await ai.listConversations({ openid: OPENID }) };
    }

    if (action === 'ai.detail') {
      await ai.ensureCollections();
      const detail = await ai.getConversationDetail({ openid: OPENID, conversationId: (event && event.conversation_id) || '' });
      if (!detail) return { ok: false, code: 'NOT_FOUND', msg: '对话不存在' };
      return { ok: true, conversation: detail };
    }

    if (action === 'ai.feedback') {
      await ai.ensureCollections();
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
