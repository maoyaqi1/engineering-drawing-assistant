# 画法几何互动教学平台开发章程

> 适用范围：本文件所在目录及其全部子目录。
> 文件结构：**第一部分「多 Agent 协作章程」（C1–C12）** 是所有 Agent 的最高级协作规则；**第二部分「开发章程」（§1–§64）** 是技术实现规则。执行优先级与冲突处理见 §C1。
> 文档状态：第二部分写于源码落盘之前，尚未随实现同步更新；凡与现有代码或 `README.md` 冲突之处，以现有实现为准，并按 §C1 / §2 先报告冲突、再动手。
> 目标版本：Version 1.0 architecture baseline，兼容项目规格中描述的 Version 4.3 与 Version 5 能力。
> 事实核对日期：2026-09-11（工作区基准提交 `ddca4f8`）。


---

# 第一部分 · 多 Agent 协作章程

本部分定义多 Agent 协作开发模式下的角色边界、可改文件范围、Git 与测试纪律。

> 分层注记（新增，非规则正文）：以下 C1–C12 为第一部分原文，**逐字保留在全局层**，未迁移；每节前的“来源：AGENTS.md Cn”仅用于标注原条款号。

## 来源：AGENTS.md C1

## C1. 文件结构、效力与冲突处理

本文件是项目内所有 Agent 的最高级协作规则，适用于 `G:\HFJH` 及其全部子目录。

本文件分两部分：

1. 第一部分「多 Agent 协作章程」（§C1–§C12）：协作模式、角色边界、文件可修改性、Git、测试、开工确认规则。
2. 第二部分「开发章程」（§1–§64）：技术实现规则（分层、坐标系、投影、几何算法、命名、验证层次等）。

执行优先级：

1. 用户当前任务中的明确要求。
2. 本文件第一部分。
3. 更深目录中的 `AGENTS.md`。
4. 本文件第二部分。
5. `docs/交接说明.md`、`README.md`、项目 Skill（`.agents/skills/engineering-drawing-assistant/`）。
6. 代码注释与历史惯例。

发现冲突时不得静默选择。

应先指出冲突、说明采用哪条规则、再把改动范围压到最小。

文档与代码不一致时，以**代码事实**为准，不得为迎合文档去重构代码。

已知文档滞后点（2026-09-11 核对，尚未修订，不得据此推断实现）：

1. 小程序端 `pages/teacher/`、`pages/roster/` 已随 `42195d9` 删除，`app.json` 现注册 7 个页面（`login`/`register`/`index`/`survey`/`ai`/`terms`/`ruler`）；章程 §5、`README.md` 的“名单管理页”表述、Skill 的 `references/architecture.md` 与 `references/frozen-modules.md` 相关条目均已过期。
2. `utils/` 实际只有 `api.js` 与 `geo.js`，不存在 `teacher-api.js`。
3. 章程 §3 / §5 / §7 / §25 / §28 中与 Three.js、`js/*.js`、DOM、BufferGeometry 相关的表述是历史设想，当前实现为 Canvas 2D。


## 来源：AGENTS.md C2

## C2. 项目总体目标

本项目是面向大学「画法几何与工程制图」课程的互动教学平台，由三条并行的交付线组成：

1. **微信小程序（学生端，主体）**：点/线/面互动、基本立体、平面切割立体、尺规作图练习、AI 教师答疑。
2. **微信云开发后端**：`api` 云函数（学生端）与 `teacher` 云函数（教师端），彼此独立。
3. **网页教师后台**：`teacher-web/` 静态页面，经 CloudBase HTTP 网关调用 `teacher` 云函数。

它不是 CAD 系统。

所有改动优先服务于空间认知、投影理解与几何构造过程的可视化。

正确性、可解释性、交互反馈、可维护性高于功能数量。

禁止把制造、参数化建模或工程出图能力作为默认产品方向。

判断成功的标准是学生是否更容易看懂空间与投影的对应关系，而不是能画多少对象。


## 来源：AGENTS.md C3

## C3. 技术栈

以下为经代码核对的实际技术栈，不得引入本节之外的运行时依赖。

