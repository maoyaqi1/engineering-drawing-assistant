# 冻结模块清单

冻结 = **默认不得主动重构**。以下模块已经过多轮迭代与真机验证，是项目的核心资产。

冻结基线：**v0.6.2（提交 `aaf75d0`）**。自该提交起，冻结模块应保持零改动；需要核查时用 `git diff --stat aaf75d0 HEAD` 看 `pages/`、`cloudfunctions/`、`utils/`、`web/` 是否为空。

允许修改的情形只有两种：
1. 用户明确要求修改该模块；
2. 修复该模块中**可复现的真实缺陷**（须先复现、再改）。

任何情况下都不得以"更整洁 / 更统一 / 新技术"为由重构。

---

## F1. 点 / 线 / 面核心互动与三视图

**位置**：`pages/index/index.js`（`handlePointType` / `handleLineType` / `handlePlaneType`、各 `getXxxTypePreset`、`handleTouch*`、`drawProjectionPanels`、`drawProjectionCorrespondence` 等）、`pages/index/index.wxml`。

**为什么冻结**：三种空间元素的创建、拖动、三面投影与投射连线是产品最核心的教学能力，已冻结多个版本并经真机验证；交互改动容易牵一发动全身。

**修改风险**：投影关系错位（长对正/高平齐/宽相等）、拖动后三视图不同步、预设位置错乱、手机端触摸失准。

**允许修改**：用户点名要求；或修复可复现的投影/拖动缺陷。

**修改前**：先确认要改动的是"投影公式"还是"交互/渲染"，只动其中一层；明确受影响的预设类型。

**修改后必须验证**：一般点/原点/三投影面/三坐标轴预设；拖动每个投影点后空间点与另两个投影同步；投射连线正确；窄屏与平板布局正常。

---

## F2. 截交几何计算 `section-geometry.js`

**位置**：`pages/index/section-geometry.js`。

**为什么冻结**：这是**几何真值层**（`createSolid` / `intersectSolid` / `createSectionLoops` / `createSectionCaps` / `createCuttingPlane`），截交结果由它决定，渲染只是表现。

**修改风险**：截交线断裂、顶点重复/缺失、退化情形（相切/共面/过顶点）返回错误、闭合环排序错乱。

**允许修改**：修复可复现的几何错误；或用户要求扩展新的立体/切割类型。

**修改前**：先用具体参数复现问题并记录；明确输入空间（世界/局部）与容差。

**修改后必须验证**：多种立体（三棱锥/五棱柱/圆柱/圆锥/圆球/圆环）× 多种截平面（水平/正垂/侧平）；截点无重复；曲线闭合无断口；三维截面与三视图来自同一份数据。

---

## F3. 平面切割立体的渲染与交互

**位置**：`pages/index/index.js`（`getSectionResult` / `drawSectionIsometricOverlay` / `drawSpatialSolidEdges` / `clipPolygonByPlane` / `drawSectionProjectionOverlay` / `handleSectionSlider` / `handleSectionPlaneType`），以及 `index.wxml` 的切割参数面板。

**为什么冻结**：与 F2 配合构成完整教学演示，参数面板经过多轮 UI 打磨。

**修改风险**：拖动参数时卡顿（曲面体对性能敏感）、截平面可视边界错误、三视图与空间图不同步。

**修改后必须验证**：连续拖动角度/位置时流畅且实时更新；松手后结果精确；六种立体逐一检查；三视图截交投影正确。

---

## F4. 基本立体互动

**位置**：`pages/index/basic-solid.js` + `pages/index/index.js` 的 solid 模式（`handleBasicSolidType` / `handleSizeSlider` / `handleRotationAxis` / `handleTranslation` / `handleRotate90` / `handleReset`）。

**为什么冻结**：六种立体的参数化与三视图联动已稳定；`handleReset` 曾出现"重置回到棱柱"类缺陷，已修复，属敏感点。

**修改风险**：重置误切到其他立体、旋转轴/平移轴状态不同步、曲面体三视图中心线（仅对称处）误加或漏加、尺寸越界。

**修改后必须验证**：六种立体分别切换；棱数步进；半径/高度/大小圆半径滑块；绕 XYZ 旋转与平移；旋转 90°；重置只影响当前立体；不可见轮廓用细虚线。

---

## F5. 学生登录 / 注册 / 名单鉴权

**位置**：`pages/login/`、`pages/register/`、`pages/roster/`、`cloudfunctions/api/index.js`（`login` / `register` / `roster.*` / `ai.ask` 中的 `isInRoster`）。

**为什么冻结**：涉及真实学生身份与 AI 提问准入，逻辑错误会直接影响可用性与数据正确性。

**关键规则（改动时不得破坏）**：

- 所有学生都要微信登录 + 自己填写学校/姓名/学号；**未在名单中的同学仍可正常使用互动工具**，只是不能使用 AI 提问。
- 学号唯一，防止冒用。
- 名单（`roster`）与教师端的班级档案（`students`）**相互独立**，不强制同步。

**修改后必须验证**：新用户登录→注册→进首页；老用户跳过登录；学号重复被拦截；名单内可用 AI、名单外被拒绝但工具可用。

---

## F6. AI 教师知识库

**位置**：`cloudfunctions/api/knowledge/*.md`（16 篇）。

**为什么冻结**：由教师课件与备课笔记长期蒸馏形成，是教学正确性的来源。

**修改风险**：知识错误直接传导为学生错误认知。

**规则**：不随意删除已有知识；新增/修改须说明原因并保持原教学逻辑；改后做 AI 回归。

---

## F7. AI 教师 Prompt

**位置**：`cloudfunctions/api/prompts/teacher_system_prompt.md`、`teacher_image_system_prompt.md`，以及 `cloudfunctions/api/ai/prompt.js` 的组装逻辑。

**为什么冻结**：Prompt 里固化了教师的教学信条（不代判对错、逻辑闭环、区分两门课、回复不超过一屏等）与"10 道基本作图问题"等教学策略，是长期调优结果。

**规则**：修改需说明原因；保持回答风格与教学逻辑；改后必须做对话回归；**改完要提示用户重新部署云函数**。

---

## F8. 已通过真机验证的核心交互

**范围**：圆球/圆环拖动跟随性、截平面拖动实时性、拖点时页面滚动锁定等。**不含尺规作图**——`pages/ruler/` 属探索模块，见下节。

**为什么冻结**：这些是反复调优"性能与手感的平衡"后的结果（用户曾明确表示"现在的平衡可以接受"）。

**规则**：不得以"优化"为名改动这些交互的时序/节流策略，除非用户明确提出性能问题并接受重新调优的代价。

---

## 探索模块（不冻结）

以下模块处于探索阶段，不在 v0.6.2 的版本记录中，**不属于冻结范围**，也不作为版本基线的一部分：

- 教师端：`pages/teacher/`、`teacher-web/`、`cloudfunctions/teacher/`，以及设计稿 `docs/teacher-admin-arch-analysis.md`、`docs/teacher-admin-db-design.md`。
- 尺规作图：`pages/ruler/`、`web/ruler.html`。

规则：可以改动，但不得顺带改动冻结模块；改动前先说明范围，改后做基本自测。

## 最小侵入原则

新增功能时：

1. 优先**新增**文件/函数/页面，而不是改造既有函数。
2. 必须改动既有函数时，只做最小必要的插入，保持原有行为分支不变。
3. 不顺手重命名、重排、格式化冻结模块的代码。
4. 若确实需要较大改动，先向用户说明必要性、影响范围与回归方案，获得确认后再做。
