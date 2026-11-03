// AI 文本/视觉模型的 OpenAI-compatible Chat Completions 适配层。
//
// 本模块负责三件事：
//   1. 从 ai/config.js 读取 DeepSeek（文本）或 DashScope（视觉）配置；
//   2. 发送非流式请求，并把模型返回的 Markdown/LaTeX 清洗成小程序可展示的纯文本；
//   3. 把网络、超时、上游状态码和空回答收敛成稳定的业务错误码。
//
// 不在此处重试或降级。调用方（teaching-events / conversation）决定是否切换服务、
// 释放图片配额或向学生返回可重试提示；API Key 只来自环境变量，不进入日志或响应。
const https = require('https');
const CONFIG = require('./config.js');

// 业务错误保留稳定 code/status；原始上游响应正文不会透传给客户端。
function makeError(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function cleanTeacherText(t) {
  if (!t) return t;
  // 兼容字符串和分段数组两种上游 content 形态。下面按顺序去掉 Markdown/LaTeX
  // 标记并替换常用数学符号；这是显示清洗，不执行公式，也不替代 HTML 转义。
  let s = Array.isArray(t) ? t.map((p) => (p && p.text) || '').join('') : String(t);
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m, c) => c.trim());
  s = s.replace(/\$([^$]+?)\$/g, (m, c) => c.trim());
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
  s = s.replace(/\\overline\{([^}]+)\}/g, '$1');
  s = s.replace(/\\triangle\b/g, '三角形');
  s = s.replace(/\\perp\b/g, '⊥').replace(/\\parallel\b/g, '∥').replace(/\\times\b/g, '×');
  s = s.replace(/\\cdot\b/g, '·').replace(/\\because\b/g, '因为').replace(/\\therefore\b/g, '所以');
  s = s.replace(/\\mid\b/g, '|').replace(/\\sim\b/g, '~').replace(/\\angle\b/g, '∠').replace(/\\degree\b/g, '°');
  s = s.replace(/\\[a-zA-Z]+\b/g, '');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/^#{1,6}\s*/gm, '');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  return s;
}

/**
 * 调用 OpenAI-compatible /chat/completions 端点。
 * @param {object} cfg ai 或 vision 配置，包含 apiKey/baseUrl/model/timeout
 * @param {object} options messages、可选 maxTokens 与 temperature
 * @returns {Promise<{content:string,model:string,usage:object}>}
 * @throws 业务错误 NO_API_KEY / TIMEOUT / NETWORK / UPSTREAM_ERROR / BAD_RESPONSE / EMPTY_RESPONSE
 */
function requestCompletion(cfg, { messages, maxTokens, temperature }) {
  return new Promise((resolve, reject) => {
    if (!cfg.apiKey) {
      return reject(makeError('NO_API_KEY', 503, 'AI教师服务尚未配置 API Key，无法回答。'));
    }
    // 两个服务都使用 OpenAI-compatible 的 /chat/completions 协议；stream=false
    // 保证云函数只处理一次性 JSON 响应，调用方不需要管理流式连接生命周期。
    const url = `${cfg.baseUrl}/chat/completions`;
    const parsed = new URL(url);
    const body = JSON.stringify({
      model: cfg.model,
      messages,
      temperature: temperature != null ? temperature : cfg.temperature,
      max_tokens: maxTokens || cfg.maxTokens,
      stream: false
    });
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: cfg.requestTimeoutMs
      },
      (res) => {
        // 上游错误正文可能含内部信息，只记录状态而不透传 raw；解析失败与空内容
        // 分别返回 BAD_RESPONSE / EMPTY_RESPONSE，便于调用方给出可读的降级提示。
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(makeError('UPSTREAM_ERROR', 502, 'AI教师暂时无法回答，请稍后重试。'));
          }
          let data;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            return reject(makeError('BAD_RESPONSE', 502, 'AI 返回内容无法解析，请稍后重试。'));
          }
          let content = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content : '';
          if (Array.isArray(content)) content = content.map((p) => (p && p.text) || '').join('');
          content = cleanTeacherText(content);
          if (!content) return reject(makeError('EMPTY_RESPONSE', 502, 'AI 本次没有生成可用回答，请稍后重试。'));
          const usage = data.usage || {};
          resolve({
            content,
            model: cfg.model,
            usage: {
              promptTokens: usage.prompt_tokens != null ? usage.prompt_tokens : null,
              completionTokens: usage.completion_tokens != null ? usage.completion_tokens : null,
              totalTokens: usage.total_tokens != null ? usage.total_tokens : null
            }
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(makeError('TIMEOUT', 504, '请求时间较长，请检查网络后重试。'));
    });
    req.on('error', (err) => {
      reject(err.code === 'TIMEOUT' ? err : makeError('NETWORK', 502, '暂时无法连接 AI 教师，请稍后重试。'));
    });
    req.write(body);
    req.end();
  });
}

function chatCompletion(options) {
  // 文本链路的配置和视觉链路彼此独立；覆盖其一的环境变量不会影响另一条。
  return requestCompletion(CONFIG.ai, options);
}

function visionChatCompletion(options) {
  // 图片本身由调用方组装为 OpenAI 兼容的 content 段；本函数只负责请求和响应清洗。
  return requestCompletion(CONFIG.vision, options);
}

module.exports = { chatCompletion, visionChatCompletion };
