# 版本冻结记录 v1.0.0（首发正式版本 · 2026-09-11）

> 形态：本版本由提交构成的正式版本（见 §8 提交清单），并打附注 tag `v1.0.0` 推送到 `origin/master`。
> 上一个版本：`v0.7.0`（tag → 提交 `f72d34b`）。
> 本版本相对 v0.7.0 只做一件事：**移除尺规作图模块**，其余功能与实现不变。
> 上级规则：`AGENTS.md` §C7 / §C8 / §C10 / §C11 / §C12。

## 1. 1.0 上线功能范围（首发即这些，其余归 2.0）

### 小程序（学生端，6 个页面）

| 页面 | 作用 |
| --- | --- |
| `pages/login/` | 微信登录 |
| `pages/register/` | 实名注册（学校 / 姓名 / 学号，学号 + 姓名唯一） |
| `pages/index/` | 核心互动画布：点 / 线 / 面、基本立体、平面切割立体（Canvas 2D） |
| `pages/ai/` | AI 教师对话（仅名册内学生可提问） |
| `pages/survey/` | 学习效果问卷 |
| `pages/terms/` | 用户协议与隐私政策 |

### 云函数

| 云函数 | 作用 |
| --- | --- |
| `cloudfunctions/api` | 学生端：登录 / 注册 / 名册状态 / 学习记录 / 统计 / 问卷 / AI 教师 |
| `cloudfunctions/teacher` | 教师端：鉴权、名册与班级、备注、学习记录、AI 问答分析、教师账号管理 |

### 教师后台（网页 `teacher-web/`）

驾驶舱、班级管理、未入册学生（仅超管）、学习记录、点线面分析、AI 教师分析、教师管理（仅超管）、设置。

### 浏览器版几何演示

`web/index.html`（不含尺规作图）。

## 2. 相对 v0.7.0 的改动（移除尺规作图模块）

**删除的文件（6 个，均可从 `v0.7.0` 恢复）**

| 文件 | 行数 |
| --- | --- |
| `pages/ruler/ruler.js` | 572 |
| `pages/ruler/ruler.wxml` | 38 |
| `pages/ruler/ruler.wxss` | 152 |
| `pages/ruler/ruler.json` | 4 |
| `web/ruler.html` | 784 |
| `utils/geo.js`（尺规专用纯几何工具，仅被 ruler.js 引用） | 82 |

**为删除彻底而同步修改的文件（4 个）**

| 文件 | 改动 |
| --- | --- |
| `app.json` | 移除页面注册 `pages/ruler/ruler`（现注册 6 个页面） |
| `pages/index/index.wxml` | 移除右下角"✏ 尺规"入口 |
| `pages/index/index.js` | 移除 `goRuler()` 跳转方法 |
| `pages/index/index.wxss` | 移除 `.ruler-fab / -icon / -label` 样式（含宽屏媒体块内对应条目） |

净变化：**10 个文件，+2 / −1678 行**。除此之外没有任何文件被修改（`git diff --name-status` 已核对）。

**行为影响**：小程序少一个页面与一个入口按钮；首页互动、AI 教师、教师后台、云函数、数据库全部不受影响。AI 教师**仍可回答尺规作图相关问题**（`cloudfunctions/api` 的知识点关键词与教学内容按"其余不动"保留）。

## 3. 划归 2.0 的功能（1.0 明确不做）

1. **尺规作图模块**：`pages/ruler/*`、`web/ruler.html`、`utils/geo.js`（可从 `v0.7.0` 一并恢复）
2. **教师端后续**：班级恢复入口、跨教师调班、学生端班级展示、历史 `class_name` 自动归并、成绩管理、作业管理、高级统计、`class_members` 多对多模型（见 `docs/requirements/REQ-002.md` 非目标）
3. **驾驶舱学生总数口径统一**（此前用户决定"系统规划之后统一改"）

## 4. 关键文件与哈希（`git hash-object` 前 10 位）

| 文件 | blob | 行数 |
| --- | --- | --- |
| `app.json` | `1940b95967` | 21 |
| `app.js` | `91869b9557` | 43 |
| `app.wxss` | `14076ea8c1` | 10 |
| `sitemap.json` | `dab7912334` | 9 |
| `pages/index/index.js` | `5e88da0056` | 1977 |
| `pages/index/index.wxml` | `2a7700e7dd` | 255 |
| `pages/index/index.wxss` | `54a8f3702a` | 328 |
| `pages/index/index.json` | `8b5ac3b1d1` | 5 |
| `pages/index/basic-solid.js` | `80af3fc79d` | 637 |
| `pages/index/section-geometry.js`（几何真值，未改动） | `8229bd0570` | 366 |
| `utils/api.js` | `36d5b6a4e5` | 118 |
| `cloudfunctions/api/index.js` | `c4412c9d09` | 387 |
| `cloudfunctions/teacher/index.js` | `93644a3618` | 2168 |

