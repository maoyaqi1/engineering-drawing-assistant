# scripts/ · 开发者只读检查

本目录是**开发者本机工具**，用来在微信开发者工具之外快速发现回归。它不参与小程序、云函数与教师网页的运行时，也不构成 CI。

## 一键运行

```powershell
node scripts/run-all.js          # 汇总全部检查；某步失败时打印该步完整输出
node scripts/run-all.js --full   # 打印每一步的完整输出
```

期望输出结尾：`合计 N 项，通过 N，失败 0`。退出码 0 = 全部通过，1 = 有失败项。

也可以单独运行：

```powershell
node scripts/geometry-test.js          # 几何真值回归（252 项断言）
node scripts/geometry-test.js --quiet  # 只打印失败项与备注
node scripts/section-projection-check.cjs  # 截交三视图可见性等价性守护（17 项）
node scripts/ai-knowledge-routing-check.cjs  # AI 教师知识点路由检查（126 项）
node scripts/integrity-check.js        # 静态接线检查
node scripts/full-check.cjs            # 全仓静态检查
node scripts/offline/run.cjs           # 单个离线云函数自测
```

## 检查清单

| 脚本 | 作用 | 是否只读 | 失败是否阻断 |
| --- | --- | --- | --- |
| `geometry-test.js` | `section-geometry.js`（截交几何真值）+ `basic-solid.js`（基本立体）的数值与拓扑基准 | 只读 | 是 |
| `section-projection-check.cjs` | 切割模式三视图「可见 / 隐藏棱」分类与改动前基准（blob `4ffcfd8874`）一致，且投影包围盒预筛仍在生效 | 只读 | 是 |
| `integrity-check.js` | `app.json` ↔ 页面文件、`index.wxml` ↔ 页面方法、客户端 action ↔ 云函数路由、打包忽略列表 | 只读 | 是 |
| `full-check.cjs` | 全仓 JS 语法、JSON、WXSS/WXML 配平、前后端接口一致性、DOM id、敏感信息、调试输出残留 | 只读 | 是 |
| `layout-check.cjs` | 首页 `getLayout` 与绘图内容是否放得下 | 只读 | 是 |
| `pad-fit-check.cjs` | 宽屏（PAD / 折叠屏展开）一屏是否放下（按样式表估算） | 只读 | 是 |
| `phone-fit-check.cjs` | 手机端参数面板折行估算 | 只读 | 否（仅报告） |
| `web-loader-check.cjs` | 网页版 `web/index.html` 的模块加载垫片与脚本顺序（模拟到 `pages/index/index.js`） | 只读 | 是 |
| `share-selfcheck.cjs` | 转发声明与 `onShareAppMessage` 行为 | 只读 | 是 |
| `ruler-removal-selfcheck.cjs` | v1.0.0 移除尺规作图后的残留扫描 | 只读 | 是 |
| `ai-knowledge-routing-check.cjs` | AI 教师知识文件与 `ai/knowledge.js` 知识点路由一致（含装配图 G06）、注入正文不超 `maxKnowledgeChars` | 只读 | 是 |
| `ai-teacher-contract-check.cjs` | AI 教师服务（千问侧）接口契约验收：§9 用例字段/长度/无 LaTeX、401/404、`matched=false` 降级 | 只读 | 需设 `QWEN_TEACHER_TOKEN`；未设时只跑负向检查 |
| `ai-answer-blind-eval.cjs` | AI 教师**回答质量盲评**：同一批问题，A（只用 16 篇）/ B（16 篇+讲稿片段）/ C（服务侧生成）三版回答打乱顺序，输出盲评页 | 只读 | 需 `DEEPSEEK_API_KEY` + `QWEN_TEACHER_*`；输出写到系统临时目录 |
| `offline/run*.cjs` | 云函数离线行为自测（内存桩，不打真实数据库） | 只读 | 是 |

## 离线云函数自测

`scripts/offline/` 下的用例通过 `wx-server-sdk` 内存桩（`scripts/offline/stub/wx-server-sdk/index.js`）直接调用 `cloudfunctions/teacher/index.js` 与 `cloudfunctions/api/index.js`，覆盖：

班级 CRUD 与权限、学生名册写入与归并、跨校同学号、账号唯一性、名单权威性、批量清理与按人清理、学号姓名校验等，合计 210 项断言。

