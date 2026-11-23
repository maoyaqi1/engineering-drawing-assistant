// 产品级静态信息集中配置。
//
// 当前版本以 README 和 v1.9.0 冻结记录为准。发布新版本时只修改本文件，
// 并同步更新版本记录；联系渠道未确认时保持空值，页面不会生成可点击入口。
const productInfo = {
  name: '工程制图学习助手',
  version: 'v1.9.0',
  subtitle: '让空间可观察、可操作、可验证。',
  positioning: '交互式工程制图学习工具',
  introduction: [
    '工程制图学习助手是一款面向工程制图课程学习的交互式数字学习工具。',
    '它以画法几何和工程制图的核心知识为基础，将抽象的空间几何关系转化为可以观察、操作和验证的数字化学习对象，帮助学生理解投影原理、建立空间概念、掌握工程图样的表达方法。'
  ],
  problems: [
    {
      key: 'spatial',
      mark: '空',
      title: '空间思维不直观',
      description: '通过动态展示和交互操作，让抽象的空间关系变得直观。'
    },
    {
      key: 'understanding',
      mark: '理',
      title: '知识理解不深入',
      description: '通过自主操作、观察变化和比较结果，帮助学生理解几何原理。'
    },
    {
      key: 'verification',
      mark: '验',
      title: '学习过程缺少验证',
      description: '通过操作结果和投影关系，帮助学生检查自己的理解。'
    }
  ],
  features: [
    '点、直线、平面的空间操作与第一角三视图联动',
    '投影法基础、正投影、三面投影体系与投影面展开',
    '两直线位置关系、直角三角形法与直角投影定理',
    '线面、面面平行、垂直、相交及分步作图',
    '平面和曲面立体的投影，以及平面与立体相交',
    '名册准入的 AI 教师、学习问卷和配套教师工作台'
  ],
  versionHighlights: [
    '新增线面、面面垂直图文页',
    '拆分平面立体与曲面立体的投影页面',
    '拆分平面与平面立体、平面与曲面立体相交页面',
    '支持棱柱、棱锥 3～8 棱截交互动'
  ],
  teamIntroduction: '本产品由工程制图课程教学团队结合教学实践持续设计与开发，围绕学生空间认知能力培养，不断探索数字技术与工程制图教学的融合方式。',
  contactChannels: [
    {
      key: 'teaching-feedback',
      title: '教师问题反馈',
      description: '欢迎工程制图教师参与产品共创，根据您的教学经验共同优化产品。如果愿意参与，可加入QQ群，入群请实名。',
      value: 'QQ群：582350202'
    },
    {
      key: 'team-email',
      title: '团队邮箱',
      description: '所有学生和教师均可通过此邮箱反馈问题、提供改进建议。',
      value: 'maoyq@ahjzu.edu.cn'
    },
    {
      key: 'official-account',
      title: '产品动态公众号',
      description: '关注“流金岁月”，查看产品发布与更新信息。',
      action: 'official-account',
      directId: 'gh_00107ceb1e4b',
      value: '流金岁月'
    }
  ]
};

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

module.exports = deepFreeze(productInfo);