| 层 | 技术 | 硬约束 |
| --- | --- | --- |
| 小程序端 | 原生 WXML / WXSS / JavaScript | 无构建步骤、无包管理器、运行时不依赖 Node.js |
| 几何渲染 | **Canvas 2D**（`canvas type="2d"`） | 不使用 Three.js / WebGL，不提供自由旋转相机 |
| 后端 | 微信云开发云函数（`wx-server-sdk`） | 依赖由微信开发者工具部署；改代码 ≠ 已生效 |
| 数据库 | 微信云数据库 | 集合与字段先查代码与控制台，不凭猜测增删 |
| 教师网页 | 原生 HTML / CSS / JS | 无框架、无云 SDK，走 HTTP 网关 |
| 网页版几何演示 | 原生 HTML / CSS / JS | `web/index.html` 可直接用浏览器打开 |

禁止：React / Vue / Angular / Electron；必须经转译才能执行的语法；客户端构建链；新的第三方 CDN 运行时依赖。

第三方脚本必须本地可用，或提供明确的离线降级方案。

允许开发者使用独立的静态分析与测试工具（例如 `node --check`），但客户端运行时不得依赖它们。


## 来源：AGENTS.md C4

## C4. 项目目录结构

| 路径 | 职责 | 状态 |
| --- | --- | --- |
| `app.js` / `app.json` / `app.wxss` | 云开发初始化、隐私授权、页面注册（7 页） | 稳定 |
| `pages/index/` | 核心教学画布：点/线/面、基本立体、平面切割立体 | 冻结（F1–F4） |
| `pages/login/`、`pages/register/` | 微信登录、实名注册 | 冻结（F5） |
| `pages/ai/` | AI 教师对话界面 | 稳定 |
| `pages/survey/`、`pages/terms/` | 学习效果问卷、用户协议与隐私政策 | 稳定 |
| `pages/ruler/`、`web/ruler.html` | 尺规作图 | 探索（不在版本基线内） |
| `utils/api.js` | 学生端调用云函数 `api` 的封装 | 稳定 |
| `utils/geo.js` | 尺规作图纯几何工具（不碰 DOM） | 冻结 |
| `cloudfunctions/api/` | 学生端云函数；含 `ai/`、`knowledge/*.md`（16 篇）、`prompts/*.md`（2 篇） | 冻结（F6/F7） |
| `cloudfunctions/teacher/` | 教师端云函数：登录鉴权、名册、统计、备注、学习记录 | 探索 |
| `teacher-web/` | 网页教师后台 | 探索 |
| `web/` | 浏览器版几何演示 | 探索 |
| `web-release/` | 网页版发布快照（含重复文件，见 Skill `architecture.md` §6） | 只读快照，默认不纳入 Git |
| `docs/` | 设计文档、`交接说明.md`、教学资料 | 可改 |
| `images/`、`screen/` | 素材与本地截图 | `screen/` 已被忽略 |
| `geogebra-offline/` | 本机 GeoGebra 离线部署（约 147MB 第三方资源） | 已被忽略，非本项目代码 |
| `.agents/skills/engineering-drawing-assistant/` | 项目专属 Skill 与参考文档 | 可改，改前说明 |


## 来源：AGENTS.md C5

## C5. Agent 角色与职责边界

本项目采用三角色协作：**需求/架构 Agent**、**开发 Agent**、**测试/审查 Agent**。

同一时刻每个 Agent 只做本角色范围内的事；跨角色动作必须先交接，不得代做。

### C5.1 需求/架构 Agent

负责：把用户诉求转成可执行的任务定义；确认影响范围与冻结模块；给出技术方案、涉及文件与回归方案；判断哪些动作需要用户授权。

必须输出：任务定义（目标、非目标、验收标准）、影响文件清单、风险与回归清单、需要用户拍板的问题。

不得：直接大范围改写业务代码；在未获授权时批准冻结模块改动；发明不存在的技术栈、页面、集合、字段或接口。

### C5.2 开发 Agent

负责：按已确认的方案做最小侵入式实现；遵守第二部分技术规则；保持几何真值与渲染分离；完成自测与 `git diff` 检查。

必须输出：改动文件、关键设计决策、实际验证方式、已知限制、后续建议（模板见 §62）。

不得：顺手重构冻结模块；扩大方案范围；自行 `commit` / `push`；改动未获授权的冻结文件。

### C5.3 测试/审查 Agent

负责：独立复现与验证；核对需求、代码、文档三方一致性；检查冻结模块是否被动过、是否引入敏感信息；给出结论与证据。

