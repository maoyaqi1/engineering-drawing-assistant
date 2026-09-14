# REQ-003 第一阶段实施方案：数据标记 + 回填 + 报表三条线

> 依据：`docs/requirements/REQ-003.md`（需求定稿）§18 G2「先上线标记与回填 + 报表三条线，再切换鉴权判定源」。
> 范围：**只动 `cloudfunctions/teacher`（A 级探索模块）与 `teacher-web/`（A 级）**；`cloudfunctions/api`（F5 冻结）、`pages/*`、`roster` 集合、鉴权判定一律不动。
> 状态：**已实施（2026-09-14）**，验证结果与部署清单见 §16。

## 16. 实施记录（2026-09-14）

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `cloudfunctions/teacher/index.js` | ① `INTERNAL_OPENIDS` 环境变量；② `publicClass` 暴露 `is_demo`；③ `class.update` 支持 `is_demo`（仅超管）；④ 线归属函数 `buildLineIndex` / `lineOfRecord` / `isExcludedLine`；⑤ 新 action `data.backfillQuality` / `data.markQuality`（均仅超管、写审计）；⑥ `dashboard` 口径改造（三条线 + 演示班排除 + 班级按 `class_id` 分组 + 教师范围过滤 + 排除计数）；⑦ `learning.list` / `ai.questions` 默认只保留 `student` 线并回报排除数；⑧ 未入册列表回传 `data_quality` |
| `teacher-web/js/app.js` | 驾驶舱「数据分线 · 本范围/全局」卡片与口径说明；班级概况提示（演示班排除、未关联班级的提示）；班级列表「（演示班）」标记；班级详情「标记/取消演示班」按钮（仅超管）；未入册页「数据质量」列 + 「一键回填数据标记…」 |
| `teacher-web/js/api.js` | 新增 `markQuality` / `backfillQuality` |
| `scripts/offline/run-quality.cjs` | 新增 39 项离线用例 |

### 验证结果

| 验证 | 方式 | 结果 |
| --- | --- | --- |
| 新用例 | `node scripts/offline/run-quality.cjs` | **39/39 通过** |
| 全量回归 | `node scripts/run-all.js` | **22 项通过**（含既有 210 项离线用例） |
| 现网数据基线 | 用 2026-09-13 导出灌入离线桩，跑 dashboard + 回填 dry-run | 三条线 `student 0 / guest 66 / test 7`（合计 73）；回填 `pending 66 = test 3 + unknown 1 + production 62`、internal 跳过 7；班级概况 `26机械①②(75) / 26机械③④(75) / 教师组(3) / 未分班(3)`；标记教师组为演示班后 → `roster_total 153`、`demo_roster 3`、班级概况不再含教师组 |
| 现网端到端验收 | 同一份导出，跑完整流程：dashboard → 标记演示班 → 回填（dry-run / commit / 幂等）→ 人工标记 → 学习记录 / AI 分析 | **28/28 通过**（含三条线求和 = 73、名册三口径自洽 156=6+150、打标分布 test 3 / unknown 1 / production 62 / internal 未标记 7、人工标记不被覆盖、教师范围与排除计数） |

**尚未覆盖（需人工执行）**：教师后台在浏览器里的实际渲染与交互（三线卡片、演示班徽标与按钮、数据标记下拉、回填确认框）——本环境无法打开 `file://` 页面，需部署后在浏览器点一遍；以及云函数部署到真实环境后的验证。

实施过程中发现并修掉两个真实缺陷：

1. 驾驶舱活动统计最初写成"排除测试/演示"，导致**游客数据混入学情**；已改为只统计 `student` 线（会话/AI 均给出 `*_test` 与 `*_guest` 拆分计数）。
2. `ai_messages` 不含 `openid`，最初直接按消息归线导致 **AI 统计恒为 0**（教师范围过滤也会失效）；已改为经 `ai_conversations` 关联到人。
3. 班级概况最初仍按 `class_name` 分组，现网出现两行「教师组」（3 人 + 2 人）；已改为**只按 `class_id` 归属**，未关联的合并进「未分班」并保留 `class_legacy_names` 提示。
4. `unregistered_count` 最初用"含演示班"的名册口径计算，导致标记演示班后与 `roster_total - registered_count` 不一致；已统一为排除演示班后的口径，并加断言（`roster_total = registered + unregistered`）。

