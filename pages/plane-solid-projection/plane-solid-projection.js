const { createSolidProjectionPage } = require('../index/solid-projection-page.js');

Page(createSolidProjectionPage({
  pageTitle: '平面立体的投影',
  pagePath: '/pages/plane-solid-projection/plane-solid-projection',
  solidTypeKeys: ['prism', 'pyramid'],
  solidTypeLabels: ['棱柱', '棱锥'],
  layoutMode: 'plane',
  allowAi: true
}));
