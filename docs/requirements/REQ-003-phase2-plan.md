# REQ-003 第二阶段实施方案：切鉴权判定源（students）+ 权限收窄 + roster 下线

> 依据：`docs/requirements/REQ-003.md`（需求定稿）§16-7 G2「先上线标记与回填 + 报表三条线，再切换鉴权判定源」（第一阶段已完成，见 `REQ-003-phase1-plan.md`）。
> 授权：用户 2026-09-14 明确「进行第二阶段」。涉及 C 级冻结模块 `cloudfunctions/api`（F5）与 `pages/index`（F1/F3/F4）的改动**仅限本方案列举的最小面**，不动几何真值。
> 状态：**实施中（2026-09-14）**，验证结果与部署清单见 §9。

## 1. 阶段目标与非目标

**目标（全部来自 REQ-003 的 R3–R9、R14、R15、R17、R19–R24、R30–R32、D1–D23）**

1. 学生端 AI 放行判定源从 `roster` 改为 `students`，并读取 `classes` 判班级状态。
2. 拒绝原因扩展为四类：`no_profile` / `not_in_roster` / `class_archived` / `no_class`；读库失败 fail closed。
3. `roster` 集合与写入通道下线（保留 `roster.status` action 名）；`roster` 为空的现状使下线对数据零影响。
4. 超管权限收窄：不得修改教师业务数据（名册 / 备注 / 班级成员 / 编辑班级），只能只读查看 + 治理动作（建停教师账号、演示班标记、打标回填、收编、恢复停用班）。
5. 停用教师前置校验（名下无 active 班）；恢复班级时若负责人已停用则拒绝。
6. 未入册列表含未注册游客并可筛选；收编写目标班负责教师（A4）且本期不支持跨教师（D23）。
7. 会话与事件写入 access 快照（写入后永不更新）。
8. 问卷邀请与提交均限「已注册学生」= **名册命中**（不受班级停用影响，见 §8-4）；未登录拦截覆盖 `index` / `ai` / `survey`，`terms` 保持匿名。

**非目标**

- 不动几何真值（`section-geometry.js`、`basic-solid.js`）、教学资产（`knowledge/`、`prompts/`）、`web/`。
- 不做班级移交、学生跨教师转班、拆环境、`schools` 实体、`students.status`。
- 不做库级唯一索引（先业务层唯一）。
- 不改微信登录/注册流程本身（仅新增字段写入与文案）。

## 2. 鉴权模型（唯一入口）

```text
resolveAccess(user) →
  ⓪ 测试账号（is_internal 或 data_quality='test'）        → student / ok（test_account=true；不计入学情，D24）
  ① 未填齐 姓名 + 学号                      → guest / no_profile
  ② 按「规范化学号」按键查询 students，比对规范化姓名
       查询抛错（读库失败）                  → guest / check_failed（fail closed，可重试）
       未命中                                → guest / not_in_roster
  ③ 命中名册：
       is_internal（openid ∈ INTERNAL_OPENIDS）→ student / ok（跳过班级检查，D21）
       class_id 为空                          → guest / no_class
       classes 读取抛错                        → guest / check_failed（fail closed，R5）
       班级文档不存在                          → guest / no_class
       班级 status !== 'active'              → guest / class_archived
       否则                                    → student / ok
```

- 测试账号（`is_internal` 或人工标 `test`）**全功能开放**、不设名册 / 班级门槛：这些使用靠报表分线排除，
  而不是靠拒绝访问（2026-09-14 决策 D24，覆盖原 A1-补）；非测试账号判定不变。
  **标记 `test` 属超管专属**（`data.markQuality` / `data.backfillQuality` 仅超管；教师端 403，学生端无法自封）。
- 匹配键恒为「学号 + 姓名」，学校不参与；**禁止**学号-only 放行。
- 规范化（两端一致，必须同时改）：学号 = trim + 去内部空白 + 全角转半角，**大小写敏感**；姓名 = trim + 压缩连续空白。
- 判定**不缓存**，每次 AI action 实时重算（R8）；只有名册命中后才读班级（少一次往返）。
- 按键查询上限 2000（B6）：`students.where({ student_no }).limit(2000)`；不把全表读当常态。

### 2.1 服务端返回（`roster.status`，R9）

| 字段 | 说明 |
| --- | --- |
| `ok` | 接口是否成功 |
| `registered` | 兼容字段 = 是否已填齐姓名 + 学号 |
| `profile_completed` | `users.profile_completed` |
| `level` | `student` / `guest` |
| `reason` | `ok` / `no_profile` / `not_in_roster` / `class_archived` / `no_class` / `check_failed` |
| `in_roster` | 名册是否命中（与 level 不必然一致：`class_archived` 时 `in_roster=true`） |
| `is_internal` | 是否为内部测试账号（只读展示） |
| `test_account` / `bypass` | 是否测试账号 / 放行来源（`internal` / `test`）——前端据此提示"本次使用不计入真实学情" |
| `student_id` / `name` / `class_name` | 回显，便于学生对照（R7） |
| `admin` | 兼容字段（`ADMIN_OPENIDS`） |

