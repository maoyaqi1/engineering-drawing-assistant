// 整体静态测试：语法 / 结构 / 前后端接口一致性 / 事件与 DOM 绑定一致性 / 敏感信息。
// 用法：node full-check.cjs   退出码 0 = 全部通过
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// 仓库根目录按脚本位置推导，保证任意克隆路径、任意工作目录都能运行
const ROOT = path.resolve(__dirname, '..');
// 跳过非项目内容：依赖、离线资源、发布快照、截图，以及云数据库导出（含真实学生数据，已 gitignore）
const SKIP = /(\\|\/)(node_modules|geogebra-offline|web-release|screen|\.git|data-export|db-export)(\\|\/)|(\\|\/)teacher-web(\\|\/)output(\\|\/)/;
const results = [];
const fail = (name, detail) => results.push({ ok: false, name, detail });
const pass = (name, detail) => results.push({ ok: true, name, detail });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const all = walk(ROOT);
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const rel = (p) => p.replace(/\\/g, '/').replace(ROOT + '/', '');

// ---- 1. JS 语法 ----
const jsFiles = all.filter((p) => p.endsWith('.js') && !/teacher-web[\\/]js[\\/]config/.test(p));
let bad = [];
for (const f of jsFiles) {
  try { cp.execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad.push(rel(f) + ': ' + String(e.stderr).split('\n')[0]); }
}
bad.length ? fail('JS 语法 node --check（' + jsFiles.length + ' 个文件）', bad.join('\n')) : pass('JS 语法 node --check（' + jsFiles.length + ' 个文件）');

// ---- 2. JSON 合法 ----
const jsonFiles = all.filter((p) => p.endsWith('.json') && !/package-lock|\.git/.test(p));
bad = [];
for (const f of jsonFiles) {
  try { JSON.parse(read(f)); } catch (e) { bad.push(rel(f) + ': ' + e.message); }
}
bad.length ? fail('JSON 解析（' + jsonFiles.length + ' 个）', bad.join('\n')) : pass('JSON 解析（' + jsonFiles.length + ' 个）');

// ---- 3. WXSS 大括号配平 ----
const wxssFiles = all.filter((p) => p.endsWith('.wxss'));
bad = [];
for (const f of wxssFiles) {
  const t = read(f);
  const o = (t.match(/\{/g) || []).length;
  const c = (t.match(/\}/g) || []).length;
  if (o !== c) bad.push(rel(f) + ': ' + o + '/' + c);
}
bad.length ? fail('WXSS 大括号配平（' + wxssFiles.length + ' 个）', bad.join('\n')) : pass('WXSS 大括号配平（' + wxssFiles.length + ' 个）');

