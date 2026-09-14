#!/usr/bin/env node
// 静态接线检查：不运行小程序、不连云端，只核对「谁调用谁」的字符串契约。
//
// 运行：node scripts/integrity-check.js     （或 node scripts/run-all.js 统一运行）
//
// 与 scripts/full-check.cjs 第 9 项的区别：本脚本不假设「页面方法都写在 pages/index/index.js 里」，
// 而是在 pages/index/ 目录下所有 JS 中查找定义，因此**拆分 index.js 前后都成立**，
// 可以直接作为冻结模块拆分（若获授权）的安全网。
//
// 检查项：
//   1. app.json 注册的页面在磁盘上存在（且含 .js / .wxml）
//   2. pages/index/index.wxml 绑定的事件处理函数在 pages/index/*.js 中有定义
//   3. 事件处理函数若写成箭头函数会丢 this（警告）
//   4. 学生端 utils/api.js 发送的 action 都能在 api 云函数路由中找到
//   5. 教师网页 teacher-web/js/api.js 发送的 action 都能在 teacher 云函数路由中找到
//   6. 两个云函数的路由表没有重复 action
//   7. teacher 云函数路由里调用的处理函数在文件内有定义
//   8. project.config.json 的打包忽略列表包含 scripts（开发者脚本不进入小程序主包）

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function listJsFiles(relativeDir) {
  const absolute = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(relativeDir, entry.name));
}

