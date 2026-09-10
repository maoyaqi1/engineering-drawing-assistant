# AI 教师维护规则

## 组成

| 部分 | 位置 | 说明 |
|---|---|---|
| 前端界面 | `pages/ai/ai.js` / `.wxml` / `.wxss` | 对话 UI、建议问题、发送/新对话 |
| 云函数入口 | `cloudfunctions/api/index.js` | action：`ai.ask` / `ai.list` / `ai.detail` / `ai.feedback` |
| 对话与存储 | `cloudfunctions/api/ai/conversation.js` | `ai_conversations`、`ai_messages` 读写 |
| 知识点匹配 | `cloudfunctions/api/ai/knowledge.js` | 关键词打分、追问判断、路由到知识文件 |
| Prompt 组装 | `cloudfunctions/api/ai/prompt.js` | 拼装系统提示词、历史消息、图片消息 |
| LLM 调用 | `cloudfunctions/api/ai/llm.js` | 纯文本与视觉两条调用路径 |
| 配置 | `cloudfunctions/api/ai/config.js` | 全部从环境变量读取 |
| 知识库 | `cloudfunctions/api/knowledge/*.md` | 16 篇，按知识点分文件 |
| 提示词 | `cloudfunctions/api/prompts/*.md` | 教师系统提示词、图片讲解系统提示词 |

## 长期教学资产（高于普通代码）

`knowledge/` 与 `prompts/` 是教师课件与备课笔记长期蒸馏的成果，**属于教学资产，不是普通配置文件**。

维护规则：

1. 修改前必须说明原因与预期效果。
2. 不随意删除已有知识；如需替换，说明旧内容去向。
3. 保持原有教学逻辑与措辞风格（含"不代判对错、逻辑闭环、区分两门课、回复不超过一屏"等既有约束）。
4. 新增知识点应同步检查 `knowledge.js` 的匹配路由是否能命中。
5. 改完必须做 AI 回归（见 references/testing.md 第四节），并确认回答长度仍"不超过一屏"。

## 环境变量（只能通过云函数环境变量配置）

在云开发控制台 → 云函数 → `api` → 配置 → 环境变量中设置：

- `DEEPSEEK_API_KEY`：文本问答（必需）
- `DEEPSEEK_BASE_URL`：可选，默认 `https://api.deepseek.com`
- `DEEPSEEK_MODEL`：可选，默认 `deepseek-chat`
- `DASHSCOPE_API_KEY`：图片讲解（视觉能力，可选）
- `VISION_BASE_URL` / `VISION_MODEL`：可选，默认指向通义千问兼容模式
- `ADMIN_OPENIDS`：名单管理员 openid 白名单（逗号分隔）

**绝对禁止**：把上述任何 Key 的真实值写入代码、文档、注释或 Git。代码中只允许出现 `process.env.XXX`。

## 部署提醒（必须主动告知用户）

改动以下任一内容后，**必须提示用户重新部署云函数 `api`**，否则不生效：

- `cloudfunctions/api/index.js`
- `cloudfunctions/api/ai/*.js`
- `cloudfunctions/api/knowledge/*.md`
- `cloudfunctions/api/prompts/*.md`

仅在小程序端改动 `pages/ai/` 时，重新编译小程序即可，无需部署云函数。

## 权限与准入

- AI 提问受名单控制：`ai.ask` 中通过 `isInRoster(user.student_id)` 判断。
- 不在名单内：**仍可正常使用互动工具**，只是不能提问。这是既定产品规则，不得擅自更改。
- `ADMIN_OPENIDS` 控制谁能进入名单管理页。

## 数据

- `ai_conversations`：`openid` / `title` / `knowledge_point` / `created_at`
- `ai_messages`：`conversation_id` / `role` / `content` / `knowledge_point` / `model` / token 统计 / 反馈字段

教师端统计会读取 `ai_messages`（`role = 'user'`）计算提问量，**不要更改其字段结构**，否则教师端统计会失效。

## 图片能力现状

代码已接入视觉模型（`visionChatCompletion`），但小程序端 `pages/ai/ai.js` 中 `enableImage = false`，即**当前默认关闭图片输入**。启用前需：确认 `DASHSCOPE_API_KEY` 已配置、验证图片讲解质量、评估成本。