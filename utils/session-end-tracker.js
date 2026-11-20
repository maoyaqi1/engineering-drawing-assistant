// 已确认结束的有效学习会话跟踪器。
//
// utils/api.js 只在服务端明确返回 ok=true 且 is_valid=true 时登记；同一个
// session_id 只登记一次。新登记会递增 revision，问卷模块据此判断是否存在
// 尚未检查的新事件。本模块不依赖 wx、页面或 Canvas。
let revision = 0;
let checkedRevision = 0;
const processedSessionIds = new Set();
const listeners = [];

function recordSessionEnd(sessionId, result) {
  const id = String(sessionId || '');
  if (!id || !result || result.ok !== true || result.is_valid !== true) return false;
  if (processedSessionIds.has(id)) return false;
  processedSessionIds.add(id);
  revision += 1;
  listeners.slice().forEach((listener) => {
    try {
      listener({ sessionId: id, revision });
    } catch (error) {
      // 邀请检查失败不得影响学习会话本身的结束结果。
    }
  });
  return true;
}

function getRevision() {
  return revision;
}

function getCheckedRevision() {
  return checkedRevision;
}

function markChecked(targetRevision) {
  const value = Number(targetRevision);
  if (!Number.isInteger(value) || value <= checkedRevision || value > revision) return false;
  checkedRevision = value;
  return true;
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

function resetForTests() {
  revision = 0;
  checkedRevision = 0;
  processedSessionIds.clear();
}

module.exports = {
  recordSessionEnd,
  getRevision,
  getCheckedRevision,
  markChecked,
  subscribe,
  resetForTests
};