必须输出：验证清单、实际执行方式（设备/尺寸/控制台）、未覆盖项、缺陷的复现步骤。

不得：边审边改业务代码（发现问题交回开发 Agent）；用“代码看起来合理”代替实测；声称存在本项目并不存在的自动化测试。

审查默认只读；确需修改时先说明并获得用户或任务负责人同意。

### C5.4 共同禁止

不得假设不存在的信息：技术栈、页面、集合、字段、接口、环境变量一律先查代码与文档后再断言。

不得覆盖或回滚他人（含用户）未提交的改动。

不得把密钥、密码、Token 写入代码、文档、注释或 Git。


## 来源：AGENTS.md C6

## C6. 协作流程与交接

标准流转：

1. **需求/架构**：读代码 → 定范围 → 出方案与验收标准 → 需要授权处请示用户。
2. **开发**：按方案实现 → 自测 → 提交交付摘要。
3. **测试/审查**：独立验证 → 给出结论与证据 → 缺陷回传开发。
4. **需求/架构**：确认验收 → 用户确认后再提交。

交接必须携带上下文：任务定义、已确认的约束、改动文件清单、验证方式、未决问题。

交接不得只留“完成 / 未完成”结论。

同一时刻只允许一个 Agent 写同一文件；发现他人正在改的文件，先停下确认。

冲突升级：涉及冻结模块、数据库结构、教学资产（知识库与 Prompt）、部署链路、权限模型时，一律升级给用户决定。


## 来源：AGENTS.md C7

## C7. 文件可修改性分级

| 级别 | 范围 | 规则 |
| --- | --- | --- |
| **A 可直接修改** | `teacher-web/`、`cloudfunctions/teacher/`、`pages/ruler/`、`web/ruler.html`、`docs/`、`images/`、新增文件与新增目录 | 说明范围后可改；改完必须自测 |
| **B 需先说明** | `pages/ai/`、`pages/survey/`、`pages/terms/`、`utils/api.js`、`app.js` / `app.json` / `app.wxss`、`web/`（除 `ruler.html`）、`README.md`、Skill 文档 | 改前说明原因、影响面与回归方式 |
| **C 冻结：需用户明确授权** | `pages/index/index.js`、`index.wxml`、`index.wxss`、`pages/index/section-geometry.js`、`pages/index/basic-solid.js`、`pages/login/`、`pages/register/`、`utils/geo.js`、`cloudfunctions/api/` 全部（含 `ai/`、`knowledge/`、`prompts/`）、已通过真机验证的核心交互 | 只有两种情形可改，见下方 |
| **D 禁止改动 / 禁止提交** | `geogebra-offline/`、`screen/`、`node_modules/`、`.env` / `.env.*`、`project.private.config.json`、`web-release/`、任何真实密钥值 | 不得修改、不得提交；确需变动先问用户 |

> 版本冻结注记（2026-09-14）：`teacher-web/` 自 **`teacher-web-v1.0.0` 起冻结**——虽仍列在 A 级，实际改动需"用户明确要求 + 可复现的真实缺陷"，并重新发布预览仓、更新 `?v=` 版本号。冻结基线、哈希、权限语义与回滚方式见 `docs/freeze-teacher-web-2026-09-14.md`。其余 A 级范围（`cloudfunctions/teacher/`、`docs/` 等）不受此注记影响。

C 级（冻结）允许改动的两种情形，缺一不可：

1. 用户在当前任务中明确要求修改该模块。
2. 修复该模块中**可复现的真实缺陷**，且先复现、再改。

任何情况下都不得以“更整洁 / 更统一 / 新技术”为由重构冻结模块。

冻结模块细目 F1–F8、修改前准备与修改后必测项见 `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md`。

冻结基线：v0.6.2 = 提交 `aaf75d0`。核查命令：

```powershell
git -C G:\HFJH diff --stat aaf75d0 HEAD -- pages/ cloudfunctions/ utils/ web/
```


## 来源：AGENTS.md C8

## C8. 修改代码前必须确认的规则

开工前逐项确认，缺一项就不动手：

