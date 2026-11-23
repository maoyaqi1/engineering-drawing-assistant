#!/usr/bin/env node
// 产品介绍与三项育人能力页面检查。
//
// 只读核对页面注册、首页入口、集中版本配置、联系渠道降级、
// 三个能力页的统一模板以及“不创建学习会话”的静态边界。
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const suite = createSuite('info-pages-check');
const read = (relativePath) => fs
  .readFileSync(path.join(ROOT, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');
const appJson = JSON.parse(read('app.json'));
const productInfo = require('../config/product-info.js');
const abilityPages = require('../config/ability-pages.js');

const INFO_PAGES = [
  {
    route: 'pages/about/about',
    title: '关于工程制图学习助手',
    homeLink: '/pages/about/about'
  },
  {
    route: 'pages/thinking/thinking',
    title: '动脑思考',
    homeLink: '/pages/thinking/thinking'
  },
  {
    route: 'pages/exploring/exploring',
    title: '动手探索',
    homeLink: '/pages/exploring/exploring'
  },
  {
    route: 'pages/tools/tools',
    title: '善用工具',
    homeLink: '/pages/tools/tools'
  }
];

suite.section('1. 页面注册与首页入口');
suite.equal(appJson.pages.length, 28, '页面注册总数由 24 增至 28');
INFO_PAGES.forEach((page) => {
  suite.check(appJson.pages.includes(page.route), `已注册：${page.route}`);
  ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
    suite.check(fs.existsSync(path.join(ROOT, `${page.route}.${extension}`)),
      `${page.route} 包含 .${extension}`);
  });
});
const homeWxml = read('pages/home/home.wxml');
INFO_PAGES.forEach((page) => {
  suite.check(homeWxml.includes(`url="${page.homeLink}"`),
    `首页已连接：${page.title}`);
});
suite.check(/class="home-title-link"[\s\S]*?url="\/pages\/about\/about"/.test(homeWxml),
  '仅产品名称链接到“关于我们”');
const profileMarkup = (homeWxml.match(/<navigator\s+class="profile-entry"[\s\S]*?<\/navigator>/) || [''])[0];
suite.check(profileMarkup.includes('url="/pages/register/register"')
  && !profileMarkup.includes('/pages/about/about'),
'个人信息按钮保持原有资料页链接');

suite.section('2. 产品介绍内容与版本配置');
const aboutWxml = read('pages/about/about.wxml');
[
  '关于工程制图学习助手',
  '这是一款什么样的产品？',
  '产品希望解决的问题',
  '版本与功能',
  '关于开发团队',
  '联系我们'
].forEach((text) => suite.check(aboutWxml.includes(text), `关于页包含：${text}`));
suite.equal(productInfo.subtitle, '让空间可观察、可操作、可验证。', '关于页副标题使用确认文案');
suite.equal(
  productInfo.problems.map((item) => item.title).join(','),
  '空间思维不直观,知识理解不深入,学习过程缺少验证',
  '三个产品问题卡片顺序正确'
);

const readme = read('README.md');
const readmeVersion = (readme.match(/当前版本：\*\*(v\d+\.\d+\.\d+)\*\*/) || [])[1];
suite.equal(productInfo.version, readmeVersion, '页面版本与 README 当前版本一致');
suite.equal(productInfo.positioning, '交互式工程制图学习工具', '版本定位使用确认文案');
suite.check(productInfo.features.length >= 5, '主要功能按当前真实能力归纳');
suite.check(productInfo.features.every((item) => typeof item === 'string' && item.length > 0),
  '主要功能没有空项');
suite.check(productInfo.versionHighlights.some((item) => item.includes('拆分平面立体与曲面立体'))
  && productInfo.versionHighlights.some((item) => item.includes('3～8 棱')),
'当前版本更新摘要与 v1.8.0 记录一致');

suite.section('3. 联系渠道不虚构');
suite.equal(productInfo.contactChannels.length, 3, '保留三个真实联系渠道');
suite.equal(
  productInfo.contactChannels.map((item) => item.value).join('|'),
  'QQ群：582350202|maoyq@ahjzu.edu.cn|流金岁月',
  'QQ 群、团队邮箱和微信公众号配置正确'
);
productInfo.contactChannels.forEach((channel) => {
  suite.check(!!channel.title && !!channel.description,
    `联系项有标题和说明：${channel.title}`);
  suite.check(typeof channel.value === 'string', `联系方式必须为字符串：${channel.title}`);
});
suite.check(productInfo.contactChannels[0].description.includes('产品共创')
  && productInfo.contactChannels[0].description.includes('实名'),
'教师反馈说明产品共创和实名要求');
suite.check(productInfo.contactChannels[1].description.includes('所有学生和教师'),
  '团队邮箱面向所有学生和教师');
suite.equal(
  productInfo.contactChannels[2].directId,
  'gh_00107ceb1e4b',
  '微信公众号原始 ID 配置正确'
);
suite.check(!productInfo.contactChannels[0].action
  && !productInfo.contactChannels[1].action,
'QQ 群和邮箱仅展示，不绑定点击行为');
suite.check(aboutWxml.includes('wx:elif="{{item.isConfigured}}"')
  && aboutWxml.includes('wx:else'),
'联系方式按配置状态显示文本');
suite.check(!aboutWxml.includes('contact-action')
  && aboutWxml.includes('bindtap="handleContactTap"'),
'联系渠道无独立复制按钮且整行可点击');
const configuredContacts = productInfo.contactChannels.filter((item) => item.value);
suite.check(configuredContacts.every((item) => !/example\.com|@example|123456789|400-?[0-9]{3}/i.test(item.value)),
  '联系方式没有示例邮箱、示例电话或占位号码');

