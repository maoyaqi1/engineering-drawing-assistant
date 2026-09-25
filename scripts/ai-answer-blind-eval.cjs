#!/usr/bin/env node
// AI 教师「回答质量」盲评工具：同一批问题，三种配置各出一版回答，打乱顺序供老师盲评。
//
// 目的（2026-09-25 决定）：验证"把讲稿片段注入生成是否真的更好"这个假设，而不是凭感觉定架构。
//   A = 只用本仓库 16 篇知识库 + 既定教学口径（不带检索片段）
//   B = 16 篇 + 服务检索到的讲稿片段正文（契约 §2.2 的 sources[].text）
//   C = 服务侧自己生成的回答（千问的提示词、它的口径）
//
// 用法：
//   $env:QWEN_TEACHER_TOKEN='...'; $env:DEEPSEEK_API_KEY='...'
//   node scripts/ai-answer-blind-eval.cjs [--questions <file.json>] [--limit N] [--out <dir>]
//
// 需要环境变量：DEEPSEEK_API_KEY（本仓库生成）、QWEN_TEACHER_BASE_URL + QWEN_TEACHER_TOKEN（服务检索与回答）
// 输出（默认写到系统临时目录，不污染仓库）：blind-eval-<时间戳>.html（盲评页）+ blind-eval-<时间戳>.json（原始数据与密钥）
//
// 边界：本脚本只读仓库模块、只调用外部服务；不是自动化测试，也不判断回答对不对——对错由老师评定。

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AI_DIR = path.join(ROOT, 'cloudfunctions', 'api', 'ai');

const { matchKnowledgePoint } = require(path.join(AI_DIR, 'knowledge.js'));
const { buildPrompt } = require(path.join(AI_DIR, 'prompt.js'));
const { chatCompletion } = require(path.join(AI_DIR, 'llm.js'));
const { askTeacherService } = require(path.join(AI_DIR, 'teacher-service.js'));

// 默认问题集：覆盖概念 / 习题 / 作图 / 口语化四类，其中包含"题目未录制"的情形
const DEFAULT_QUESTIONS = [
  '点的三面投影规律是什么？',
  '直线按与投影面的相对位置可以分为哪几类？',
  '什么是重影点？怎么判别可见性？',
  '直角三角形法求实长是怎么做的？',
  '一般位置直线与一般位置平面相交，交点怎么求？',
  '怎么判断直线与平面平行？',
  '圆柱表面取点怎么取？',
  '平面切割圆锥，截交线可能是什么形状？',
  '两立体相贯的可见性怎么判断？',
  '最大斜度线有什么用？',
  '换面法的原理是什么？为什么要换面？',
  '帮我把这个图的两面投影补一下',
  '剖视图分哪几种？',
  '今天天气怎么样'
];

function parseArgs(argv) {
  const out = { questions: null, limit: null, dir: path.join(os.tmpdir(), 'hfjh-blind-eval') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--questions') out.questions = argv[i + 1];
    else if (argv[i] === '--limit') out.limit = Number(argv[i + 1]);
    else if (argv[i] === '--out') out.dir = argv[i + 1];
  }
  return out;
}