### 部署清单（用户执行）

1. **给 `teacher` 云函数配置环境变量 `INTERNAL_OPENIDS`**（7 个内部账号的 openid，逗号分隔）——不配置则 `internal` 线为空（老师自测数据会落进 `demo`/`guest`）。
2. 重新部署 `cloudfunctions/teacher`（未部署不算完成）。
3. 重新发布 `teacher-web/`。
4. 在教师后台执行：**给「教师组」标记演示班** → 打开「未入册学生」页点「一键回填数据标记…」（先预览 66 条 → 确认）。
5. 验收：驾驶舱出现「数据分线」卡片（超管：student 0 / guest 66 / test 7；教师：本范围）；班级概况不再出现重复的「教师组」；「未分班」行显示提示"名册里写着「教师组」，未关联班级"。

### 已知限制

- `data_quality` 的新账号判定依赖"回填/人工"，登录时自动打标（R25）仍留待第二阶段（需 F5 授权）。
- 未入册列表仍只含"已注册游客"（含未注册游客属 D7/第二阶段）。
- 演示班排除只在报表口径生效；鉴权不受影响（第二阶段才引入 `class_archived` / `no_class`）。

## 1. 阶段目标与非目标

**目标**

1. 让"测试 / 演示 / 真实"三类数据在**报表口径**上分开（学情 / 游客漏斗 / 测试三条线互斥不漏）。
2. 让历史数据（现网 73 个账号）可被**幂等回填**打标，并可**人工纠正**。
3. 让班级维度可以标记"演示班"，从班级统计中排除。
4. 教师驾驶舱只看本范围；超管看全局 + 三条线。

**非目标（明确不做）**

- 不改鉴权判定源（不把 `resolveAccess` 改成读 `students`，不读 `classes`，不加 `class_archived` / `no_class`）。
- 不动 `roster` 集合与其接口。
- 不改超管权限边界（9 处 `isSuper` 放行点收窄、停用教师前置校验、收编 owner 修正等属第二阶段）。
- 不做未登录拦截、问卷门槛、会话/事件 access 快照（第二阶段）。
- 不物理删除任何数据。

## 2. 交付物总览

| 编号 | 交付物 | 落点 |
| --- | --- | --- |
| W1 | 字段：`classes.is_demo`；判定函数所需的 `users.data_quality` / `data_quality_source`（`is_internal` 不落库判定，见 §4） | `cloudfunctions/teacher/index.js` |
| W2 | **线归属判定函数**（单一实现，实时计算） | `cloudfunctions/teacher/index.js` |
| W3 | **幂等回填任务** `data.backfillQuality`（dry-run / confirm / 可重跑 / 写审计） | 同上 |
| W4 | **人工改标记** `data.markQuality`（仅超管，写审计，只改 `data_quality`） | 同上 |
| W5 | **演示班标记**：扩展 `class.update` 支持 `is_demo`（仅超管可改）+ `publicClass` 暴露该字段 | 同上 |
| W6 | **报表口径改造**：驾驶舱三条线、名册/班级排除演示班、教师范围过滤、学习记录与 AI 分析排除测试数据 | 同上 |
| W7 | **教师后台 UI**：演示班徽标与勾选、数据标记列与批量操作、三条线卡片与口径说明 | `teacher-web/js/app.js`、`teacher-web/index.html` |
| W8 | **离线用例** `scripts/offline/run-quality.cjs`（判定优先级、回填幂等、人工不被覆盖、demo 排除、三条线求和、权限校验） | `scripts/offline/` |

## 3. 数据模型（字段级）

