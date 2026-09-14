# 重构记录：拆分 `pages/index/index.js`（2026-09-13）

> 范围：`pages/index/` 下的文件结构，**只搬运、不改行为**。
> 上级规则：`AGENTS.md` C7（C 级冻结模块的两种允许情形）、C8、C9、C10、C11、C12；`.agents/skills/engineering-drawing-assistant/references/frozen-modules.md`（F1/F3/F4/F8）。

## 1. 授权与范围

`pages/index/index.js` 是 C 级冻结文件（F1 点/线/面交互与三视图、F3 平面切割立体渲染、F4 基本立体、F8 真机调优交互）。本次改动属于 **C7 中「用户明确要求修改该模块」**的情形：用户在 2026-09-13 的会话中明确授权拆分。

本次**不含**：

- 不改任何算法、预设数值、节流时序、绘制样式、文案与 UI（`index.wxml` / `index.wxss` / `index.json` 零改动）；
- 不改 `section-geometry.js`（F2 几何真值）与 `basic-solid.js` 的导出 API 与实现；
- 不改对外方法名：`index.wxml` 的 25 个事件绑定名、`basic-solid.js` 依赖的 10 个页面方法全部保持。

## 2. 拆分前后

| 文件 | 拆分前 | 拆分后 |
| --- | --- | --- |
| `pages/index/index.js` | 1986 行（data + 112 个方法混在一起） | 104 行（data + 6 个生命周期 + require/挂载） |
| `pages/index/constants.js` | — | 新增（DEFAULT_POINT / MODEL_MIN / MODEL_LIMIT / ISOMETRIC_DEPTH_Z） |
| 其余 11 个新模块 | — | 按功能承载 106 个方法（见下表） |
| `web/index.html` | 只加载 `section-geometry.js` + `index.js`（垫片无视 require 参数） | 按依赖顺序加载 14 个模块；垫片改为「相对路径 → 导出对象」 |

## 3. 模块职责

| 模块 | 承载内容 |
| --- | --- |
| `index.js` | 页面 `data`、生命周期（`onReady`/`onResize`/`onShow`/`onHide`/`onUnload`/`onShareAppMessage`）、`Page(Object.assign({...}, 各模块))` 挂载 |
| `constants.js` | 教学常量（坐标范围 0～8、默认点、等轴测深度压缩） |
| `presets.js` | 点 8 种 / 线 7 种 / 面 7 种预设、截平面类型判定、立体默认参数 |
| `session.js` | 云函数会话与学习行为埋点（`api` 在无 `wx.cloud` 时为 `null`，静默跳过） |
| `math-utils.js` | `clamp` / `screenToModel` / 重心坐标 / 截交环去重 |
| `projection.js` | 等轴测投影、第一角三视图投影、视图深度、画布布局（`getLayout`） |
| `touch.js` | 点/线/面拖动与拖动锁定（只改 `this.data`，不 `setData`） |
| `draw-helpers.js` | Canvas 2D 绘制原语（线、虚线、点、文字、多边形、箭头、圆角矩形） |
| `render-scene.js` | 画布初始化、重绘调度、空间图与三视图面板绘制 |
| `section-math.js` | 立体表面可见性、棱线朝向、按截平面裁剪（判定层） |
| `section-render.js` | 截交结果、空间图截交叠加、三视图截交投影、截断立体绘制 |
| `solid-projection.js` | 基本立体三视图（轮廓、不可见细虚线、中心线） |
| `ui-handlers.js` | 模块/类型切换、滑块、姿态与平移、旋转 90°、重置、跳转 |

模块之间只通过 `this` 调用其它方法（与拆分前一致），文件级标识符只有 `DEFAULT_POINT` / `MODEL_MIN` / `MODEL_LIMIT` / `ISOMETRIC_DEPTH_Z` / `api` / `SectionGeometry` / `BasicSolid`，均已按模块 require。

**每个模块文件外层都是一个 IIFE**（`(function () { … })();`）。原因：小程序与 Node 走 CommonJS，模块天然有独立作用域；而 `web/index.html` 是用 `<script src>` 直接打开的，同名顶层 `const`（例如 `ISOMETRIC_DEPTH_Z` 同时出现在 4 个文件里）会在同一个全局作用域里冲突。IIFE 让同一份代码在两种环境下作用域一致，因此**不要删掉这两个外层括号**——`scripts/web-loader-check.cjs` 会检查这一点。

## 4. 零行为变化的验证证据（本次实际执行）

