# 版本冻结记录 v0.7.0（2026-09-11）

> 形态：**工作区（未提交）快照**，基线提交 `2438fa3`。本记录不含提交动作：未 commit、未 push。
> 版本号 `v0.7.0`（用户 2026-09-11 确认；上一次基线为 `v0.6.2` / `aaf75d0`）。
> 状态：**静态与离线测试全部通过；等待用户完整测试确认后，再决定是否按 §7 落盘为提交**。
> 上级规则：`AGENTS.md` §C7 / §C8 / §C10 / §C11 / §C12。

## 1. 本版本包含的三条工作线

| # | 工作线 | 内容 | 详细记录 |
| --- | --- | --- | --- |
| W1 | 规则分层 | `AGENTS.md` 改造为全局入口 + `docs/rules/*.md` 专题 + `.agent/*.md` 角色文件 + 迁移映射表 | `docs/rules/RULE-MIGRATION-MAP.md`、`AGENT-RULE-MIGRATION-MAP.md` |
| W2 | 教师后台 | REQ-001（已提交 `2438fa3`）+ REQ-002 第一阶段（班级实体、`class.*`、年级班级页、批量删除、未入册学生、跨校判重） | `docs/requirements/REQ-001|002.md`、`docs/test/TEST-001|002.md` |
| W3 | 小程序 UI | PAD/手机布局适配（旋转、左右分栏、手机等大字、一屏放下、参数面板并排） | `docs/freeze-pad-ui-2026-09-11.md` |

## 2. 文件清单与哈希（blob 前 10 位，`git hash-object` 可复核）

### W1 规则分层

| 文件 | 行数 | blob |
| --- | --- | --- |
| `AGENTS.md` | 602 | `77f02999c8` |

未跟踪目录：`docs/rules/`（12 个文件）、`.agent/`（3 个文件：`requirements.md`、`developer.md`、`tester.md`）。

### W2 教师后台

| 文件 | 行数 | blob |
| --- | --- | --- |
| `cloudfunctions/teacher/index.js` | 2168 | `93644a3618` |
| `cloudfunctions/api/index.js` | 387 | `c4412c9d09`（2026-09-11 修订：白名单校验改为「学号 + 姓名」都要对上，见 §8） |
| `teacher-web/js/app.js` | 1822 | `9f5e1d1eed` |
| `teacher-web/js/api.js` | 144 | `9fd0123847` |
| `teacher-web/css/style.css` | 511 | `9fb8163c5f` |
| `teacher-web/index.html` | 74 | `3325767f00` |

未跟踪目录：`docs/requirements/`（REQ-001、REQ-002）、`docs/test/`（TEST-001、TEST-002）。

### W3 小程序 UI

见 `docs/freeze-pad-ui-2026-09-11.md` 中的 12 个文件与哈希（本次复核未变动）：
`app.json` `1165ba7761`、`pages/index/index.json` `8b5ac3b1d1`、`index.js` `b5490ca654`、
`index.wxml` `1f7833086f`、`index.wxss` `9f34f2c188`（2026-09-11 两次修订：旋转90° 按钮改显式基准宽度；旋转90° 语义改为独立按钮、绕当前高亮轴，见该文件 §8）、`basic-solid.js` `80af3fc79d`、
`pages/{ai,login,register,ruler,survey,terms}/*.wxss` `0749220125` / `fb503aa2ff` / `1fed2f499a` / `1d32806fa4` / `1c883485a9` / `fdd4672b4f`。

## 3. 测试结果（本轮整体执行，全部通过）

### 3.1 静态整体测试 `full-check.cjs`（仓库外脚本）：11/11

| 检查项 | 结果 |
| --- | --- |
| JS 语法 `node --check`（22 个文件） | 通过 |
| JSON 解析（13 个） | 通过 |
| WXSS 大括号配平（8 个） | 通过 |
| WXML 标签配平（7 个） | 通过 |
| 教师端 action 一致性（前端调用 29 / 云端 31） | 通过；云端未被前端引用的 2 个是维护工具 `roster.backfill`、`student.records` |
| 学生端 action 一致性（16 个云端 action） | 通过 |
| 教师网页 api 方法一致性（使用 27 / 定义 29） | 通过 |
| 教师网页 DOM id 一致性（引用 100 / 可寻址 106） | 通过 |
| 小程序事件绑定一致性（绑定 26 / 页面方法 112） | 通过 |
| 敏感信息扫描（82 个文件） | 无命中 |
| 云函数/网页调试输出残留 | 无 |