function shuffleWithSeed(list, seed) {
  const arr = list.slice();
  let s = seed;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function looksCopyQuestion(answer, question) {
  const a = String(answer || '').replace(/\s+/g, '');
  const q = String(question || '').replace(/\s+/g, '');
  if (!a || q.length < 6) return false;
  const head = a.slice(0, 24);
  return head.indexOf(q.slice(0, 8)) >= 0;
}

function metrics(answer, question) {
  const text = String(answer || '');
  return {
    chars: text.length,
    overLimit: text.length > 150,
    hasLatex: /\$|\\frac|\\triangle|\\angle|\\overline/.test(text),
    copiesQuestion: looksCopyQuestion(text, question)
  };
}

async function generateLocal(question, segments) {
  const kp = matchKnowledgePoint(question, {}) || null;
  const result = await chatCompletion({
    messages: buildPrompt({ message: question, history: [], currentKnowledgePoint: kp, segments })
  });
  return result.content;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('缺少 DEEPSEEK_API_KEY（本仓库生成用）');
    process.exit(2);
  }
  if (!process.env.QWEN_TEACHER_BASE_URL || !process.env.QWEN_TEACHER_TOKEN) {
    console.error('缺少 QWEN_TEACHER_BASE_URL / QWEN_TEACHER_TOKEN（服务检索与回答用）');
    process.exit(2);
  }

  let questions = DEFAULT_QUESTIONS;
  if (args.questions) {
    const raw = JSON.parse(fs.readFileSync(args.questions, 'utf8'));
    questions = Array.isArray(raw) ? raw.map((q) => (typeof q === 'string' ? q : q.question)) : DEFAULT_QUESTIONS;
  }
  if (args.limit) questions = questions.slice(0, args.limit);

  const items = [];
  for (let i = 0; i < questions.length; i += 1) {
    const question = questions[i];
    process.stdout.write('[' + (i + 1) + '/' + questions.length + '] ' + question + ' ... ');

    const fromService = await askTeacherService({
      question,
      conversationId: null,
      knowledgePoint: matchKnowledgePoint(question, {}) || null,
      history: []
    });
    const segments = fromService ? fromService.sources.filter((s) => s && s.text) : [];

    const answers = {};
    try {
      answers.A = await generateLocal(question, null);
    } catch (e) {
      answers.A = '（生成失败：' + (e.message || e) + '）';
    }
    try {
      answers.B = segments.length ? await generateLocal(question, segments) : '（服务未回传片段正文，B 与 A 相同）';
    } catch (e) {
      answers.B = '（生成失败：' + (e.message || e) + '）';
    }
    answers.C = fromService && fromService.content ? fromService.content : '（服务未返回回答）';

    const order = shuffleWithSeed(['A', 'B', 'C'], 7919 * (i + 1));
    items.push({
      question,
      knowledgePoint: matchKnowledgePoint(question, {}) || null,
      segmentCount: segments.length,
      videoIds: fromService ? fromService.videoRefs.map((v) => v.video_id) : [],
      order,
      answers,
      metrics: {
        A: metrics(answers.A, question),
        B: metrics(answers.B, question),
        C: metrics(answers.C, question)
      }
    });
    console.log('完成（片段 ' + segments.length + ' 段）');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.mkdirSync(args.dir, { recursive: true });
  const dataFile = path.join(args.dir, 'blind-eval-' + stamp + '.json');
  const htmlFile = path.join(args.dir, 'blind-eval-' + stamp + '.html');
  fs.writeFileSync(dataFile, JSON.stringify({ generatedAt: stamp, items }, null, 2), 'utf8');

  const payload = JSON.stringify(items).replace(/</g, '\\u003c');
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AI 教师回答盲评</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;margin:0;padding:24px;background:#f5f7fa;color:#1d2b3a}
h1{font-size:20px;margin:0 0 8px}.hint{font-size:13px;color:#5a6b81;margin-bottom:20px}
.q{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.qt{font-size:15px;font-weight:600;margin-bottom:10px}
.card{border:1px solid #e3e9f2;border-radius:8px;padding:10px 12px;margin-bottom:8px}
.label{display:inline-block;font-size:12px;color:#1677ff;background:#eef5ff;border-radius:4px;padding:1px 6px;margin-right:6px}
.ans{font-size:14px;line-height:1.75;white-space:pre-wrap;margin-top:6px}
.m{font-size:12px;color:#8a97a8;margin-top:6px}
.pick{font-size:13px;color:#3b4a5e;margin-top:6px}
button{font-size:15px;padding:8px 18px;border:none;border-radius:8px;background:#1677ff;color:#fff;cursor:pointer}
#result{background:#fff;border-radius:10px;padding:16px 18px;margin-top:16px;display:none;font-size:14px;line-height:1.9}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #e3e9f2;padding:4px 10px;text-align:center}
</style></head><body>
<h1>AI 教师回答盲评</h1>
<div class="hint">每题三版回答，顺序已打乱。请勾选"最好"的那一版（可以不选）。全部评完后点底部按钮查看统计与对应关系。</div>
<div id="root"></div>
<div style="margin:20px 0"><button onclick="showResult()">查看统计</button></div>
<div id="result"></div>
<script>
const items=${payload};
const root=document.getElementById('root');
items.forEach((it,qi)=>{
  const wrap=document.createElement('div');wrap.className='q';
  const qt=document.createElement('div');qt.className='qt';qt.textContent=(qi+1)+'. '+it.question;wrap.appendChild(qt);
  it.order.forEach((key,idx)=>{
    const card=document.createElement('div');card.className='card';
    const lab=document.createElement('span');lab.className='label';lab.textContent='①②③'[idx];
    card.appendChild(lab);
    const a=document.createElement('div');a.className='ans';a.textContent=it.answers[key];card.appendChild(a);
    const m=document.createElement('div');m.className='m';
    m.textContent='长度 '+it.metrics[key].chars+' 字'+(it.metrics[key].hasLatex?' · 含 LaTeX':'')+(it.metrics[key].copiesQuestion?' · 疑似复述题目':'');
    card.appendChild(m);
    const p=document.createElement('label');p.className='pick';
    p.innerHTML='<input type="radio" name="q'+qi+'" value="'+key+'"> 这版最好';
    card.appendChild(p);
    wrap.appendChild(card);
  });
  root.appendChild(wrap);
});
function showResult(){
  const tally={A:0,B:0,C:0};const detail=[];
  items.forEach((it,qi)=>{
    const sel=document.querySelector('input[name="q'+qi+'"]:checked');
    const key=sel?sel.value:null;
    if(key)tally[key]+=1;
    detail.push((qi+1)+'. 选：'+(key?(key+'（'+it.order.map((k,i)=>'①②③'[i]+'='+k).join('，')+'）'):'未选'));
  });
  const names={A:'A 只用16篇知识库',B:'B 16篇+讲稿片段',C:'C 服务侧生成'};
  let html='<b>统计</b><table><tr><th>配置</th><th>被选为最好</th></tr>';
  ['A','B','C'].forEach(k=>{html+='<tr><td>'+names[k]+'</td><td>'+tally[k]+'</td></tr>';});
  html+='</table><div style="margin-top:10px">每题答案顺序：<br>'+detail.join('<br>')+'</div>';
  const box=document.getElementById('result');box.innerHTML=html;box.style.display='block';
}
</script></body></html>`;
  fs.writeFileSync(htmlFile, html, 'utf8');

  console.log('\n完成。');
  console.log('盲评页：' + htmlFile);
  console.log('原始数据：' + dataFile);
  console.log('提示：先自己评完再点"查看统计"，避免先看到 A/B/C 对应关系。');
}

run().catch((err) => {
  console.error('执行失败：', err && err.message ? err.message : err);
  process.exit(1);
});