1. 本次涉及的文件属于 C7 的哪一级？是否需要用户授权？
2. 是否触及冻结模块 F1–F8？
3. 是否触及几何真值（`section-geometry.js`、投影公式）？改动属于“投影公式”还是“交互 / 渲染”？只动其中一层。
4. 是否触及数据库集合或字段？是否影响教师端统计所依赖的字段结构（`ai_messages` 结构不得更改）？
5. 是否触及教学资产（`knowledge/*.md`、`prompts/*.md`）？改后是否需要重新部署云函数？
6. 是否引入新技术栈、构建步骤、第三方依赖或 CDN？（默认禁止）
7. 是否涉及权限模型（超级管理员 / 普通教师 / 学生，以及名册准入规则）？
8. 本次的验收标准与回归清单是什么？
9. 工作区是否有他人未提交的改动？`git status` / `git log -1 --oneline` 是否已确认？
10. 是否需要部署（云函数）或发布（教师网页）？**未部署不算完成。**

任何实现任务开始前必须先读相关源文件，不得仅凭文件名或文档推断模块行为。

修改前应简述架构、目标文件与受影响模块，再动手。

只实现当前请求范围内的功能，不借机做无关格式化或重构。


## 来源：AGENTS.md C9

## C9. 编码规范

除第二部分 §40–§47（命名、函数设计、类与组合、注释、CSS、HTML）外，本项目特有硬约束：

- 不引入构建步骤、包管理器、前端框架或必须转译的语法。
- 几何真值只存在于领域数据（`this.data` 的点/线/面/立体参数与 `section-geometry.js` 的计算结果），渲染层只读。
- 命名：类、构造器与工厂类型用 `PascalCase`；函数与变量用 `camelCase`；常量用 `UPPER_SNAKE_CASE`；布尔用 `is` / `has` / `can` / `should` 前缀；事件处理用 `handleXxx`。
- 坐标转换函数必须在名称中标明来源与目标，例如 `worldToView`、`projectIsometric`、`screenToModel`。
- 角度内部统一使用弧度，界面可显示度数，转换必须通过命名函数完成。
- 浮点比较不得使用严格相等，容差来自共享数值策略。
- 数值有限性必须在写入几何状态前校验，避免 NaN 传播。
- 与相邻文件风格保持一致；不做与本任务无关的格式化、重命名或重排。
- `pages/index/index.js`（约 1900 行）属**已知架构债务**，不得以“更整洁”为由顺手拆分。


## 来源：AGENTS.md C10

## C10. Git 使用规范

当前事实：

| 项 | 值 |
| --- | --- |
| 主仓库 | `G:\HFJH`，分支 `master` |
| 远程 | `origin` → `https://github.com/maoyaqi1/engineering-drawing-assistant.git`（私有） |
| 冻结基线 | `aaf75d0`（v0.6.2） |
| 教师网页发布仓库 | `maoyaqi1/hfjh-teacher-preview`，分支 `main`（不是 `master`），GitHub Pages |
| 自动化测试 / CI | **无** |

规则：

- Agent **不得自行 `commit` 或 `push`**，除非用户在该次任务中明确要求。
- 不得 `rebase` / `reset --hard` / `--amend` / 改写历史；不得修改 remote 配置。
- 不得用 `git checkout -- <file>`、`git reset` 等方式丢弃工作区改动。
- 下列文件按项目约定**保持未跟踪**，视为用户资产，不得擅自纳入或删除：`docs/ai_teacher_reflections.txt`、`docs/qrcode.png`、`docs/产品海报.html`、`images/ai-avatar.png`、`web-release/`。
- 开始前执行 `git status` 与 `git log -1 --oneline`；结束后用 `git diff` / `git status` 逐项核对改动范围。
- 提交前必须做敏感信息检查：明文口令、`sk-` 前缀、API Key / Secret / Token 字面量；确认 `TEACHER_PASSWORD`、`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY` 等只以 `process.env.XXX` 形式出现；确认 `.env` 未入库。
- 提交信息沿用现有风格：`feat(scope): …`、`fix(scope): …`、`docs: …`。
- 推送账号认证必须由用户本人完成；Agent 不得代输密码、代读验证码或自建 Token。
- GitHub 传输在本机网络下不稳定（`Connection was reset` 属常态），失败时先报告再重试，不反复重试。


## 来源：AGENTS.md C11

## C11. 测试要求

本项目**没有自动化测试、没有测试框架、没有 CI**。

因此不得用“测试已通过”指代不存在的自动化测试；只能说明在微信开发者工具、真机或云开发控制台实际验证了哪些场景。

最低要求：