### 2.2 AI 拒绝码（`accessDeniedResult`）

| reason | code | 文案要点 |
| --- | --- | --- |
| `no_profile` | `NO_PROFILE` | 请先填写学校、姓名和学号 |
| `not_in_roster` | `NOT_IN_ROSTER` | 老师还没把你的「姓名 + 学号」录入名册 |
| `class_archived` | `CLASS_ARCHIVED` | 班级已停用，请联系老师恢复；互动不受影响 |
| `no_class` | `NO_CLASS` | 还没被分到班级，请联系老师 |
| `check_failed` | `ACCESS_CHECK_FAILED` | 系统繁忙，请稍后重试（不得误报「不在名册」） |

## 3. 数据模型变更

| 集合 | 字段 | 写入方 | 说明 |
| --- | --- | --- | --- |
| `users` | `is_internal` | 学生端登录/注册（环境变量强制覆盖，D22） | 只由 `INTERNAL_OPENIDS` 决定；鉴权时**实时按环境变量重算**，不依赖该字段（避免副本漂移） |
| `users` | `data_quality` / `data_quality_source` | 新账号在注册时写 `auto`；`data.markQuality` 写 `manual` | 新账号：T0（2026-09-09，北京时间）之后注册 = `production`，之前 = `unknown`；人工结果不被自动覆盖 |
| `learning_sessions` | `access_level` / `access_reason` / `in_roster` / `is_internal` | `session.start` | 会话开始时刻快照 |
| `learning_records` | 同上 | `record.event` | 事件发生时刻快照 |
| `classes` | （读）`status` / `is_demo` | — | 鉴权只读 `status`；`is_demo` 只影响报表分线（B2） |

快照边界（B3/R30）：**写入后永不随后续状态变化更新**，禁止历史回填修正。

## 4. 实施步骤与涉及文件

| 步骤 | 内容 | 文件 | 级别 |
| --- | --- | --- | --- |
| S1 | `resolveAccess` 改读 `students` + `classes`；四态与四种原因；fail closed；`users.is_internal`/`data_quality` 写入；按键查询与上限 | `cloudfunctions/api/index.js` | C（F5，已授权） |
| S2 | `roster` 下线：删 `roster.import` / `roster.list` / `roster.remove` / `roster.clear` 与 `loadRosterSet`；`roster.status` 扩展四态 | `cloudfunctions/api/index.js` | C（F5，已授权） |
| S3 | 会话 / 事件 access 快照；问卷门槛（邀请 + 提交） | `cloudfunctions/api/index.js` | C（F5，已授权） |
| S4 | 规范化学号（全角转半角）+ 姓名压缩空白；删 `grantAiAccess` / `revokeAiAccess` 与 6 处调用；删 `roster.backfill`（白名单补名） | `cloudfunctions/teacher/index.js` | A |
| S5 | 超管收窄：名册 / 备注 / 班级成员 / 班级编辑 = 仅负责人；超管保留只读查看 + 恢复停用班（R15） | `cloudfunctions/teacher/index.js` | A |
| S6 | 治理类 action 下线（`data.reset` / `data.emptyAccounts` / `data.legacyRoster`）；停用教师前置校验（R17）；恢复班级负责人校验（B1）；未入册列表含未注册游客 + 筛选（D7）；收编写目标班负责人 + 审计（A4/R20） | `cloudfunctions/teacher/index.js` | A |
| S7 | 首页登录校验放宽为「仅需登录」（未注册游客可互动，D17/§3）；AI 页登录校验 + 四态文案；问卷页登录校验；清理未使用接口 | `pages/index/session.js`、`pages/ai/ai.js`、`pages/survey/survey.js`、`utils/api.js` | C（F1/F3/F4 仅登录校验）/ B |
| S8 | 教师后台：未入册筛选与收编入口、超管只读提示、停用教师前置提示、班级停用/恢复按钮权限 | `teacher-web/js/app.js`、`teacher-web/js/api.js`、`teacher-web/index.html` | A |
| S9 | 离线用例 `scripts/offline/run-access2.cjs`（四态 / fail closed / internal 豁免 / 快照 / 问卷 / 权限收窄 / 收编负向 / roster 零引用） | `scripts/offline/` | A |
| S10 | 文档同步：用户与鉴权模型、REQ-003 §10 文件清单与状态 | `docs/` | A |

