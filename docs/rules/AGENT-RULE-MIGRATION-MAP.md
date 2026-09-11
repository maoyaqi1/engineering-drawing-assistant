# C1–C12 协作条款迁移映射表

> 用途：核对第一部分的 12 条协作与治理条款在分层后是否仍完整、可见、可追溯；本表不是规则正文。
> 核对日期：2026-09-11 ｜ 迁移前快照：`docs/rules/AGENTS-pre-layering.snapshot.md`
> 结论：C1–C12 **全部逐字保留在 AGENTS.md**，未迁移、未改写、未摘要；本次只在 AGENTS.md 新增路由层（分层说明、专题加载表、触发条件、专题索引、原章节位置索引）。

## 迁移映射

| 原条款 | 新位置 | 是否完整迁移 | 备注 |
| --- | --- | --- | --- |
| C1 | AGENTS.md（保留，逐字未动） | 完整保留 | 滞后点涉及的 §5/§7/§25/§28 已迁入专题，可用 AGENTS.md 的位置索引解析；与 §2 的优先级次序冲突已于 2026-09-11 由用户裁决（方案 §9.3 P0 关闭：§2 已按 C1 的六级重写）；滞后点第 3 条部分已过期（project-facts L1/L6） |
| C2 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §1、§37、§64 近重复；三条交付线细节分散到 teaching-app / teacher-backend / cloud-database |
| C3 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §3 近重复；禁止项（框架、转译、构建链、CDN）为全局硬约束，不下放 |
| C4 | AGENTS.md（保留，逐字未动） | 完整保留 | 页面清单与状态是可核对事实，见 project-facts；教师线与云侧的细节分派到 teacher-backend / cloud-database |
| C5 | AGENTS.md（保留，逐字未动） | 完整保留 | C5.1–C5.3 与 .agent/requirements.md、developer.md、tester.md 重复（本轮未修改角色文件，按方案第 7 批另行授权） |
| C6 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §4、§59 重复；五类升级触发（冻结模块、数据库结构、教学资产、部署链路、权限模型）必须全局可见 |
| C7 | AGENTS.md（保留，逐字未动） | 完整保留 | F1–F8 细目在 Skill references/frozen-modules.md，基线核查命令亦见 docs/交接说明.md 第 10 节 |
| C8 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §4、C11 相关；第 4/5/7/10 条是云与数据库、权限、部署门禁，分派到 cloud-database / teacher-backend / git-release |
| C9 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §40–§47（现位于 coding.md）逐字重复；几何真值条目与 geometry.md §6/§29 重复 |
| C10 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §60、Skill git-workflow.md 重复；未跟踪资产清单未覆盖 .agent/、docs/requirements/、docs/test/、docs/rules/（project-facts L9） |
| C11 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §49–§55（testing.md）重复/相关；四条回归底线必须在小任务上也可见 |
| C12 | AGENTS.md（保留，逐字未动） | 完整保留 | 与 §62、C5.2、.agent/developer.md 第 8.6 节重复；§62 模板保留在同一文件，避免引用断裂 |

## 关键门禁逐项核对（用户指定不得因分层丢失的六项）

| 门禁主题 | 权威条款 | 分层后是否仍全局可见 |
| --- | --- | --- |
| Agent 角色边界 | C5（C5.1–C5.3）＋ `.agent/*.md` | 是（C5 全文保留在 AGENTS.md） |
| 任务交接 | C5.2、C6 | 是（C6 全文保留在 AGENTS.md） |
| 冲突处理 | C1、C6、§2 与 `AGENTS.md` 的“权威与冲突处理” | 是（C1、C6、§2 全文保留；路由层补充了专题冲突时的解析顺序） |
| 安全门禁 | C5.4、C7、C8、C10、C11 | 是（全部保留；路由层附“全局安全门禁定位索引”指向条款） |
| 冻结模块 | C7（A/B/C/D 分级与 C 级两种允许情形） | 是（正文保留；F1–F8 细目仍在 Skill references） |
| Git 禁止项 | C10（禁止自行 commit/push、禁止 rebase/reset --amend、禁止丢弃工作区改动、敏感信息禁令） | 是（正文保留；仓库事实与发布流程移至 `docs/rules/git-release.md`） |

## 说明

1. 本轮未修改 `.agent/requirements.md`、`.agent/developer.md`、`.agent/tester.md`（它们是工作区未跟踪的用户资产；按 `RULE-LAYER-PLAN.md` 第 7 批另行授权）。
2. C1 的滞后点、C7 的基线命令、C10 的未跟踪资产清单属于“现状事实”，已在 `docs/rules/project-facts.md` 登记，但规则正文仍以 AGENTS.md 为准。
3. C1 与 §2 的指令优先级次序冲突（方案 §9.3 P0）已于 2026-09-11 由用户裁决：以 C1 的六级次序为准，§2 正文据此重写（用户 > 第一部分 > 更深目录 AGENTS.md > 第二部分 > 交接说明/README/Skill > 注释与惯例）。C1 未改动；§2 原文本保留在快照第 294–307 行，见 `RULE-MIGRATION-MAP.md` 的 §2 行。
4. `AGENTS.md` 的分层结构为：第一部分 C1–C12（逐字保留）→ 第二部分 §1–§64（§1/§2/§3/§61/§62/§64 正文保留在全局层，其余章节正文位于 `docs/rules/*.md`）→ 路由层（指向 `docs/rules/*.md`）。路由层不构成第二套规则正文。
