// 首页课程视图与搜索的纯函数层。
//
// 本模块不读取页面实例、不调用 wx，便于离线验证章节顺序、知识点状态、
// 跨章节关键词匹配和路由可用性。

function normalizeQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function supportsRoute(point, supportedKinds) {
  if (!point || point.availability !== 'available' || !point.route) return false;
  const routeKind = point.route.kind || 'page';
  return Array.isArray(supportedKinds) && supportedKinds.includes(routeKind);
}

function getStatusText(point, supportedKinds) {
  if (!point || point.availability !== 'available') return '待开放';
  return supportsRoute(point, supportedKinds) ? '' : '接入中';
}

function getRouteUrl(point) {
  if (!point || !point.route || !point.route.path) return '';
  const mode = point.route.mode ? `?mode=${encodeURIComponent(point.route.mode)}` : '';
  return point.route.path + mode;
}

function decoratePoint(point, chapter, order, supportedKinds) {
  const isOpen = supportsRoute(point, supportedKinds);
  return {
    id: point.id,
    title: point.title,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    availability: point.availability,
    isOpen,
    statusText: getStatusText(point, supportedKinds),
    routeUrl: isOpen ? getRouteUrl(point) : '',
    order
  };
}

function buildHomeChapters(catalog, expandedChapterId, supportedKinds) {
  let order = 0;
  return catalog.chapters.map((chapter) => ({
    id: chapter.id,
    number: chapter.number,
    name: chapter.name,
    title: chapter.title,
    hasMultiplePoints: chapter.points.length > 1,
    isExpanded: chapter.id === expandedChapterId,
    points: chapter.points.map((point) => {
      const item = decoratePoint(point, chapter, order, supportedKinds);
      order += 1;
      return item;
    })
  }));
}

function getTitleScore(title, keywords, chapterTitle, normalizedQuery) {
  const normalizedTitle = normalizeQuery(title);
  const normalizedChapter = normalizeQuery(chapterTitle);
  let score = 0;
  if (normalizedTitle === normalizedQuery) score = Math.max(score, 1000);
  if (normalizedTitle.startsWith(normalizedQuery)) score = Math.max(score, 800);
  if (normalizedTitle.includes(normalizedQuery)) score = Math.max(score, 600);
  (keywords || []).forEach((keyword) => {
    const normalizedKeyword = normalizeQuery(keyword);
    if (normalizedKeyword === normalizedQuery) score = Math.max(score, 500);
    else if (normalizedKeyword.includes(normalizedQuery)
      || normalizedQuery.includes(normalizedKeyword)) {
      score = Math.max(score, 400);
    }
  });
  if (normalizedChapter.includes(normalizedQuery)) score = Math.max(score, 100);
  return score;
}

function searchKnowledgePoints(catalog, rawQuery, supportedKinds) {
  const normalizedQuery = normalizeQuery(rawQuery);
  if (!normalizedQuery) return [];
  const results = [];
  let order = 0;
  catalog.chapters.forEach((chapter) => {
    chapter.points.forEach((point) => {
      const score = getTitleScore(point.title, point.keywords, chapter.title, normalizedQuery);
      if (score > 0) {
        results.push(Object.assign(
          decoratePoint(point, chapter, order, supportedKinds),
          { score }
        ));
      }
      order += 1;
    });
  });
  return results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.order - right.order;
  });
}

module.exports = {
  normalizeQuery,
  supportsRoute,
  getStatusText,
  getRouteUrl,
  buildHomeChapters,
  searchKnowledgePoints
};
