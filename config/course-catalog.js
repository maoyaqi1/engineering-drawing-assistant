// 课程目录的唯一数据源。
//
// 本文件只保存课程结构、学习知识点、搜索关键词和页面映射，不依赖 wx、Page
// 或 Canvas。状态约定：
//   available：已有真实学习页面；最终路由由 route 描述。
//   planned：当前尚未实现，只能展示为“待开放”。
//
// 阶段 1 尚未接入 pages/index 的五模式深链，因此首页运行时会暂时禁用
// route.kind = "index-mode" 的入口；阶段 2 完成参数解析后再开放。

const chapters = [
  {
    id: 'chapter-1',
    number: '第一章',
    name: '投影体系的建立',
    title: '第一章：投影体系的建立',
    points: [
      {
        id: 'projection-basic',
        title: '投影法基础',
        availability: 'available',
        route: { path: '/pages/projection-method/projection-method', kind: 'page' },
        keywords: [
          '投影', '投影法', '中心投影', '平行投影', '正投影', '斜投影',
          '投射线', '投影面', '平行性', '从属性'
        ]
      },
      {
        id: 'orthographic-projection',
        title: '正投影',
        availability: 'available',
        route: { path: '/pages/orthographic-projection/orthographic-projection', kind: 'page' },
        keywords: [
          '正投影', '垂直投射线', '真实性', '积聚性', '相似性',
          '实长', '实形', '投影面平行线', '投影面平行面',
          '投影面垂直线', '投影面垂直面'
        ]
      },
      {
        id: 'projection-system',
        title: '三面投影体系',
        availability: 'available',
        route: { path: '/pages/projection/projection', kind: 'page' },
        keywords: ['三面投影', '三视图', 'V面', 'H面', 'W面', '第一分角', '八分角']
      },
      {
        id: 'point-projection',
        title: '点的投影',
        availability: 'available',
        route: { path: '/pages/index/index', kind: 'legacy-page' },
        keywords: ['点', '投影点', '点的三面投影', '坐标']
      },
      {
        id: 'projection-transform',
        title: '投影变换',
        availability: 'planned',
        keywords: ['换面法', '投影面变换', '旋转法']
      }
    ]
  },
  {
    id: 'chapter-2',
    number: '第二章',
    name: '直线的投影',
    title: '第二章：直线的投影',
    points: [
      {
        id: 'line-projection',
        title: '直线的投影规律',
        availability: 'available',
        route: { path: '/pages/index/index', mode: 'line', kind: 'index-mode' },
        keywords: [
          '直线', '直线段', '端点', '三面投影', '投影规律',
          '一般位置直线', '水平线', '正平线', '侧平线',
          '铅垂线', '正垂线', '侧垂线'
        ]
      },
      {
        id: 'triangle-method',
        title: '直角三角形法求实长',
        availability: 'available',
        route: { path: '/pages/triangle-method/triangle-method', kind: 'page' },
        keywords: ['直线的实长', '实长', '倾角', '直角三角形法', '线段实长']
      },
      {
        id: 'two-line-position',
        title: '两直线位置关系',
        availability: 'available',
        route: { path: '/pages/two-line-position/two-line-position', kind: 'page' },
        keywords: ['两直线', '平行', '相交', '交叉', '异面']
      },
      {
        id: 'right-angle-projection',
        title: '直角投影定理',
        availability: 'available',
        route: { path: '/pages/right-angle-projection/right-angle-projection', kind: 'page' },
        keywords: ['直角', '垂直', '直线垂直', '直角投影']
      }
    ]
  },
  {
    id: 'chapter-3',
    number: '第三章',
    name: '平面的投影',
    title: '第三章：平面的投影',
    points: [
      {
        id: 'plane-representation',
        title: '平面的表示方法',
        availability: 'available',
        route: { path: '/pages/plane-representation/plane-representation', kind: 'page' },
        keywords: [
          '平面的表示', '三点定面', '点与直线', '相交直线', '平行直线',
          '平面图形', '迹线', '水平迹线', '正面迹线', '侧面迹线',
          'P_H', 'P_V', 'P_W'
        ]
      },
      {
        id: 'plane-positions',
        title: '平面的投影规律',
        availability: 'available',
        route: { path: '/pages/index/index', mode: 'plane', kind: 'index-mode' },
        keywords: ['一般位置平面', '水平面', '正平面', '侧平面', '铅垂面', '正垂面', '侧垂面']
      },
      {
        id: 'maximum-slope-line',
        title: '最大斜度线',
        availability: 'available',
        route: { path: '/pages/maximum-slope-line/maximum-slope-line', kind: 'page' },
        keywords: ['最大斜度线', '平面倾角', '迹线', '平面与投影面夹角']
      }
    ]
  },
  {
    id: 'chapter-4',
    number: '第四章',
    name: '线面、面面位置关系',
    title: '第四章：线面、面面位置关系',
    points: [
      {
        id: 'parallel-relations',
        title: '线面、面面平行',
        availability: 'available',
        route: { path: '/pages/parallel-relations/parallel-relations', kind: 'page' },
        keywords: ['线面平行', '面面平行', '直线与平面平行', '平面与平面平行']
      },
      {
        id: 'line-plane-relation',
        title: '线面、面面相交',
        availability: 'available',
        route: { path: '/pages/intersection-relations/intersection-relations', kind: 'page' },
        keywords: ['线面相交', '面面相交', '交点', '交线', '直线与平面', '辅助平面法']
      },
      {
        id: 'perpendicular-relations',
        title: '线面、面面垂直',
        availability: 'available',
        route: { path: '/pages/perpendicular-relations/perpendicular-relations', kind: 'page' },
        keywords: [
          '线面垂直', '面面垂直', '直线与平面垂直', '平面与平面垂直',
          '法线', '垂线', '二面角'
        ]
      }
    ]
  },
  {
    id: 'chapter-5',
    number: '第五章',
    name: '立体的投影',
    title: '第五章：立体的投影',
    points: [
      {
        id: 'polyhedron-projection',
        title: '平面立体的投影',
        availability: 'available',
        route: { path: '/pages/plane-solid-projection/plane-solid-projection', kind: 'page' },
        keywords: ['平面立体', '棱柱', '棱锥', '多面体', '三视图']
      },
      {
        id: 'curved-solid-projection',
        title: '曲面立体的投影',
        availability: 'available',
        route: { path: '/pages/curved-solid-projection/curved-solid-projection', kind: 'page' },
        keywords: ['曲面立体', '回转体', '圆柱', '圆锥', '圆球', '圆环', '三视图']
      }
    ]
  },
  {
    id: 'chapter-6',
    number: '第六章',
    name: '直线、平面与立体相交',
    title: '第六章：直线、平面与立体相交',
    points: [
      {
        id: 'line-solid-intersection',
        title: '直线与立体相交',
        availability: 'planned',
        keywords: ['直线与立体', '贯穿点', '贯穿线']
      },
      {
        id: 'plane-solid-intersection',
        title: '平面与平面立体相交',
        availability: 'available',
        route: {
          path: '/pages/plane-solid-intersection/plane-solid-intersection',
          kind: 'page'
        },
        keywords: ['截交线', '三棱锥', '五棱柱', '平面立体', '截平面']
      },
      {
        id: 'curved-solid-intersection',
        title: '平面与曲面立体相交',
        availability: 'available',
        route: {
          path: '/pages/curved-solid-intersection/curved-solid-intersection',
          kind: 'page'
        },
        keywords: ['截交线', '圆柱', '圆锥', '圆球', '圆环', '曲面立体', '截平面']
      }
    ]
  },
  {
    id: 'chapter-7',
    number: '第七章',
    name: '两立体相交',
    title: '第七章：两立体相交',
    points: [
      {
        id: 'intersection-curve-basic',
        title: '相贯线',
        availability: 'planned',
        keywords: ['相贯线', '两立体相交', '共有线']
      },
      {
        id: 'intersection-solid-analysis',
        title: '两立体相交',
        availability: 'planned',
        keywords: ['相贯线投影', '立体相交分析', '平面立体相贯', '曲面立体相贯']
      }
    ]
  }
];

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }
  return value;
}

module.exports = deepFreeze({
  chapters,
  defaultExpandedChapterId: ''
});
