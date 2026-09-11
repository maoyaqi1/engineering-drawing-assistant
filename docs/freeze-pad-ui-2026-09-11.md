# 小程序 PAD / 手机 UI 冻结记录（2026-09-11）

> 范围：小程序（学生端）**界面布局与样式层**。本记录冻结的是"页面怎么排"，不改变几何真值、投影公式与业务逻辑。
> 依据：`AGENTS.md` §C7 / §C8，`.agents/skills/engineering-drawing-assistant/references/frozen-modules.md`（F1–F8）。
> 本记录**不含任何提交动作**：未 commit、未 push。

## 1. 冻结基线

| 项 | 值 |
| --- | --- |
| Git 基线提交 | `2438fa3`（`feat(teacher-web): 未入册学生设置班级改为下拉选择已有班级`） |
| 冻结形态 | 工作区（未提交）快照，位于上述提交之上 |
| 冻结日期 | 2026-09-11 |
| 核验方式 | `git hash-object <文件>`，与下表 blob 前 10 位比对 |

## 2. 冻结文件清单

| 文件 | 行数 | 字节 | blob（前 10 位） |
| --- | --- | --- | --- |
| `app.json` | 22 | 547 | `1165ba7761` |
| `pages/index/index.json` | 5 | 108 | `8b5ac3b1d1` |
| `pages/index/index.js` | 1983 | 78086 | `b5490ca654` |
| `pages/index/index.wxml` | 259 | 18332 | `1f7833086f` |
| `pages/index/index.wxss` | 361 | 21744 | `9f34f2c188` |
| `pages/index/basic-solid.js` | 637 | 24008 | `80af3fc79d` |
| `pages/ai/ai.wxss` | 304 | 6668 | `0749220125` |
| `pages/login/login.wxss` | 146 | 3143 | `fb503aa2ff` |
| `pages/register/register.wxss` | 92 | 2158 | `1fed2f499a` |
| `pages/ruler/ruler.wxss` | 152 | 3397 | `1d32806fa4` |
| `pages/survey/survey.wxss` | 133 | 3146 | `1c883485a9` |
| `pages/terms/terms.wxss` | 56 | 1379 | `fdd4672b4f` |

本次冻结**不包含**（属于其它任务线，未纳入）：

`AGENTS.md`、`docs/rules/**`、`docs/requirements/**`、`docs/test/**`、`.agent/**`、
`cloudfunctions/api/index.js`、`cloudfunctions/teacher/index.js`、
`teacher-web/**`、`web-release/**`、`docs/ai_teacher_reflections.txt`、`docs/qrcode.png`、
`docs/产品海报.html`、`images/ai-avatar.png`。

## 3. 冻结内容摘要（本次 UI 变更）

1. **允许平板旋转**：`app.json` 顶层新增 `"resizable": true`（基础库 ≥ 2.3.0）；`pages/index/index.json` 新增 `"pageOrientation": "auto"`。
2. **旋转/改尺寸后重测画布**：`pages/index/index.js` 新增 `onResize()`；切换模式后重新测量画布再绘制。
3. **宽屏左右分栏**：`getLayout()` 按画布宽高比 ≥ 1.25 走左右布局（左＝空间图，右＝三面投影）；手机竖屏仍是原上下布局，数值与改动前逐字段一致。
4. **字号与手机等大**：7 个页面样式表追加 `@media (min-width: 500px)` 块，把基础样式里的 rpx 换算成手机等大的 px（rpx 会随窗口宽度放大，是"PAD 上字太大"的根因）；同时移除原先把页面锁成 720px 居中窄栏的 `@media (min-width: 700px)`。
5. **一屏放下**：宽屏画布高度 = 窗口高 − 各模式扣减值（点/线/面 330px、平面切割 365px、基本立体 390px），下限 220px、上限 620px。
6. **参数面板并排**：PAD 与手机都合并参数行（基本立体：类型／尺寸／姿态+旋转90°；平面切割：立体与截平面同一行）；宽度不足时自动折行回到竖向。
7. **立体视图标签**：`basic-solid.js` 中 V 面/H 面/W 面标签改用投影区矩形定位（`projectionLeft/Top/Width/Height`），仅坐标变化。

## 4. 冻结时的验证证据

| 检查项 | 方法 | 结果 |
| --- | --- | --- |
| JS 语法 | `node --check pages/index/index.js`、`basic-solid.js` | 通过 |
| 样式配平 | 大括号计数（index/ai/login/register/ruler/survey/terms） | 238/238、62/62、28/28、21/21、26/26、29/29、13/13 |
| 配置合法 | `app.json`、`pages/index/index.json` JSON 解析 | 通过 |
| WXML 结构 | 标签配平 | `<view>` 83/83、`<block>` 1/1、`<text>` 64/64、`<button>` 38/38 |
| 手机端未被改动 | `index.wxss` 中 `@media` 之前的基础样式段与迁移前快照逐行比对 | 仅新增 15 行，删除/修改 0 行 |
| 布局回归 | `layout-check.cjs`（48 项断言） | 48/48 通过；手机竖屏三种尺寸与改动前数值完全一致 |
| 一屏放下（PAD） | `pad-fit-check.cjs`（7 设备 × 3 模式 = 21 项） | 21/21 通过，横屏余量 44–58px |
| 手机面板折行 | `phone-fit-check.cjs`（6 种宽度） | 375px：尺寸 2 行（滑块 92px）、角度滑块 257px；320px 自动降为 1 个/行 |
| 改动范围 | `git diff --stat`、目录白名单 | 未触及 `pages/index/section-geometry.js`、`utils/`、`web/`、`cloudfunctions/api/`、知识库与 Prompt |
| 敏感信息 | 密钥/口令/Token 字面量扫描、调试输出扫描 | 无命中 |
| 几何逻辑 | 审查 `index.js` 差异 | 未改投影公式（`projectIsometric`、`worldToView` 等）；`section-geometry.js` 零改动 |