1. 改动前先声明要验证哪些场景、用什么设备与尺寸。
2. 触及几何或交互的改动，必须在模拟器或真机上实际操作，不能只读代码。
3. 触及云函数的改动，必须重新部署后再验证；**未部署不算验证**。
4. 触及数据库的改动，先确认集合存在与字段结构，再验证读写。
5. 改完 JavaScript 至少做语法自检：`node --check <file>`。
6. 审查 Agent 必须独立复现，不沿用开发 Agent 的结论。

回归底线，任何改动后至少确认：

1. 首页能正常打开并绘制。
2. 点/线/面三种模式切换后仍能绘制与拖动。
3. 基本立体与平面切割立体仍能正常显示。
4. 学生登录 / 注册流程未被破坏。

模块级回归清单见 `.agents/skills/engineering-drawing-assistant/references/testing.md`（注意该文件对 `pages/roster/`、`pages/teacher/` 的描述已过期）。

验证层次见第二部分 §49–§54。


## 来源：AGENTS.md C12

## C12. 交付与汇报

交付说明必须包含：改动文件、新增类 / 工厂、新增方法、设计决策、实际执行的验证、已知限制、后续建议（模板见 §62）。

不得只汇报“已完成”。

不得把未验证的部分写成已验证。

发现文档与实现冲突时，在交付说明中单列说明，并给出采用的规则。


# 第二部分 · 开发章程（技术实现）

## 来源：AGENTS.md §1

## 1. 章程目的

本项目是大学画法几何与工程制图课程的互动教学平台。

它不是 CAD 系统。

所有贡献必须优先服务于空间认知、投影理解和几何构造过程的可视化。

正确性、可解释性、交互反馈和可维护性高于功能数量。

禁止为了展示数学技巧而增加学生难以理解的复杂度。

禁止把制造、参数化建模或工程出图能力作为默认产品方向。


## 来源：AGENTS.md §2

## 2. 指令优先级

贡献者按以下优先级处理约束：

1. 用户当前任务中的明确要求。
2. 本文件第一部分（C1–C12）。
3. 更深目录中的 `AGENTS.md`。
4. 本文件第二部分（§1–§64）。
5. `docs/交接说明.md`、`README.md`、项目 Skill（`.agents/skills/engineering-drawing-assistant/`）。
6. 代码注释与历史惯例。

当不同层级规则发生冲突时，应明确说明采用的上级规则，不得静默选择。
文档与代码不一致时，以实际代码事实为准。


## 来源：AGENTS.md §3

## 3. 技术边界

当前实现是**原生微信小程序 + 微信云开发**，另有一条**静态网页版**；本节的边界按这两条线理解，而不是浏览器单页应用。

- 小程序端（`pages/`、`utils/`、`app.*`）：WXML/WXSS/JavaScript；几何渲染使用 **Canvas 2D**（`canvas type="2d"`），空间坐标是几何真值，三视图由同一个点模型派生。
- 网页版（`web/`、`web-release/`、`teacher-web/`）：静态 HTML/CSS/JS；入口 `web/index.html`，直接用浏览器打开即可测试，公众号部署说明见 `web/README.md`。
- 后端（`cloudfunctions/api` 学生端、`cloudfunctions/teacher` 教师端）：微信云函数，依赖 `wx-server-sdk`，由微信开发者工具管理；改动需部署后才生效。

**不使用 Three.js / WebGL**：三维区域是适合移动端的等轴测教学示意，不是可旋转的场景（见 `README.md`）。若将来确需引入 WebGL 或新的构建链，须先单独提出方案并说明影响，不得以本章程历史版本为依据直接引入。

仍然适用：

- 客户端不得引入 React、Vue、Angular 或 Electron。
- 客户端不得新增必须经转译才能执行的语法。
- 客户端不得要求构建步骤或包管理器（云函数依赖由微信开发者工具管理，不计入客户端构建链）。
- 不得依赖 Node.js 才能运行客户端应用。
- 允许开发者使用独立的静态分析或测试工具，但运行时不得依赖它们。
- 第三方脚本必须本地可用或提供明确的离线降级方案。



> 分层说明（本次分层新增，非规则正文）：第二部分 §4–§60、§63 已按专题迁出，位置见下文路由层的“原章节位置索引”；以下 §61、§62、§64 属跨专题全局契约（完成定义、交付摘要模板、最终原则），保留在全局层，原文如下。

