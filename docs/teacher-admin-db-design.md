# 教师端管理后台 —— 数据库变更方案（Phase 2）

> 状态：设计输出，未修改任何代码。
> 前置：基于 `docs/teacher-admin-arch-analysis.md`（Phase 1）与用户对 4 项决策的确认。
> 已定决策：① 学生档案用独立 `students` 集合；② 教师用独立 `teachers` 账号 + 初始化脚本创建；③ V1 学习记录用 `learning_sessions` 粗粒度 + 复用 AI 记录；④ 新增独立 `teacher` 云函数。

---

## 0. 数据模型总览

```
teachers ──< teacher_classes >── classes ──< students
                                         │        │
                                         │        └── 关联 users（微信身份，通过 studentNo/openid）
                                         └── schoolId ── schools

users（微信身份，现有）── 1:1 绑定关系（绑定后）── students（教学档案）

learning_sessions（现有，会话级）   ── 关联 students（加 studentId/classId）
ai_conversations / ai_messages（现有）── 按 openid 反查 students（不改 AI 模块）
```

**核心思想**：`users` = 微信身份；`students` = 教学档案。两者通过 `studentNo`（学号，业务唯一）与 `openid`（微信身份）关联。教师端只操作 `students/classes/schools/teachers`，**不改动 `users` 的核心字段**，最小侵入现有学生端。

---

## 1. 新增集合

### 1.1 `teachers`（教师账号）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动主键 |
| `username` | string | 登录账号（**唯一索引**） |
| `passwordHash` | string | 密码哈希（scrypt/pbkdf2 + salt） |
| `salt` | string | 盐值 |
| `name` | string | 教师姓名 |
| `schoolId` | string | 所属学校 |
| `schoolName` | string | 学校名称（冗余） |
| `role` | string | 固定 `teacher` |
| `status` | string | `active` / `inactive` |
| `createdAt` / `updatedAt` / `lastLoginAt` | string | ISO 时间 |

**创建方式（首版）**：初始化云函数 `teacher.init` 或部署脚本，从环境变量/配置读取首个教师账号（username + 明文密码，云函数内加盐哈希后写入）。后续可由设置页修改。

---

### 1.2 `teacher_sessions`（教师登录会话/令牌）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动主键 |
| `teacherId` | string | 关联 `teachers._id` |
| `token` | string | 随机令牌（**唯一索引**），Web 端请求头携带 |
| `expiresAt` | string | 过期时间（默认 24h，可续期） |
| `createdAt` | string | ISO 时间 |

**鉴权**：教师 Web 每次请求带 `token` → `teacher` 云函数校验 `teacher_sessions`（未过期 + `teachers.status=active`）→ 得到 `teacherId`。

---

### 1.3 `schools`（学校）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动主键 |
| `name` | string | 学校名称（**唯一索引**） |
| `code` | string | 预留 |
| `createdAt` | string | ISO 时间 |

**V1 极简**：只支持学校名称。学院/专业暂不单独建表（在地字段预留）。

---

### 1.4 `classes`（班级）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动主键 |
| `schoolId` | string | 关联 `schools._id` |
| `schoolName` | string | 冗余 |
| `className` | string | 班级名（如"机械2401"） |
| `college` | string | 学院（预留，可空） |
| `major` | string | 专业（预留，可空） |
| `grade` | string | 年级（预留，可空） |
| `createdAt` | string | ISO 时间 |

**去重约束**：`schoolId + className` 唯一。

---

### 1.5 `students`（学生档案 —— 教师端操作的主表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动主键 |
| `studentNo` | string | 学号（**业务唯一索引**；对应现有 `users.student_id`） |
| `name` | string | 姓名 |
| `schoolId` | string | 关联 `schools._id` |
| `schoolName` | string | 冗余 |
| `college` | string | 学院（预留） |
| `major` | string | 专业（预留） |
| `classId` | string | 关联 `classes._id` |
| `className` | string | 冗余（班级名） |
| `openid` | string | 绑定微信 openid（**未绑定为 null**） |
| `userId` | string | 绑定后关联 `users._id` |
| `status` | string | `active` / `inactive` |
| `createdAt` / `updatedAt` / `lastLoginAt` | string | ISO 时间 |

**绑定前**：教师预录入，`openid=null`、`userId=null`。
**绑定后**：学生端按学号命中本表 → 写入 `openid` + `userId`（并同步 `users.studentDocId`）。

---

### 1.6 `teacher_classes`（教师—班级关系）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动主键 |
| `teacherId` | string | 关联 `teachers._id` |
| `classId` | string | 关联 `classes._id` |
| `createdAt` | string | ISO 时间 |

