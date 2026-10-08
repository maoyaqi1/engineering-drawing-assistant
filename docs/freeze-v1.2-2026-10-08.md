# 版本冻结记录 v1.2（投影体系模块）

> 状态：**已冻结**（主仓已提交并打附注 tag `v1.2.0`；**未推送**，推送由用户执行）
> 上一版本：`v1.1.0`（2026-09-25，tag `v1.1.0`，基线提交 `03df1bf`）
> 本次改动：新增**投影体系**独立页面（三投影面体系、八分角/第一分角、投影面展开、空间旋转观察）+ 首页工具条入口
> 上级规则：`AGENTS.md` C1（用户明确要求优先）、C7/C8（冻结模块与开工前确认）、C10（提交与推送）、C11（本项目无自动化测试，改后必真机验证）、C12/§62（交付摘要）
> 修订（2026-10-08，tag `v1.2.0` 之后单独提交）：§9 第 4 条按**用户裁决**记录配色结论；`AGENTS.md` C1 的已知滞后点第 1 条与 C4 目录表的页面清单同步为 8 页（新增 `pages/projection/`、补记 `pages/video/`、更正已移除的 `pages/ruler/`）。

---

## 1. 版本定位

面向大学「画法几何」课程的**投影面体系**教学模块：把"三个互相垂直的投影面 → 空间点与三个投影 → 投影面展开成三视图"这一条主线做成可操作页面，并支持八分角观察与空间旋转。

形态：**独立新增页面** `pages/projection/`，只**只读复用** `pages/index/` 的既有模块（布局 `projection.js`、绘图原语 `draw-helpers.js`、画布生命周期 `render-scene.js`、学习埋点 `session.js`、常量 `constants.js`），不复制投影公式、不改动这些模块。

---

## 2. 改动清单

| 文件 | 性质 | blob（前 10 位） | 行数 |
| --- | --- | --- | --- |
| `pages/projection/projection.js` | 新增（页面） | `36d8c21af1` | 63 |
| `pages/projection/unfold.js` | 新增（展开数学 + 绘制 + 交互） | `9630ea0533` | 706 |
| `pages/projection/projection.wxml` | 新增 | `feb6f4923a` | 74 |
| `pages/projection/projection.wxss` | 新增 | `0406d2f38a` | 138 |
| `pages/projection/projection.json` | 新增 | `4b58455770` | 5 |
| `app.json` | B 级：注册 `pages/projection/projection` | `ab5e442ebb` | 23 |
| `pages/index/index.wxml` | **C 级冻结模块**：工具条加入口 + 位置调整 | `31f93e85d9` | 261 |
| `scripts/geometry-test.js` | 开发者只读检查：新增「D. 投影体系」一节 | `0e3be8ae7d` | 650 |
| `README.md` | 功能清单补一行 | `12b8cc2fab` | 57 |
| `docs/交接说明.md` | §3 目录职责、§8 teacher action 同步、§11 功能清单 | `1bbbad94b8` | 247 |

核对命令：

```powershell
git -C G:\HFJH hash-object app.json pages/index/index.wxml pages/projection/projection.js pages/projection/unfold.js `
  pages/projection/projection.wxml pages/projection/projection.wxss pages/projection/projection.json `
  scripts/geometry-test.js README.md "docs/交接说明.md"
```

---

## 3. 涉及冻结模块的改动与授权依据

| 模块 | 级别 | 改动 | 依据 |
| --- | --- | --- | --- |
| `pages/index/index.wxml` | C（F1 已真机验证的核心交互） | ① 工具条新增「投影体系」入口（复用既有 `.profile-entry` 样式类，**未改 `index.wxss`**）；② 2026-10-08 用户要求把「个人信息」放最左、投影体系居中，故两行入口互换顺序 | **用户明确要求**（2026-10-08 多次对话："放到第一页，为新增页面，其余不能动"、"个人信息放在最左侧，中间投影体系"）。改动仅为入口的顺序与新增，共 9 行，未触及点/线/面/立体/切割五个模式的任何分支 |
| `app.json` | B | 注册新页面 | B 级要求已说明（不注册无法编译该页） |

未改动：`pages/index/index.js`、`index.wxss`、`render-scene.js`、`ui-handlers.js`、`touch.js`、`section-*`、`basic-solid.js`、`pages/login`、`pages/register`、`utils/geo.js`、`cloudfunctions/**`、`teacher-web/**`、`web/**`。

---

## 4. 验证证据

### 4.1 开发者只读检查（本机，2026-10-08）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 全量只读检查 | `node scripts/run-all.js` | **27 项 27 通过** |
| 几何真值回归（含新增「D. 投影体系」一节） | `node scripts/geometry-test.js` | **289 项 289 通过**（v1.1 时为 252 项） |
| 整体静态检查 | `node scripts/full-check.cjs` | **11 项 11 通过**（JS 语法、JSON、WXML 标签配平 8 个、敏感信息与调试输出扫描） |
| 静态接线检查 | `node scripts/integrity-check.js` | **28 项 28 通过**（`app.json` ↔ 页面文件、`index.wxml` 事件绑定 ↔ 页面方法） |

「D. 投影体系」一节锁住的关键不变量（改动折叠方向/旋转符号会立刻失败）：

1. θ=0 恒等、θ=90 时 H 上的点落到 (x, 0, −y)、W 上的点落到 (−y, 0, z)；
2. 折痕 OX、OZ 上的点旋转后不动，旋转保持长度；
3. **展开 90° 后三个投影点按第一角正投影到 V 面的二维坐标，与 `pages/index/projection.js` 的 `worldToView(front/top/left)` 逐点相同**；
4. 实心投影面的遮挡判定：第一分角内的点不被挡、V 面背后的点被挡、超出板范围的点不被挡、视角绕 OZ 轴转 180° 后原本被挡的点可见；八分角与第一分角两种板范围下结论不同（板大小决定谁挡谁）。