### 3.2 教师端离线行为自测（内存库 + `wx-server-sdk` 桩）：115/115

| 套件 | 覆盖 | 断言 |
| --- | --- | --- |
| `run.cjs` | `class.*` 全链路（建班／重复拒绝／跨校同名／教师隔离／403／NOT_FOUND／加人双写／跨名册拒绝／移出双清／重命名同步／停用保留与禁增删／`roster` 不变） | 34/34 |
| `run-purge.cjs` | 名册批量删除 + 白名单同步撤销 | 20/20 |
| `run-validate.cjs` | 录入校验、普通教师禁用批量删除、勾选与筛选取交集 | 19/19 |
| `run-merge.cjs` | 学生页录入的班级名与班级实体合并规则（含名称不匹配保持未分班） | 18/18 |
| `run-crossschool.cjs` | 跨校同学号 + 姓名判重、迁移前旧记录兜底 | 17/17 |
| `run-outside.cjs` | 未入册学生与白名单释放 | 7/7 |

### 3.3 布局专项：48 + 21 + 6 全通过

| 脚本 | 结果 |
| --- | --- |
| `layout-check.cjs` | 48/48；手机竖屏三种尺寸与适配前逐字段一致 |
| `pad-fit-check.cjs` | 21/21（7 设备 × 3 模式），横屏余量 44–58px |
| `phone-fit-check.cjs` | 6 种宽度折行与滑块宽度均符合预期 |

### 3.4 规则分层完整性

| 检查项 | 结果 |
| --- | --- |
| §1–§64 映射 | 64/64 全部出现，无缺失（映射表 70 行 = 64 条 + 6 条"保留在 AGENTS.md 原因"汇总行） |
| C1–C12 映射 | 12/12 |
| C1 与 §2 的优先级冲突 | 已消解：`AGENTS.md` §2 现行次序与 C1 完全一致 |

## 4. 未覆盖项（需真实环境确认，不以本轮结论代替）

1. **云端**：`classes` 集合是否已建、`students.class_id` 是否已写入、索引是否存在、`teacher` 云函数 action 是否可调用（`docs/test/TEST-002.md` §二）。
2. **真机/工具**：`AGENTS.md` §C11 回归底线四项（首页绘制、点/线/面切换与拖动、立体与切割显示、登录/注册）；PAD 与手机的最终观感。
3. 教师网页发布仓库 `maoyaqi1/hfjh-teacher-preview` 的当前内容是否与本仓库 `teacher-web/` 一致（GitHub Pages 约 10 分钟缓存，`index.html` 已加 `?v=20260911f`）。
4. 本项目没有自动化测试、测试框架与 CI（`AGENTS.md` §C11）；上表全部为静态检查与离线桩测试，**不等于真机验收**。

## 5. 冻结约束

1. 第 2 节的 19 个文件 + 3 个未跟踪目录视为**冻结**：改动需"用户明确要求 + 可复现问题"，且只动本工作线范围内的一层。
2. 不得顺手重构、重命名、格式化；不得改动 `pages/index/section-geometry.js`、`utils/geo.js`、`cloudfunctions/api/knowledge|prompts` 等冻结资产。
3. 教师端改动后**必须重新部署云函数**，网页端改动后必须同步预览仓库；未部署不算完成。
4. 小程序 UI 改动必须重跑 `full-check.cjs` 与三支布局脚本，并更新本记录哈希。
5. 禁止提交：`web-release/`、`docs/ai_teacher_reflections.txt`、`docs/qrcode.png`、`docs/产品海报.html`、`images/ai-avatar.png`、`.env*`、`project.private.config.json`（`AGENTS.md` §C7 D 级）。

## 6. 回滚

当前一切改动都在工作区。按工作线分别回滚（命令由用户执行，Agent 不代跑 `git checkout --` / `git reset`）：

```powershell
# W3 小程序 UI（12 个文件）
git -C G:\HFJH checkout -- app.json pages/index/index.json pages/index/index.js `
  pages/index/index.wxml pages/index/index.wxss pages/index/basic-solid.js `
  pages/ai/ai.wxss pages/login/login.wxss pages/register/register.wxss `
  pages/ruler/ruler.wxss pages/survey/survey.wxss pages/terms/terms.wxss

