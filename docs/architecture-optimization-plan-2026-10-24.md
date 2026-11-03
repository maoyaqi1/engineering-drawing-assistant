# 架构优化方案（本轮不实施）

> 状态：方案待确认
> 适用代码：`v1.3.0` 之后的 2026-10-24 修复工作区
> 约束：保持原生小程序、原生教师网页、Canvas 2D、现有 action 与返回字段；不新增构建链或框架

## 1. 教师云函数

### 当前问题与证据

`cloudfunctions/teacher/index.js` 当前约 2,435 行，同时承担：

- 30 余个 action 的路由与返回结构；
- 登录、token、教师账号管理；
- 名册录入、导入、收编；
- 班级、成员与归档；
- 驾驶舱、学习记录、AI 分析；
- 数据分线、回填与按人清理；
- 分页、权限和部分数据访问。

`lib/runtime.js`、`lib/identity.js`、`lib/class-model.js` 已抽出部分基础设施，但业务服务仍集中在入口文件。文件行数只是症状，真正的问题是权限策略、业务编排和数据库访问在同一函数中交错，失败语义也容易在不同处理器中重复。

### 目标职责

```text
index.js
  → action 路由、请求形状校验、统一错误序列化

lib/auth-policy.js
  → 教师身份、超管/本人范围、写权限策略

services/teacher-account-service.js
services/roster-service.js
services/class-service.js
services/analytics-service.js
services/data-governance-service.js
  → 单个业务用例的编排、权限调用、事务/补偿边界

repositories/*-repository.js
  → collection 名称、查询、分页、字段映射

lib/runtime.js
  → 云 SDK、数据库句柄、token、加密、分页基础能力
```

依赖方向只能向下：

```text
index → services → repositories → runtime
```

服务层不得直接拼 `db.collection(...)`；仓储不得决定角色权限；入口不得复制业务规则。

### 迁移步骤

1. 建立 action 契约快照，记录每个 action 的输入、成功字段、错误码与权限矩阵；
2. 先抽只读 analytics 服务，保持返回 JSON 完全一致；
3. 抽 teacher-account 与 roster 服务；
4. 抽 class 服务，写操作按现有 `class.*` 边界逐个迁移；
5. 最后抽 data-governance，因它涉及删除和审计，必须先完成失败/重试测试；
6. 每批只移动一个业务域，入口保留旧 action 名，全部旧离线用例通过后再进入下一批。

### 必须保持

- 所有 action 名与成功返回字段；
- `teacher_sessions`、`owner_teacher_id` 权限语义；
- 超管对教师业务数据只读；
- `ai_messages` 结构；
- 分页完整性、失败不伪装空数据、班级成员部分成功语义。

### 回归

`run-all.js` 中全部教师离线用例；额外验证普通教师/超管矩阵、1000+ 记录、读取故障、单条写入故障、重试恢复、教师网页现有调用。

### 回滚

每批服务抽取独立改动、独立部署；入口保留可直接切回旧处理器的提交边界。发生故障时恢复上一版 `teacher` 云函数即可，数据库无需回滚。

## 2. 教师网页

### 当前问题与证据

`teacher-web/js/app.js` 当前约 2,563 行，集中包含会话、路由、导航、驾驶舱、名册、班级、弹窗、详情、数据治理和 DOM 模板。页面切换时多个异步请求没有统一代次控制，较早请求晚返回时可能覆盖当前页。

### 目标职责

```text
js/app.js                 → 启动与依赖装配
js/session.js             → token、教师信息、登录失效
js/router.js              → hash 路由、权限守卫、页面生命周期
js/ui/dom.js              → esc、元素查询、按钮状态
js/ui/feedback.js         → 空态、失败态、重试、提示
js/views/dashboard.js
js/views/students.js
js/views/classes.js
js/views/learning.js
js/views/ai.js
js/views/governance.js
js/modals/*.js            → 建班、成员、导入、收编等弹窗
```

每个 view 导出 `mount(container, context)` 和可选 `dispose()`；异步请求接收 `requestGeneration` 与 `AbortController.signal`。路由切换时递增代次并取消旧请求，只有当前代次允许写 DOM。

### 迁移步骤

1. 先抽 `dom.js`、`feedback.js` 和 `session.js`，只消除重复，不改页面行为；
2. 增加路由代次控制和请求取消，先让旧单体页面使用；
3. 抽驾驶舱 view，验证失败、空数据、partial 和重试；
4. 依次抽班级、名册、学习记录、AI 分析与治理；
5. 最后移除 `app.js` 中的旧页面实现。

### 必须保持

- HTML 控件 ID、hash 路由、教师可见菜单；
- `TeacherApi` action 与返回结构；
- 登录失效清理逻辑；
- 现有弹窗操作和错误提示。

### 回归