// ---- 4. WXML 标签配平 ----
const wxmlFiles = all.filter((p) => p.endsWith('.wxml'));
bad = [];
for (const f of wxmlFiles) {
  const t = read(f);
  for (const tag of ['view', 'block', 'text', 'button', 'scroll-view', 'picker', 'canvas']) {
    const open = (t.match(new RegExp('<' + tag + '\\b', 'g')) || []).length
      - (t.match(new RegExp('<' + tag + '\\b[^>]*/>', 'g')) || []).length;
    const close = (t.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (open !== close) bad.push(rel(f) + ' <' + tag + '> ' + open + '/' + close);
  }
}
bad.length ? fail('WXML 标签配平（' + wxmlFiles.length + ' 个）', bad.join('\n')) : pass('WXML 标签配平（' + wxmlFiles.length + ' 个）');

// ---- 5. 教师端：前端 api.js ↔ 云函数 dispatch ----
const teacherFn = read(ROOT + '/cloudfunctions/teacher/index.js');
const teacherApi = read(ROOT + '/teacher-web/js/api.js');
const dispatcher = new Set([...teacherFn.matchAll(/action === '([^']+)'/g)].map((m) => m[1]));
const called = new Set([...teacherApi.matchAll(/callTeacher\('([^']+)'/g)].map((m) => m[1]));
const missA = [...called].filter((a) => !dispatcher.has(a));
const unused = [...dispatcher].filter((a) => !called.has(a));
missA.length
  ? fail('教师端 action 一致性（前端调用 ' + called.size + ' / 云端 ' + dispatcher.size + '）', '云端缺失: ' + missA.join(', '))
  : pass('教师端 action 一致性（前端调用 ' + called.size + ' / 云端 ' + dispatcher.size + '）', '前端未使用的云端 action: ' + (unused.join(', ') || '无'));

// ---- 6. 学生端：utils/api.js ↔ api 云函数 dispatch ----
const apiFn = read(ROOT + '/cloudfunctions/api/index.js');
const studentApi = read(ROOT + '/utils/api.js');
const sDispatch = new Set([...apiFn.matchAll(/action === '([^']+)'/g)].map((m) => m[1]));
const sCalled = new Set([...studentApi.matchAll(/['"]([a-z]+\.[a-zA-Z.]+|login|register)['"]/g)].map((m) => m[1]));
const sMiss = [...sCalled].filter((a) => !sDispatch.has(a));
sMiss.length
  ? fail('学生端 action 一致性', '云端缺失: ' + sMiss.join(', ') + '（云端有: ' + [...sDispatch].join(', ') + '）')
  : pass('学生端 action 一致性', '云端 action: ' + [...sDispatch].join(', '));

// ---- 7. 教师网页：app.js 调用的 api 方法是否都存在 ----
const appJs = read(ROOT + '/teacher-web/js/app.js');
const apiMethods = new Set([...teacherApi.matchAll(/^\s{4}(\w+)\(/gm)].map((m) => m[1]));
const usedMethods = new Set([...appJs.matchAll(/\bapi\.(\w+)\s*\(/g)].map((m) => m[1]));
const missM = [...usedMethods].filter((m) => !apiMethods.has(m) && m !== 'then' && m !== 'catch');
missM.length
  ? fail('教师网页 api 方法一致性（使用 ' + usedMethods.size + ' / 定义 ' + apiMethods.size + '）', '未定义: ' + missM.join(', '))
  : pass('教师网页 api 方法一致性（使用 ' + usedMethods.size + ' / 定义 ' + apiMethods.size + '）');

// ---- 8. 教师网页：app.js 里的 $('id') 是否能在 index.html 或 app.js 模板里找到 ----
const html = read(ROOT + '/teacher-web/index.html');
// 注意：教师后台绝大多数视图是 app.js 自己拼 HTML 生成的，id 定义同时在 index.html 与 app.js 模板中
const htmlIds = new Set([
  ...[...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
  ...[...appJs.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
  ...[...appJs.matchAll(/\.id\s*=\s*'([^']+)'/g)].map((m) => m[1])
]);
const appIds = new Set([...appJs.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
const missId = [...appIds].filter((i) => !htmlIds.has(i));
missId.length
  ? fail('教师网页 DOM id 一致性（引用 ' + appIds.size + ' / 可寻址 ' + htmlIds.size + '）', '未找到: ' + missId.join(', '))
  : pass('教师网页 DOM id 一致性（引用 ' + appIds.size + ' / 可寻址 ' + htmlIds.size + '）');

// ---- 9. 小程序：index.wxml 事件绑定 ↔ index.js 方法 ----
const wxml = read(ROOT + '/pages/index/index.wxml');
// 首页方法分散在 pages/index/ 下的多个模块（拆分后），因此扫描整个目录
const indexDir = path.join(ROOT, 'pages', 'index');
const pageSources = fs.readdirSync(indexDir).filter((f) => f.endsWith('.js')).map((f) => read(path.join(indexDir, f)));
const handlers = new Set([...wxml.matchAll(/\b(?:bind|catch)[a-z]*="(\w+)"/g)].map((m) => m[1]));
const methods = new Set();
pageSources.forEach((src) => {
  for (const m of src.matchAll(/^\s{2,}(?:async )?(\w+)\s*\(/gm)) methods.add(m[1]);
});
const missH = [...handlers].filter((h) => !methods.has(h));
missH.length
  ? fail('小程序事件绑定一致性（绑定 ' + handlers.size + ' / 页面方法 ' + methods.size + '）', '未定义: ' + missH.join(', '))
  : pass('小程序事件绑定一致性（绑定 ' + handlers.size + ' / 页面方法 ' + methods.size + '）');

// ---- 10. 敏感信息与调试输出 ----
const codeFiles = all.filter((p) => /\.(js|json|wxml|wxss|html|md)$/.test(p) && !/docs[\\/]rules|docs[\\/]requirements|docs[\\/]test|AGENTS\.md|\.agents[\\/]skills/.test(p));
const secrets = [];
const debugs = [];
for (const f of codeFiles) {
  const t = read(f);
  if (/sk-[A-Za-z0-9]{16,}/.test(t)) secrets.push(rel(f) + ': sk- 前缀');
  if (/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"\s]{6,}['"]/i.test(t)) secrets.push(rel(f) + ': 疑似硬编码密钥/口令');
  if (/console\.(log|debug|info)\s*\(/.test(t) && /cloudfunctions[\\/]|teacher-web[\\/]js[\\/](app|api)\.js/.test(f)) debugs.push(rel(f));
}
secrets.length ? fail('敏感信息扫描', secrets.join('\n')) : pass('敏感信息扫描（' + codeFiles.length + ' 个文件）');
debugs.length ? fail('云函数/网页调试输出残留', debugs.join('\n')) : pass('云函数/网页调试输出残留');

// ---- 输出 ----
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name.padEnd(width) + (r.detail ? '  ' + r.detail.replace(/\n/g, '\n      ') : ''));
}
const failed = results.filter((r) => !r.ok).length;
console.log('\n合计 ' + results.length + ' 项，通过 ' + (results.length - failed) + '，失败 ' + failed);
process.exit(failed ? 1 : 0);