| 集合 | 字段 | 类型 / 取值 | 写入方 | 说明 |
| --- | --- | --- | --- | --- |
| `classes` | `is_demo` | boolean，缺省视为 `false` | 仅超管（`class.update`） | 演示/内部班标记；当前将用于「教师组」 |
| `users` | `data_quality` | `'production'` / `'test'` / `'unknown'`；缺省视为 `'unknown'` | 回填任务 / 超管人工 | **只承载结论**，报表判定不依赖它是否存在 |
| `users` | `data_quality_source` | `'auto'` / `'manual'` | 同上 | `manual` 不被回填覆盖 |
| `users` | `is_internal` | boolean（**第二阶段才写入**，见 §15） | — | 第一阶段**不写**，`internal` 由环境变量实时判定 |

**兼容性**：三个字段均为新增、可空；旧数据无需迁移即可上线（缺省值语义见上表）；旧版云函数不读这些字段，回滚无影响。

## 4. 线归属判定函数（单一实现）

```text
resolveLine(user, ctx) → 'internal' | 'demo' | 'test' | 'guest' | 'student'
  ① internal：user.openid ∈ INTERNAL_OPENIDS（环境变量，实时判定；D22 人工不可改）
  ② demo    ：user 命中的名册行 class_id → classes.is_demo === true
  ③ test    ：users.data_quality === 'test'（回填或人工结论）
  ④ guest   ：未命中名册（含未填资料者与名册外的已注册用户）
  ⑤ student ：命中名册且不属上述
```

- **优先级与 §8 一致**：`internal > demo > test > guest > student`；每个用户唯一归属，**三条线求和 = 总用户数**（现网基线 73）。
- **实时计算**：不把判定结果持久化到 users（避免重演 `roster` 式的"副本与源漂移"）；`data_quality` 只保存人工/回填结论。
- 判定结果同时用于：驾驶舱三条线、班级统计、学习记录与 AI 分析的默认排除。

## 5. 接口与 action

| action | 权限 | 入参 | 行为 | 审计 |
| --- | --- | --- | --- | --- |
| `data.backfillQuality`（新增） | 仅超管 | `dry_run`（默认 true）、`confirm_count` | 按规则给历史账号写 `data_quality` + `data_quality_source='auto'`；跳过 `manual`；**不动 `is_internal`**；幂等 | 写 `maintenance_logs` |
| `data.markQuality`（新增） | 仅超管 | `user_ids[]`、`quality`（`test` / `production` / `unknown`） | 写 `data_quality` + `source='manual'`；不改 `is_internal` | 写 `maintenance_logs` |
| `class.update`（扩展） | 负责教师可改班级信息；**`is_demo` 仅超管** | 现有字段 + `is_demo` | 教师传 `is_demo` → 403 | 现有留痕方式 |
| `dashboard`（扩展） | 现有鉴权 | — | 新增 `lines`、`scope`、`excluded` 字段（见 §6） | — |

接口返回约定：`data.backfillQuality` 返回 `{ ok, mode, categories, preview, hint }`；`data.markQuality` 返回 `{ ok, updated, skipped }`。

## 6. 报表口径改造位点（逐处）

`cloudfunctions/teacher/index.js` 的 `dashboard`（[第 307–440 行](G:/HFJH/cloudfunctions/teacher/index.js:307)）：

| 现有字段 | 改法 |
| --- | --- |
| `total_students`（= users 全部） | 保留总数，另加 `lines: { student, guest, test }`（按 §4 判定）；前端卡片改为三线并排 + 总数 |
| `roster_total` / `registered_count` / `unregistered_count` | **排除 `is_demo` 班级**后再计 |
| `classes[]`（现按 `class_name` 文本分组，[第 369–391 行](G:/HFJH/cloudfunctions/teacher/index.js:369)） | 改为**按 `class_id` 分组**（展示用 `classes.name`），并排除 `is_demo` 班级；修复"名册显示 5 人、班级成员 3 人"的误导 |
| `today_active_students` / `plp_today` / `plp_week` / `ai_today` / `ai_week` / `trend[]` / `module_distribution[]` / `ai_hot[]` | 只统计 **`student` 线**（排除 internal / demo / test / guest） |
| （新增）`scope` | `'me'` 或 `'all'`，供前端显示"本范围 / 全局" |
| （新增）`excluded` | 各线排除条数，供前端显示"已排除测试与演示数据 N 条" |

