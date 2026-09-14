# 专题规则：项目现状事实（project-facts）

> 分层位置：`AGENTS.md` 的专题规则层。
> **性质声明：本文件是“事实层”，不是“规则层”。** 它回答“现在是什么”，不回答“必须怎么做”；其中的事实本身不构成强制要求。规范性约束以 `AGENTS.md` 与其余专题文件为准。
> 权威性：仅 §63 一节为迁移前 `AGENTS.md` 的**逐字原文**（§63 标题即“当前仓库特别说明”，其规则性内容“文档与代码冲突以现有实现为准”同时存在于 `AGENTS.md` C1）；其余为核对记录。
> 加载触发：阅读任何涉及实现状态、版本、页面清单、目录结构、技术栈历史、冻结模块或文档滞后项的规则之前。
> 维护约定：事实变化时先更新本文件，再更新引用它的规则；每次更新必须写明核对日期与核对命令。
> 迁移基线：`docs/rules/AGENTS-pre-layering.snapshot.md`（2026-09-11 快照）。

---

## 来源：AGENTS.md §63

## 63. 当前仓库特别说明

本节写于源码落盘之前。截至 2026-09-10，源码已落盘并可在微信开发者工具中运行（v0.6.2），实现为「原生微信小程序 + 微信云开发 + Canvas 2D」，与本章程原设想的技术栈（浏览器 + Three.js）不同。

因此本章程不能证明项目规格中 Version 4.3 或 Version 5 功能已经存在。

涉及真实坐标系、脚本加载方式和模块边界的条目，凡与现有代码或 `README.md` 冲突者，以现有实现为准并按 §2 报告。

若真实实现与本章程中的“推荐”条目不同，应评估兼容性后再调整。

标记为“必须”或“不得”的正确性、生命周期和产品边界规则仍然有效。

运行方式与操作说明记录在 `README.md`（微信开发者工具导入 → 编译 → 预览）；运行方式变化时必须同步更新该文件。

坐标范围与容差阈值应集中定义；新增判定不得再散落新的魔法阈值。

首次截面实现应优先建立纯数据输出，再交给绘制层渲染。


---

## 现状核对（核对日期 2026-09-11，基准提交 `ddca4f8` + 工作区未提交改动）

> **2026-09-14 事实更新（REQ-003 第二阶段，已实施待部署）**：学生端 AI 放行判定源已从 `roster` 白名单改为
> `students` 名册（按键查询）+ `classes` 状态；`roster` 集合与 `roster.import/list/remove/clear` 已下线（仅保留
> `roster.status` action 名）；`roster.backfill`、`data.reset`、`data.emptyAccounts`、`data.legacyRoster`、
> `student.purge` 均已下线并回 `ACTION_RETIRED`；`api` 与 `teacher` 云函数新增环境变量 `INTERNAL_OPENIDS`。
> 详见 `docs/requirements/REQ-003-phase2-plan.md` 与 `docs/用户与鉴权模型.md`。
> （以下 09-11 各节为当次核对记录，凡与上述更新冲突处，以上述更新与代码为准。）

> **2026-09-14 事实更新（教师后台版本冻结）**：`teacher-web/`（主仓）与发布仓库 `maoyaqi1/hfjh-teacher-preview`（`main`）
> 已冻结为 **`teacher-web-v1.0.0`**：主仓基线 `a853878`（教师网页最后改动在 `6242b48`）、预览仓发布提交 `2caa5d8`、
> 脚本缓存版本 `?v=20260914b`，两仓 6 个文件的 blob 哈希逐字节一致。此后改动需"用户明确要求 + 可复现的真实缺陷"，
> 并重新发布预览仓、更新 `?v=` 与冻结记录哈希。基线、权限语义与回滚见 `docs/freeze-teacher-web-2026-09-14.md`。
> 数据库侧 `roster` 集合已于 2026-09-14 由用户删除。

### 1. 小程序页面清单

`app.json` 的 `pages` 数组当前注册 7 个页面：`pages/login/login`、`pages/register/register`、`pages/index/index`、`pages/survey/survey`、`pages/ai/ai`、`pages/terms/terms`、`pages/ruler/ruler`。`pages/teacher/`、`pages/roster/` 已随 `42195d9` 删除。

### 2. 目录结构（顶层）

`app.js`、`app.json`、`app.wxss`、`sitemap.json`、`project.config.json`、`AGENTS.md`、`README.md`、`.gitignore`、`.agent/`、`.agents/`、`cloudfunctions/`、`docs/`、`images/`、`pages/`、`screen/`（已忽略）、`teacher-web/`、`utils/`、`web/`、`web-release/`（默认不纳入 Git）、`geogebra-offline/`（已忽略）。

目录职责、稳定/冻结/探索状态以 `AGENTS.md` C4 为权威。

### 3. 技术栈现状

| 层 | 现状 |
| --- | --- |
| 小程序端 | 原生 WXML / WXSS / JavaScript，无构建步骤、无包管理器；几何渲染为 Canvas 2D（`canvas type="2d"`） |
| 后端 | 微信云开发云函数 `api`（学生端）与 `teacher`（教师端），依赖 `wx-server-sdk` |
| 数据库 | 微信云数据库（集合清单见 `docs/rules/cloud-database.md`） |
| 教师网页 | `teacher-web/` 原生 HTML / CSS / JS，经 CloudBase HTTP 网关调用 `teacher` 云函数 |
| 网页版几何演示 | `web/index.html` 可直接用浏览器打开 |
| 几何工具 | `utils/api.js`（云函数调用封装）、`utils/geo.js`（尺规作图纯几何工具），不存在 `teacher-api.js` |