### 4.2 页面级交互核对（离线桩，未入库）

- `pages/projection/projection.wxml` 的 9 个事件绑定全部能在 Page 对象上解析（未在 `scripts/` 覆盖率内，本次用一次性脚本核对）；
- 模拟拖动：视角 0° → 90°、松手才提交 data、拖动期间锁定/结束后解锁页面滚动；
- 在下方「展开投影图」区域起拖**不**旋转视角；
- 按「投影展开」**不改变**投影面范围（2026-10-08 用户要求）。

### 4.3 用户验收（真机 / 模拟器）

2026-10-08 用户在新页面上逐轮验收并提出修改（工具条入口位置、单个展开/折叠按钮、投影面范围切换、展开后颜色不变、投影轴白色、面板两排布局、默认第一分角），每轮均附带真机截图确认；本轮冻结前最后一次截图确认了工具条顺序（个人信息 → 投影体系 → 模块选择器）与面板布局。

**未做**：由测试角色独立复测；正式版发布后的回归。按 `AGENTS.md` C11，小程序端改动需重新编译上传后才算上线。

---

## 5. 未纳入本版本的工作（仍在工作区，未提交）

| 工作 | 涉及文件 | 状态 |
| --- | --- | --- |
| AI 教师 V2.1「教学事件」 | `cloudfunctions/api/ai/teaching-events.js`、`cloudfunctions/api/ai/conversation.js`、`cloudfunctions/api/index.js`、`pages/ai/*`、`pages/video/*`、`utils/api.js`、`scripts/offline/run-teaching-events.cjs` | 代码完成、离线断言全绿；**云函数未部署、未真机验证**，故不纳入本版本 |
| 教师端「未分班学生可调整班级」 | `cloudfunctions/teacher/index.js`、`teacher-web/*`、`scripts/offline/run.cjs`、`docs/freeze-teacher-web-2026-09-14.md` | 代码完成、离线断言全绿；**云函数未部署、预览仓未发布**，故不纳入本版本 |

`docs/交接说明.md` 中与这两批相关的条目（`ai_teaching_events` 集合、`ai.teaching_event`、`class.unassigned`、教师端「未分班」入口）已按"随代码一起提交"的原则暂缓，待各自部署验证后再补。

---

## 6. 部署 / 发布状态

| 目标 | 状态 |
| --- | --- |
| 小程序（`pages/projection/`、首页入口） | ⬜ 待用户重新编译上传（体验版/正式版） |
| 云函数 `api` / `teacher` | 本版本**未改动**，无需部署 |
| 教师网页（预览仓） | 本版本**未改动**，无需发布 |
| 数据库 | 本版本**未新增集合/字段** |

---

## 7. 回滚

```powershell
# 只回滚本版本（保留后续工作区改动）：把 pages/projection/ 与首页入口恢复到 v1.1.0
git -C G:\HFJH checkout v1.1.0 -- app.json pages/index/index.wxml
Remove-Item -Recurse -Force G:\HFJH\pages\projection     # 该目录在本版本新增，v1.1.0 中不存在
# 文档与检查脚本如需一并回退：
git -C G:\HFJH checkout v1.1.0 -- scripts/geometry-test.js README.md "docs/交接说明.md"
```

回滚不影响数据库与云函数（本版本未触及）。

---

## 8. 冻结后约束

1. 本版本的提交与 tag `v1.2.0` 构成冻结基线；此后修改 `pages/projection/` 或 `pages/index/index.wxml` 需"用户明确要求 + 可复现问题"。
2. 修改后必须重跑：`node scripts/run-all.js`、`node scripts/geometry-test.js`（后者锁住展开方向与"展开成三视图"的口径）。
3. 改动 `pages/index/**` 任一部分属 C 级：按 `AGENTS.md` C7 需用户明确授权，并做点/线/面/立体/切割的真机回归。
4. 推送由用户执行：`git push origin master`、`git push origin v1.2.0`（认证不可代做）。

---

## 9. 已知限制与文档滞后项

1. 空间旋转只有方位（绕 OZ 轴），没有俯仰——本项目空间视图是固定斜轴测基底（`AGENTS.md` §31 明确不引入相机系统）。
2. 八分角模式下三块面展平后会**完全重合**（投影面为有限方板，展平后必然落在同一平面），重合处只能看到最上面一块的颜色；要看"三种颜色并列摊平"请用第一分角范围。
3. 分角编号顺序按 2026-10-08 用户提供的《画法几何》八分角参考图推定（Ⅰ = ＋＋＋，x>0 四个绕 OX 依次 Ⅰ–Ⅳ，x<0 四个依次 Ⅴ–Ⅷ）；如课程教材顺序不同，改 `unfold.js` 的 `OCTANTS` 一张表即可。
4. **投影面配色已由用户裁决定稿（2026-10-08）：按当前配色**——V 蓝（`#2a6ac4`）、H 绿（`#2f8f5f`）、W 黄（`#b8912f`），即与首页空间视图一致；`AGENTS.md` §9 的建议默认色（H 浅蓝 / V 浅绿 / W 浅黄）不适用于本模块，本模块以本条裁决为准。
5. `AGENTS.md` C4 的页面清单仍写作 7 页（`login`/`register`/`index`/`survey`/`ai`/`video`/`terms`），实际 `app.json` 现为 8 页（新增 `pages/projection/projection`）；本次未改章程正文，登记在此。
6. 新页面未接入 `web/`（浏览器版演示）：`web/index.html` 的 CommonJS 垫片按 `pages/index/` 的模块顺序注册，新页面若要进网页版需另加脚本与页面（本次未做，用户未要求）。
