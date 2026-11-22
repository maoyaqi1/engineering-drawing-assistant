const { createSolidProjectionPage } = require('../index/solid-projection-page.js');

Page(createSolidProjectionPage({
  pageTitle: '曲面立体的投影',
  pagePath: '/pages/curved-solid-projection/curved-solid-projection',
  solidTypeKeys: ['cylinder', 'cone', 'sphere', 'torus'],
  solidTypeLabels: ['圆柱', '圆锥', '圆球', '圆环'],
  allowAi: false
}));
