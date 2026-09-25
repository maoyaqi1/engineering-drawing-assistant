const fs = require('fs');
const path = require('path');
const CONFIG = require('./config.js');
const { getKnowledgeContent } = require('./knowledge.js');

const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'teacher_system_prompt.md');
const IMAGE_SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'teacher_image_system_prompt.md');
let systemPromptCache = null;
let imageSystemPromptCache = null;

function getSystemPrompt() {
  if (systemPromptCache) return systemPromptCache;
  systemPromptCache = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
  return systemPromptCache;
}

function getImageSystemPrompt() {
  if (imageSystemPromptCache) return imageSystemPromptCache;
  imageSystemPromptCache = fs.readFileSync(IMAGE_SYSTEM_PROMPT_PATH, 'utf8').trim();
  return imageSystemPromptCache;
}

const IMAGE_CORE_RULES = [
  '【画法几何核心要点（做题务必依据这些规范，不要自创）】',
  '- 三投影面：V面（正面）、H面（水平）、W面（侧面）。三面投影规律：长对正（a′a 垂直 OX 轴）、高平齐（a′a″ 垂直 OZ 轴）、宽相等（用 45° 分角线转宽）。',
  '- 点的投影：A(x,y,z)。正面 a′(x,z)、水平 a(x,y)、侧面 a″(y,z)。已知两面可由三规律唯一求第三面。',
  '- 两点相对位置：x 大在左、y 大在前、z 大在上。重影点：某投影重合时看第三个坐标判断可见（坐标值大者可见）。',
  '- 直线：一般位置、投影面平行线、投影面垂直线。一般位置线段实长用直角三角形法（以某投影长为一边、坐标差为另一边）。',
  '- 平面：一般位置平面、投影面垂直面（某投影积聚为直线）、投影面平行面（某投影反映实形）。',
  '- 求点/交线/截交线/相贯线：先找特殊点→再补中间点→依次连接→判断可见性。求交点先看积聚性，无积聚性用辅助平面法（含直线作辅助平面→求交线→求交点）。',
  '- 可见性：位于观察者一侧、朝向投影面的表面可见；背对观察者的部分不可见。'
].join('\n');

const METHOD_RULES = [
  '【画法几何解题方法（做题务必调用，严格按步骤，不要跳步）】',
  'M01 点的两面投影：aa′ 垂直 OX 轴。M02 由坐标作三面投影：按三规律定 a、a′、a″。',
  'M03 由两面求第三面：作 45° 辅助线传宽 Y。M04 重影点：不相等的坐标值大者可见，不可见加()。',
  'M05 直角三角形法求实长与倾角：实长/坐标差/投影长/倾角四要素，须同对同一投影面。',
  'M06 换面法求实长：新投影面垂直原体系某一投影面、X1 轴平行于不变投影。',
  'M07 直线上取点：从属性+定比性（AC:CB = ac:cb = a′c′:c′b′ = a″c″:c″b″）。',
  'M08 两直线平行：一般位置两面投影平行即可。M09 两直线相交：同面投影相交且交点符合点的投影规律。',
  'M10 面内取点：作辅助线或利用积聚性。M11 面内取线：过面内两点/过一点且平行面内一线（无数解）。',
  'M12 求平面对投影面倾角：作最大斜度线（垂直面内平行线）→直角三角形法。',
  'M13 线面平行：面外线平行面内线；特殊位置看积聚性。M14 面面平行：两对相交直线对应平行。',
  'M15 特殊位置线面求交点：用积聚性直接定。M16 一般位置线面求交点：辅助平面三步骤（含直线作平面→求交线→交点）。',
  'M17/M18 求交线：求两共有点连线。M19 三面共点法。',
  'M20 线面垂直：水平投影垂直面内水平线的水平投影、正面投影垂直面内正平线的正面投影。',
  'M21–M24 距离：过点作垂面/垂线→求垂足→求实长；M25 两线夹角：构三角形求三边实长；M26 线面角：余角法；M27 面面角：补角法。',
  'M28 平面立体截交线：求截平面与棱线交点（多截面求截面间交点）→连接→判可见性→整理轮廓线。',
  'M29 曲面体截交线：空间及投影分析→（非圆曲线）先特殊点补中间点→光滑连接→判可见性→整理轮廓线。',
  'M30 求贯穿点：过直线作辅助平面→求与立体表面交线→交点（成双）。',
  'M31–M33 相贯线：分析→特殊点→补中间点→光滑连接→判可见性→整理轮廓线。M34 正交圆柱相贯线：向大圆柱内弯曲，相贯处大圆柱转向线不存在。',
  'M37 相贯线特殊情况：共锥顶/平行柱→直线；回转体与球（球心在轴上）→圆。M38 相贯线可见性：只有两形体都可见侧面的交线才可见。',
  '',
  '【边界与防幻觉（铁律）】',
  '- 老师在课件里没写清楚、只有图示的（如换面法综合题、齿轮/螺纹画法细节、公差数值等）→ 能讲的原理讲对，再引导学生想，并诚实说明“老师课件是图示，请对照教材/课件上的图，以老师讲的为准”，**绝不编造**标准号、数值、比例系数、画法步骤。',
  '- 涉及查表（标准件尺寸、公差数值、模数系列、轴承尺寸、螺栓长度等）→ 只教“怎么算、查哪页”，**不给表中数值**。',
  '- 批改时对不确定/缺口内容**不判“画错”**，只说“这里看不清/不确定，建议核对教材图例”。',
  '- 引用老师的规定句、标准号、具体数值时，**一个数字都不要改写**。'
].join('\n');