其余页面样式（与 v0.7.0 相同）：`pages/ai/ai.wxss 0749220125`、`login fb503aa2ff`、`register 1fed2f499a`、`survey 1c883485a9`、`terms fdd4672b4f`。
完整的历史哈希表见 `docs/freeze-v0.7.0-2026-09-11.md` 与 `docs/freeze-pad-ui-2026-09-11.md`。
浏览器版：`web/index.html bb758cfcb8`、`web/runtime.js c350058fa6`、`web/style.css 28ce7d1a27`。

## 5. 冻结前验证证据（2026-09-11 实际执行）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 尺规移除专项 | `ruler-removal-selfcheck.cjs`：页面注册↔文件双向核对、跳转目标核对、**真实加载首页 Page 对象**核对事件绑定、残留引用扫描 | **15/15**（含 25 个事件绑定全部有实现；`goToAi`/`goProfile` 实际调用跳转正确；`goRuler` 已不存在） |
| 整体静态测试 | `full-check.cjs` | **11/11**（语法 / JSON / 配平 / 前后端一致性 / 敏感信息） |
| 教师端离线行为自测 | 6 套内存库桩测试 | **119/119**（34 + 20 + 19 + 18 + 21 + 7） |
| 布局专项 | `layout-check.cjs` / `pad-fit-check.cjs` | 48/48、21/21 |

## 6. 部署 / 发布状态（用户确认，非仓库可验证）

| 目标 | 版本 | 状态 |
| --- | --- | --- |
| `api` 云函数 | `c4412c9d09` | 已部署（2026-09-11 用户确认），本次未改动，**1.0 无需重新部署** |
| `teacher` 云函数 | `93644a3618` | 已部署，本次未改动 |
| 教师网页 | `teacher-web/` 现状 | 已发布到预览仓库；本次未改动 |
| 小程序 | 本记录 §4 | 1.0 需在开发者工具**重新编译**并上传体验版/正式版 |
| 浏览器版演示 | `web/` | **若曾发布到静态托管，需重新同步**（已删除 `web/ruler.html`） |

## 7. 已知文档滞后项（本次**未**修改，按"其余不动"保留）

以下文档仍按"尺规作图存在"描述，与 1.0 代码不一致，建议作为 2.0 或文档专项处理：

1. `AGENTS.md`（9 处：§C4 目录表、§C7 文件分级 A 级的 `pages/ruler/`、`web/ruler.html`）
2. `docs/rules/project-facts.md`（3 处）、`docs/rules/coding.md`（3 处）、`docs/rules/RULE-LAYER-PLAN.md`（1 处，历史方案，可不改）
3. `docs/交接说明.md`（10 处）
4. `.agents/skills/engineering-drawing-assistant/`：`SKILL.md`（4）、`references/architecture.md`（8）、`references/frozen-modules.md`（5）、`.agent/tester.md`（1）
5. `docs/freeze-pad-ui-2026-09-11.md` §2 把 `pages/ruler/ruler.wxss` 列为冻结样式（该文件已删除）
6. `docs/rules/AGENTS-pre-layering.snapshot.md`（12 处）为**历史快照**，按设计不改

## 8. 提交清单与标签

| 顺序 | 提交 | 说明 |
| --- | --- | --- |
| 1 | `879183f` | `feat(miniprogram): 移除尺规作图模块（1.0 功能范围收敛）`（4 改 + 6 删） |
| 2 | 本文件所在提交 | `docs: 新增 v1.0.0 首发版本冻结记录` |

**版本标签**：`v1.0.0`（附注 tag，指向第 2 个提交）。核验：`git show v1.0.0`、`git tag -l -n1 v1.0.0`。
推送目标：`origin/master`（`https://github.com/maoyaqi1/engineering-drawing-assistant.git`，私有）。
未纳入本版本的未跟踪资产（按 §C7 D 级与项目约定保持未跟踪）：`web-release/`、`docs/ai_teacher_reflections.txt`、`docs/qrcode.png`、`docs/产品海报.html`、`images/ai-avatar.png`。

## 9. 回滚

```powershell
# 只恢复尺规作图模块（不动其它任何改动）
git -C G:\HFJH checkout v0.7.0 -- pages/ruler web/ruler.html utils/geo.js
# 再手动还原 app.json 的页面注册与首页入口（见 §2 的 4 个修改文件）

# 整体回到 v0.7.0（谨慎：会丢弃 1.0 的移除改动）
git -C G:\HFJH checkout v0.7.0 -- .
```

## 10. 冻结期间的约束

1. 本记录 §4 的文件视为 1.0 冻结资产：改动需"用户明确要求 + 可复现问题"，且只动一层。
2. 不得以"更整洁"为由重构；`pages/index/section-geometry.js`、`cloudfunctions/api/knowledge|prompts`、`utils/geo.js` 的删除状态与历史决定保持一致。
3. 改云函数必须重新部署，改网页必须重新同步预览仓库，改小程序必须重新编译/上传；未部署不算完成。
4. 修改任一冻结文件后重跑：`ruler-removal-selfcheck.cjs`（如仍适用）、`full-check.cjs`、布局脚本、6 套离线自测，并更新哈希。