### 4. 自动化测试与 CI

仓库**没有**自动化测试、测试框架与 CI 配置：无根 `package.json`，无测试目录约定，无 `.github/`；仅云函数目录各有 `package.json`（部署依赖）。`node --check <file>` 属于开发者本地静态自检，不是项目自动化测试。

### 5. 云函数结构

`cloudfunctions/api/`：`index.js`、`package.json`、`ai/`、`knowledge/`（15 个 `.md`）、`prompts/`（2 个 `.md`）。
`cloudfunctions/teacher/`：`index.js`、`package.json`。

### 6. Web 后台结构

`teacher-web/`：`index.html`、`css/`、`js/`、`README.md`。发布仓库为 `maoyaqi1/hfjh-teacher-preview`、分支 `main`（GitHub Pages）。

### 7. 冻结模块现状

冻结基线 v0.6.2 = `aaf75d0`；F1–F8 细目见 `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` 与 `docs/交接说明.md` 第 10 节；核查命令：

```powershell
git -C G:\HFJH diff --stat aaf75d0 HEAD -- pages/ cloudfunctions/ utils/ web/
```

### 8. 已知文档滞后项

| 编号 | 滞后内容 | 证据 |
| --- | --- | --- |
| L1 | `AGENTS.md` C1 已声明三条滞后点（页面清单、`utils/` 内容、WebGL 时代表述） | `AGENTS.md` C1；`app.json`；`utils/` 目录 |
| L2 | §5 与 Skill 文档仍列 `pages/roster/`、`pages/teacher/` 与 `js/*.js` | §5 原文（现位于 `docs/rules/coding.md`）；`.agents/skills/engineering-drawing-assistant/references/architecture.md` |
| L3 | `cloudfunctions/api/knowledge/` 实测 15 篇，C4 与 F6 记作 16 篇 | 目录列举 2026-09-11 |
| L4 | §16 实体清单列六类实体，未列圆环 `torus`；§53 曲面测试亦无圆环 | §16/§53 原文；`pages/index/basic-solid.js` 的 `buildTorus` |
| L5 | §21/§23 要求“解析或半解析优先、不得只依赖渲染网格”，现实现为独立参数网格 + 三角形—平面求交（设计差异，未判违规） | `pages/index/section-geometry.js` |
| L6 | §7、§17、§25、§48 含 Three.js/WebGL 时代表述（场景分组、材质模板、polygon offset、BufferGeometry、InstancedMesh、`renderer.info`） | 各节原文；当前渲染层为 Canvas 2D |
| L7 | §34、§36、§43 描述的状态机、动画系统、事件总线在当前 `pages/index/index.js` 未发现实现 | 关键词检索 2026-09-11 |
| L8 | `README.md` 仍含“名单管理”等过期表述；Skill `SKILL.md` 与部分 references 仍列已删除页面 | `README.md`；`.agents/skills/engineering-drawing-assistant/SKILL.md` |
| L9 | `AGENTS.md` C10 的未跟踪用户资产清单未覆盖 `.agent/`、`docs/requirements/`、`docs/test/`、`docs/rules/` | `git status` 2026-09-11 |
| L10 | 三种“基线”含义不同：冻结基线 `aaf75d0`、交接文档基准 `40c6055`、事实核对基准 `ddca4f8` + 工作区改动 | C7、C10、`docs/交接说明.md`、C1 |
| L11 | C1 与 §2 的指令优先级次序冲突已关闭：2026-09-11 用户裁决采用 C1 的六级次序，§2 已按其重写；§2 原文（“用户 > 更深目录 AGENTS.md > 本文件 > README 与项目规格 > 注释”）仅存于快照第 294–307 行 | `AGENTS.md` C1/§2；`docs/rules/AGENTS-pre-layering.snapshot.md` |

以上均为事实登记，**未对规则文字做任何修改**；是否修订由用户裁决。

### 9. 本次分层迁移引入的文件（事实登记）

| 文件 | 用途 |
| --- | --- |
| `docs/rules/AGENTS-pre-layering.snapshot.md` | 迁移前 `AGENTS.md` 的只读校验副本（54,245 字节 / 1,489 行），不是规则权威来源，不在常规加载路径 |
| `docs/rules/RULE-MIGRATION-MAP.md` | §1–§64 逐条迁移映射 |
| `docs/rules/AGENT-RULE-MIGRATION-MAP.md` | C1–C12 逐条迁移映射 |
| `AGENTS.md`（分层结构） | 三段：第一部分 C1–C12（逐字保留）→ 第二部分 §1–§64（§1/§2/§3/§61/§62/§64 正文保留，其余章节指向专题）→ 路由层（结构总览、分层结构、权威与冲突、全局安全门禁索引、加载协议、专题规则加载表、必须阅读条件、专题规则索引、原章节位置索引、回滚与校验）。`docs/rules/` 的专题文件为 8 个：`geometry.md`、`coding.md`、`teaching-app.md`、`testing.md`、`cloud-database.md`、`teacher-backend.md`、`git-release.md`、`project-facts.md` |

### 10. 核对命令

```powershell
git -C G:\HFJH status --short
git -C G:\HFJH log -1 --oneline
Get-Content -Raw -LiteralPath 'G:\HFJH\app.json'
Get-ChildItem -LiteralPath 'G:\HFJH\cloudfunctions\api\knowledge' -File
```
