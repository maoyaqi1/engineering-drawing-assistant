# 专题规则：Git、版本与发布（git-release）

> 分层位置：`AGENTS.md` 的专题规则层。
> 权威性：本文件正文为迁移前 `AGENTS.md` 的**逐字原文**，未改写、未摘要、未弱化；每节前的“来源”行标明原章节号。
> 单一权威：同一条规则只有一处正文；其他位置只允许指针。
> 全局优先：`AGENTS.md` C10（Git 使用规范）保留在全局层，其中的禁止自行 `commit`/`push`、禁止 `rebase`/`reset --hard`/`--amend`、禁止丢弃工作区改动、敏感信息禁令始终优先于本文件。
> 加载触发：Git、分支、提交、推送、部署、发布、版本与迁移。
> 交叉引用：仓库事实、冻结基线与未跟踪资产清单见 `AGENTS.md` C7/C10 与 `docs/rules/project-facts.md`；冻结模块 F1–F8 与核查命令见 `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md`；部署链路见 `docs/交接说明.md` 第 5 节；几何数据版本与轴语义不得无声改变同时约束 `docs/rules/geometry.md`。
> 现状事实（非规则，核对日期 2026-09-11）：主仓库 `G:\HFJH`、分支 `master`、远程 `origin` = `https://github.com/maoyaqi1/engineering-drawing-assistant.git`（私有）；教师网页发布仓库为 `maoyaqi1/hfjh-teacher-preview`、分支 `main`（GitHub Pages）；冻结基线 v0.6.2 = `aaf75d0`；仓库无自动化测试与 CI；GitHub 传输在本机网络下不稳定。
> 迁移基线：`docs/rules/AGENTS-pre-layering.snapshot.md`（2026-09-11 快照）。

## 本文件章节索引

| 原章节 | 标题 | 迁移前位置 |
| --- | --- | --- |
| §58 | 版本与迁移 | 快照第 1367 行 |
| §60 | 提交质量门槛 | 快照第 1395 行 |

---

## 来源：AGENTS.md §58

## 58. 版本与迁移

领域数据格式应包含版本号。

格式变更必须提供迁移策略或明确不兼容原因。

不得无声改变坐标轴语义。

不得无声改变投影展开方向。

不得复用旧字段表达新的不同含义。

已公开 ID 必须保持稳定。


## 来源：AGENTS.md §60

## 60. 提交质量门槛

代码必须可读且职责清晰。

不得留下调试日志、断点或临时可视对象。

不得提交未使用的大型依赖或资源。

不得提交生成缓存。

所有新增资源必须有使用位置和所有权。

所有新增控件必须连接实际行为或明确禁用。

所有新增对象必须有删除或销毁路径。
