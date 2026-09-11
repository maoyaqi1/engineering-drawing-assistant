# 专题规则：教师后台（teacher-backend）

> 分层位置：`AGENTS.md` 的专题规则层。
> 权威性：**本文件目前不含 § 正文**。迁移前 `AGENTS.md` 的 §1–§64 中没有教师后台专属章节，教师端相关的规范性约束全部位于仍保留在全局层的 C 系列条款中；因此本文件只提供指针与现状事实，不新增、不改写任何规则。
> 单一权威：同一条规则只有一处正文；本文件中的“指针表”指向权威条款，“现状事实”只是核对记录。
> 全局优先：`AGENTS.md` 的文件分级、安全门禁、授权与提交禁止条款始终优先于本文件。
> 加载触发：改动 `teacher-web/`、`cloudfunctions/teacher/`，或任务涉及名册、班级、统计、备注、学习记录、教师权限、AI 问答查询。
> 迁移基线：`docs/rules/AGENTS-pre-layering.snapshot.md`（2026-09-11 快照）。

## 指针表（权威正文位置）

| 主题 | 权威正文 |
| --- | --- |
| 目录职责与冻结/探索状态（`teacher-web/`、`cloudfunctions/teacher/` 属探索模块） | `AGENTS.md` C4、C7 |
| 开工前确认：是否触及数据库集合/字段、是否触及权限模型 | `AGENTS.md` C8 第 4、7 条 |
| 冲突升级：权限模型、数据库结构、教学资产、部署链路升级用户 | `AGENTS.md` C1、C6 |
| 同一时刻同一文件只允许一个 Agent 写 | `AGENTS.md` C6 |
| 云函数改动必须部署后才算完成/验证 | `AGENTS.md` C8 第 10 条、C11 第 3 条 |
| 禁止自行 `commit`/`push`、禁止丢弃工作区改动、敏感信息检查 | `AGENTS.md` C10 |
| 交付说明必须包含的内容 | `AGENTS.md` C12（模板见 §62） |
| 云函数、数据库集合与字段、环境变量、API action | `docs/rules/cloud-database.md` |
| 前端（HTML/CSS/JS）编码规范 | `docs/rules/coding.md` |
| 提交、推送、发布与版本 | `docs/rules/git-release.md` |
| 冻结模块 F1–F8 细目与核查命令 | `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` |
| 权限、集合、action、部署链路的完整事实 | `docs/交接说明.md` 第 5、6、7、8、9、10 节 |

## 现状事实（非规则，核对日期 2026-09-11）

以下条目只是“现在是什么”，不构成强制要求；规范类约束见上表。

1. `teacher-web/` 为原生静态页面：`index.html`、`css/`、`js/`、`README.md`，经 CloudBase HTTP 网关调用 `teacher` 云函数（`docs/交接说明.md` 第 4 节）。
2. `cloudfunctions/teacher/` 含 `index.js`（1,240 行）与 `package.json`。
3. `teacher` 云函数的分发入口为 `action` 分支，2026-09-11 检索到的 action 共 20 个：`login`、`logout`、`me`、`teacher.list`、`teacher.create`、`teacher.update`、`teacher.delete`、`dashboard`、`student.list`、`student.create`、`student.update`、`student.import`、`student.delete`、`student.adopt`、`student.records`、`student.detail`、`note.add`、`note.delete`、`learning.list`、`ai.questions`（与 `docs/交接说明.md` 第 8 节一致）。
4. 权限模型为超级管理员 / 普通教师 / 学生三级；据 `docs/交接说明.md` 第 6 节，普通教师只能查看自己名册范围内的学生及学习数据，云函数按 `owner_teacher_id` 强制校验，不靠前端隐藏。
5. 小程序端 `pages/teacher/`、`pages/roster/` 已删除，当前 `app.json` 注册 7 个页面；教师端入口为 `teacher-web/`。
6. `teacher-web/js/app.js` 与 `cloudfunctions/teacher/index.js` 在工作区存在**用户未提交的改动**（见 `git status`）；分层迁移未触碰这两个文件。
7. `README.md` 仍含“学生名单管理”等过期表述，Skill 与部分 reference 文档仍列出 `pages/teacher/`；属文档滞后，见 `docs/rules/project-facts.md`。

## 已知限制与待办

`docs/交接说明.md` 第 12 节记录了教师端已知限制与待办；本文件不复制其清单，避免形成第二权威。