普通教师/超管登录、全部路由、网络失败、快速切换路由、旧请求晚返回、空数据、partial、弹窗提交与重试；发布预览仓后做真实浏览器验证。

### 回滚

每个 view 抽取前保留单体实现；通过路由装配点切换，不需要回滚 HTML 或云函数。教师网页发布使用独立预览仓，可回退到上一发布提交。

## 3. 首页模块

### 当前问题与证据

`pages/index/index.js` 现在只有约 104 行，主要保留 data、生命周期和 `Object.assign` 装配；行数已不再是主要问题。现存问题是：

- `presets`、`session`、`projection`、`touch`、`renderScene`、`uiHandlers` 等模块都通过页面 `this` 隐式调用彼此方法；
- `Object.assign` 静默覆盖同名键；
- 纯计算与页面协调方法仍需要人工辨认依赖。

### 目标职责

- 纯函数模块只接收显式输入并返回数据，不读取 Page 实例；
- 页面协调模块只组合纯函数、更新 `this.data` 与调度重绘；
- 绘制模块只读领域状态；
- 装配层显式列出模块名，并在运行时检测重复方法。

### 方法重名检测

计划新增装配辅助：

```text
composePageModules(base, namedModules)
```

它逐个枚举 `Object.keys(module)`，若同一方法出现两次则抛错并列出方法名和两个模块名；只允许显式白名单覆盖（例如投影页的 `drawScene` 被 `unfold` 覆盖，必须在白名单中说明原因）。

另增静态检查：加载每个模块，列出导出键，在 Node 中构建装配结果；发现未声明覆盖即失败。

### 迁移步骤

1. 生成当前模块导出与方法调用图；
2. 先加入装配重名检测，不改变模块行为；
3. 把已确认无状态依赖的数学函数抽为显式参数纯函数；
4. 按“点线面 / 立体 / 截交 / 渲染”逐域消除跨模块 `this` 调用；
5. 每次只迁移一个域，并运行几何、截交、布局和网页版加载检查。

### 必须保持

- WXML 事件名和 Page 方法名；
- 几何真值、投影公式、截交算法；
- Canvas 生命周期、拖动节流、滚动锁定；
- 浏览器版 CommonJS 垫片加载顺序。

### 回归

`geometry-test`、`section-projection-check`、`integrity-check`、`web-loader-check`、首页布局检查，以及真机点线面拖动、六种立体、六种截交、投影体系。

### 回滚

装配检测与纯函数抽取分开提交；恢复旧 `Object.assign` 列表即可回退装配层。几何算法和领域数据不参与该迁移。

## 4. 几何容差可解释性

### 当前问题与证据

当前容差按不同语义分散为 `1e-8`、`1e-7`、`1e-6`、`1e-5`、`1e-4`、`0.02` 等，作用域包括：

- 模型去重和共面判定；
- 截交环连接；
- 重心坐标松弛；
- 屏幕包围盒预筛；
- 深度遮挡比较。

这些数值服务于不同单位和误差来源，不能统一替换为一个常量。

### 命名建议

| 建议名称 | 单位 | 作用域 |
| --- | --- | --- |
| `MODEL_POINT_EPSILON` | 教学模型单位 | 点去重、向量零长度 |
| `SECTION_LOOP_MERGE_EPSILON` | 教学模型单位 | 截交环端点连接 |
| `BARYCENTRIC_RELAXATION` | 无量纲 | 点在三角形内的中心坐标松弛 |
| `VIEW_DEPTH_TOLERANCE` | 视图深度单位 | 遮挡比较 |
| `VIEW_BBOX_TOLERANCE_PX` | 逻辑像素 | 三视图三角形包围盒预筛 |

### 整理步骤

1. 建立“名称 - 数值 - 单位 - 使用函数 - 允许变化条件”清单；
2. 只在同一语义、同一模块内改名，不改变数值；
3. 容差定义靠近其领域模块，禁止跨模型和屏幕空间复用；
4. 注释说明误差来源与为什么不能统一；
5. 逐个替换并运行几何与截交基准。

### 必须保持

- 所有现有容差数值保持不变；
- 投影公式、截交算法、退化判定与可见性结论保持不变；
- `section-projection-check` 锁定的屏幕包围盒容忍量和深度比较语义保持不变；
- 外部 Page 方法、WXML 事件和输出数据不变。

### 回归

`geometry-test.js`、`section-projection-check.cjs`、`full-check.cjs`、`integrity-check.js`，以及六种立体截交、投影体系 0°/中间/90° 和真机拖动。

### 回滚

容差命名按模块逐个提交；每个模块可独立恢复原常量名与引用。若任何数值或判定基准变化，该次改动必须回退，而不是更新测试期望。

这不是本轮实施项；任何数值调整都需单独重现问题并重新冻结证据。