校验脚本位置（**不在仓库内**，为避免给小程序引入构建链）：

```
%USERPROFILE%\.codex\visualizations\2026\09\11\01a08de4-f538-7901-82f7-cca0467d6153\
  wxss-wide.cjs        # 由基础样式生成 index.wxss 的宽屏媒体块
  layout-check.cjs     # 布局/图形是否放得下
  pad-fit-check.cjs    # PAD 一屏估算
  phone-fit-check.cjs  # 手机折行与滑块宽度估算
```

## 5. 未覆盖项（需真机/工具确认）

本记录的证据全部来自静态检查与算术推导，**不含真机验证**。以下需在微信开发者工具或真机上确认：

1. C11 回归底线：首页可正常绘制；点/线/面三种模式切换与拖动；基本立体与切割立体显示；登录/注册未受影响。
2. PAD 横屏实际观感（是否仍需微调留白）。
3. 手机端参数并排后的手感（375px 下尺寸滑块约 92px）。

启动验证前需**重新编译**：`app.json`、`pages/index/index.json`、`index.wxml` 的改动不吃热更新。

## 6. 冻结期间的约束

1. 表中文件视为**冻结**：只有"用户明确要求"且"存在可复现问题"时才改，且只动 UI 层。
2. 不得以"更整洁/更统一"为由重构；不得顺手改几何真值与投影公式（`section-geometry.js`、`getLayout` 的坐标语义）。
3. 新增宽屏样式一律写进 `@media (min-width: 500px)`；确认手机不受影响后再提交。
4. 手机端样式若必须调整，改动后需重新比对 `@media` 之前的基础样式段（应只有新增）。
5. `index.wxss` 的宽屏媒体块内容由脚本固化；后续若要手改宽屏数值，请直接改该媒体块，并同步更新本记录第 4 节的校验结论。
6. 修改任一冻结文件后，重跑第 4 节的四支校验脚本并在交付说明中给出新哈希。

## 7. 回滚方法

本次改动全部在工作区，未提交，回滚=丢弃工作区改动。以下命令**由用户执行**（Agent 不代执行 `git checkout --` / `git reset`）：

```powershell
# 只回滚本次 UI 冻结涉及的文件（不含其它任务线改动）
git -C G:\HFJH checkout -- `
  app.json `
  pages/index/index.json pages/index/index.js pages/index/index.wxml pages/index/index.wxss pages/index/basic-solid.js `
  pages/ai/ai.wxss pages/login/login.wxss pages/register/register.wxss pages/ruler/ruler.wxss pages/survey/survey.wxss pages/terms/terms.wxss
```

回滚后 `git status --short` 应不再出现上述 12 个文件。
另有本次改动前的 `index.wxss` 快照（`%TEMP%\index.wxss.bak`、`index.wxss.bak2`），仅作对照，TEMP 可能被清理，不依赖它回滚。

## 8. 修订记录

| 日期 | 修订 | 影响文件 | 说明 |
| --- | --- | --- | --- |
| 2026-09-11 | 旋转90° 按钮改为显式基准宽度 | `pages/index/index.wxss`（`973453f3f9` → `9f34f2c188`） | 用户反馈：手机端选「旋转」时 `旋转/平移` 被挤到单独一行、按钮被拉宽。根因是小程序 `<button>` 的 `width: auto` 会吃掉整行剩余宽度（原先 `flex: none; width: auto` 无效）；手机端改为 `flex: 0 1 100rpx; width: 100rpx; min-width: 92rpx`（可收缩，容不下时优雅降级），宽屏端补 `flex: 0 0 56px; width: 56px`；并把 `.solid-group .pose-tab` 由 96rpx 收到 92rpx。手机基础样式段由「+15/−0」变为「+16/−1」（被替换的正是那条 `.rot90-chip`）。复测：整体静态测试 11/11、布局脚本 48/48、PAD 一屏 21/21、手机折行 6/6 全部通过（360/375/390/414/430 姿态首行需 299px，均放得下；320 类小屏回退为两行） |
| 2026-09-11 | 旋转90° 语义修正：独立按钮、始终可用 | `pages/index/index.wxml`（`60607e8e34` → `1f7833086f`）、`pages/index/index.js`（`d354a2e538` → `b5490ca654`） | 用户澄清：旋转90° 是**独立按钮**，与「旋转/平移」页签无关；平移状态下也应可用；每次点击绕**当前高亮的轴**旋转 90°。改动：WXML 去掉按钮上的 `wx:if="{{poseTabIndex === 0}}"`；`handleRotate90` 的轴改为 `poseTabIndex === 0 ? rotationAxis : translationAxis`，并同步旋转角度滑块（`rotationAxis/rotationAxisIndex/rotationValue`）。未改旋转方向（仍为每次 +90°）、未改平移逻辑。复测：整体静态测试 11/11、布局脚本 48/48、PAD 一屏 21/21 全部通过 |