suite.section('4. 三项能力页与统一模板');
const abilityTemplate = read('templates/ability-page.wxml');
const expectedAbilityKeys = ['thinking', 'exploring', 'tools'];
suite.equal(Object.keys(abilityPages).join(','), expectedAbilityKeys.join(','),
  '能力页配置顺序固定');
expectedAbilityKeys.forEach((key) => {
  const page = abilityPages[key];
  suite.equal(page.abilities.length, 3, `${page.title} 包含三项能力`);
  suite.check(page.introduction.length > 0 && page.prompt.items.length > 0,
    `${page.title} 包含核心介绍和学习启发`);
  suite.equal(page.practice.items.length, 3, `${page.title} 包含三项课堂学习约定`);
  suite.check(page.practice.rule.includes('铅笔、直尺、圆规和橡皮'),
    `${page.title} 明确要求携带尺规和铅笔`);
  suite.check(page.practice.items.some((item) => item.includes('铅笔'))
    && page.practice.items.some((item) => item.includes('尺规')
      || item.includes('直尺') || item.includes('圆规')),
  `${page.title} 强调先用铅笔构造并用尺规校核`);
  const pageWxml = read(`pages/${key}/${key}.wxml`);
  suite.check(pageWxml.includes('<include src="../../templates/ability-page.wxml" />'),
    `${page.title} 复用统一能力页模板`);
  const pageJs = read(`pages/${key}/${key}.js`);
  suite.check(!/startSession|recordEvent|utils\/api|onShow\s*\(|onHide\s*\(/.test(pageJs),
    `${page.title} 不创建学习会话或学习记录`);
});
[
  '{{pageContent.title}}',
  '{{pageContent.subtitle}}',
  '能力培养',
  '{{pageContent.prompt.title}}',
  '带着问题思考，用铅笔和尺规动手验证，再以规范工具表达结果，三项能力在同一个作图过程中彼此支撑。',
  '返回课程首页'
].forEach((text) => suite.check(abilityTemplate.includes(text), `能力页模板包含：${text}`));
[
  '{{pageContent.practice.label}}',
  '{{pageContent.practice.title}}',
  '{{pageContent.practice.rule}}',
  '{{pageContent.practice.items}}'
].forEach((text) => suite.check(abilityTemplate.includes(text), `课堂学习约定包含：${text}`));
suite.check(!abilityTemplate.includes('<canvas'), '能力介绍页不使用 Canvas');
suite.equal(
  abilityPages.thinking.abilities.map((ability) => ability.title).join(','),
  '空间思维能力,几何分析能力,逻辑推理能力',
  '动脑思考页统一使用空间思维术语'
);

suite.section('5. 返回与学习统计边界');
[
  'pages/about/about.js',
  'pages/thinking/thinking.js',
  'pages/exploring/exploring.js',
  'pages/tools/tools.js'
].forEach((relativePath) => {
  const source = read(relativePath);
  suite.check(source.includes('handleBack()'), `${relativePath} 提供返回处理`);
  suite.check(source.includes("wx.reLaunch({ url: '/pages/home/home' })"),
    `${relativePath} 无上一页时可返回课程首页`);
  suite.check(!/startSession|endSession|recordEvent|statistics/.test(source),
    `${relativePath} 不接入学习会话、事件或问卷统计`);
  suite.check(!/utils\/api/.test(source), `${relativePath} 不依赖学生端云接口`);
});

suite.section('6. 联系渠道点击行为');
{
  let aboutPageDefinition = null;
  const copiedValues = [];
  const openedAccounts = [];
  const toasts = [];
  global.Page = (definition) => { aboutPageDefinition = definition; };
  global.getCurrentPages = () => [{ route: 'pages/home/home' }];
  global.wx = {
    navigateBack() {},
    reLaunch() {},
    setClipboardData(options) {
      copiedValues.push(options.data);
      if (options.success) options.success();
    },
    showToast(options) {
      toasts.push(options.title);
    },
    openOfficialAccountProfile(options) {
      openedAccounts.push(options.username);
    }
  };
  delete require.cache[require.resolve('../pages/about/about.js')];
  require('../pages/about/about.js');
  suite.check(!!aboutPageDefinition, '关于页 Page 对象可加载');
  if (aboutPageDefinition) {
    [
      'QQ群：582350202',
      'maoyq@ahjzu.edu.cn',
      '流金岁月'
    ].forEach((value) => {
      const channel = aboutPageDefinition.data.contactChannels.find(
        (item) => item.value === value
      );
      suite.check(!!channel && channel.isConfigured,
        `联系渠道已配置：${value}`);
    });
    const tap = (key) => aboutPageDefinition.handleContactTap.call(aboutPageDefinition, {
      currentTarget: { dataset: { contactKey: key } }
    });
    const account = aboutPageDefinition.data.contactChannels.find(
      (item) => item.key === 'official-account'
    );
    const configuredDirectId = account.directId;
    tap('teaching-feedback');
    tap('team-email');
    suite.equal(copiedValues.length, 0, 'QQ 群和邮箱点击不执行复制');
    tap('official-account');
    suite.equal(openedAccounts.join('|'), 'gh_00107ceb1e4b',
      '配置公众号原始 ID 后调用官方直达 API');
    account.directId = '';
    tap('official-account');
    suite.equal(copiedValues.join('|'), '流金岁月',
      '公众号直达失败降级时复制公众号名称');
    suite.equal(toasts[0], '公众号名称已复制，请在微信中搜索',
      '公众号降级复制提示正确');
    account.directId = configuredDirectId;
  }
}

process.exitCode = suite.finish();