**教师范围过滤**：`dashboard` 现在完全不过滤（全局）。第一阶段改为——普通教师按 `visibleStudents(me)` 的 openid 集合过滤会话/事件/AI 数据；超管不加过滤（对应 D9）。注意这会让**教师端数字明显下降**（现网 73% 的会话来自内部账号）。

**学习记录页（`learning.list`）与 AI 分析页（`ai.questions`）**：列表与 summary 默认排除 internal / demo / test 的数据，并在 summary 里回传被排除条数；教师范围过滤保持现状（已经是自己名册范围）。

## 7. 教师后台 UI（`teacher-web/`）

1. **驾驶舱**：卡片区改为"总数 + 在册学情 / 游客 / 测试"三线；名册卡片下方加一行口径说明（"已排除测试与演示数据"）；顶部标注范围（本范围 / 全局）。
2. **班级概况表**：改为按班级实体列出（含"演示班"徽标），演示班默认隐藏或置灰；班级列显示 `classes.name`。
3. **班级列表 / 详情**：新增"演示"列；编辑弹窗加 `is_demo` 勾选（**仅超管可见**）。
4. **未入册学生页**（超管专属）：新增"数据标记"列（`production` / `test` / `unknown`）+ 批量标记按钮；范围与筛选保持现状（扩到未注册游客属第二阶段）。
5. **口径提示**：三线数字旁加 tooltip 说明（internal 名单来自环境变量；demo 来自班级标记；test 来自数据标记）。

## 8. 回填与人工标记流程

**回填（一次性，可重复）**

1. 超管执行 `data.backfillQuality`（dry-run）→ 预览按类别计数。**现网实测预期（脚本核过，合计 73）**：`internal` 跳过 7、`test` 3（`86804388` / `0000001` / `23210010119`）、`production` 62（T0 当天及之后注册的非 internal/test 账号，含 21 个已注册游客与 41 个未填资料账号）、`unknown` 1（T0 之前注册的 09-04 空账号）。
2. 核对条数 → 带 `dry_run: false` + `confirm_count` 执行。
3. 再次 dry-run 应显示 0 待处理（幂等证据）。

**人工标记**

- 超管在未入册页选中账号 → 选 `test`（或 `production`）→ 保存；该记录 `source='manual'`，后续回填不再覆盖。

**审计**：以上动作全部写 `maintenance_logs`（含操作人、条数、类别分布），可在控制台追溯。

## 9. 涉及文件 / 不涉及文件

**涉及**

- `cloudfunctions/teacher/index.js`（A 级）：字段、判定函数、两个新 action、dashboard 与列表口径
- `teacher-web/js/app.js`、`teacher-web/index.html`（A 级）：驾驶舱、班级、未入册页
- `scripts/offline/run-quality.cjs`（新增，A 级）：离线用例
- `docs/`（A 级）：本方案与实施记录

**不涉及**

- `cloudfunctions/api/**`（F5 冻结，含鉴权判定、问答、roster 相关实现）
- `pages/**`（小程序端一律不动）
- `pages/index/section-geometry.js`、`basic-solid.js`（F2/F4 几何真值）
- `cloudfunctions/api/knowledge|prompts`（F6/F7 教学资产）
- `web/`、`roster` 集合

## 10. 授权与部署边界

| 项 | 说明 |
| --- | --- |
| A（本方案主体） | `cloudfunctions/teacher` 与 `teacher-web` 属 C7 的 **A 级探索模块**（说明范围后可改）；本文件即范围说明，**开工前请你确认** |
| B（本方案**不含**） | 若要把"登录时自动打标"纳入第一阶段，需要改 `cloudfunctions/api` 的 `ensureUser`（**F5 冻结模块**，需单独授权）。本方案已**刻意规避**：判定实时计算，字段只存人工结论（见 §15） |
| C（部署） | 云函数需**重新部署**才生效；教师网页需**重新发布**；两者由你执行，我不 commit / push |

## 11. 风险与回归清单

