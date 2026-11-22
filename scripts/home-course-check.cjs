#!/usr/bin/env node
// 阶段 1 首页课程骨架检查：课程数据、搜索纯函数、路由安全、页面结构和生命周期边界。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('home-course-check');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const appJson = JSON.parse(read('app.json'));
const catalog = require('../config/course-catalog.js');
const search = require('../pages/home/home-search.js');

const expectedChapterTitles = [
  '第一章：投影体系的建立',
  '第二章：直线的投影',
  '第三章：平面的投影',
  '第四章：线面、面面位置关系',
  '第五章：立体的投影',
  '第六章：直线、平面与立体相交',
  '第七章：两立体相交'
];

suite.section('1. 页面注册与静态结构');
suite.check(appJson.pages.includes('pages/home/home'), '课程首页已注册');
['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
  suite.check(fs.existsSync(path.join(ROOT, 'pages/home/home.' + extension)),
    '课程首页包含 .' + extension);
});
const homeWxml = read('pages/home/home.wxml');
[
  '工程制图学习助手',
  '理解投影规律 · 探索空间形体 · 培育工程思维',
  '动脑思考',
  '动手探索',
  '善用工具',
  '搜索知识点，如：直线的实长',
  '课程学习',
  '让空间可观察、可操作、可验证。'
].forEach((text) => suite.check(homeWxml.includes(text), '首页包含文案：' + text));
suite.check(!homeWxml.includes('在学习与实践中培育工程思维'),
  '首页已删除工程思维补充标语');
suite.check(!homeWxml.includes('排行榜') && !homeWxml.includes('学习统计'),
  '首页未增加排行榜或学习统计卡');
suite.check(!homeWxml.includes('/pages/ai/ai'), '课程首页未连接 AI 教师');
suite.check(homeWxml.includes('disabled="{{!item.isOpen}}"')
  && homeWxml.includes('disabled="{{!point.isOpen}}"'),
  '未开放搜索结果和知识点使用原生禁用状态');
suite.check(!homeWxml.includes('hot-search-row') && !homeWxml.includes('热门'),
  '首页已移除占据纵向空间的热门搜索区');
suite.check(!read('pages/home/home.js').includes('hotSearches'),
  '首页不再保留热门搜索状态');
suite.check(!homeWxml.includes('chapter-meta') && !homeWxml.includes('个知识点'),
  '章节标题不显示知识点数量副文案');
const homeWxss = read('pages/home/home.wxss');
const chapterTitleRule = (homeWxss.match(/\.chapter-title-wrap\s*\{[\s\S]*?\}/) || [''])[0];
const chapterChevronRule = (homeWxss.match(/\.chapter-chevron\s*\{[\s\S]*?\}/) || [''])[0];
suite.check(chapterTitleRule.includes('position: absolute')
  && chapterTitleRule.includes('left: 20rpx')
  && chapterTitleRule.includes('text-align: left')
  && chapterChevronRule.includes('right: 20rpx'),
  '章节标题左对齐且下拉箭头靠最右侧');
suite.check(homeWxml.includes('wx:if="{{chapter.hasMultiplePoints}}"')
  && homeWxml.includes('chapter-chevron'),
  '仅多知识点章节显示右侧下拉箭头');
suite.check(homeWxml.includes('wx:for-index="pointIndex"')
  && homeWxml.includes('{{pointIndex + 1}}.'),
  '展开后的知识点按 1、2、3 顺序编号');
suite.check(!read('pages/home/home.wxss').includes('.chapter-meta'),
  '删除知识点数量副文案样式');

suite.section('2. 七章顺序与知识点状态');
suite.equal(catalog.chapters.length, 7, '课程目录固定为七章');
suite.equal(
  JSON.stringify(catalog.chapters.map((chapter) => chapter.title)),
  JSON.stringify(expectedChapterTitles),
  '章节名称与顺序完全一致'
);
const pointIds = new Set();
let pointCount = 0;
catalog.chapters.forEach((chapter) => {
  suite.check(chapter.points.length > 0, chapter.number + ' 至少有一个知识点');
  chapter.points.forEach((point) => {
    pointCount += 1;
    suite.check(!!point.id && !pointIds.has(point.id), '知识点 ID 唯一：' + point.id);
    pointIds.add(point.id);
    suite.check(!point.route || point.availability === 'available',
      '仅已实现知识点允许配置路由：' + point.id);
  });
});
suite.check(pointCount >= 20, '课程目录覆盖全部规划知识点（当前 ' + pointCount + ' 项）');

