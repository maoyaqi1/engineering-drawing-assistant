---
name: engineering-drawing-assistant
description: '工程制图学习助手（项目根目录 G:/HFJH）的项目专属开发 Skill：保护已通过真机验证的几何核心（点/线/面/平面切割立体/基本立体）、AI 教师教学资产与微信云开发架构，并规范增量开发、测试、AI 教师维护与 Git 工作流。仅用于该微信小程序项目。'
metadata:
  short-description: G:/HFJH 工程制图学习助手项目专属开发规范
---

# 工程制图学习助手 · 项目专属规范

## 何时使用

当任务针对 `G:/HFJH` 这个微信小程序项目时使用，包括：修改或新增学生端页面、点/线/面与立体几何互动、AI 教师、云函数、教师后台、学习数据统计、界面优化、发布与版本冻结。

不适用于其他仓库或与本项目无关的通用任务。

## 项目事实（以此为准）

- **技术栈**：原生微信小程序（WXML/WXSS/JS）+ 微信云开发（云函数/云数据库/云存储）。**几何渲染使用 Canvas 2D，不是 Three.js。**
- **两个云函数**：`cloudfunctions/api`（学生端）、`cloudfunctions/teacher`（教师端），彼此独立。
- **两套教师前端**：小程序页 `pages/teacher/` 与网页 `teacher-web/`，共用 `teacher` 云函数。
- **核心几何文件**：`pages/index/index.js`（约 1900 行的主画布）、`pages/index/section-geometry.js`（截交几何真值）、`pages/index/basic-solid.js`（基本立体）、`utils/geo.js`（尺规作图纯几何工具）。
- **无自动化测试**：目前依赖人工 / 真机回归测试，详见 references/testing.md。

详细模块地图、数据流与数据库集合见 references/architecture.md。

## 铁律

1. 先读代码再动手；不凭文件名或文档推断实现。
2. 先定位影响范围，再给方案；不因"更漂亮/更统一/方便重构"而重构稳定模块。
3. 不修改冻结模块，除非用户明确授权（见下节）。
4. 不破坏已有功能；新功能必须做旧功能回归。
5. 涉及几何时以**几何真值**为准，不以视觉效果为准。
6. 涉及 AI 教师时，区分**代码 / Prompt / 知识库 / 环境变量**四类改动。
7. 涉及云函数时，考虑**部署后才生效**的差异（改代码 ≠ 已生效）。
8. 涉及数据库时，不凭猜测新增或修改集合与字段。
9. 不把密钥、密码、Token 写入任何代码、文档或 Git。
10. 改完必须检查 `git diff`，并报告实际改动。
11. 不自行 `git commit` / `git push`，除非用户明确要求。
12. 当 `AGENTS.md` 与实际代码冲突时，**先识别并报告冲突**，不得通过重构代码去迎合文档。

## 冻结基线

**v0.6.2 = 提交 `aaf75d0`** 是当时冻结的版本，也是本规范的范围基准；自该提交起冻结模块必须保持零改动（改动只允许两种情形，见下节）。

## 冻结模块

默认不得主动重构下列模块：点/线/面核心互动与三视图、平面切割立体与 `section-geometry.js` 几何计算、基本立体互动、学生登录/注册与名单鉴权、AI 教师知识库与提示词、已通过真机验证的核心交互。

每个冻结模块的冻结原因、修改风险、允许修改的条件、修改前准备与修改后验证，见 references/frozen-modules.md。

**核心原则**：新增功能优先采用最小侵入式修改，不因为新增功能而重构已经稳定的核心模块。

## 探索模块（不冻结）

`pages/teacher/`、`teacher-web/`、`cloudfunctions/teacher/`（教师端）与 `pages/ruler/`、`web/ruler.html`（尺规作图）属于探索阶段：它们不在 v0.6.2 的版本记录中，**不属于冻结范围**，也不作为版本基线的一部分。

探索模块可以改动，但不得顺带改动冻结模块；改动前先说明范围，改后做基本自测。

## 开发流程

开始较大改动前：

1. `git status` 确认工作区状态与当前基准版本。
2. 阅读将要修改的源文件与相邻模块。
3. 说明**要改哪些文件、影响哪些模块、如何回归**，再动手。

开发中：小步修改，避免一次性大规模重构；不顺手做无关格式化。

完成后：

1. 按模块做回归测试（见 references/testing.md）。
2. `git diff` / `git status` 检查改动范围。
3. 检查是否引入敏感信息。
4. 向用户汇报：改了哪些文件、如何验证、已知限制。
5. 用户确认后才 commit；推送同样需用户确认。

## 测试要求

必须验证：点的创建/移动/三面投影、线的方向变化与投影、面的投影与空间关系、平面切割立体（不同立体/不同参数/截交结果/投影）、基本立体（参数修改与投影同步）、AI 教师（提问/回答/上下文/异常）、教师后台（登录/数据读取/权限）。

只要触及几何或交互，就必须说明**实际做了什么验证**，不得以"代码看起来合理"代替测试。完整检查清单见 references/testing.md。

## AI 教师维护规则

`cloudfunctions/api/knowledge/` 与 `cloudfunctions/api/prompts/` 属于**长期教学资产**：修改前说明原因、保持原有教学逻辑、不随意删除已有知识；Prompt 改动须考虑回答风格与教学逻辑；改后必须做 AI 回归并提示用户**重新部署云函数**；API Key 只能通过环境变量管理。

详见 references/ai-teacher.md。

## Git 工作规则

- 分支 `master`，远程 `origin` → GitHub 私有仓库 `maoyaqi1/engineering-drawing-assistant`。
- 当前基准提交：`aaf75d0`（`chore: establish engineering drawing assistant v0.6.2 baseline`）。
- Codex 不得自行 commit / push；提交前检查敏感信息。

详见 references/git-workflow.md。

## 参考文件

- references/architecture.md：模块地图、数据流、数据库集合、web 与 web-release 区别、已知架构债务。
- references/frozen-modules.md：冻结模块清单与处置规则。
- references/testing.md：各模块人工/真机回归清单。
- references/ai-teacher.md：AI 教师知识库、Prompt、环境变量与部署规则。
- references/git-workflow.md：Git 流程、基准版本与安全检查。