## 来源：AGENTS.md §61

## 61. 完成定义

功能行为符合当前任务。

几何结果在正常与退化案例中合理。

三维场景和三视图同步。

交互期间无明显卡顿。

对象删除与模块销毁无明显泄漏。

直接打开 `index.html` 可运行。

现有功能完成必要回归检查。

文档与实际行为一致。

交付摘要完整。


## 来源：AGENTS.md §62

## 62. 交付摘要模板

修改文件：列出实际修改的路径。

新增类型：列出类、工厂或领域类型；没有则写无。

新增方法：列出重要公共方法；没有则写无。

设计决策：说明坐标、算法、状态与生命周期选择。

验证：列出实际执行的检查和结果。

已知限制：只列真实限制。

后续改进：列出非当前范围但有价值的工作。


## 来源：AGENTS.md §64

## 64. 最终原则

空间关系必须比数值面板更直观。

几何真值必须独立于渲染对象。

投影与截面必须共享同一领域数据来源。

退化情形必须被建模，而不是被忽略。

交互必须即时反馈，同时保持最终结果准确。

渲染资源（当前为 Canvas 2D）必须有明确所有者和释放路径。

算法必须可解释、可测试、可扩展。

每次改动必须保护已工作的教学能力。

当简洁与炫技冲突时，选择简洁。

当速度与不可见的错误冲突时，选择正确并进行有依据的优化。

当最终图形与学习过程冲突时，同时呈现构造过程。

本平台的成功标准不是能画多少对象，而是学生是否更容易看懂空间与投影的对应关系。

---

# 路由层（指向 `docs/rules/*.md`）

> 本层是本次规则分层重构新增的**路由层**，本身不含规则正文。规则正文只有两个来源：本文件的 C1–C12 与保留的 §1/§2/§3/§61/§62/§64，以及 `docs/rules/*.md`；本层只回答“规则放在哪里、什么时候必须读”。

本节及以下“专题规则加载表”“必须阅读专题规则的条件”“专题规则索引”“原章节位置索引”用于说明规则放在哪里、什么时候必须读。它们不新增、不删除、不改写任何原有规则；原有规则正文一律逐字保留（全局层留在本文件，专题层迁入 `docs/rules/*.md`，每节标注“来源：AGENTS.md §N”）。

## 结构总览

```text
AGENTS.md
├─ 第一部分 C1–C12
│    └─ 全局协作、安全、角色、Git 边界
├─ 第二部分 §1–§64
│    └─ 项目技术规则（§1/§2/§3/§61/§62/§64 正文保留在本文件，其余章节见 docs/rules/*.md）
└─ 路由层
     └─ 指向 docs/rules/*.md

docs/rules/
├─ geometry.md
├─ coding.md
├─ teaching-app.md
├─ testing.md
├─ cloud-database.md
├─ teacher-backend.md
├─ git-release.md
└─ project-facts.md
```

## 分层结构

| 层 | 文件 | 何时读取 | 承载内容 |
| --- | --- | --- | --- |
| 1 全局层 | `AGENTS.md`（本文件） | 每次任务必读 | 产品目标、技术栈硬边界、Agent 协作核心规则、文件修改权限与冻结模块、安全门禁、禁止自行 `commit`/`push`、完成定义与交付契约、专题索引与触发表 |
| 2 角色层 | `.agent/requirements.md`、`.agent/developer.md`、`.agent/tester.md` | 按当前 Agent 角色读取 | 角色职责、必读材料、输出物模板、角色特有禁止项（本轮未修改这些文件） |
| 3 专题层 | `docs/rules/*.md` | 按下方触发表命中后读取 | 几何、教学应用、教师后台、云与数据库、测试、Git 发布、通用编码、项目事实 |

## 权威与冲突处理

