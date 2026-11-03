// 离线自测桩：仅实现 cloudfunctions/teacher/index.js 在 class.* 路径上用到的 wx-server-sdk 能力。
// 只在本地临时目录使用，不属于项目代码，也不入库。
const store = new Map();
// 故障注入（仅离线用例用）：把某个集合的读取改成抛错，用来验证 fail closed 行为
const faults = new Set();
// 单次写入故障：只让下一个匹配的 update 失败，用来模拟部分成功和可重试路径。
const updateFaults = [];
const addFaults = [];
let transactionTail = Promise.resolve();

function failIfInjected(name) {
  if (!faults.has(name)) return;
  const err = new Error('simulated read failure: ' + name);
  err.errCode = -502000;
  throw err;
}

function failUpdateIfInjected(name, id) {
  const index = updateFaults.findIndex((fault) =>
    fault.collection === name && (!fault.id || fault.id === id));
  if (index < 0) return;
  updateFaults.splice(index, 1);
  const err = new Error('simulated update failure: ' + name + '/' + (id || '*'));
  err.errCode = -502001;
  throw err;
}

function collectionMap(name) {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name);
}

function cloneStore() {
  const copy = new Map();
  store.forEach((rows, name) => {
    copy.set(name, new Map(Array.from(rows.entries()).map(([id, row]) => [id, Object.assign({}, row)])));
  });
  return copy;
}

function restoreStore(snapshot) {
  store.clear();
  snapshot.forEach((rows, name) => store.set(name, rows));
}

function match(doc, cond) {
  if (!cond) return true;
  return Object.keys(cond).every((key) => {
    const expect = cond[key];
    const actual = doc ? doc[key] : undefined;
    if (expect && typeof expect === 'object' && expect.__op) {
      if (expect.__op === 'gte') return actual >= expect.value;
      if (expect.__op === 'in') return expect.value.includes(actual);
      if (expect.__op === 'exists') return (actual !== undefined && actual !== null) === expect.value;
      if (expect.__op === 'neq') return actual !== expect.value;
    }
    return actual === expect;
  });
}

function makeQuery(name, cond, opts) {
  const state = Object.assign({ skip: 0, limit: 1000, order: null }, opts || {});
  const query = {
    where(next) { return makeQuery(name, Object.assign({}, cond, next), state); },
    field() { return query; }, // 投影在桩里忽略（测试只关心数据内容）
    skip(n) { return makeQuery(name, cond, Object.assign({}, state, { skip: n })); },
    limit(n) { return makeQuery(name, cond, Object.assign({}, state, { limit: n })); },
    orderBy(field, dir) { return makeQuery(name, cond, Object.assign({}, state, { order: { field, dir } })); },
    async get() {
      failIfInjected(name);
      let rows = Array.from(collectionMap(name).values()).filter((d) => match(d, cond));
      if (state.order) {
        const { field, dir } = state.order;
        rows = rows.slice().sort((a, b) => (dir === 'desc' ? -1 : 1) * String(a[field]).localeCompare(String(b[field])));
      }
      return { data: rows.slice(state.skip, state.skip + state.limit).map((d) => Object.assign({}, d)) };
    },
    async count() {
      failIfInjected(name);
      const rows = Array.from(collectionMap(name).values()).filter((d) => match(d, cond));
      return { total: rows.length };
    },
    async remove() {
      const rows = Array.from(collectionMap(name).entries()).filter(([, d]) => match(d, cond));
      rows.forEach(([id]) => collectionMap(name).delete(id));
      return { stats: { removed: rows.length } };
    },
    async update({ data }) {
      failUpdateIfInjected(name, null);
      let updated = 0;
      Array.from(collectionMap(name).entries()).forEach(([id, d]) => {
        if (!match(d, cond)) return;
        collectionMap(name).set(id, Object.assign({}, d, data));
        updated += 1;
      });
      return { stats: { updated } };
    }
  };
  return query;
}

function makeCollection(name) {
  const base = makeQuery(name, {}, {});
  return Object.assign(base, {
    doc(id) {
      return {
        async get() {
          const d = collectionMap(name).get(id);
          if (!d) {
            const err = new Error('document not exists');
            err.errCode = -502004;
            throw err;
          }
          return { data: Object.assign({}, d) };
        },
        async update({ data }) {
          const d = collectionMap(name).get(id);
          if (!d) {
            const err = new Error('document not exists');
            err.errCode = -502004;
            throw err;
          }
          failUpdateIfInjected(name, id);
          collectionMap(name).set(id, Object.assign({}, d, data));
          return { stats: { updated: 1 } };
        },
        async remove() {
          collectionMap(name).delete(id);
          return { stats: { removed: 1 } };
        }
      };
    },
    async add({ data }) {
      const faultIndex = addFaults.indexOf(name);
      if (faultIndex >= 0) {
        addFaults.splice(faultIndex, 1);
        const err = new Error('simulated add failure: ' + name);
        err.errCode = -502002;
        throw err;
      }
      const id = 'id_' + (collectionMap(name).size + 1) + '_' + Math.random().toString(36).slice(2, 8);
      collectionMap(name).set(id, Object.assign({ _id: id }, data));
      return { _id: id };
    }
  });
}

function makeTransactionCollection(name) {
  const collection = makeCollection(name);
  return {
    doc(id) {
      return {
        async get() {
          failIfInjected(name);
          const row = collectionMap(name).get(id);
          if (!row) {
            const err = new Error('document not exists');
            err.errCode = -502004;
            throw err;
          }
          return { data: Object.assign({}, row) };
        },
        async set({ data }) {
          failUpdateIfInjected(name, id);
          collectionMap(name).set(id, Object.assign({ _id: id }, data));
          return { stats: { updated: 1 } };
        },
        async update({ data }) {
          const row = collectionMap(name).get(id);
          if (!row) {
            const err = new Error('document not exists');
            err.errCode = -502004;
            throw err;
          }
          failUpdateIfInjected(name, id);
          collectionMap(name).set(id, Object.assign({}, row, data));
          return { stats: { updated: 1 } };
        }
      };
    },
    add(args) {
      return collection.add(args);
    }
  };
}

async function runTransaction(work) {
  const previous = transactionTail;
  let release;
  transactionTail = new Promise((resolve) => { release = resolve; });
  await previous;
  const snapshot = cloneStore();
  try {
    return await work({
      collection(name) {
        return makeTransactionCollection(name);
      }
    });
  } catch (error) {
    restoreStore(snapshot);
    throw error;
  } finally {
    release();
  }
}

const command = {
  gte: (value) => ({ __op: 'gte', value }),
  in: (value) => ({ __op: 'in', value }),
  exists: (value) => ({ __op: 'exists', value }),
  neq: (value) => ({ __op: 'neq', value })
};

module.exports = {
  DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',
  init() {},
  // 离线用例专用：__fault('classes', true) 让该集合的读取抛错（验证 fail closed）
  __fault(name, on) {
    if (on) faults.add(name); else faults.delete(name);
  },
  // 只让下一个匹配 id（省略 id 时匹配该集合下一次操作）的 update 抛错。
  __failNextUpdate(name, id) {
    updateFaults.push({ collection: name, id: id || null });
  },
  __failNextAdd(name) {
    addFaults.push(name);
  },
  getWXContext() { return { OPENID: global.__CURRENT_OPENID || 'self-test-openid', UNIONID: null }; },
  database() {
    return {
      collection: (name) => makeCollection(name),
      command,
      runTransaction,
      async createCollection(name) { collectionMap(name); return { ok: true }; }
    };
  },
  __store: store
};
