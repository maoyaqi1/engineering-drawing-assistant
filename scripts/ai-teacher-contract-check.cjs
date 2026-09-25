#!/usr/bin/env node
// AI 教师服务「接口契约」验收检查（开发者本机运行，只读，零第三方依赖）。
//
// 运行：
//   $env:QWEN_TEACHER_TOKEN='...'; node scripts/ai-teacher-contract-check.cjs
//   node scripts/ai-teacher-contract-check.cjs            # 未设置 token 时只跑负向检查
//
// 对应《AI教师对接契约》v0.2 §2（字段）、§3（video_refs）、§5（降级）、§9（用例）、§11.2（验收标准）。
//
// 为什么单独放一个脚本、不并入 run-all.js：
//   其余检查脚本都是纯本地只读的；本脚本需要一个**外部** AI 教师服务在线（默认 127.0.0.1:8787）。
//   放进 run-all 会让没有起服务的人误判为失败，因此保持独立运行。
//
// 边界：
//   1. 只发请求、只读响应；不写任何文件、不改任何仓库文件；
//   2. 正向用例会触发对端一次真实生成请求（有费用），仅在设置了 token 时执行；
//   3. 不替代真机回归，也不替代人工判断回答质量（AGENTS.md C11）。

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { createSuite } = require('./lib/harness.js');

const BASE = process.env.QWEN_TEACHER_BASE_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.QWEN_TEACHER_TOKEN || '';
const PATH = '/v1/ai-teacher/ask';
const ANSWER_MAX_CHARS = 150;
const LATEX_PATTERN = /\$|\\frac|\\triangle|\\angle|\\overline|\\perp/;
const RESPONSE_FIELDS = ['answer', 'matched', 'video_refs', 'sources', 'model', 'usage'];
const VIDEO_REF_FIELDS = ['video_id', 'video_title', 'kp_title', 'start', 'end', 'time_label', 'score'];

// 契约 §9 三条用例 + 补充的「命中但无视频」用例
const CASES = [
  {
    id: 'case1 命中且有视频',
    body: { question: '两交叉直线的公垂线怎么画', knowledge_point: 'G08', history: [], top_k: 3, threshold: 0.35, client_request_id: 'case1' },
    expectMatched: true,
    expectVideo: true
  },
  {
    id: 'case2 命中（正投影性质）',
    body: { question: '正投影的四个基本性质是什么', knowledge_point: 'G01', history: [], top_k: 3, threshold: 0.35, client_request_id: 'case2' },
    expectMatched: true,
    expectVideo: null
  },
  {
    id: 'case3 课程外未命中',
    body: { question: '今天天气怎么样', knowledge_point: null, history: [], top_k: 3, threshold: 0.35, client_request_id: 'case3' },
    expectMatched: false,
    expectVideo: false
  },
  {
    // 题干取自千问 stage1 实测用例（其 case4_raw.json：matched=true、video_refs=[]，
    // 因为剖视图属 jx_ 前缀，视频尚未上传云存储，被可播放过滤排除）
    id: 'case4 命中但无视频（机械制图，视频未上传）',
    body: { question: '剖视图分哪几种？', knowledge_point: null, history: [], top_k: 3, threshold: 0.35, client_request_id: 'case4' },
    expectMatched: true,
    expectVideo: false
  }
];

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const client = url.protocol === 'https:' ? https : http;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = client.request(
      { method, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (e) {
            json = null;
          }
          resolve({ status: res.statusCode, text, json });
        });
      }
    );
    req.on('error', (err) => resolve({ status: 0, text: String(err.message || err), json: null }));
    if (payload) req.write(payload);
    req.end();
  });
}

const suite = createSuite('AI 教师服务契约检查', { quiet: process.argv.includes('--quiet') });

(async () => {
  // A 服务可达性
  suite.section('A 服务可达与鉴权（负向，不需要 token）');
  const health = await request('GET', '/healthz');
  suite.check(health.status === 200, 'GET /healthz 返回 200', '实际 HTTP ' + health.status);
  if (health.json && typeof health.json.records === 'number') {
    suite.check(health.json.records >= 2725, '知识库记录数 ≥ 2725（实际 ' + health.json.records + '）');
  }
  const noToken = await request('POST', PATH, { question: 'x' });
  suite.equal(noToken.status, 401, '无 token 请求被拒绝（401）');
  const badToken = await request('POST', PATH, { question: 'x' }, 'wrong-token');
  suite.equal(badToken.status, 401, '错误 token 请求被拒绝（401）');
  const badPath = await request('POST', '/v1/nope', { question: 'x' }, TOKEN);
  suite.equal(badPath.status, 404, '未知路由返回 404');

  if (!TOKEN) {
    suite.note('未设置 QWEN_TEACHER_TOKEN，跳过 §9 正向用例（只跑了 A 段负向检查）');
    process.exitCode = suite.finish();
    return;
  }

  // B 契约 §9 用例
  suite.section('B 契约 §9 用例（正向）');
  for (const item of CASES) {
    const res = await request('POST', PATH, item.body, TOKEN);
    if (!suite.equal(res.status, 200, item.id + ' · HTTP 200')) continue;
    const r = res.json || {};
    suite.check(
      RESPONSE_FIELDS.every((f) => Object.prototype.hasOwnProperty.call(r, f)),
      item.id + ' · 含契约 §2 全部字段',
      '实际字段：' + Object.keys(r).join(',')
    );
    suite.check(
      Object.keys(r).filter((k) => !RESPONSE_FIELDS.includes(k)).length === 0,
      item.id + ' · 无契约外多余字段'
    );
    suite.equal(!!r.matched, item.expectMatched, item.id + ' · matched=' + item.expectMatched);
    if (r.matched) {
      suite.check(typeof r.answer === 'string' && r.answer.length > 0, item.id + ' · matched=true 时 answer 非空');
      suite.check((r.answer || '').length <= ANSWER_MAX_CHARS, item.id + ' · answer ≤ ' + ANSWER_MAX_CHARS + ' 字（实际 ' + (r.answer || '').length + '）');
      suite.check(!LATEX_PATTERN.test(r.answer || ''), item.id + ' · answer 无 LaTeX');
    }
    if (item.expectVideo === true) {
      suite.check(Array.isArray(r.video_refs) && r.video_refs.length > 0, item.id + ' · 返回 video_refs');
      if (Array.isArray(r.video_refs) && r.video_refs.length) {
        const ref = r.video_refs[0];
        suite.check(
          VIDEO_REF_FIELDS.every((f) => Object.prototype.hasOwnProperty.call(ref, f)),
          item.id + ' · video_refs 字段符合契约 §3',
          '实际字段：' + Object.keys(ref).join(',')
        );
        suite.check(typeof ref.start === 'number' && ref.start >= 0, item.id + ' · start 为整数秒');
      }
    }
    if (item.expectVideo === false) {
      suite.check(Array.isArray(r.video_refs) && r.video_refs.length === 0, item.id + ' · video_refs 为空数组');
    }
  }

  process.exitCode = suite.finish();
})();