1. 用户当前任务中的明确要求 > 本文件第一部分 C1–C12 > 更深目录中的 `AGENTS.md` > 本文件第二部分（§1–§64；含保留在全局层的 §1/§2/§3/§61/§62/§64 与已迁出的 §4–§60、§63 所在专题文件）> `docs/rules/*.md` 与角色文件 > `docs/交接说明.md`、`README.md`、项目 Skill > 代码注释与历史惯例。（该次序与 §2 一致：C1 与 §2 原有的“更深目录 AGENTS.md”次序冲突已于 2026-09-11 由用户裁决，§2 按裁决重写。）
2. 本文件与专题文件出现同一规则正文重复时视为缺陷：安全门禁、文件分级、授权与提交禁止条款以本文件为准，专业执行细节以专题文件为准，并须报告该重复。
3. 发现冲突不得静默选择：先指出冲突、说明采用哪条规则、再动手（见 C1、§2）。
4. 文档与代码不一致时以**代码事实**为准，不得为迎合文档重构代码（见 C1；事实登记见 `docs/rules/project-facts.md`）。
5. 原文中的 `见 §N` 引用按本文件“原章节位置索引”和 `docs/rules/RULE-MIGRATION-MAP.md` 解析；专题文件内的 `§N` 指该文件内“来源：AGENTS.md §N”对应的原文。
6. 专题文件与角色文件冲突时，以本文件的优先级规则为准，并先报告冲突。

## 全局安全门禁定位索引（正文见本文件，不在此重复）

| 门禁 | 权威条款 |
| --- | --- |
| 不假设不存在的信息（技术栈、页面、集合、字段、接口、环境变量先查代码与文档） | C5.4 |
| 不覆盖或回滚他人（含用户）未提交的改动；未知改动视为用户改动 | C5.4、C10 |
| 密钥、密码、Token 不得写入代码、文档、注释或 Git | C5.4、C10 |
| 文件可修改性 A/B/C/D 分级、C 级冻结模块的两种允许情形、D 级禁止改动与提交 | C7 |
| 冲突升级用户（冻结模块、数据库结构、教学资产、部署链路、权限模型） | C1、C6 |
| 开工前 10 项确认门禁（先读代码、确认分级、范围、验收与回归、工作区状态等） | C8 |
| 不引入构建链/框架/转译语法；几何真值独立于渲染；`pages/index/index.js` 架构债不得顺手拆分 | C9 |
| 禁止自行 `commit`/`push`；禁止 `rebase`/`reset --hard`/`--amend`；禁止丢弃工作区改动；敏感信息检查 | C10 |
| 本项目没有自动化测试/框架/CI；任何改动后的四条回归底线 | C11 |
| 交付与汇报必须包含的内容；不得只报“已完成”；不得把未验证写成已验证 | C12（模板见 §62） |

## 加载协议（必须遵守）

1. 先读本文件（含文件分级、安全门禁、四条回归底线）。
2. 再按当前角色读 `.agent/` 中的角色文件。
3. 再按“专题规则加载表”与“必须阅读专题规则的条件”加载命中的专题文件；一个任务命中多项时取并集。
4. 命中的专题文件不存在、路径失效或内容明显过期时，必须停止并请求确认，不得凭记忆执行。
5. 只有“普通 UI/小修改”可以不加载专题文件，且必须同时满足：不触及几何、教学、AI 教师、教师后台、云函数、数据库、权限、教学资产与 Git 发布，改动文件属于 C7 的 A 级（或 B 级且已按 B 级要求说明范围）。
6. 专题文件中的规则只在其触发范围内生效；未命中的专题不构成本次任务的强制要求。

---

# 专题规则加载表

| 任务 | 必读专题 |
| --- | --- |
| 普通 UI/小修改 | coding |
| 教师后台 | teacher-backend + cloud-database |
| 学生端/工程制图学习助手 | teaching-app |
| AI 教师 | teaching-app + cloud-database |
| 几何/投影/立体/截交 | geometry |
| 云函数/API/数据库 | cloud-database |
| 测试/回归 | testing |
| Git/部署/发布 | git-release |
| 项目状态确认 | project-facts |

补充行（同一任务可命中多行，取并集）：

| 任务 | 必读专题 |
| --- | --- |
| 冻结模块 F1–F8 缺陷修复或改动 | geometry（或 coding）+ testing；动手前先读 C7 与 `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` |
| 教师网页前端 `teacher-web/` | teacher-backend + cloud-database + coding |
| 浏览器版几何演示 `web/`、`web-release/` | geometry + coding |
| AI 教师知识库与 Prompt（教学资产） | teaching-app + cloud-database（+ testing） |
| 规则或文档维护（`AGENTS.md`、`docs/rules/`、Skill、README） | project-facts + coding |
| 跨交付线改动 | 命中专题取并集；不确定时先加 project-facts |

---

# 必须阅读专题规则的条件

