#!/usr/bin/env node
// AI 教师知识点路由与知识库一致性守护（开发者本机运行，只读，零第三方依赖）。
//
// 运行：node scripts/ai-knowledge-routing-check.cjs            （或 node scripts/run-all.js 统一运行）
//       node scripts/ai-knowledge-routing-check.cjs --quiet    只打印失败项与备注
//
// 背景（2026-09-24）：
//   用教师新整理的《AI教师知识库》（F:\AI教师知识库，162 个视频 / 2725 个知识点片段）校对
//   cloudfunctions/api/knowledge/*.md 时发现：课程第 8 章「装配图」（课件 8.1–8.5，5 个视频）
//   在知识文件与 ai/knowledge.js 的匹配路由里都不存在。学生问「装配图怎么看」时，
//   matchKnowledgePoint 返回 null —— 既不注入任何知识，也不落到任何知识点，
//   回答完全交给模型自由发挥。本脚本把该缺口与其余全部知识点路由一起锁住。
//
// 检查项：
//   A 每篇知识文件的「知识点ID」非空、唯一、可被 getKnowledgeContent 取到，文件数与知识点数一致
//   B 全部知识点的代表性提问命中预期知识点（含装配图 G06；含追问沿用会话知识点）
//   C 每篇注入正文长度不超过 config.context.maxKnowledgeChars（超出会被 buildKnowledgeBlock 截断）
//   D 装配图章节存在且可被路由到
//
// 边界（必须明确）：
//   1. 只读：不连网络、不写任何文件、不调用大模型；
//   2. 只锁定「知识点路由 + 文件一致性」，不代表回答质量；回答质量必须在云函数部署后
//      用真实对话回归（AGENTS.md C11 第 3 条：未部署不算验证）；
//   3. 不是自动化测试框架，也不替代真机回归（AGENTS.md C11）。

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./lib/harness.js');

const ROOT = path.resolve(__dirname, '..');
const AI_DIR = path.join(ROOT, 'cloudfunctions', 'api', 'ai');
const KNOWLEDGE_DIR = path.join(ROOT, 'cloudfunctions', 'api', 'knowledge');

const { listKnowledgePoints, getKnowledgeContent, matchKnowledgePoint } = require(path.join(AI_DIR, 'knowledge.js'));
const CONFIG = require(path.join(AI_DIR, 'config.js'));

// 与 ai/knowledge.js 的 ID_PATTERN 保持一致（该常量未导出，这里按同一规则解析）
const ID_PATTERN = /##\s*知识点ID\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i;

// 代表性提问 → 预期知识点ID。既覆盖既有知识点（回归），也覆盖装配图（本次补齐）。
const ROUTES = [
  // —— 装配图（课程第 8 章，2026-09-24 依据 F:\AI教师知识库 新增）——
  ['装配图是什么', 'G06'],
  ['装配图怎么看', 'G06'],
  ['装配图明细栏怎么填', 'G06'],
  ['零件序号怎么标注', 'G06'],
  ['装配图上的配合尺寸指什么', 'G06'],
  ['由装配图拆画零件图', 'G06'],
  ['部件测绘的步骤是什么', 'G06'],
  ['装配图有哪些特殊表示法', 'G06'],
  // —— 点 / 投影法 ——
  ['正投影的四个基本性质', 'G01'],
  ['中心投影法和平行投影法的区别', 'G01'],
  ['点的三面投影规律是什么？', 'G02'],
  ['已知点的坐标怎么作三面投影', 'G02'],
  ['重影点怎么判断可见性', 'G02'],
  ['两点相对位置怎么判断', 'G02'],
  // —— 直线 / 平面 ——
  ['一般位置直线的实长怎么求', 'G03'],
  ['直角三角形法求实长', 'G03'],
  ['直角投影定理的内容', 'G03'],
  ['直角投影定理应用例题1', 'G03'],
  ['最大斜度线的作用', 'G04'],
  ['怎么判断点在平面上', 'G04'],
  ['投影面垂直面的积聚投影有什么用', 'G04'],
  // —— 立体 / 截交 / 相贯 ——
  ['圆柱表面取点怎么取', 'G05'],
  ['圆环的投影是什么样', 'G05'],
  ['圆锥的转向轮廓线指什么', 'G05'],
  ['截交线怎么画', 'G07'],
  ['平面与圆锥相交的截交线形状', 'G07'],
  ['贯穿点怎么求', 'G07'],
  ['相贯线怎么求', 'G15'],
  ['两立体相贯的可见性判断', 'G15'],
  // —— 相对位置与度量 ——
  ['怎么判断直线与平面平行', 'G08'],
  ['一般位置线面相交怎么求交点', 'G08'],
  ['点到平面的距离怎么求', 'G08'],
  ['直线与平面垂直的投影特征', 'G08'],
  // —— 制图基本知识 / 组合体 / 图样画法 ——
  ['图线有哪几种', 'G09'],
  ['尺寸标注三要素是什么', 'G09'],
  ['圆弧连接怎么画', 'G09'],
  ['形体分析法的作用', 'G10'],
  ['相切处的投影怎么画', 'G10'],
  ['剖视图与断面图的区别', 'G11'],
  ['半剖视图适用什么场合', 'G11'],
  // —— 零件图 / 标准件 / 投影变换 / 轴测图 ——
  ['零件图包含哪些内容', 'G12'],
  ['公差和配合是什么意思', 'G12'],
  ['螺纹五要素', 'G12'],
  ['表面粗糙度的作用', 'G12'],
  ['平键的标记怎么写', 'G13'],
  ['滚动轴承由哪几部分组成', 'G13'],
  ['圆柱齿轮的基本参数', 'G13'],
  ['换面法的原则是什么', 'G14'],
  ['点的投影变换规律', 'G14'],
  ['正等轴测图的轴间角是多少', 'G16'],
  ['斜二测适合什么情况', 'G16']
];

