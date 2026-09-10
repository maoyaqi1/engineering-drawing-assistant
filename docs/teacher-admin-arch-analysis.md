# 教师端管理后台 —— 现有项目架构分析报告（Phase 1）

> 状态：仅分析，未修改任何代码。
> 用途：作为教师端 Web 增量开发的基线，避免创建第二套用户体系/重复数据。
> 结论先行：**现有系统没有一个可复用的"教师身份 + 班级 + 学生档案"体系**，需要在**尽量不动学生端**的前提下新增教师端数据层与云函数，学生端仅做"身份绑定 + 学习记录上报"的最小增量。

---

## 1. 项目总体结构

原生微信小程序 + 微信云开发，单云函数 `cloudfunctions/api`（唯一云函数，承担全部业务 action），无独立服务器。

```
HFJH/
├── app.js                     # 云初始化 + user 缓存
├── app.json                   # 页面注册（8 个页面）
├── utils/api.js               # 小程序端云函数调用封装（action 白名单）
├── utils/geo.js               # 纯几何求交工具（尺规模块用）
├── pages/
│   ├── login / register       # 微信登录 + 实名注册（学校/姓名/学号）
│   ├── index                  # 核心教学画布（点/线/面/基本立体/平面切割立体）
│   ├── ai                     # AI 教师对话
│   ├── roster                 # 学生名单管理（管理员）
│   ├── survey                 # 学习效果问卷
│   ├── terms                  # 用户协议 / 隐私政策
│   └── ruler                  # 尺规作图（pad 优先）
├── cloudfunctions/api/
│   ├── index.js               # 唯一云函数入口，路由全部 action
│   ├── ai/conversation.js     # AI 会话/消息（ai_conversations / ai_messages）
│   ├── ai/knowledge.js        # 知识点匹配
│   ├── ai/llm.js / prompt.js  # LLM 调用与提示词
│   └── knowledge/*.md         # AI 教师知识库
└── web/  web-release/         # 网页版（独立静态，与小程序云函数无数据耦合）
```

---

## 2. 当前用户体系

### 身份锚点
**微信 openid** 是唯一确定身份的依据。第一次调用任意云函数时通过 `cloud.getWXContext()` 获取 `OPENID`，自动在 `users` 集合创建/更新一条用户记录（`ensureUser`）。

### `users` 集合字段（自动创建）
```text
_id
openid              # 唯一身份锚点
unionid             # 预留
nickname            # 预留（空）
avatar              # 预留（空）
role: 'student'     # 固定为 student，尚无 teacher
status: 'active'
valid_session_count  # 有效学习次数（问卷触发用）
created_at / last_login_at
```

### 注册时追加字段（`register` action）
```text
school               # 学校（自由文本）
name                 # 姓名
student_id           # 学号（normalizeStudentId 去空格；学号唯一，防不同微信号冒用）
profile_completed: true
updated_at
```

### 关键点
- **没有教师身份**：`role` 只有 `student`，没有任何 teacher 账号/密码/角色。
- **没有班级/学院/专业字段**：`users` 里只有 `school` + `name` + `student_id`，没有 `classId/className/college/major`。
- **学号唯一**：注册时校验 `student_id` 是否已被其他账号占用。
- **登录态**：前端 `app.globalData.user` + `wx.setStorageSync('hfjh_user')` 缓存整个 user 对象。

---

## 3. 当前学生信息保存在哪里

学生真实信息在 **`users` 集合**（school / name / student_id）。

另有一个轻量 **`roster` 名单集合**，仅服务 AI 提问鉴权：
```text
roster:
  student_id
  created_at
```
`roster` **不含姓名/班级/学校**，只是一个"学号白名单"。学生在名单内才能使用 AI 教师提问。

> 注意：现有"名单"（roster）本质是**学号白名单**，不是"学生档案表"。教师端的"学生管理"需要独立的、带班级/学号/姓名/学校的学生档案，不能把 `roster` 当作学生主表。

---

## 4. 当前数据库 collection

由 `index.js` 的 `COLLECTIONS` 数组 + `ai/conversation.js` 的 `ensureCollections` 共同确认，共 7 个：

| collection | 用途 | 关键字段 | 关联 |
|---|---|---|---|
| `users` | 用户（学生） | openid, name, school, student_id, role=student | 主身份表 |
| `roster` | 学号白名单（AI 提问鉴权） | student_id | 无姓名/班级 |
| `learning_sessions` | 学习会话（时长/互动数） | user_id, openid, start/end_time, duration, module, interaction_count, is_valid | 按 user_id 关联 users |
| `survey_responses` | 问卷提交 | user_id, survey_id, answers | 按 user_id |
| `survey_invites` | 问卷触发记录 | user_id, trigger_count, completed | 按 user_id |
| `ai_conversations` | AI 对话头 | openid, title, knowledge_point | 按 openid |
| `ai_messages` | AI 消息 | conversation_id, role, content, knowledge_point, model, tokens | 按 conversation_id |

---

## 5. 当前云函数

**只有 1 个云函数 `api`**，通过 `event.action` 路由。所有业务都集中在 `api/index.js`（约 12KB）+ `ai/conversation.js`。

