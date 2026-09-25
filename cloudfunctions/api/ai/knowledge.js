const fs = require('fs');
const path = require('path');

// 知识点匹配逻辑（移植自 AIteacher backend/services/knowledgeService.js）
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

const ID_PATTERN = /##\s*知识点ID\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i;
const TITLE_PATTERN = /^#\s+(.+)$/m;
const CONTENT_PATTERN = /^##\s+基本概念[\s\S]*$/m;

const KEYWORDS = {
  G01: ['投影法', '正投影法', '斜投影法', '中心投影法', '平行投影法', '正投影的性质', '唯一性', '度量性', '投影基本概念'],
  G02: ['点的投影', '点的三面投影', '三面投影', '三投影面体系', '点的坐标', '两点相对位置', '点投影', '投影连线', 'a′', 'a″', '长对正', '高平齐', '宽相等', '点的', '三个投影'],
  G03: ['直线', '一般位置直线', '正平线', '水平线', '侧平线', '铅垂线', '正垂线', '侧垂线', '投影面平行线', '投影面垂直线', '实长', '直线的投影', '直线位置', '直角投影定理'],
  G04: ['平面', '一般位置平面', '正平面', '水平面', '侧平面', '正垂面', '铅垂面', '侧垂面', '投影面平行面', '投影面垂直面', '平面位置', '实形', '平面的投影', '最大斜度线', '平面的最大斜度线'],
  G05: ['棱柱', '棱锥', '基本立体', '平面立体', '回转体', '圆柱', '圆锥', '圆球', '球', '圆环', '转向轮廓线', '立体投影', '立体的投影', '表面取点', '轴线', '锥顶', '母线', '纬圆', '素线法', '纬圆法'],
  // G06 装配图：2026-09-24 依据教师新整理的《AI教师知识库》（课件 8.1–8.5 五个视频）补齐，
  // 此前整章缺失（问「装配图怎么看」既不注入知识、也不落知识点），见 scripts/ai-knowledge-routing-check.cjs
  G06: ['装配图', '装配体', '装配干线', '明细栏', '零件序号', '装配示意图', '部件测绘', '拆画零件图', '配合尺寸', '外形尺寸', '安装尺寸', '性能尺寸', '规定画法', '特殊表示法', '拆卸画法', '夸大画法', '假想画法', '展开画法', '装配结构', '接触面'],
  G07: ['截交', '截交线', '截平面', '截面', '断面', '切割', '平面切割', '平面与立体相交', '直线与立体相交', '贯穿点', '截切', '被切'],
  G08: ['相对位置', '直线与平面', '平面与平面', '直线与平面平行', '平面与平面平行', '直线与平面垂直', '平面与平面垂直', '交点', '交线', '辅助平面', '线面相交', '面面相交', '两平面', '点到平面', '点到直线', '线面角', '二面角'],
  G14: ['投影变换', '换面法', '新投影面', '辅助投影面', '新投影轴', '投影变换规律', '点的新投影', '投影面平行线变为', '投影面垂直线变为', '实形', '倾角'],
  G15: ['相贯', '相贯线', '两立体相交', '两立体相贯', '两平面立体相贯', '平面立体与曲面立体相贯', '两曲面立体相贯', '结合点', '辅助球面法', '相贯线画法', '共有线', '贯'],
  G09: ['制图的基本知识', '图纸幅面', '幅面', '图框', '图线', '粗实线', '细实线', '细虚线', '虚线', '细点画线', '点画线', '比例', '长仿宋', '字高', '尺寸标注', '尺寸界线', '尺寸线', '尺寸数字', '尺规绘图', '徒手绘图', '斜度', '锥度', '圆弧连接', '平面图形', '已知弧', '中间弧', '连接弧', '国家标准', '标题栏', '箭头'],
  G10: ['组合体', '形体分析', '线面分析', '叠加', '挖切', '切割', '组合体视图', '组合体三视图', '表面连接', '相切', '平齐', '定形尺寸', '定位尺寸', '总体尺寸', '尺寸基准', '构型设计', '拉伸', '旋转', 'CSG'],
  G11: ['机件的图样画法', '图样画法', '剖视图', '剖视', '全剖', '半剖', '局部剖', '断面图', '断面', '移出断面', '重合断面', '基本视图', '向视图', '局部视图', '斜视图', '剖面线', '剖切面', '简化画法', '局部放大图'],
  G12: ['零件图', '零件图的内容', '零件表达方案', '主视图', '表达方案', '技术要求', '表面粗糙度', '尺寸公差', '配合', '尺寸基准', '读零件图', '看零件图', '零件测绘', '标题栏', '粗糙度', '螺纹', '外螺纹', '内螺纹', '螺纹标记', '螺纹五要素', '螺纹三要素', '螺纹画法', '螺距', '导程', '牙型', '大径', '小径', '中径', '互换性', '基孔制', '基轴制', '形位公差', '倒角', '退刀槽'],
  G13: ['标准件', '常用件', '螺栓', '螺柱', '螺钉', '螺母', '垫圈', '螺纹紧固件', '螺纹联接', '平键', '半圆键', '键', '销', '圆柱销', '圆锥销', '开口销', '滚动轴承', '深沟球轴承', '圆锥滚子轴承', '推力球轴承', '齿轮', '圆柱齿轮', '模数', '分度圆', '齿顶圆', '齿根圆', '花键', '弹簧'],
  G16: ['轴测图', '正等轴测', '正等测', '斜二等轴测', '斜二测', '轴测轴', '轴间角', '轴向伸缩系数', '坐标法', '切割法', '组合法', '轴测投影', '轴测剖视'],
};