| 命中条件（路径、关键词或动作） | 必须加载 |
| --- | --- |
| 改动 `pages/index/`、`utils/geo.js`、`pages/index/basic-solid.js`、`pages/index/section-geometry.js`，或任务出现投影、坐标、三视图、点线面、立体、截交、相贯、拾取、拖动 | `docs/rules/geometry.md` |
| 改动 `pages/ai/`、`pages/survey/`、`pages/terms/`、`pages/login/`、`pages/register/`，或涉及教学交互、教学呈现、可访问性、响应式布局 | `docs/rules/teaching-app.md` |
| AI 教师问答、知识库 `knowledge/*.md`、Prompt `prompts/*.md` | `docs/rules/teaching-app.md` + `docs/rules/cloud-database.md` |
| 改动 `teacher-web/`、`cloudfunctions/teacher/`，或涉及名册、班级、统计、备注、学习记录、教师权限 | `docs/rules/teacher-backend.md` + `docs/rules/cloud-database.md` |
| 改动 `cloudfunctions/api/`、`cloudfunctions/teacher/`，或涉及集合、字段、action、环境变量、部署 | `docs/rules/cloud-database.md` |
| 执行测试、回归、验收、发布前验证 | `docs/rules/testing.md` + 命中专题 |
| 执行 Git、分支、提交、推送、部署、发布、版本与迁移 | `docs/rules/git-release.md` |
| 写或改 JavaScript、WXML、WXSS、HTML、CSS | `docs/rules/coding.md` |
| 出现文档与代码冲突、版本或页面清单疑问、冻结模块范围疑问 | `docs/rules/project-facts.md` |
| 一任务命中多个条件 | 取专题并集；不确定时先加载最相关专题加 `docs/rules/project-facts.md` |

---

# 专题规则索引

| 专题 | 文件 | 分类 | 承载的原章节 | 是否含规则正文 |
| --- | --- | --- | --- | --- |
| coding | `docs/rules/coding.md` | 通用编码与工程规范 | §4、§5、§40–§48、§56、§57、§59 | 是（逐字迁移） |
| geometry | `docs/rules/geometry.md` | 画法几何与几何渲染交互 | §6–§33 | 是（逐字迁移） |
| teaching-app | `docs/rules/teaching-app.md` | 学生端教学应用 | §34–§39 | 是（逐字迁移） |
| teacher-backend | `docs/rules/teacher-backend.md` | 教师后台 | 无 § 正文（指针与现状事实） | 否 |
| cloud-database | `docs/rules/cloud-database.md` | 云函数与云数据库 | 无 § 正文（指针与现状事实） | 否 |
| testing | `docs/rules/testing.md` | 测试与验证 | §49–§55 | 是（逐字迁移） |
| git-release | `docs/rules/git-release.md` | Git、版本与发布 | §58、§60 | 是（逐字迁移） |
| project-facts | `docs/rules/project-facts.md` | 项目现状事实 | §63（其余为事实登记） | 部分（§63 逐字迁移） |

---

# 原章节位置索引

用于解析本文件与专题文件中出现的 `§N` 引用（例如 C1 滞后点提到的 §5/§7/§25/§28、C9 提到的 §40–§47、C11 提到的 §49–§54）。逐条映射见 `docs/rules/RULE-MIGRATION-MAP.md`。

| 原章节 | 当前位置 |
| --- | --- |
| C1–C12 | 本文件（逐字保留） |
| §1、§2、§3 | 本文件（逐字保留） |
| §61、§62、§64 | 本文件（逐字保留：完成定义、交付摘要模板、最终原则属跨专题全局契约） |
| §4、§5、§40–§48、§56、§57、§59 | `docs/rules/coding.md` |
| §6–§33 | `docs/rules/geometry.md` |
| §34–§39 | `docs/rules/teaching-app.md` |
| §49–§55 | `docs/rules/testing.md` |
| §58、§60 | `docs/rules/git-release.md` |
| §63 | `docs/rules/project-facts.md` |

---

# 回滚与校验

迁移前 `AGENTS.md` 的只读副本为 `docs/rules/AGENTS-pre-layering.snapshot.md`（54,245 字节 / 1,489 行 / 24,991 字符，2026-09-11 快照）。如需回滚，用该副本覆盖 `AGENTS.md` 并删除 `docs/rules/` 下本次新增的专题文件即可；副本不在常规加载路径，也不是规则权威来源。