## 5. 权限矩阵落地位点（超管只读）

| 位点 | 现状 | 目标 |
| --- | --- | --- |
| `student.update` / `student.delete` | `!isSuper && owner!==me` | 仅 `owner===me`（超管 403） |
| `note.add` / `note.delete` | 同上 / 同上 | 仅本人（超管 403） |
| `class.update` | `canManageClass`（超管放行） | 仅 `owner===me` |
| `class.members.add` / `remove` / `syncMembers` | `canManageClass` | 仅 `owner===me` |
| `class.archive` | `canManageClass` | 停用：仅负责人；**恢复：负责人或超管（R15）** |
| `class.list` / `class.detail` / `student.list` / `learning.*` / `ai.questions` | 只读 | 保持（超管全局只读） |

负向用例（验收 8）：超管对别班名册 / 备注 / 成员的写操作返回 403，且不产生写入。

## 6. `roster` 下线顺序（C1，不可颠倒）

1. 部署新代码（`api` + `teacher`）→ 确认线上不再读 `roster`。
2. 仓库侧零引用核对（`rg "'roster'"` 只剩 `roster.status` action 名与注释）。
3. 最后删除 `roster` 集合（当前为空，删除零风险）。

顺序反了会命中旧版 `loadRosterSet()`（无 try/catch）→ 学生提问直接 `SERVER_ERROR`。

## 7. 回归与验收（对应 REQ-003 §14 的 1–23 条）

- 离线用例：`node scripts/offline/run-access2.cjs`；全量：`node scripts/run-all.js`。
- 冻结模块回归（C11 四条底线）：首页可开、点/线/面切换与拖动、立体与切割显示、登录注册流程。
- 数据基线核对：以 2026-09-13 导出验证「四态分布」与「三条线求和 = 总用户数」。
- 部署后必做：`api` 重新部署（否则判定源仍是旧代码）；小程序重新上传；`teacher` 重新部署；教师网页重新发布。

## 8. 风险与已知代价

1. `api` 首次依赖 `classes`：读取失败 fail closed（可重试文案），会造成真实学生临时无法提问（R5）。
2. 切换当天「在册学情」为 0（两个新生班尚未注册、教师组为演示班）属预期现象，不得按故障处理（§12-7）。
3. 跨校同姓名 + 同学号误匹配：本期不引入学校参与匹配（B5）。
4. **问卷门槛口径已定**：判定用 `in_roster`（名册命中），**不看班级状态**——依据 D3「停用班只关 AI、互动可用」，问卷属学习反馈，停用班学生仍可提交；邀请（`statistics.can_invite`）与提交（`survey.submit`）共用这一道门槛。若希望改成与 AI 同口径（名册命中且班级 `active`），是 1 行改动。
5. 未注册游客可进入首页互动（D17 明确要求）；这与发布版「未注册即跳注册页」的行为不同，属于产品漏斗的既有决策，不是回归缺陷。

## 9. 实施记录（2026-09-14）

### 9.1 改动文件