const requiredAvailable = [
  '投影法基础',
  '正投影',
  '三面投影体系',
  '点的投影',
  '直线的投影规律',
  '直角三角形法求实长',
  '两直线位置关系',
  '直角投影定理',
  '平面的表示方法',
  '平面的投影规律',
  '最大斜度线',
  '线面、面面平行',
  '线面、面面相交',
  '线面、面面垂直',
  '平面立体的投影',
  '曲面立体的投影',
  '平面与平面立体相交',
  '平面与曲面立体相交'
];
requiredAvailable.forEach((title) => {
  const point = catalog.chapters
    .flatMap((chapter) => chapter.points)
    .find((item) => item.title === title);
  suite.check(!!point && point.availability === 'available', '已有功能已标记可用：' + title);
});
const firstChapterPointTitles = catalog.chapters[0].points.map((point) => point.title);
suite.equal(
  firstChapterPointTitles.slice(0, 3).join(','),
  '投影法基础,正投影,三面投影体系',
  '第一章前三项为投影法基础、正投影、三面投影体系'
);

const requiredPlanned = [
  '投影变换',
  '直线与立体相交',
  '相贯线',
  '两立体相交'
];
requiredPlanned.forEach((title) => {
  const point = catalog.chapters
    .flatMap((chapter) => chapter.points)
    .find((item) => item.title === title);
  suite.check(!!point && point.availability === 'planned' && !point.route,
    '未实现知识点无路由：' + title);
});

