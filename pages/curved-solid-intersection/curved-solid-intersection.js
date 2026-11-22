const { createSectionSolidPage } = require('../index/section-solid-page.js');

Page(createSectionSolidPage({
  pageTitle: '平面与曲面立体相交',
  pagePath: '/pages/curved-solid-intersection/curved-solid-intersection',
  learningChapterName: '平面与曲面立体相交',
  canvasAriaLabel: '圆柱、圆锥、圆球或圆环与截平面的空间图和三视图互动图',
  pageInstruction: '选择曲面立体，调整截平面观察截交线变化',
  lessonTitle: '平面与曲面立体相交，截交线随立体和平面位置变化',
  lessonBody: '选择截平面类型并调整角度和位置，观察圆柱、圆锥、圆球、圆环的截交线及其三面投影。',
  solidTypes: [
    { key: 'cylinder', label: '圆柱' },
    { key: 'cone', label: '圆锥' },
    { key: 'sphere', label: '圆球' },
    { key: 'torus', label: '圆环' }
  ]
}));
