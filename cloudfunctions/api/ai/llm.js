const https = require('https');
const CONFIG = require('./config.js');

function makeError(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function cleanTeacherText(t) {
  if (!t) return t;
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

function requestCompletion(cfg, { messages, maxTokens, temperature }) {
  return new Promise((resolve, reject) => {
    if (!cfg.apiKey) {
      return reject(makeError('NO_API_KEY', 503, 'AI教师服务尚未配置 API Key，无法回答。'));
    }
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
  return requestCompletion(CONFIG.ai, options);
}

function visionChatCompletion(options) {
  return requestCompletion(CONFIG.vision, options);
}

module.exports = { chatCompletion, visionChatCompletion };
