const { createSectionSolidPage } = require('../index/section-solid-page.js');

Page(createSectionSolidPage({
  pageTitle: '平面与平面立体相交',
  pagePath: '/pages/plane-solid-intersection/plane-solid-intersection',
  learningChapterName: '平面与平面立体相交',
  canvasAriaLabel: '棱柱或棱锥与截平面的空间图和三视图互动图',
  pageInstruction: '选择棱柱或棱锥并调整棱数、截平面，观察截交线变化',
  lessonTitle: '平面与平面立体相交，截交线是封闭多边形',
  lessonBody: '选择截平面类型并调整角度和位置，观察截平面与棱线、棱面形成的截交线及其三面投影。',
  supportsSides: true,
  defaultSides: 5,
  solidTypes: [
    { key: 'prism', label: '棱柱' },
    { key: 'pyramid', label: '棱锥' }
  ]
}));
