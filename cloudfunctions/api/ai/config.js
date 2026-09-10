// AI 教师云函数配置：DEEPSEEK_API_KEY 等从云函数环境变量读取，绝不落在前端。
module.exports = {
  ai: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 600,
    requestTimeoutMs: 60000,
    maxUserMessageLength: 2000
  },
  vision: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    baseUrl: (process.env.VISION_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    model: process.env.VISION_MODEL || 'qwen-vl-plus',
    temperature: 0.3,
    maxTokens: 900,
    requestTimeoutMs: 60000,
    maxUserMessageLength: 2000
  },
  context: {
    maxHistoryMessages: 12,
    maxKnowledgeChars: 4000,
    titleLength: 20
  }
};
