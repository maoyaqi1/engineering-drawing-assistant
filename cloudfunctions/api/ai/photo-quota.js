// 拍照提问的每日原子配额。
//
// 对应需求 AI-23–AI-26 / DATA-10 / DATA-20。
// 该模块只管理“是否允许进入图片处理链路”，不保存图片、不生成回答：
//   - ai_photo_quota_daily：每日预占、确认、释放状态；
//   - learning_records.ai_photo_ask：成功后的既有审计事件与统计来源。
const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const QUOTA_COLLECTION = 'ai_photo_quota_daily';
const PHOTO_DAILY_LIMIT = 2;
const PHOTO_ASK_EVENT = 'ai_photo_ask';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEASE_TTL_MS = 10 * 60 * 1000;

// 用户标识和请求键只以哈希形式落库，避免配额文档保存 openid 或图片内容。
function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function beijingDateKey(atMs) {
  const value = Number.isFinite(atMs) ? atMs : Date.now();
  return new Date(value + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function startOfTodayInBeijing(atMs) {
  const value = Number.isFinite(atMs) ? atMs : Date.now();
  const dayStartMs = Math.floor((value + BEIJING_OFFSET_MS) / DAY_MS) * DAY_MS - BEIJING_OFFSET_MS;
  return new Date(dayStartMs).toISOString();
}

function quotaDocumentId(openid, dateKey) {
  return sha256('photo-quota|' + String(openid || '') + '|' + dateKey);
}

function requestKeyHash(requestId, imageBase64) {
  // 新客户端使用每次发送的 request_id；旧客户端用图片内容哈希作为幂等回退。
  const explicit = String(requestId || '').trim().slice(0, 128);
  return sha256('photo-request|' + (explicit || String(imageBase64 || '')));
}

function isNotFound(error) {
  return error && (error.errCode === -502004 || /not exists/i.test(String(error.message || '')));
}

function isExpired(lease, atMs) {
  return !!lease && lease.status === 'pending' && Number(lease.expires_at_ms) <= atMs;
}

function cleanLeases(leases, atMs) {
  const output = {};
  Object.keys(leases || {}).forEach((key) => {
    const lease = leases[key];
    if (!lease) return;
    if (isExpired(lease, atMs) || lease.status === 'released') return;
    output[key] = lease;
  });
  return output;
}

function documentData(doc) {
  const data = Object.assign({}, doc || {});
  delete data._id;
  return data;
}

function countPending(leases) {
  return Object.keys(leases || {}).filter((key) => leases[key] && leases[key].status === 'pending').length;
}

// 对外只暴露限额、已用和剩余；内部租约明细不下发客户端。
function publicQuota(confirmedCount, limit) {
  const used = Math.min(limit, Math.max(0, Number(confirmedCount) || 0));
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false
  };
}

async function countLegacyPhotoAsks(openid, atMs) {
  const result = await db.collection('learning_records')
    .where({
      openid,
      event_type: PHOTO_ASK_EVENT,
      created_at: db.command.gte(startOfTodayInBeijing(atMs))
    })
    .count();
  return Math.max(0, Number(result && result.total) || 0);
}

async function getTransactionDocument(transaction, documentId) {
  try {
    const result = await transaction.collection(QUOTA_COLLECTION).doc(documentId).get();
    return result && result.data ? Object.assign({ _id: documentId }, result.data) : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

// 优先使用 SDK 的 runTransaction；兼容旧 SDK 时显式 commit/rollback，
// 但隔离与原子性仍由云数据库事务提供。
async function runTransaction(work) {
  if (typeof db.runTransaction === 'function') return db.runTransaction(work);

  // 兼容只提供显式 startTransaction 的 SDK；真实云端事务仍由数据库保证隔离。
  const transaction = await db.startTransaction();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * 原子预占一次图片处理名额。
 * 返回 state: reserved | in_progress | completed | exceeded。
 * pending 租约会占用名额，但只有 confirm 才增加 confirmed_count；超时租约会被清理。
 */
async function reserve(input) {
  const openid = String((input && input.openid) || '');
  const imageBase64 = String((input && input.imageBase64) || '');
  const atMs = Number.isFinite(input && input.nowMs) ? input.nowMs : Date.now();
  const dateKey = beijingDateKey(atMs);
  const documentId = quotaDocumentId(openid, dateKey);
  const requestKey = requestKeyHash(input && input.requestId, imageBase64);

  // 仅用于首次上线当天衔接旧版消费记录；配额文档一旦存在后以 confirmed_count 为准。
  const legacyCount = await countLegacyPhotoAsks(openid, atMs);

  return runTransaction(async (transaction) => {
    let doc = await getTransactionDocument(transaction, documentId);
    if (!doc) {
      doc = {
        _id: documentId,
        subject_hash: sha256(openid),
        date_key: dateKey,
        confirmed_count: Math.min(PHOTO_DAILY_LIMIT, legacyCount),
        leases: {},
        created_at: new Date(atMs).toISOString(),
        updated_at: new Date(atMs).toISOString()
      };
    }

    const leases = cleanLeases(doc.leases, atMs);
    const existing = leases[requestKey];
    if (existing && existing.status === 'confirmed') {
      return {
        state: 'completed',
        dateKey,
        documentId,
        requestKey,
        lease: existing,
        quota: publicQuota(doc.confirmed_count, PHOTO_DAILY_LIMIT)
      };
    }
    if (existing && existing.status === 'pending' && !isExpired(existing, atMs)) {
      return {
        state: 'in_progress',
        dateKey,
        documentId,
        requestKey,
        lease: existing,
        quota: publicQuota(doc.confirmed_count + countPending(leases), PHOTO_DAILY_LIMIT)
      };
    }

    const occupied = Math.max(0, Number(doc.confirmed_count) || 0) + countPending(leases);
    if (occupied >= PHOTO_DAILY_LIMIT) {
      await transaction.collection(QUOTA_COLLECTION).doc(documentId).set({
        data: documentData(Object.assign({}, doc, { leases, updated_at: new Date(atMs).toISOString() }))
      });
      return {
        state: 'exceeded',
        dateKey,
        documentId,
        requestKey,
        quota: publicQuota(PHOTO_DAILY_LIMIT, PHOTO_DAILY_LIMIT)
      };
    }

    const lease = {
      status: 'pending',
      slot: occupied + 1,
      created_at: new Date(atMs).toISOString(),
      expires_at_ms: atMs + LEASE_TTL_MS,
      released_at: null,
      conversation_id: '',
      assistant_message_id: '',
      audit_event_id: '',
      audit_pending: false
    };
    leases[requestKey] = lease;
    const next = Object.assign({}, doc, {
      confirmed_count: Math.max(0, Number(doc.confirmed_count) || 0),
      leases,
      updated_at: new Date(atMs).toISOString()
    });
    await transaction.collection(QUOTA_COLLECTION).doc(documentId).set({ data: documentData(next) });
    return {
      state: 'reserved',
      dateKey,
      documentId,
      requestKey,
      lease,
      quota: publicQuota(next.confirmed_count + countPending(leases), PHOTO_DAILY_LIMIT)
    };
  });
}

// 将 pending 租约转为 confirmed，并把对话/助手消息 ID 写回租约；
// 只有实际发起过预占的请求才允许确认。
async function confirm(reservation, details) {
  if (!reservation || reservation.state !== 'reserved') return reservation;
  const atMs = Number.isFinite(details && details.nowMs) ? details.nowMs : Date.now();
  return runTransaction(async (transaction) => {
    const doc = await getTransactionDocument(transaction, reservation.documentId);
    if (!doc) throw new Error('photo quota document missing');
    const leases = cleanLeases(doc.leases, atMs);
    const lease = leases[reservation.requestKey];
    if (!lease || lease.status !== 'pending') {
      throw new Error('photo quota lease no longer pending');
    }
    leases[reservation.requestKey] = Object.assign({}, lease, {
      status: 'confirmed',
      confirmed_at: new Date(atMs).toISOString(),
      conversation_id: String((details && details.conversationId) || ''),
      assistant_message_id: String((details && details.messageId) || '')
    });
    const confirmedCount = Math.min(
      PHOTO_DAILY_LIMIT,
      Math.max(0, Number(doc.confirmed_count) || 0) + 1
    );
    await transaction.collection(QUOTA_COLLECTION).doc(reservation.documentId).set({
      data: documentData(Object.assign({}, doc, {
        confirmed_count: confirmedCount,
        leases,
        updated_at: new Date(atMs).toISOString()
      }))
    });
    return { quota: publicQuota(confirmedCount, PHOTO_DAILY_LIMIT) };
  });
}

// AI 主链失败时释放 pending 名额。释放本身失败不回抛业务主错误，
// 只把 released=false 返回给入口，由租约 TTL 最终回收。
async function release(reservation, reason) {
  if (!reservation || reservation.state !== 'reserved') return { released: true, quota: null };
  const atMs = Date.now();
  try {
    return await runTransaction(async (transaction) => {
      const doc = await getTransactionDocument(transaction, reservation.documentId);
      if (!doc) {
        return { released: true, quota: publicQuota(0, PHOTO_DAILY_LIMIT) };
      }
      const leases = cleanLeases(doc.leases, atMs);
      const lease = leases[reservation.requestKey];
      if (!lease || lease.status !== 'pending') {
        return {
          released: true,
          quota: publicQuota(doc.confirmed_count, PHOTO_DAILY_LIMIT)
        };
      }
      leases[reservation.requestKey] = Object.assign({}, lease, {
        status: 'released',
        release_reason: String(reason || '').slice(0, 64),
        released_at: new Date(atMs).toISOString()
      });
      await transaction.collection(QUOTA_COLLECTION).doc(reservation.documentId).set({
        data: documentData(Object.assign({}, doc, { leases, updated_at: new Date(atMs).toISOString() }))
      });
      return {
        released: true,
        quota: publicQuota(doc.confirmed_count, PHOTO_DAILY_LIMIT)
      };
    });
  } catch (error) {
    console.warn('[photo-quota] 预占释放失败 request=' + reservation.requestKey);
    return { released: false, quota: reservation.quota };
  }
}

// 审计事件是旁路记录；回写失败不得推翻已经完成的 AI 回答，只返回 false 供诊断。
async function updateAudit(reservation, auditEventId, auditPending) {
  if (!reservation || reservation.state !== 'reserved') return false;
  try {
    await runTransaction(async (transaction) => {
      const doc = await getTransactionDocument(transaction, reservation.documentId);
      if (!doc) return;
      const leases = Object.assign({}, doc.leases || {});
      const lease = leases[reservation.requestKey];
      if (!lease) return;
      leases[reservation.requestKey] = Object.assign({}, lease, {
        audit_event_id: String(auditEventId || ''),
        audit_pending: !!auditPending,
        audit_updated_at: new Date().toISOString()
      });
      await transaction.collection(QUOTA_COLLECTION).doc(reservation.documentId).set({
        data: documentData(Object.assign({}, doc, { leases, updated_at: new Date().toISOString() }))
      });
    });
    return true;
  } catch (error) {
    console.warn('[photo-quota] 审计状态回写失败 request=' + reservation.requestKey);
    return false;
  }
}

module.exports = {
  QUOTA_COLLECTION,
  PHOTO_DAILY_LIMIT,
  PHOTO_ASK_EVENT,
  LEASE_TTL_MS,
  beijingDateKey,
  startOfTodayInBeijing,
  quotaDocumentId,
  requestKeyHash,
  countLegacyPhotoAsks,
  reserve,
  confirm,
  release,
  updateAudit
};