**V1**：一名教师 → 多个班级（`teacherId` 上可有多行）。**权限核心**：教师只能访问其 `teacher_classes` 内的 `classId`。

---

### 1.7 `learning_records`（事件级学习记录 —— 预留，V1 不上）

V1 按决策③使用现有 `learning_sessions` 粗粒度。本表为后续扩展预留，字段建议：
```text
studentId / classId / sessionId / eventType / chapterId / knowledgePointId / page / duration / metadata / createdAt
```
待学生端引入"登录/进入章节/练习"事件后再启用，V1 不创建、不写入。

---

## 2. 现有集合的最小增量修改

只**新增字段（可选、可空）**，不改任何既有写入逻辑，避免影响学生端行为。

### 2.1 `users`

- 新增 `studentDocId`（string，可空）：学生绑定后指向 `students._id`。其余字段不动。
- 绑定流程与 `users.student_id` 一致性：绑定后若 `users.student_id` 为空则回填，否则校验与 `students.studentNo` 一致；不一致以学号唯一约束拦截。

### 2.2 `learning_sessions`

- 新增 `studentId`（string，可空）、`classId`（string，可空）：学生已绑定微信且会话始于绑定后时写入，方便教师按学生/班级查询。现有 `user_id/openid` 保留。

### 2.3 `ai_conversations` / `ai_messages`

- **不改**。教师端按 `openid` → `students`（studentNo/classId）反查即可。数据量上升后再考虑冗余 `studentId`（后续优化项）。

---

## 3. 索引建议

| 集合 | 索引 |
|---|---|
| `teachers` | `username` 唯一 |
| `teacher_sessions` | `token` 唯一 |
| `schools` | `name` 唯一 |
| `classes` | `schoolId+className` 唯一 |
| `students` | `studentNo` 唯一；`openid`（普通）；`classId`（普通）；`schoolId`（普通） |
| `teacher_classes` | `teacherId`（普通）；`classId`（普通） |
| `learning_sessions` | `user_id+created_at`；`studentId+created_at`；`classId+created_at` |
| `ai_conversations` | `openid+created_at` |

> 微信云开发数据库：在控制台/云函数中创建；`unique` 索引用于学号/账号唯一性约束。

---

## 4. 云函数设计

新增**独立云函数 `teacher`**，与现有 `api` 完全隔离，互不影响冷启动与权限。

### 4.1 鉴权
每个 action 先校验 `authorization: Bearer <token>` → 查 `teacher_sessions` → 得 `teacherId` → 所有班级/学生查询强制过滤 `teacher_classes` 内 `classId`（权限不依赖前端隐藏按钮）。

### 4.2 action 清单
```text
teacher.init              # 初始化首个教师账号（部署期调用）
teacher.login             # 账号密码登录 → 发 token
teacher.logout            # 注销 token
teacher.me                # 当前教师信息
teacher.getDashboard      # 驾驶舱统计（学生/班级/今日学习/AI提问/本周/平均时长）
teacher.getClasses        # 教师负责的班级 + 班级概况
teacher.getClassDetail    # 班级详情（人数/活跃率/平均时长/AI次数/知识点困难）
teacher.getStudents       # 学生列表（搜索/筛选/分页）
teacher.createStudent     # 新增学生
teacher.updateStudent     # 编辑学生
teacher.getStudentDetail  # 学生详情（概况/进度/记录/AI/练习/备注）
teacher.importStudents    # Excel 批量导入（校验→预览→确认写入）
teacher.unbindStudent     # 解除微信绑定
teacher.getLearningRecords# 学习记录（按班级/学生/时间）
teacher.getAIQuestions    # AI 问答（按班级/学生/时间/知识点）
teacher.getAnalytics      # 学情分析（活跃度/知识点热度/困难提示）
teacher.updateTeacher     # 教师个人信息/改密
```

---

## 5. 教师 Web → 云函数接入方式

**推荐**：教师 Web 用 `@cloudbase/js-sdk`（浏览器端 SDK）直接调用 `teacher` 云函数，**不新建后端服务器**，与小程序共用同一云环境。

```text
教师浏览器（静态 page + @cloudbase/js-sdk）
   │  callFunction('teacher', { action, ... })
   ▼
teacher 云函数
   │  Bearer token 鉴权 + teacher_classes 权限过滤
   ▼
云数据库
```

**说明**：
- 教师鉴权是**账号密码 + token**，不依赖微信 openid，因此即使 Web 端没有微信登录态也能用。
- 需在云开发控制台开启本环境的 **Web 端（@cloudbase/js-sdk）访问**（开通后，可用匿名/自定义登录拿到调用凭证；教师登录仍走账号密码）。
- **可选更稳方案**：若 `@cloudbase/js-sdk` 接入不畅，可改用云函数 **HTTP 触发**（云函数返回可公网调用的 URL，Web 直接 fetch）。二选一，均不引入独立服务器。