const FOLLOW_UP_PHRASES = [
  '我还是不懂', '不懂', '没听懂', '解释一下', '举个例子', '举例', '带我做题', '考考我',
  '我没理解', '再用', '换个', '说明白'
];

let fileCache = null;
let pointRegistry = null;

function splitIds(raw) {
  return raw.split(/[\s,，、;/；]+/).map((s) => s.trim()).filter(Boolean);
}

function loadKnowledge() {
  if (fileCache) return fileCache;
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md')).sort();
  fileCache = files.map((fileName) => {
    const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, fileName), 'utf8');
    const titleMatch = content.match(TITLE_PATTERN);
    const idMatch = content.match(ID_PATTERN);
    const contentMatch = content.match(CONTENT_PATTERN);
    const ids = idMatch ? splitIds(idMatch[1]) : [];
    return {
      fileName,
      title: titleMatch ? titleMatch[1].trim() : fileName.replace(/\.md$/, ''),
      ids,
      content: contentMatch ? contentMatch[0].trim() : content.trim()
    };
  });
  pointRegistry = new Map();
  for (const file of fileCache) {
    for (const id of file.ids) {
      pointRegistry.set(id, { id, title: file.title, file: file.fileName, content: file.content });
    }
  }
  return fileCache;
}

function isFollowUp(text) {
  const t = text.trim().toLowerCase();
  return FOLLOW_UP_PHRASES.some((p) => t.includes(p));
}

function scoreByKeywords(text) {
  const lower = text.toLowerCase();
  let bestId = null;
  let bestScore = 0;
  for (const [id, words] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const w of words) {
      if (lower.includes(w.toLowerCase())) score += w.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return { bestId, bestScore };
}

function fallbackId(text) {
  const lower = text.toLowerCase();
  // 装配图是独立章节（课程第 8 章），「装配」不出现在其它章节标题中，故优先判定，
  // 避免「装配图」被 /零件图|零件/ 抢先归到零件图 G12。
  if (/装配图|装配|明细栏|零件序号|部件测绘/.test(text)) return 'G06';
  if (/轴测|正等测|斜二测/.test(text)) return 'G16';
  if (/螺纹紧固件|螺栓|螺柱|螺钉|螺母|垫圈|键|销|轴承|齿轮|模数|分度圆|弹簧|标准件|常用件/.test(text)) return 'G13';
  if (/零件图|零件|表面粗糙度|尺寸公差|公差|配合|粗糙度/.test(text)) return 'G12';
  if (/剖|断面|视图|图样画法|放大图/.test(text)) return 'G11';
  if (/组合体|叠加|挖切|切割|形体|构型|拉伸/.test(text)) return 'G10';
  if (/图框|图线|幅面|比例|字体|尺寸|斜度|锥度|圆弧连接/.test(text)) return 'G09';
  if (/相贯|两立体|贯穿|结合点/.test(text)) return 'G15';
  if (/投影变换|换面法|新投影面/.test(text)) return 'G14';
  if (/相对位置|相交|平行|垂直|交线|交点/.test(text)) return 'G08';
  if (/点/.test(text)) return 'G02';
  if (/直线|线/.test(lower)) return 'G03';
  if (/平面|面/.test(lower)) return 'G04';
  if (/立体|柱|锥|球|圆|棱|回转/.test(lower)) return 'G05';
  if (/截|切|断面/.test(lower)) return 'G07';
  if (/投影/.test(lower)) return 'G01';
  return null;
}

function matchKnowledgePoint(text, ctx = {}) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  if (isFollowUp(t)) return ctx.current || ctx.kp || null;
  const { bestId, bestScore } = scoreByKeywords(t);
  if (bestScore >= 1) return bestId;
  return fallbackId(t);
}

function getKnowledgeContent(knowledgePointId) {
  loadKnowledge();
  return pointRegistry.get(knowledgePointId) || null;
}

function listKnowledgePoints() {
  loadKnowledge();
  return Array.from(pointRegistry.entries()).map(([id, p]) => ({ id, title: p.title, knowledgePoint: id }));
}

module.exports = { matchKnowledgePoint, getKnowledgeContent, listKnowledgePoints };
