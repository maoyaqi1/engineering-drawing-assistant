// 离线自测桩加载器。
//
// 作用：让 `require('wx-server-sdk')` 在本地解析到 scripts/offline/stub 下的内存桩，
//       而不是真实 SDK（真实 SDK 只存在于云端部署环境，本地没有 node_modules）。
// 用法：在 run*.cjs 的第一行调用 enableOfflineSdkStub()，之后再 require 云函数。
//
// 说明：桩只实现云函数在本仓库离线自测里用到的那部分数据库能力（见 stub/wx-server-sdk/index.js）。
//       它不参与小程序、云函数与教师网页的运行时；这只是开发者本机工具（AGENTS.md C3、C11）。
const path = require('path');
const Module = require('module');

const STUB_ROOT = path.join(__dirname, 'stub');
const ROOT = path.resolve(__dirname, '..', '..');

function repoPath(...segments) {
  return path.join(ROOT, ...segments);
}

function enableOfflineSdkStub() {
  const parts = String(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  if (!parts.includes(STUB_ROOT)) {
    process.env.NODE_PATH = [STUB_ROOT].concat(parts).join(path.delimiter);
    if (typeof Module._initPaths === 'function') Module._initPaths();
  }
  // 兜底：若上面的私有 API 未来被移除，用直接路径把桩注册进 require 缓存
  try {
    require.resolve('wx-server-sdk');
  } catch (error) {
    const stubEntry = path.join(STUB_ROOT, 'wx-server-sdk', 'index.js');
    require.cache[stubEntry] = {
      id: stubEntry,
      filename: stubEntry,
      loaded: true,
      exports: require(stubEntry)
    };
  }
}

module.exports = { enableOfflineSdkStub, repoPath, ROOT, STUB_ROOT };