function collect(source, pattern) {
  const found = [];
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

function duplicates(list) {
  const seen = new Set();
  const repeated = new Set();
  list.forEach((item) => {
    if (seen.has(item)) repeated.add(item);
    seen.add(item);
  });
  return [...repeated];
}

function isDefinedInAnyFile(name, sources) {
  const patterns = [
    // 对象方法简写 / 函数声明：name(...) {
    new RegExp('(?:^|[\\s,{;])(?:async\\s+)?' + name + '\\s*\\([^)]*\\)\\s*\\{', 'm'),
    // 属性赋值：name: function / name: (...) => / name: async
    new RegExp('(?:^|[\\s,{;])' + name + '\\s*:\\s*(?:async\\s+)?(?:function\\b|\\()', 'm')
  ];
  return sources.some((source) => patterns.some((pattern) => pattern.test(source)));
}

function isArrowDefinition(name, sources) {
  const arrowPattern = new RegExp('(?:^|[\\s,{;])' + name + '\\s*:\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>', 'm');
  return sources.some((source) => arrowPattern.test(source));
}

// 真机上页面方法是否都挂上去了，只能在运行时看：这里用桩加载首页 Page 对象
function loadPageObject() {
  const indexFile = path.join(ROOT, 'pages', 'index', 'index.js');
  const previousPage = global.Page;
  const previousWx = global.wx;
  let captured = null;
  global.Page = (options) => { captured = options; };
  global.wx = { cloud: undefined };
  try {
    Object.keys(require.cache).forEach((key) => {
      if (key.indexOf(path.join(ROOT, 'pages', 'index')) === 0) delete require.cache[key];
    });
    require(indexFile);
  } finally {
    global.Page = previousPage;
    global.wx = previousWx;
  }
  return captured;
}

function main() {
  const quiet = process.argv.includes('--quiet') || process.argv.includes('-q');
  const suite = createSuite('integrity-check', { quiet });
  const warnings = [];

  // ---- 1. app.json ↔ 页面文件 ----
  suite.section('1. 页面注册与文件');
  const appJson = JSON.parse(read('app.json'));
  const pages = Array.isArray(appJson.pages) ? appJson.pages : [];
  suite.check(pages.length > 0, 'app.json 至少注册 1 个页面');
  pages.forEach((page) => {
    const hasJs = exists(page + '.js');
    const hasWxml = exists(page + '.wxml');
    suite.check(hasJs && hasWxml, page + ' 的 .js / .wxml 均存在', hasJs ? '' : '缺少 .js；' + (hasWxml ? '' : '缺少 .wxml'));
  });

  // ---- 2/3. 首页事件绑定 ↔ 页面方法 ----
  suite.section('2. 首页事件绑定与页面方法（拆分后依然成立）');
  const wxml = read('pages/index/index.wxml');
  const indexSources = listJsFiles('pages/index').map((file) => read(file));
  const handlers = [...new Set(collect(wxml, /\b(?:bind|catch|mut-bind):?[a-zA-Z]+\s*=\s*"([A-Za-z_$][\w$]*)"/g))];
  suite.check(handlers.length > 0, 'index.wxml 至少绑定 1 个事件处理函数');
  const missingHandlers = handlers.filter((name) => !isDefinedInAnyFile(name, indexSources));
  suite.check(missingHandlers.length === 0, 'index.wxml 的 ' + handlers.length + ' 个事件处理函数都有实现',
    missingHandlers.length ? '未找到实现：' + missingHandlers.join(', ') : '');
  const arrowHandlers = handlers.filter((name) => isArrowDefinition(name, indexSources));
  if (arrowHandlers.length) warnings.push('以下事件处理函数写成箭头函数，会丢失页面 this：' + arrowHandlers.join(', '));

  // ---- 4/5/6. 客户端 action ↔ 云函数路由 ----
  suite.section('3. 客户端 action 与云函数路由一致性');
  const apiFunction = read('cloudfunctions/api/index.js');
  const studentApi = read('utils/api.js');
  const apiRoutes = collect(apiFunction, /action === '([^']+)'/g);
  const studentActions = [...new Set(collect(studentApi, /callApi\(\s*'([^']+)'/g))];
  const missingStudentActions = studentActions.filter((action) => apiRoutes.indexOf(action) < 0);
  suite.check(missingStudentActions.length === 0,
    '学生端 utils/api.js 的 ' + studentActions.length + ' 个 action 都在 api 云函数路由中',
    missingStudentActions.length ? 'api 云函数缺少：' + missingStudentActions.join(', ') : '');

  const teacherFunction = read('cloudfunctions/teacher/index.js');
  const teacherApi = read('teacher-web/js/api.js');
  const teacherRoutes = collect(teacherFunction, /action === '([^']+)'/g);
  const teacherActions = [...new Set(collect(teacherApi, /callTeacher\(\s*'([^']+)'/g))];
  const missingTeacherActions = teacherActions.filter((action) => teacherRoutes.indexOf(action) < 0);
  suite.check(missingTeacherActions.length === 0,
    '教师网页的 ' + teacherActions.length + ' 个 action 都在 teacher 云函数路由中',
    missingTeacherActions.length ? 'teacher 云函数缺少：' + missingTeacherActions.join(', ') : '');

  const duplicateStudentRoutes = duplicates(apiRoutes);
  suite.check(duplicateStudentRoutes.length === 0, 'api 云函数路由无重复 action（' + apiRoutes.length + ' 条）',
    duplicateStudentRoutes.length ? '重复：' + duplicateStudentRoutes.join(', ') : '');
  const duplicateTeacherRoutes = duplicates(teacherRoutes);
  suite.check(duplicateTeacherRoutes.length === 0, 'teacher 云函数路由无重复 action（' + teacherRoutes.length + ' 条）',
    duplicateTeacherRoutes.length ? '重复：' + duplicateTeacherRoutes.join(', ') : '');

  // ---- 7. teacher 路由调用的处理函数必须存在 ----
  suite.section('4. teacher 云函数路由与处理函数');
  const routedHandlers = [...new Set(collect(teacherFunction, /result\s*=\s*await\s+([A-Za-z_$][\w$]*)\s*\(/g))];
  const missingRoutedHandlers = routedHandlers.filter((name) => !isDefinedInAnyFile(name, [teacherFunction]));
  suite.check(missingRoutedHandlers.length === 0,
    'teacher 路由调用的 ' + routedHandlers.length + ' 个处理函数在文件内都有定义',
    missingRoutedHandlers.length ? '未找到定义：' + missingRoutedHandlers.join(', ') : '');

  // ---- 5/6. 首页页面对象接线（拆分后方法分散在 pages/index/*.js）----
  suite.section('5. 首页页面对象接线');
  const pageSources = fs.readdirSync(path.join(ROOT, 'pages', 'index'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, source: read(path.join('pages', 'index', file)) }));
  const pageObject = loadPageObject();
  suite.check(!!pageObject, '首页 index.js 可被加载并注册 Page 对象（桩运行，不依赖微信运行时）');
  const pageMethods = new Set(Object.keys(pageObject || {}).filter((key) => typeof pageObject[key] === 'function'));
  suite.equal(Object.prototype.hasOwnProperty.call(pageObject || {}, 'data'), true, '页面对象仍带 data');

  const boundHandlers = handlers.filter((name) => typeof (pageObject || {})[name] !== 'function');
  suite.check(boundHandlers.length === 0,
    'index.wxml 的 ' + handlers.length + ' 个事件处理函数都挂在运行期页面对象上',
    boundHandlers.length ? '未挂上：' + boundHandlers.join(', ') : '');

  // 页面实例自带的微信 API（不是本页定义的方法）
  const WX_PAGE_APIS = ['setData', 'createSelectorQuery', 'selectComponent', 'selectAllComponents',
    'animate', 'groupSetData', 'getTabBar', 'hasBehavior', 'route'];
  let thisCallCount = 0;
  const unresolvedCalls = new Set();
  pageSources.forEach((item) => {
    for (const match of item.source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      thisCallCount += 1;
      if (!pageMethods.has(match[1]) && WX_PAGE_APIS.indexOf(match[1]) < 0) unresolvedCalls.add(match[1]);
    }
  });
  suite.check(unresolvedCalls.size === 0,
    'pages/index/*.js 的 ' + thisCallCount + ' 处 this.xxx() 调用都能解析到方法（共 ' + pageMethods.size + ' 个方法）',
    unresolvedCalls.size ? '未解析：' + [...unresolvedCalls].join(', ') : '');

  const basicSolidPageCalls = [...new Set(collect(read('pages/index/basic-solid.js'), /\bpage\.([A-Za-z_$][\w$]*)\s*\(/g))];
  const missingPageApis = basicSolidPageCalls.filter((name) => !pageMethods.has(name));
  suite.check(missingPageApis.length === 0,
    'basic-solid.js 依赖的 ' + basicSolidPageCalls.length + ' 个页面方法都还挂在 Page 上',
    missingPageApis.length ? '缺失：' + missingPageApis.join(', ') : '');

  const arrowProperties = [];
  pageSources.forEach((item) => {
    const found = item.source.match(/^ {2}[A-Za-z_$][\w$]*\s*:\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm);
    if (found) arrowProperties.push(item.file + ' ' + found.length + ' 处');
  });
  suite.check(arrowProperties.length === 0, '页面方法没有写成箭头函数（箭头函数会丢失页面 this）', arrowProperties.join(', '));

  suite.section('6. 首页常量与文件规模');
  const constantsSource = read('pages/index/constants.js');
  suite.check(/DEFAULT_POINT\s*=\s*Object\.freeze\(\{\s*x:\s*4,\s*y:\s*3,\s*z:\s*5\s*\}\)/.test(constantsSource),
    'constants.js：DEFAULT_POINT = (4, 3, 5)');
  suite.check(/MODEL_MIN\s*=\s*0;/.test(constantsSource) && /MODEL_LIMIT\s*=\s*8;/.test(constantsSource),
    'constants.js：教学坐标范围仍是 0～8');
  suite.check(/ISOMETRIC_DEPTH_Z\s*=\s*0\.76;/.test(constantsSource), 'constants.js：ISOMETRIC_DEPTH_Z = 0.76');
  const indexLineCount = read('pages/index/index.js').split('\n').length;
  suite.check(indexLineCount <= 350, 'index.js 只保留 data + 生命周期（当前 ' + indexLineCount + ' 行，上限 350）');

  // ---- 7. 开发者脚本不进小程序主包 ----
  suite.section('7. 打包边界');
  const projectConfig = JSON.parse(read('project.config.json'));
  const ignoreList = (projectConfig.packOptions && projectConfig.packOptions.ignore) || [];
  const ignoredValues = ignoreList.map((item) => item.value);
  suite.check(ignoredValues.indexOf('scripts') >= 0, 'project.config.json 的 packOptions.ignore 含 scripts（不打包开发者脚本）',
    '当前忽略列表：' + ignoredValues.join(', '));
  suite.check(ignoredValues.indexOf('docs') >= 0 && ignoredValues.indexOf('teacher-web') >= 0, 'docs / teacher-web 仍在打包忽略列表中');

  if (warnings.length) {
    suite.section('警告（不阻断）');
    warnings.forEach((text) => console.log('  ! ' + text));
  }

  const code = suite.finish();
  if (!code) console.log('integrity-check: OK');
  process.exitCode = code;
}

main();
