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
  // 千问侧「检索 + 生成」服务（腾讯云 SCF 函数 URL）。未配置时 askTeacherService 返回 null，
  // 自动回落到下方 ai/vision 的既有链路（契约 §5 降级）。
  // threshold=0.55 由 103 条评测集的阈值扫描确定（docs/AI教师对接契约.md §12.2 第 3/5 条）。
  teacherService: {
    baseUrl: (process.env.QWEN_TEACHER_BASE_URL || '').replace(/\/+$/, ''),
    token: process.env.QWEN_TEACHER_TOKEN || '',
    topK: 3,
    // 相关性阈值：由服务侧取 max(本值, 服务内闸门) 生效。
    // 调高 → 宁缺勿错（少推视频）；调低 → 推得多但容易推错。可用环境变量 QWEN_TEACHER_THRESHOLD 调整，无需改代码。
    threshold: Number(process.env.QWEN_TEACHER_THRESHOLD || 0.55),
    requestTimeoutMs: 8000,
    // 带图提问时服务侧要多做一次读题（视觉模型），给更长的超时；
    // 注意：云函数 api 自身的超时必须大于这个值（建议 60s）
    requestTimeoutMsImage: 20000
  },
  // 拍照提问总开关（服务端可关停）：AI_IMAGE=off 时忽略图片，
  // 有文字就按文字回答，纯图片则提示改用文字——用于视觉调用成本失控时的紧急止损。
  image: {
    enabled: (process.env.AI_IMAGE || '').toLowerCase() !== 'off'
  },
  // 视频讲解播放总开关（服务端控制，改环境变量即刻生效，无需重新提审小程序）：
  //   VIDEO_PLAYBACK=off → 不下发 file_id，前端回到"只显示标题与时间点"的降级呈现。
  // 说明：个人主体「教育服务-教育信息展示」类目在官方类目表中标注"不支持教育视频播放"，
  // 是否携带播放入口需以审核结论为准；一旦被拒，把 VIDEO_PLAYBACK 置 off 即可立刻回滚。
  // VIDEO_CLOUD_BASE 为云存储文件 ID 前缀，如与实际情况不符可在控制台改环境变量，无需改代码。
  video: {
    playback: (process.env.VIDEO_PLAYBACK || '').toLowerCase() !== 'off',
    cloudBase: (process.env.VIDEO_CLOUD_BASE
      || 'cloud://cloud1-d4gwsysje82cf604a.636c-cloud1-d4gwsysje82cf604a-1476352837').replace(/\/+$/, ''),
    pathPrefix: 'videos'
  },
  context: {
    maxHistoryMessages: 12,
    maxKnowledgeChars: 4000,
    titleLength: 20
  }
};