# W2 教师后台（6 个文件）
git -C G:\HFJH checkout -- cloudfunctions/teacher/index.js cloudfunctions/api/index.js `
  teacher-web/index.html teacher-web/js/app.js teacher-web/js/api.js teacher-web/css/style.css

# W1 规则分层
git -C G:\HFJH checkout -- AGENTS.md
Remove-Item docs\rules, docs\requirements, docs\test, .agent -Recurse
```

## 7. 版本落地建议（需用户授权后再执行）

本记录只是"文档层面"的冻结；要让版本真正落地（可追溯、可回退），建议按工作线分成 3 个提交，避免再把不同任务线混在一起：

```powershell
# W1 规则分层
git add AGENTS.md docs/rules .agent
git commit -m "docs(rules): AGENTS.md 分层为全局入口 + docs/rules 专题规则"

# W2 教师后台（REQ-002 第一阶段 + 后续维护功能）
git add cloudfunctions/teacher/index.js cloudfunctions/api/index.js `
  teacher-web/index.html teacher-web/js/app.js teacher-web/js/api.js teacher-web/css/style.css `
  docs/requirements docs/test
git commit -m "feat(teacher): 班级管理第一阶段与学生名册维护（REQ-002）"

# W3 小程序 UI + 本版本/UI 冻结记录
git add app.json pages/index/index.json pages/index/index.js pages/index/index.wxml `
  pages/index/index.wxss pages/index/basic-solid.js `
  pages/ai/ai.wxss pages/login/login.wxss pages/register/register.wxss `
  pages/ruler/ruler.wxss pages/survey/survey.wxss pages/terms/terms.wxss `
  docs/freeze-v0.7.0-2026-09-11.md docs/freeze-pad-ui-2026-09-11.md
git commit -m "feat(miniprogram): PAD/手机布局适配（旋转、左右分栏、一屏放下）"

git tag v0.7.0   # 可选：项目此前未使用 tag，版本以提交信息记录
```

提交前需要用户先定一件事：`docs/rules/AGENTS-pre-layering.snapshot.md`（54KB，迁移前校验副本）是否入库。
它不是规则权威来源，建议不入库或移到仓库外；上面的 `git add docs/rules` 会把它一起带上，需先排除。

上传云函数、同步教师网页预览仓库与 `git push` 由用户执行（`AGENTS.md` §C10：推送认证必须用户本人完成）。

## 8. 修订记录（冻结后）

| 日期 | 修订 | 影响文件 | 说明 |
| --- | --- | --- | --- |
| 2026-09-11 | 白名单校验收紧为「学号 + 姓名」两项都要对上 | `cloudfunctions/api/index.js`（`c8941dea73` → `c4412c9d09`，384 → 387 行） | 用户报告：学号相同、姓名不同的学生也能通过 AI 白名单。根因是 `isInRoster` 里对「迁移前只有学号、没有姓名的旧记录」做了**按学号兜底放行**（`set.legacy.has(sid)`），于是同一学号下的任何姓名都会放行。改为只认 `学号\|姓名` 精确匹配，去掉学号兜底。影响：无姓名的旧白名单记录不再放行，需先由超管调用教师端 `roster.backfill` 补齐姓名（教师端签发/撤销逻辑本就按「学号 + 姓名」，未改动）。复测：离线自测 34+20+19+18+21+7 = **119/119** 通过（新增 A7 同号不同名+无姓名旧记录仍不放行、A9/A10 补齐姓名后恢复放行）；静态整体测试 11/11。该文件属 `api` 云函数，**已于 2026-09-11 部署生效**（见 §9） |

## 9. 部署状态（用户确认，非本仓库可验证）

| 目标 | 版本（本仓库 blob） | 状态 |
| --- | --- | --- |
| `api` 云函数（学生端） | `c4412c9d09`（387 行，2026-09-11 15:50 本地版本） | **已部署**（2026-09-11 用户确认；即白名单收紧已生效） |
| `teacher` 云函数（教师端） | `93644a3618`（2168 行，12:40 本地版本） | 已部署（此前轮次用户确认） |
| 教师网页 `teacher-web/` | `app.js 9f5e1d1eed` / `index.html 3325767f00` | 已发布到预览仓库（此前用户确认；`index.html` 带 `?v=20260911f`） |
| 小程序端 | 见 §2 W3 哈希 | 需在微信开发者工具**重新编译**后验证（`app.json`/`index.json`/`index.wxml` 不吃热更新） |

> 部署状态无法由仓库内容证明，上表状态来自用户确认；修改上述任一文件后需重新部署/发布，并以 §4 的真机与云端核验项为准。
