// 离线云函数测试的公共上下文。
//
// 每个 run*.cjs 都使用同一套内存数据库和断言记录格式；把这几类基础设施集中在这里，
// 用例文件只保留自己的种子数据、调用步骤和断言。该模块只服务开发者离线自检，
// 不进入小程序、云函数或教师网页的运行包。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');

// 必须先启用 NODE_PATH / require 缓存桩，再加载 wx-server-sdk；
// 否则本地会尝试解析未安装的真实云 SDK。
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}

function seed(name, rows) {
  rows.forEach((row) => table(name).set(row._id, row));
}

function rows(name) {
  return Array.from(table(name).values());
}

function size(name) {
  return table(name).size;
}

function dump(name) {
  const serialized = rows(name).sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return JSON.stringify(serialized);
}

// 每个用例文件使用独立 reporter，避免多个模块共享可变断言数组。
function createReporter() {
  const results = [];

  function check(name, pass, detail) {
    results.push({
      name,
      pass: !!pass,
      detail: detail === undefined ? '' : String(detail)
    });
  }

  // options 只保留历史输出差异：
  //   separator=false：run-photo-quota / run-teaching-events 原本不打印分隔线；
  //   compactDetail=true：仅在有详情时打印 " :: "；
  // 返回值是失败数，调用方仍可自行选择 process.exit 或 process.exitCode。
  function printSummary(options) {
    const opts = options || {};
    const failed = results.filter((result) => !result.pass);
    results.forEach((result) => {
      const detail = opts.compactDetail
        ? (result.detail ? ' :: ' + result.detail : '')
        : ' :: ' + result.detail;
      console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + detail);
    });
    if (opts.separator !== false) console.log('---');
    console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length)
      + ' 失败=' + failed.length);
    return failed.length;
  }

  return { results, check, printSummary };
}

module.exports = {
  repoPath,
  sdk,
  table,
  seed,
  rows,
  size,
  dump,
  createReporter
};