现有 action 清单：
```text
login                 # 获取/创建用户
register              # 实名注册（学校/姓名/学号，学号唯一）
roster.status         # 是否注册 / 是否在名单 / 是否管理员
roster.import         # 管理员导入学号（逐条去重）
roster.list           # 管理员查看名单
roster.remove         # 管理员移除（按 _id）
roster.clear          # 管理员清空名单
session.start         # 创建学习会话
session.end           # 结束学习会话（算时长/互动 → is_valid）
statistics            # 统计有效次数 + 问卷触发
survey.submit         # 提交问卷
ai.ask                # AI 提问（名单内才可）
ai.list / ai.detail   # AI 会话列表 / 详情
ai.feedback           # AI 消息评价
```

### 管理员鉴权方式（重要）
通过**云函数环境变量 `ADMIN_OPENIDS`**（逗号分隔的 openid 列表）判断是否名单管理员（`isAdmin(openid)`）。**这不是教师账号体系**，没有密码、没有班级范围、没有角色。

---

## 6. 当前 AI 问答是否已保存

**已保存**，结构完整：
- `ai_conversations`：`openid`、`title`、`knowledge_point`、`created_at`。
- `ai_messages`：`conversation_id`、`role`、`content`、`knowledge_point`、`model`、token 统计、`created_at`，反馈字段 `feedback_rating/feedback_reason`。

> 教师端"AI 问答"页：可直接按 `openid` → `users.find(student_id)` 关联到学生，复用现有数据，**无需新增重复存储**。唯一缺的是 `classId`（学生没有班级，自然没有），需靠学生档案补充或按用户反查。

---

## 7. 当前是否已记录学习行为

**部分记录，但不满足教师端学情分析**。现有：
- `learning_sessions`：记录了 **会话级** 时长、interaction_count、module、is_valid。判定"有效"为 `duration>=60s 或 interaction>=3`。

**缺失**：`studentId/classId`（用 user_id 代替）、无 `chapterId/knowledgePointId`、无 `eventType`（登录/进入章节/用工具/练习等事件流）、无 `lesson records`、无 `exercise_records`。仅有粗粒度"本次用了多久、点了几次"。

> 要实现教师端"学习记录时间线/章节进度/知识点热度"，需要在 `learning_sessions` 基础上**新增事件级记录**，但第一版可先做"会话级 + 会话内交互次数"的粗粒度统计，再逐步补事件流。

---

## 8. 学生端现有最小修改点

为打通教师端数据，学生端**只需**以下增量（不改现有 UI/核心逻辑）：
1. **身份绑定**：现有注册页已实现"填学校/姓名/学号"，但**没有"从教师预录入学生档案中按学号绑定"**的逻辑。教师端录入学生 → 学生进小程序填学号 → 命中档案 → 绑定（将 openid 写入学生档案）。
2. **学习记录上报**：`session.start/end` 已存在，可复用；需补充 `studentId`（若已绑定）。
3. **AI 提问记录**：`ai_conversations/ai_messages` 已按 openid 存，无需改动，教师端反查即可。

---

## 9. 教师端应如何复用现有体系（结论）

**复用：**
- `users` → 学生身份（openid/name/student_id/school）**可直接当成学生主表**，但缺班级/专业/学院。
- `ai_conversations` / `ai_messages` → AI 问答管理页**原样复用**。
- `learning_sessions` → 学习时长统计**基础复用**（会话级）。
- `cloudfunctions/api` → 扩展为新 action 入口（开新云函数或扩展现有，需评估体积/冷启动，建议拆分独立 `teacher-*` action 或新增 `teacher` 云函数）。

**需新增（不重复造，是现有没有的）：**
- `teachers` 集合 + 教师登录（账号/密码，`role=teacher`）。
- 学校/班级结构：`schools`、`classes`（至少学校+班级，学院/专业字段预留）。
- 学生档案增强：给 `users` 补 `classId/college/major`，或建 `students` 视图集合关联 `users`（需决定是否与 users 合并）。
- 教师-班级关系：`teacher_classes`（教师负责哪些班级）。
- 事件级学习记录：`learning_records`（可选，V1 可先粗粒度）。
- 教师端鉴权云函数 + 数据权限校验（教师只能看自己班级学生）。

---

## 10. 关键风险 / 待决策项（进入 Phase 2 前需确认）

1. **学生主表**：继续用 `users` 补班级字段，还是新建 `students` 集合（学生档案）并关联 `users`？
   - 倾向：`users` 是"微信身份"，`students` 是"教学档案"，两者通过 `openid/student_id` 关联。教师端操作 `students`，不动 `users` 核心字段，最符合"最小侵入"。
2. **教师身份**：独立 `teachers` 集合（独立登录入口），不占用 `users`。需教师账号密码管理方式（首版：云函数内置/初始化脚本创建，或环境变量）。
3. **学习记录粒度**：V1 用 `learning_sessions` 粗粒度，还是新增 `learning_records` 事件级？倾向 V1 先粗粒度 + AI 记录复用，事件级放后续。
4. **云函数组织**：扩展现有 `api`，还是新增独立 `teacher` 云函数？倾向新增独立 `teacher` 云函数（职责清晰、不影响现有 `api` 的冷启动与权限）。

这些决策直接影响 Phase 2（数据库变更方案），建议先敲定再进入 Phase 2。