| 验证 | 方法 | 结果 |
| --- | --- | --- |
| 逐方法正文一致性 | 解析 HEAD 版 `index.js` 与拆分后 `pages/index/*.js`，逐方法比较正文（忽略行首缩进与成员尾逗号） | **112/112 逐字一致**（差异仅限整体缩进与 12 处末成员尾逗号） |
| `data` 块一致性 | 按块提取后逐字比较 | 一致 |
| 运行期页面对象 | 用 `global.Page`/`global.wx` 桩分别加载拆分前/拆分后，比较键集合、函数形参个数、`data` 深比较 | 键集合 113 → 113、112 个方法形参一致、`data` 一致 |
| 抽样真调用 | `getLayout`（375×667 / 1024×768）、`projectIsometric`、`worldToView`、`projectPointToView`、`getIsometricDepth`、`getViewDepth`、5 种预设、`defaultSolidParams`、`getSectionPlaneType`、`clamp`、`screenToModel`、`sanitizeSolidPosition` 等 23 次调用 | 返回值完全一致 |
| 全量检查 | `node scripts/run-all.js` | **20 项全部通过** |
| 静态接线 | `node scripts/integrity-check.js` | **26 项全部通过**（含运行期页面对象接线） |
| 网页版加载 | `node scripts/web-loader-check.cjs` | 11 项通过：按 `web/index.html` 的脚本顺序在 `vm` 中加载，页面对象、25 个绑定、模块路径解析，以及 `getLayout` / `projectIsometric` 结果与 Node 端一致 |
| 几何真值 | `node scripts/geometry-test.js` | 252 项断言通过（未受本次改动影响） |

**未覆盖**：微信开发者工具的编译与真机/模拟器回归（点/线/面拖动、五种模式切换、滑块、复位、平板与大屏布局）；`web/index.html` 在真实浏览器里的渲染（`web/runtime.js` 需要真实 DOM 与 Canvas，本次未改它；本地 `file://` 在自动化环境里被浏览器策略拦住，无法代跑）；云函数部署验证。这些必须由用户执行，见 `AGENTS.md` C11。

## 5. 为拆分新增的永久检查

`scripts/integrity-check.js` 新增两节（每次运行都会执行）：

1. **首页页面对象接线**：用桩加载 `pages/index/index.js`，核对 `index.wxml` 的 25 个绑定在运行期页面对象上都有同名函数；`pages/index/*.js` 里所有 `this.xxx()` 调用都能解析到 112 个方法之一；`basic-solid.js` 依赖的 10 个页面方法仍在；模块内没有把方法写成箭头函数（会丢 `this`）。
2. **首页常量与文件规模**：`constants.js` 的三个常量值锁定；`index.js` ≤ 350 行（防止再次膨胀）。
3. **网页版模块加载**（`scripts/web-loader-check.cjs`）：按 `web/index.html` 的 `<script>` 顺序在 `vm` 中执行，核对垫片按路径解析模块、`window.geometryPage` 的 25 个事件绑定、`data.point` 预设，以及 `getLayout` / `projectIsometric` 与 Node 端结果一致。旧垫片「无视参数、一律返回 section-geometry」的问题就是被这项检查发现的。

同时 `scripts/full-check.cjs` 的小程序事件绑定检查、`scripts/layout-check.cjs` 的 `getLayout` 提取，都改为扫描 `pages/index/` 全目录（拆分前它们假设方法都在 `index.js` 里）。

## 6. 已知限制

1. 拆分不改变 `Page` 选项的键顺序（`data` 与生命周期仍在对象字面量中，其余方法由 `Object.assign` 追加）。微信按名字读取 Page 选项，顺序无语义；若日后有人依赖键顺序，需注意。
2. `scripts/geometry-test.js` 中记录的「截平面与顶面完全共面时截交环退化」仍存在（属 F2 行为，本次未改）。
3. 本轮未重新部署任何云函数（本次未改云函数代码）。
4. `web/index.html` 的加载顺序需人工维护：新增或调整 `pages/index/` 模块依赖时，必须同步 `<script>` 顺序与 `registerGeometryModule` 调用（`scripts/web-loader-check.cjs` 会失败提醒）。

## 7. 回滚

```powershell
# 回到拆分前的单文件版本，并移除新增模块
git -C G:\HFJH checkout HEAD -- pages/index/index.js
git -C G:\HFJH clean -f pages/index   # 注意：只清理未跟踪的新模块，执行前先确认没有其它未跟踪文件
```

更稳妥的方式：按第 3 节的文件清单逐个删除新增模块，再用 `git diff` 确认恢复成单文件。

## 8. 后续建议

- 后续任何 `pages/index/` 改动，先跑 `node scripts/run-all.js`（含几何真值 252 项断言），再做开发者工具/真机回归。
- 若要把 `render-scene.js`（333 行）或 `ui-handlers.js`（294 行）进一步拆分，同属冻结模块改动，仍需用户授权，并以本文第 4 节的验证方式为准。