suite.section('3. 路由与深链可用边界');
const indexLegacyPoint = catalog.chapters[0].points.find((point) => point.id === 'point-projection');
const supportedKinds = ['page', 'legacy-page', 'index-mode'];
catalog.chapters.forEach((chapter) => {
  chapter.points.forEach((point) => {
    if (!point.route) return;
    const pagePath = point.route.path.replace(/^\//, '');
    suite.check(appJson.pages.includes(pagePath), '路由已注册：' + point.route.path);
    suite.check(!point.route.path.includes('/ai/'), '课程目录不连接 AI：' + point.id);
  });
});
suite.check(search.supportsRoute(indexLegacyPoint, supportedKinds),
  '旧版默认点模式继续可用');
const linePoint = catalog.chapters[1].points.find((point) => point.id === 'line-projection');
suite.check(search.supportsRoute(linePoint, supportedKinds),
  '五模式深链完成后直线知识点可打开');
suite.equal(search.getRouteUrl(indexLegacyPoint), '/pages/index/index',
  '点模式使用已兼容的旧路由');
suite.equal(search.getRouteUrl(linePoint), '/pages/index/index?mode=line',
  '直线知识点生成正确的模式参数');

suite.section('4. 搜索与搜索结果显示');
const triangleResults = search.searchKnowledgePoints(catalog, '直线的实长', supportedKinds);
suite.check(triangleResults.some((item) => item.id === 'triangle-method' && item.isOpen),
  '“直线的实长”可命中并打开直角三角形法');
suite.check(triangleResults.some((item) => item.chapterNumber === '第二章'),
  '搜索结果包含所属章节');
const orthographicResults = search.searchKnowledgePoints(catalog, '相似性', supportedKinds);
suite.check(orthographicResults[0]
  && orthographicResults[0].id === 'orthographic-projection'
  && orthographicResults[0].isOpen,
'“相似性”可命中并打开正投影页面');
const crossChapterResults = search.searchKnowledgePoints(catalog, '投影', supportedKinds);
suite.check(new Set(crossChapterResults.map((item) => item.chapterId)).size >= 3,
  '关键词“投影”可跨三章以上查找');
const plannedResults = search.searchKnowledgePoints(catalog, '相贯线', supportedKinds);
suite.check(plannedResults.length >= 2 && plannedResults.every((item) => !item.isOpen
  && item.statusText === '待开放'), '未实现知识点显示待开放且不可点击');
const modeResults = search.searchKnowledgePoints(catalog, '直线的投影规律', supportedKinds);
suite.check(modeResults[0].isOpen && modeResults[0].routeUrl.endsWith('?mode=line'),
  '直线的投影规律映射到直线模式');
suite.equal(
  catalog.chapters[1].points.map((point) => point.title).join(','),
  '直线的投影规律,直角三角形法求实长,两直线位置关系,直角投影定理',
  '第二章只保留指定四项且顺序正确'
);
const removedPointOnLine = catalog.chapters[1].points.find(
  (point) => point.title === '直线上的点'
);
const removedLinePositions = catalog.chapters[1].points.find(
  (point) => point.title === '各种位置直线的投影'
);
suite.check(!removedPointOnLine && !removedLinePositions,
  '第二章未提及知识点已从课程目录删除');
const twoLinePoint = catalog.chapters[1].points.find(
  (point) => point.id === 'two-line-position'
);
suite.check(twoLinePoint && twoLinePoint.availability === 'available'
  && twoLinePoint.route
  && twoLinePoint.route.path === '/pages/two-line-position/two-line-position',
'两直线位置关系已映射到独立探索页面');
const twoLineResults = search.searchKnowledgePoints(
  catalog,
  '两直线位置关系',
  supportedKinds
);
suite.check(twoLineResults[0]
  && twoLineResults[0].id === 'two-line-position'
  && twoLineResults[0].isOpen,
'“两直线位置关系”可搜索并打开');
const intersectionPoint = catalog.chapters[3].points.find(
  (point) => point.id === 'line-plane-relation'
);
suite.check(intersectionPoint
  && intersectionPoint.availability === 'available'
  && intersectionPoint.route
  && intersectionPoint.route.path
    === '/pages/intersection-relations/intersection-relations',
'线面、面面相交已映射到概念概览页');
const intersectionResults = search.searchKnowledgePoints(
  catalog,
  '面面相交',
  supportedKinds
);
suite.check(intersectionResults[0]
  && intersectionResults[0].id === 'line-plane-relation'
  && intersectionResults[0].isOpen,
'“面面相交”可搜索并打开概念概览页');
const parallelPoint = catalog.chapters[3].points.find(
  (point) => point.id === 'parallel-relations'
);
suite.check(parallelPoint
  && parallelPoint.availability === 'available'
  && parallelPoint.route
  && parallelPoint.route.path === '/pages/parallel-relations/parallel-relations',
'线面、面面平行已映射到独立图文页');
const parallelResults = search.searchKnowledgePoints(
  catalog,
  '线面平行',
  supportedKinds
);
suite.check(parallelResults[0]
  && parallelResults[0].id === 'parallel-relations'
  && parallelResults[0].isOpen,
'“线面平行”可搜索并打开独立图文页');
const perpendicularPoint = catalog.chapters[3].points.find(
  (point) => point.id === 'perpendicular-relations'
);
suite.check(perpendicularPoint
  && perpendicularPoint.availability === 'available'
  && perpendicularPoint.route
  && perpendicularPoint.route.path
    === '/pages/perpendicular-relations/perpendicular-relations',
'线面、面面垂直已映射到独立图文页');
const perpendicularResults = search.searchKnowledgePoints(
  catalog,
  '法线',
  supportedKinds
);
suite.check(perpendicularResults[0]
  && perpendicularResults[0].id === 'perpendicular-relations'
  && perpendicularResults[0].isOpen,
'“法线”可搜索并打开线面、面面垂直图文页');
suite.equal(
  catalog.chapters[2].points.map((point) => point.title).join(','),
  '平面的表示方法,平面的投影规律,最大斜度线',
  '第三章知识点名称按要求调整'
);
const planeRepresentationPoint = catalog.chapters[2].points.find(
  (point) => point.id === 'plane-representation'
);
suite.check(planeRepresentationPoint
  && planeRepresentationPoint.route
  && planeRepresentationPoint.route.path === '/pages/plane-representation/plane-representation'
  && planeRepresentationPoint.route.kind === 'page',
'平面的表示方法已映射到独立页面');
const planeRepresentationResults = search.searchKnowledgePoints(
  catalog,
  '迹线表示',
  supportedKinds
);
suite.check(planeRepresentationResults[0]
  && planeRepresentationResults[0].id === 'plane-representation'
  && planeRepresentationResults[0].isOpen,
'“迹线表示”可搜索并打开平面的表示方法');
suite.equal(
  catalog.chapters[3].points.map((point) => point.title).join(','),
  '线面、面面平行,线面、面面相交,线面、面面垂直',
  '第四章收缩为三个指定模块'
);
suite.equal(
  catalog.chapters[4].points.map((point) => point.title).join(','),
  '平面立体的投影,曲面立体的投影',
  '第五章知识点名称按要求调整'
);
const planeSolidPoint = catalog.chapters[4].points.find(
  (point) => point.id === 'polyhedron-projection'
);
suite.check(planeSolidPoint
  && planeSolidPoint.route
  && planeSolidPoint.route.path
    === '/pages/plane-solid-projection/plane-solid-projection',
'平面立体的投影已映射到独立互动页');
const curvedSolidPoint = catalog.chapters[4].points.find(
  (point) => point.id === 'curved-solid-projection'
);
suite.check(curvedSolidPoint
  && curvedSolidPoint.route
  && curvedSolidPoint.route.path
    === '/pages/curved-solid-projection/curved-solid-projection',
'曲面立体的投影已映射到独立互动页');
const planeSolidResults = search.searchKnowledgePoints(
  catalog,
  '棱锥',
  supportedKinds
);
suite.check(planeSolidResults[0]
  && planeSolidResults[0].id === 'polyhedron-projection'
  && planeSolidResults[0].isOpen,
'“棱锥”可搜索并打开平面立体投影页');
const curvedSolidResults = search.searchKnowledgePoints(
  catalog,
  '圆环',
  supportedKinds
);
suite.check(curvedSolidResults[0]
  && curvedSolidResults[0].id === 'curved-solid-projection'
  && curvedSolidResults[0].isOpen,
'“圆环”可搜索并打开曲面立体投影页');
suite.equal(
  catalog.chapters[5].points.map((point) => point.title).join(','),
  '直线与立体相交,平面与平面立体相交,平面与曲面立体相交',
  '第六章保留待开放的直线相交并拆分平面相交页面'
);
suite.equal(
  catalog.chapters[6].points.map((point) => point.title).join(','),
  '相贯线,两立体相交',
  '第七章保留两个更名模块并删除相贯线求作'
);
const removedPlanePositions = catalog.chapters[2].points.find(
  (point) => point.title === '各种位置平面的投影'
);
const removedPointLineInPlane = catalog.chapters[2].points.find(
  (point) => point.title === '平面上的点和直线'
);
const removedTwoPlaneRelation = catalog.chapters[3].points.find(
  (point) => point.title === '两平面的位置关系'
);
const removedSectionTitle = catalog.chapters[5].points.find(
  (point) => point.title === '截交线的分析与作图'
);
const removedSectionLine = catalog.chapters[5].points.find(
  (point) => point.title === '截交线'
);
const removedCombinedIntersection = catalog.chapters[5].points.find(
  (point) => point.title === '平面与立体相交'
);
const removedIntersectionMethod = catalog.chapters[6].points.find(
  (point) => point.title === '相贯线的求作'
);
suite.check(!removedPlanePositions && !removedPointLineInPlane
  && !removedTwoPlaneRelation && !removedSectionTitle
  && !removedSectionLine && !removedCombinedIntersection
  && !removedIntersectionMethod,
'第三、四、六、七章旧标题及第六章合并入口已删除');
const planeIntersectionPoint = catalog.chapters[5].points.find(
  (point) => point.id === 'plane-solid-intersection'
);
const curvedIntersectionPoint = catalog.chapters[5].points.find(
  (point) => point.id === 'curved-solid-intersection'
);
suite.check(planeIntersectionPoint
  && planeIntersectionPoint.route
  && planeIntersectionPoint.route.path
    === '/pages/plane-solid-intersection/plane-solid-intersection',
'平面与平面立体相交已映射到独立互动页');
suite.check(curvedIntersectionPoint
  && curvedIntersectionPoint.route
  && curvedIntersectionPoint.route.path
    === '/pages/curved-solid-intersection/curved-solid-intersection',
'平面与曲面立体相交已映射到独立互动页');
const polyhedronResults = search.searchKnowledgePoints(
  catalog,
  '五棱柱',
  supportedKinds
);
suite.check(polyhedronResults.some((item) => item.id === 'plane-solid-intersection'
  && item.isOpen), '“五棱柱”可搜索并打开平面立体相交页');
const curvedIntersectionResults = search.searchKnowledgePoints(
  catalog,
  '截交线',
  supportedKinds
);
suite.check(curvedIntersectionResults.some((item) => item.id === 'curved-solid-intersection'
  && item.isOpen), '“截交线”可搜索并打开曲面立体相交页');
suite.equal(search.normalizeQuery('  直线 的 投影  '), '直线的投影', '搜索词规范化');
suite.equal(search.searchKnowledgePoints(catalog, '   ', supportedKinds).length, 0,
  '空搜索不返回结果');

suite.section('5. 首页页面对象行为');
let pageDefinition = null;
const navigation = [];
const relaunches = [];
global.Page = (definition) => { pageDefinition = definition; };
global.getApp = () => ({
  globalData: { user: { openid: 'test-openid', student_id: '20260001' } }
});
global.wx = {
  reLaunch: ({ url }) => relaunches.push(url),
  navigateTo: ({ url }) => navigation.push(url),
  showToast: () => {}
};
delete require.cache[require.resolve('../pages/home/home.js')];
require('../pages/home/home.js');
suite.check(!!pageDefinition, '首页 Page 对象可加载');
if (pageDefinition) {
  const page = Object.assign({}, pageDefinition, {
    data: Object.assign({}, pageDefinition.data),
    setData(patch) { Object.assign(this.data, patch); }
  });
  page.onLoad();
  suite.equal(relaunches.length, 0, '已登录且资料完整时不发生启动重定向');
  suite.equal(page.data.chapters.length, 7, '页面加载七章目录');
  suite.check(page.data.chapters.every((chapter) => !chapter.isExpanded),
    '默认全部章节收起');
  suite.check(page.data.chapters.every((chapter, index) => chapter.hasMultiplePoints
    === (catalog.chapters[index].points.length > 1)),
  '多知识点箭头状态与课程目录一致');
  const firstHeader = page.data.chapters.find((chapter) => chapter.id === 'chapter-2');
  page.toggleChapter({ currentTarget: { dataset: { id: firstHeader.id } } });
  suite.check(page.data.chapters.find((chapter) => chapter.id === 'chapter-2').isExpanded,
    '点击章节可展开');
  page.handleSearchInput({ detail: { value: '直线的实长' } });
  suite.equal(page.data.searchResults[0].id, 'triangle-method', '页面搜索复用纯函数结果');
  page.openKnowledgePoint({ currentTarget: { dataset: { id: 'triangle-method' } } });
  suite.equal(navigation[0], '/pages/triangle-method/triangle-method', '已开放知识点跳转真实路由');
  navigation.length = 0;
  page.openKnowledgePoint({ currentTarget: { dataset: { id: 'line-projection' } } });
  suite.equal(navigation[0], '/pages/index/index?mode=line', '五模式知识点跳转正确深链');
  navigation.length = 0;
  page.openKnowledgePoint({ currentTarget: { dataset: { id: 'plane-solid-intersection' } } });
  suite.equal(navigation[0],
    '/pages/plane-solid-intersection/plane-solid-intersection',
    '平面与平面立体相交知识点跳转独立页面');
  navigation.length = 0;
  page.openKnowledgePoint({ currentTarget: { dataset: { id: 'curved-solid-intersection' } } });
  suite.equal(navigation[0],
    '/pages/curved-solid-intersection/curved-solid-intersection',
    '平面与曲面立体相交知识点跳转独立页面');
  navigation.length = 0;
  page.openKnowledgePoint({ currentTarget: { dataset: { id: 'intersection-curve-method' } } });
  suite.equal(navigation.length, 0, '待开放知识点不产生跳转');
}

suite.section('6. 阶段边界');
const homeJs = read('pages/home/home.js');
suite.check(!/startSession\s*\(/.test(homeJs), '首页不创建学习会话');
suite.check(!/recordEvent\s*\(/.test(homeJs), '首页不写章节学习记录');
suite.check(!/statistics\s*\(/.test(homeJs), '阶段 1 首页不调用问卷统计');
suite.check(!/canvas/.test(homeWxml), '首页不新增 Canvas');

process.exitCode = suite.finish();