| 文件 | 改动 |
| --- | --- |
| `cloudfunctions/api/index.js` | `resolveAccess` 改读 `students`（按键查询 + 上限 2000）+ `classes`（四态与四种原因、读失败 fail closed）；`toHalfWidth` / `normalizeStudentId` / `normalizeName`；`is_internal` 豁免班级检查；`RETIRED_ACTIONS`（roster 写入口下线）；`roster.status` 扩展；`session.start` / `record.event` 写 access 快照；`statistics` / `survey.submit` 增加在册学生门槛；`ensureUser` 写 `is_internal`（登录强制覆盖）与 `data_quality` |
| `cloudfunctions/teacher/index.js` | 学号/姓名规范化（全角转半角、压缩空白）；删除 `grantAiAccess` / `revokeAiAccess` 与 6 处调用；删除 `roster.backfill` / `data.legacyRoster` / `data.emptyAccounts` / `data.reset` / `student.purge` 与其函数体，改用 `RETIRED_ACTIONS` 明确回 `ACTION_RETIRED`；`requireOwnClass`（超管对班级只读，唯一例外是恢复已停用班）；`student.update/delete`、`note.add/delete` 改为仅归属教师本人；`updateTeacher` 停用前校验无 `active` 班（R17）；`archiveClass` 恢复前校验负责人在职（B1）；未入册列表含未注册游客 + `profile` 筛选 + 排除 internal（D7/假设 1）；`adoptStudent` 重写（教师手动收编本班 / 超管按账号收编到指定班、owner 写目标班负责人、写审计） |
| `teacher-web/js/api.js` | 下线 `resetData` / `legacyRosterCleanup` / `emptyAccountsCleanup` / `purgeStudents` 包装 |
| `teacher-web/js/app.js` | 删除整表清理 / 旧白名单清理 / 空账号清理三处入口与实现；新增 `canWriteClass` / `myTeacherId` 与超管只读提示（班级列表、班级详情、名册行操作、教师备注）；未入册页改「未入册用户」（身份筛选 + 收编到班级）；相关文案去掉白名单表述 |
| `teacher-web/index.html` | 静态资源版本号 `?v=20260914b`（避免浏览器缓存旧 JS） |
| `utils/api.js` | 删除 `rosterImport` / `rosterList` / `rosterRemove` / `rosterClear` |
| `pages/index/session.js` | 首页只校验登录（去掉"未注册即跳注册页"），未注册游客可互动（D17/§3） |
| `pages/ai/ai.js` | 登录校验；四态 + `check_failed` 文案；拒绝码映射；班级类原因不再引导去改资料 |
| `pages/survey/survey.js` | 登录校验；问卷门槛失败文案 |
| `scripts/offline/stub/wx-server-sdk/index.js` | 新增 `__fault(collection, on)` 故障注入（验证 fail closed） |
| `scripts/offline/run-access2.cjs` | 新增用例（四态 / fail closed / 测试账号全功能 / 快照（含 `access_test_account`） / 问卷 / 登录打标与"学生端不能自封测试号" / 静态约定），现为 44 项 |
| `scripts/offline/run-access.cjs` 等 8 个用例 | 按新契约改写（判定源 students、白名单下线、批量删除下线、超管只读、班级不变量） |
| `docs/用户与鉴权模型.md`、本文件 | 模型与实施记录同步 |

**追加改动（2026-09-14 当晚，用户决策 D24「测试账号 = 全功能开放、不计入学情」）**

| 文件 | 改动 |
| --- | --- |
| `cloudfunctions/api/index.js` | `resolveAccess` 增加第 ⓪ 步：`is_internal` 或 `data_quality='test'` → `student/ok`（`test_account=true`、`bypass=internal|test`），跳过名册与班级门槛；仍回报名册真实命中情况；问卷门槛统一为 `hasRosterRights()`（在册学生或测试账号）；`roster.status` 回传 `test_account` / `bypass` |
| `pages/ai/ai.js` | 测试账号在 AI 页显示"全功能开放、不计入真实学情"提示 |
| `scripts/offline/run-access2.cjs` | B 组用例改写为测试账号全功能（内部账号未分班 / 不在名册 / 无资料均可用；人工标 `test` 可用；未标记的普通游客仍被拒）；问卷门槛加测测试账号 |

### 9.2 验证结果

| 验证 | 方式 | 结果 |
| --- | --- | --- |
| 全量只读检查 | `node scripts/run-all.js` | **23 项全通过**（13 套离线用例 + 几何/接线/布局/网页加载等） |
| 第二阶段鉴权用例（含测试账号全功能 + 标 test 仅超管） | `node scripts/offline/run-access2.cjs` | **44/44** |
| 基础鉴权用例 | `node scripts/offline/run-access.cjs` | **24/24** |
| 权限收窄 / 批量删除下线 | `run-purge.cjs` 8/8、`run-retired.cjs` 12/12、`run-outside.cjs` 9/9 | 通过 |
| 班级不变量（R17 / B1 / 超管只读） | `run-classrestore.cjs` | **20/20** |
| 数据分线 + 标 test 仅超管（第一阶段不受影响） | `run-quality.cjs` | **41/41** |

尚未覆盖（需人工执行）：教师后台在浏览器里的实际渲染与交互（超管只读提示、未入册筛选与收编弹窗）、云函数部署后的真机验证、小程序真机回归。

### 9.3 部署清单（用户执行）

1. **`cloudfunctions/api`**：配置环境变量 `INTERNAL_OPENIDS`（与 `teacher` 用同一份名单，逗号分隔）→ 重新部署。**未部署则判定源仍是旧代码（仍读 roster）**。
2. **`cloudfunctions/teacher`**：重新部署（超管收窄、R17/B1 校验、未入册列表与新收编接口都在这里）。
3. **小程序**：重新编译上传（首页登录校验放宽、AI 页四态文案、问卷门槛）。
4. **教师网页**：重新发布（`?v=20260914b`）。
5. `roster` 集合删除：**先确认上面 1–4 已生效**（学生端提问正常、教师端无报错），再在云开发控制台删除空集合 `roster`。
6. 验收抽查：用五类账号各提问一次（未注册游客 / 已注册游客 / 在班学生 / 停用班学生 / 未分班学生），核对返回码；抽查一个 `is_internal` 账号在停用班里仍可提问。