const suite = createSuite('AI 教师知识点路由检查', { quiet: process.argv.includes('--quiet') });

// —— A 知识库文件与知识点ID一致 ——
suite.section('A 知识库文件与知识点ID一致');
const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md')).sort();
const declaredIds = [];
files.forEach((fileName) => {
  const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, fileName), 'utf8');
  const idMatch = content.match(ID_PATTERN);
  if (!suite.check(!!idMatch, fileName + ' 声明了「知识点ID」')) return;
  const ids = idMatch[1].split(/[\s,，、;/；]+/).map((s) => s.trim()).filter(Boolean);
  suite.check(ids.length > 0, fileName + ' 的知识点ID非空');
  ids.forEach((id) => declaredIds.push(id));
});
suite.equal(new Set(declaredIds).size, declaredIds.length, '知识点ID不重复');
suite.equal(listKnowledgePoints().length, declaredIds.length, '路由表知识点数与文件声明数一致');
declaredIds.forEach((id) => {
  suite.check(!!getKnowledgeContent(id), '知识点 ' + id + ' 能被 getKnowledgeContent 取到');
});
suite.note('知识文件 ' + files.length + ' 篇 / 声明知识点 ' + declaredIds.length + ' 个');

// —— B 知识点路由 ——
suite.section('B 知识点路由（代表性提问）');
ROUTES.forEach(([query, expected]) => {
  suite.equal(matchKnowledgePoint(query), expected, '「' + query + '」→ ' + expected);
});

// 追问：无上下文时不应凭空落到某个知识点；有会话上下文时沿用会话知识点
suite.equal(matchKnowledgePoint('我还是不懂'), null, '无上下文的追问「我还是不懂」不误报到知识点');
suite.equal(matchKnowledgePoint('我还是不懂', { current: 'G02' }), 'G02', '有会话上下文时追问沿用当前知识点');
suite.equal(matchKnowledgePoint('今天天气怎么样', null), null, '课程外提问不落到知识点');

// —— C 注入正文长度上限 ——
suite.section('C 注入正文长度上限');
const maxChars = CONFIG.context.maxKnowledgeChars;
declaredIds.forEach((id) => {
  const kp = getKnowledgeContent(id);
  if (!kp) return;
  suite.check(
    kp.content.length <= maxChars,
    id + ' 注入正文 ' + kp.content.length + ' 字符 ≤ ' + maxChars,
    kp.content.length > maxChars ? '超出部分会被 buildKnowledgeBlock 截断' : ''
  );
});

// —— D 装配图章节 ——
suite.section('D 装配图章节（课程第 8 章）');
const assembly = getKnowledgeContent('G06');
suite.check(!!assembly, '存在装配图知识点 G06');
if (assembly) {
  suite.check(assembly.title.indexOf('装配') >= 0, 'G06 标题含「装配」：' + assembly.title);
  ['明细栏', '序号', '规定画法', '技术要求'].forEach((word) => {
    suite.check(assembly.content.indexOf(word) >= 0, 'G06 正文含「' + word + '」');
  });
}

process.exitCode = suite.finish();