> 结论：优先 `@cloudbase/js-sdk`；失败则回退 HTTP 触发。此接入方式虽不在 4 项决策内，但为教师 Web 复用云环境的必要前提，已在此明确。

---

## 6. Excel 导入流程

```text
教师 Web 选 Excel
   → 客户端用 SheetJS(xlsx) 解析为结构化行（不传二进制给云函数）
   → 调 teacher.importStudents（data=行数组，mode=validate）
   → 云函数逐行校验（学号/姓名/班级存在/重复/缺失）
   → 返回预览：成功 N / 重复学号 X / 缺字段 Y / 班级不存在 Z + 每行错误原因
   → 教师确认
   → 再调 teacher.importStudents（mode=commit）正式写入 students
```

**安全**：不在未校验前直写数据库；客户端只负责解析为 JSON，校验与权限全部在云函数内完成。

---

## 7. 权限设计（云函数强制，非前端隐藏）

| 主体 | 可见范围 |
|---|---|
| 学生（小程序） | 只能看自己（现有 `users`/`ai` 逻辑不变） |
| 教师 | 只能访问 `teacher_classes` 内班级的学生/记录/AI 问答 |
| 其他教师 | 不能访问他人班级数据 |

所有 `teacher` 云函数查询都以当前 `teacherId` 的 `teacher_classes.classId` 集合做 `where` 过滤；重要写操作（导入/绑定/改密）同样校验。

---

## 7.1 游客身份与非班级用户（重要，已确认）

**学生端不强制绑定班级档案，AI 教师鉴权逻辑维持现有「名单(roster)」不变。**

现实教学场景中，并不是所有用户都通过班级进入。因此：

1. **不强制绑定**：学生微信登录后若学号未在 `students` 档案中，**不拦截、不要求填班级**，照常作为**游客**使用互动工具。
2. **AI 教师权限维持现状**：能否提问仍由现有 `roster`（学号白名单）判断，`api` 云函数 `ai.ask` 的 `isInRoster` 逻辑**完全不动**。
3. **两套数据互不阻塞**：
   - `roster`（AI 名单）= 现有的学号白名单，解决"谁能提问"。
   - `students`（班级档案）= 教师端班级管理用，解决"哪个班有哪些学生及学情"。
   - `roster` 与 `students` **默认独立、不自动同步**；教师可手动在现有名单页维护 AI 名单。
4. **绑定是增量、非门槛**：学生填学号时，云函数去 `students` 表查，命中则关联 `studentDocId`/`classId`（学习记录进班级）；未命中则忽略，游客照常。
5. **Phase 7 不再需要"提示老师先录入"**——无档案直接放行，回归"系统里已有的、在名单里的可用 AI 教师"这一原有逻辑。

> 结论：`students`/`classes`/`teacher_classes` 是教师端班级学情体系；`roster` 是学生端 AI 准入名单。两者并存，统一由 `teacher` 云函数维护班级档案、现有 `api` 维护 AI 名单，互不改动。

---

## 8. 后续扩展预留（不在 V1 实现）

- 事件级 `learning_records`、章节进度 `chapter_progress`、练习记录 `exercise_records`。
- 知识点掌握度、AI 学情报告、教学建议。
- 教师布置任务/作业/考试、错题本。
- 多教师共班、学校管理员、多租户权限。

现有字段设计均带 `college/major/grade` 预留（可空），保证非机械类工科专业可扩展。

---

## 9. 进入 Phase 3 前的确认点

1. **教师 Web 接入方式**：`@cloudbase/js-sdk`（推荐）还是云函数 HTTP 触发？建议先用前者，失败再回退。
2. **首个教师账号**：初始化脚本从云函数环境变量 `TEACHER_USERNAME` / `TEACHER_PASSWORD` 读取（部署时填一次即可；未配置时输出提示，不阻塞登录功能开发）。
3. **学生档案与现有已注册学生的对账**：登录/绑定学号时命中 `students.studentNo` 即关联（写入 `studentDocId`/`classId`）；**未命中则作为游客放行**，AI 教师权限仍按现有 `roster` 名单判断，不提示教师先录入。
4. **教师端导入班级学生**：默认只写入 `students` 档案，不同步 `roster`（AI 名单仍由现有名单页维护）；如需"导入即进 AI 名单"作为后续可选开关，暂不默认开启。

以上 4 点确认后进入 **Phase 3：开发教师登录**。