```powershell
node scripts/offline/run.cjs        # class.* 权限/去重/双写/归档
node scripts/offline/run-datarest.cjs
```

**边界**：桩只实现本地自测用到的数据库能力，与真实云开发环境存在差异；改了云函数仍然必须**重新部署**后在真实环境验证（未部署不算验证，见 `AGENTS.md` C11 第 3 条）。

## 几何基准值怎么维护

`geometry-test.js` 里的 `SOLID_BASELINE` / `INTERSECT_BASELINE` / `LOOP_BASELINE` / `BUILT_SOLID_BASELINE` / `DEGENERATE_BASELINE` 是当前实现的实测基准值。

它们的作用是**锁住行为**：数值变化时脚本会失败并打印「期望 / 实际」。若改动确实是有意为之（并获得授权），逐项核对后再更新基准值，不要直接删除断言。

`C1 退化与边界情形` 一节只**记录**当前行为，其中「截平面与顶面完全共面时截交环退化」是已知限制，不是本目录要修的问题。

## 注意事项

1. **不要**把会改写源文件的生成器放进本目录：`wxss-wide.cjs` / `wxss-wide-all.cjs`（历史版本，用于生成宽屏样式块并 `writeFileSync` 回源文件）故意未纳入，避免被误当作检查脚本运行。其中 `wxss-wide-all.cjs` 还引用了 v1.0.0 已删除的 `pages/ruler/ruler.wxss`，已失效。
2. `full-check.cjs` 第 9 项与 `integrity-check.js` 第 2 项都按 `pages/index/*.js` **全目录**查找首页方法定义（`index.js` 已于 2026-09-13 拆分为 `constants.js` / `presets.js` / `session.js` / `math-utils.js` / `projection.js` / `touch.js` / `draw-helpers.js` / `render-scene.js` / `section-math.js` / `section-render.js` / `solid-projection.js` / `ui-handlers.js`，见 `docs/refactor-2026-09-13-index-split.md`）。
   `integrity-check.js` 第 5 节进一步用桩加载首页 Page 对象，核对 `index.wxml` 的绑定与 `this.xxx()` 调用在**运行期**都能解析到方法。
3. `scripts/` 已在 `project.config.json` 的 `packOptions.ignore` 中排除，不会进入小程序主包，`integrity-check.js` 会校验这一点。
4. 本目录的检查**不替代**真机/模拟器回归，也不替代云函数部署后的真实验证（`AGENTS.md` C11、`docs/rules/testing.md` §49）。
5. `pages/index/` 下的模块文件外层各有一层 IIFE（`(function () { … })();`）：网页版是用 `<script src>` 直接打开的，没有 IIFE 时多个文件的同名顶层 `const` 会在同一个全局作用域里冲突。删除这两行会让网页版直接报错，`web-loader-check.cjs` 会拦住。

## 截交三视图等价性怎么维护

`section-projection-check.cjs` 内嵌了 2026-09-15 性能冻结**之前**的 `isProjectionEdgeVisible`（提交 `734feb9` · blob `4ffcfd8874`），用来证明「投影包围盒预筛」只改速度、不改三视图结论。

它锁的是**分类**（每条棱可见 / 隐藏），不是像素：

1. 若有意改动可见性判定算法（例如换成按面的朝向分类），先确认 `docs/freeze-section-projection-2026-09-15.md` 的冻结约束，再更新内嵌基准——不要在未核对的情况下删断言。
2. 若只是重构 `getProjectionLineSets` 的写法，本脚本必须保持全绿；第 2 节还会检查预筛是否真的在生效，防止「等价但退化回慢实现」。
3. 第 1 节只覆盖平面切割立体（F3）：`drawSolidProjection` 目前仅由 `drawSectionProjectionOverlay` 调用；基本立体（F4）走 `basic-solid.js` 自己的 `edgeStyle`，不在本脚本范围内。

## 相关规则

- `AGENTS.md` C3（允许开发者使用独立静态分析工具，运行时不得依赖）、C7（新增文件与目录属 A 级）、C10、C11（本项目没有自动化测试/CI）
- `docs/rules/testing.md` §49–§55（验证层次、截面测试基准、测试数据原则）
- `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md`（F2 截交几何、F4 基本立体的改动要求）
- `docs/freeze-v1.0.0-2026-09-11.md` §10（修改冻结文件后应重跑的检查）