| 风险 | 说明与应对 |
| --- | --- |
| 数字变化 | 教师端与超管面板数字会下降（排除测试/演示/游客 + 教师范围过滤）。上线前先记录基线（73 users / 134 sessions / 299 records），上线后逐项比对 |
| 教师看不到数据 | 若教师名下名册为空，其驾驶舱会近乎空白 → 前端加"本范围"说明，避免误判为故障 |
| 演示班排除过宽 | `is_demo` 只作用于报表与班级统计，不影响鉴权与名册；误标可一键取消 |
| 回填误标 | 只写 `data_quality`；人工可改且不被覆盖；写审计可追溯 |
| 回归底线 | 班级 CRUD、成员增减、名册导入、教师账号管理、学习记录与 AI 分析页面均需回归（`run-all` 现有 210 项离线用例必须保持全绿） |
| 性能 | 判定需读取 `users` + `students` + `classes`（现有 `fetchAll` 分页）；驾驶舱本就全量读取，量级不变 |

## 12. 验收步骤

**手动（部署后）**

1. 超管给「教师组」勾 `is_demo` → 班级概况不再列出教师组；名册人数不含其成员；该班学生活动不计入学情。
2. 超管执行 `data.backfillQuality` dry-run → 预览显示 `test` 3 条与其余分类；执行后再跑一次为 0 待处理（幂等）。
3. 超管在未入册页把某游客标为 `test` → 测试线 +1、游客线 −1；再次回填不改变该条。
4. 教师账号登录 → 驾驶舱仅显示本范围并标注"本范围"；超管登录 → 全局 + 三条线。
5. **三条线求和 = 总用户数**（现网 73）。
6. 学习记录 / AI 分析页默认不含 internal / demo / test 数据，并显示被排除条数。

**自动（本地离线）**

```powershell
node scripts/offline/run-quality.cjs   # 新增用例
node scripts/run-all.js                # 全量检查（含既有 210 项）
```

## 13. 实施顺序（每步可独立验证）

| 步骤 | 内容 | 验证 |
| --- | --- | --- |
| 1 | `classes.is_demo` + `class.update` 支持（超管限定）+ `publicClass` 暴露 | 离线用例：教师改 demo → 403；超管可改 |
| 2 | 线归属判定函数 | 离线用例：优先级、求和=总数 |
| 3 | `data.backfillQuality` + `data.markQuality` + 审计 | 离线用例：幂等、manual 不被覆盖、留痕 |
| 4 | `dashboard` 口径改造（三条线 / demo 排除 / 教师范围） | 离线用例 + 现网基线比对 |
| 5 | 学习记录 / AI 分析默认排除 + 计数 | 离线用例 |
| 6 | `teacher-web` UI（徽标、标记列、三线卡片、口径说明） | 手动验收（浏览器） |
| 7 | `run-quality.cjs` 补齐 + `run-all` 全绿 + 交付摘要 | 交付前自检 |

## 14. 回滚方案

- 代码：重新部署上一版 `teacher` 云函数 + 还原 `teacher-web`；标记字段（`is_demo` / `data_quality`）留在库里无害（旧代码不读）。
- 数据：回填只写 `data_quality`，可用 `data.markQuality` 逐条改回；不需要删除任何记录。
- 顺序：先回滚代码、再决定是否保留标记；**禁止**先删字段/集合。

## 15. 与 REQ-003 的一处差异（需你确认）

REQ-003 的 R25 写的是"**登录时写入** `is_internal` / `data_quality`"，属于 `cloudfunctions/api`（F5 冻结模块）的改动。本方案**刻意改为**：

- 线归属**实时判定**（环境变量 + 班级标记 + 人工结论），报表不依赖字段是否被写过；
- `is_internal` **第一阶段不落库**，第二阶段再按 R25 落地（那时与鉴权改造一并授权）；
- `data_quality` 第一阶段只由**回填 / 人工**写入。

好处：第一阶段**零冻结模块改动**，可独立上线与回滚；代价：未打标的新账号只能靠"实时规则"归线（`test` 判定依赖字段，因此新注册的测试账号需人工标记）。

如果你更希望"新注册账号自动带标记"在阶段一就生效，我就把它作为可选项 W9 加入，那时需要你对 `cloudfunctions/api` 的授权。
