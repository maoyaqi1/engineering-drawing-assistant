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

> **2026-09-14 更新（REQ-003 第二阶段）**：`teacher` 云函数已按"教师 = 名册唯一录入端 / 超管只读"收窄——
> ① 删除 `grantAiAccess` / `revokeAiAccess`（白名单同步，roster 已下线）；
> ② `student.purge`、`roster.backfill`、`data.reset`、`data.emptyAccounts`、`data.legacyRoster` 下线，统一回 `ACTION_RETIRED`；
> ③ `student.update` / `student.delete` / `note.add` / `note.delete` / `class.update` / `class.members.*` / `class.syncMembers`
> 改为**仅班级或名册归属教师本人**（超管 403）；超管唯一例外是"恢复已停用班级"（R15）；
> ④ 停用教师前校验其名下无 `active` 班级（R17）；恢复班级前校验负责人在职（B1）；
> ⑤ `student.adopt` 重写：教师手动输入「学号 + 姓名」收编本班，超管按账号收编到指定班且 `owner_teacher_id` 写目标班负责教师（A4）；
> ⑥ `student.list` 的 `source=registered`（未入册用户）改为包含未注册游客，并支持 `profile` 筛选；
> ⑦ 新增 action：`data.backfillQuality`、`data.markQuality`（第一阶段）。
> ⑧ 数据标记权限：`data.markQuality`（人工标 production / test / unknown）与 `data.backfillQuality` **仅超管可调**（普通教师 403）；
> 教师网页的「数据标记」下拉只在超管的「未入册用户」页出现，非超管渲染为纯文本。
> 详见 `docs/requirements/REQ-003-phase1-plan.md`、`docs/requirements/REQ-003-phase2-plan.md`。

1. `teacher-web/` 为原生静态页面：`index.html`、`css/`、`js/`、`README.md`，经 CloudBase HTTP 网关调用 `teacher` 云函数（`docs/交接说明.md` 第 4 节）。
2. `cloudfunctions/teacher/` 含入口 `index.js`（当前约 2,435 行）、`package.json` 与 `lib/runtime.js`、`lib/identity.js`、`lib/class-model.js`。
3. `teacher` 云函数的分发入口为 `action` 分支；2026-10-24 的静态接线检查覆盖 34 个 action，完整清单以 `docs/交接说明.md` 第 8 节和 `integrity-check.js` 为准。
4. 权限模型为超级管理员 / 普通教师 / 学生三级；据 `docs/交接说明.md` 第 6 节，普通教师只能查看自己名册范围内的学生及学习数据，云函数按 `owner_teacher_id` 强制校验，不靠前端隐藏。
5. 小程序端 `pages/teacher/`、`pages/roster/` 已删除，当前 `app.json` 注册 11 个页面；教师端入口只有 `teacher-web/`。
6. `teacher-web/js/app.js` 当前约 2,563 行，教师云函数约 2,435 行；两者仍存在单体大文件债务，渐进方案见 `docs/architecture-optimization-plan-2026-10-24.md`。
7. 2026-10-24 代码审查修复增加了超过 1000 条记录、读取/写入故障、部分成功和驾驶舱失败态测试；本地入口为 `node scripts/run-all.js`，没有 CI。

## 已知限制与待办

`docs/交接说明.md` 第 12 节记录了教师端已知限制与待办；本文件不复制其清单，避免形成第二权威。