function buildSystemContent(currentKnowledgePoint) {
  const base = getSystemPrompt();
  if (!currentKnowledgePoint) return base;
  const kp = getKnowledgeContent(currentKnowledgePoint);
  const label = kp ? `${currentKnowledgePoint} ${kp.title}` : currentKnowledgePoint;
  return `${base}\n\n【当前教学知识点】本节课正在学习：${label}。请围绕这个知识点进行辅导。`;
}

function buildKnowledgeBlock(currentKnowledgePoint) {
  if (!currentKnowledgePoint) return null;
  const kp = getKnowledgeContent(currentKnowledgePoint);
  if (!kp) return null;
  let content = kp.content;
  const maxChars = CONFIG.context.maxKnowledgeChars;
  if (content.length > maxChars) {
    content = `${content.slice(0, maxChars)}\n…（后续内容已省略以控制篇幅）`;
  }
  // 小程序端不渲染 /figures/ 本地配图，故不注入配图引用
  return `【课程知识库资料】${kp.title}（${currentKnowledgePoint}）：\n\n${content}`;
}

// 【课程检索片段】：由千问侧服务检索回传的讲稿/PPT 片段正文（契约 §2.2 的 sources[].text）。
// 生成仍在本仓库完成，用于把"大语料检索"与"教学口径"结合起来（决定：方案 C）。
// 片段只作讲解依据，不允许原样复述。
function buildSegmentBlock(segments) {
  if (!Array.isArray(segments) || !segments.length) return null;
  const lines = segments.slice(0, 4).map((seg, i) => {
    const tag = seg.video_id ? '视频' : 'PPT';
    const head = `${i + 1}. [${tag}] ${seg.doc || ''}${seg.time_label ? '（' + seg.time_label + '）' : ''}`;
    return `${head}\n${seg.text}`;
  });
  return '【课程检索片段（按相关度排序，讲解时取用其中与问题相关的部分；不得整段照抄、不得复述题目）】\n\n'
    + lines.join('\n\n');
}

function buildPrompt({ message, history = [], currentKnowledgePoint, segments = null }) {
  const messages = [{ role: 'system', content: buildSystemContent(currentKnowledgePoint) }];
  messages.push({ role: 'system', content: METHOD_RULES });
  const knowledgeBlock = buildKnowledgeBlock(currentKnowledgePoint);
  if (knowledgeBlock) messages.push({ role: 'system', content: knowledgeBlock });
  const segmentBlock = buildSegmentBlock(segments);
  if (segmentBlock) messages.push({ role: 'system', content: segmentBlock });
  const recent = history.slice(-CONFIG.context.maxHistoryMessages);
  for (const m of recent) {
    if (m && (m.role === 'user' || m.role === 'assistant')) {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: 'user', content: message });
  return messages;
}

function buildImageMessages({ message, imageDataUrl, currentKnowledgePoint, segments = null }) {
  const systemMessages = [{ role: 'system', content: getImageSystemPrompt() }];
  systemMessages.push({ role: 'system', content: IMAGE_CORE_RULES });
  systemMessages.push({ role: 'system', content: METHOD_RULES });
  const knowledgeBlock = buildKnowledgeBlock(currentKnowledgePoint);
  if (knowledgeBlock) systemMessages.push({ role: 'system', content: knowledgeBlock });
  const segmentBlock = buildSegmentBlock(segments);
  if (segmentBlock) systemMessages.push({ role: 'system', content: segmentBlock });
  const userContent = [];
  if (imageDataUrl) userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  userContent.push({ type: 'text', text: '请先复述图中已知与所求（必要时先请学生确认），再严格按上面的画法几何要点与步骤讲解作图过程；每一步说明依据；看不清楚、不确定的地方明确说明，不要臆造。' });
  if (message && message.trim()) userContent.push({ type: 'text', text: message.trim() });
  systemMessages.push({ role: 'user', content: userContent });
  return systemMessages;
}

function generateTitle(firstUserMessage) {
  const text = (firstUserMessage || '').trim().replace(/\s+/g, ' ');
  if (!text) return '新对话';
  const max = CONFIG.context.titleLength;
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  const truncated = clean.length > max ? `${clean.slice(0, max)}…` : clean;
  return truncated || '新对话';
}

module.exports = { getSystemPrompt, getImageSystemPrompt, buildPrompt, buildImageMessages, generateTitle };
