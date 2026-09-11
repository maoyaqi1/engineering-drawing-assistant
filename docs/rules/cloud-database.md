# 专题规则：云函数与云数据库（cloud-database）

> 分层位置：`AGENTS.md` 的专题规则层。
> 权威性：**本文件目前不含 § 正文**。云函数与数据库的规范性约束全部位于仍保留在全局层的 C 系列条款（以及 `docs/rules/coding.md` §57）中；因此本文件只提供指针与现状事实，不新增、不改写任何规则。
> 单一权威：同一条规则只有一处正文；本文件中的“指针表”指向权威条款，“现状事实”只是核对记录。
> 全局优先：`AGENTS.md` 的文件分级、安全门禁、授权与提交禁止条款始终优先于本文件。
> 加载触发：改动 `cloudfunctions/api/`、`cloudfunctions/teacher/`，或任务涉及数据库集合/字段、API action、环境变量、教学资产部署、权限模型。
> 迁移基线：`docs/rules/AGENTS-pre-layering.snapshot.md`（2026-09-11 快照）。

## 指针表（权威正文位置）

| 主题 | 权威正文 |
| --- | --- |
| 后端技术栈与硬约束（微信云开发云函数、`wx-server-sdk`、“改代码 ≠ 已生效”） | `AGENTS.md` C3 |
| 数据库集合与字段先查代码与控制台，不凭猜测增删；`ai_messages` 结构不得更改（教师端统计依赖它） | `AGENTS.md` C8 第 4 条 |
| 是否触及教学资产（`knowledge/*.md`、`prompts/*.md`）及改后是否需重新部署云函数 | `AGENTS.md` C8 第 5 条 |
| 云函数改动未部署不算完成、未部署不算验证 | `AGENTS.md` C8 第 10 条、C11 第 3 条 |
| 数据库改动先确认集合存在与字段结构再验证读写 | `AGENTS.md` C11 第 4 条 |
| 密钥/口令/Token 只以 `process.env.XXX` 形式出现；`.env`、`.env.*` 禁止入库；不得写入代码、文档、注释或 Git | `AGENTS.md` C5.4、C10 |
| 触及数据库结构或权限模型时升级用户 | `AGENTS.md` C1、C6 |
| 导入数据校验类型/范围/有限数值；不执行导入数据中的脚本或表达式 | `docs/rules/coding.md` §57 |
| 学生端云函数调用封装（`utils/api.js`）与目录职责 | `AGENTS.md` C4 |
| 教师端业务与权限模型细节 | `docs/rules/teacher-backend.md` |
| 部署、发布与版本 | `docs/rules/git-release.md` |
| 集合、字段、action、环境变量的完整事实 | `docs/交接说明.md` 第 5、7、8、9 节 |

## 现状事实（非规则，核对日期 2026-09-11）

以下条目只是“现在是什么”，不构成强制要求；规范类约束见上表。

1. `cloudfunctions/api/`：`index.js`、`package.json`、`ai/`、`knowledge/`、`prompts/`。
2. `knowledge/` 实测 15 个 `.md` 文件；`prompts/` 实测 2 个（`teacher_system_prompt.md`、`teacher_image_system_prompt.md`）。`AGENTS.md` C4 与 `docs/交接说明.md` 第 10 节 F6 记作“16 篇”，属文档滞后。
3. `cloudfunctions/teacher/`：`index.js`、`package.json`；action 清单见 `docs/rules/teacher-backend.md` 现状事实第 3 条与 `docs/交接说明.md` 第 8 节。
4. 集合清单（`users`、`roster`、`students`、`teachers`、`teacher_sessions`、`teacher_classes`、`teacher_notes`、`learning_sessions`、`learning_records`、`ai_conversations`、`ai_messages`、`survey_responses`、`survey_invites`）以 `docs/交接说明.md` 第 7 节为准；本文件不复制其字段说明，避免形成第二权威。
5. 环境变量：`api` 使用 `ADMIN_OPENIDS`；AI 教师使用 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`DASHSCOPE_API_KEY`、`VISION_BASE_URL`、`VISION_MODEL`；`teacher` 使用 `TEACHER_USERNAME`、`TEACHER_PASSWORD`。取值只在云开发控制台填写，不写入仓库（`docs/交接说明.md` 第 9 节）。
6. 仓库无自动化测试、无测试框架、无 CI；云函数改动只能通过微信开发者工具部署后在真机/模拟器中人工验证。
7. `AGENTS.md`、`docs/rules/` 的本次分层迁移只新增/修改文档，未改动 `cloudfunctions/` 任何文件，未改动数据库，未部署。

## 已知限制与待办

`docs/交接说明.md` 第 12 节记录限制与待办；本文件不复制其清单。
