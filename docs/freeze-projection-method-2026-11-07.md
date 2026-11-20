# 投影法基础页面冻结记录（2026-11-07）

> 冻结标识：`projection-method-page-2026-11-07`
> 冻结日期：2026-11-07
> Git 基准：`12d5f4c`（`v1.6.0`）
> 冻结性质：当前工作区页面级快照；不是 Git commit、tag、部署或线上发布

## 1. 冻结范围

本记录冻结以下页面实现和专项检查：

| 文件 | 行数 | SHA-256 |
| --- | ---: | --- |
| `pages/projection-method/projection-method.js` | 389 | `3EC77A4C9FDA3D08D9BD9A4D7C4BD8A9A76E2197CB03DB6F3F4805C7E8871012` |
| `pages/projection-method/projection-method-model.js` | 537 | `2EED74BD54E59C7CCF7E45890B9FBA8F19345749F78390DD3656E0BBAA60D4BA` |
| `pages/projection-method/projection-method-render.js` | 774 | `6B820BAF6A0D56DDB9FBF3D2D6556C95FF3C0933864818105C1F0DAAA5FA3F04` |
| `pages/projection-method/projection-method.wxml` | 80 | `52F6861D0B10477920C887E02B63315F607797989F7F59CB92FB6449C4165286` |
| `pages/projection-method/projection-method.wxss` | 269 | `554225D6EF787714CA5B9D77B25F6F06B42E7A302A77B1D6DDAB55BEBDB46375` |
| `pages/projection-method/projection-method.json` | 8 | `5563D610B447E098719E0C519DF54FF83551ADE93C97118AA31D39E8F5196C06` |
| `scripts/projection-method-check.cjs` | 462 | `C5BB8F279029709FB594F036C1ADB90FF756D414F549FEE343AF7D48AFD89D26` |

`app.json`、`config/course-catalog.js` 和 `scripts/run-all.js` 属于共享接线文件，不整体冻结；后续修改必须继续保留以下入口契约：

- 页面路径：`pages/projection-method/projection-method`
- 课程知识点 ID：`projection-basic`
- 首页标题：`投影法基础`
- 课程入口路径：`/pages/projection-method/projection-method`
- 全量检查入口继续包含 `scripts/projection-method-check.cjs`

## 2. 冻结的教学能力

- 页面只保留“投影方法”和“平行投影法的性质”两个模块。
- 投影方法提供中心投影、平行投影切换和重新播放；平行投影滑杆中点为 `90°` 正投影，其余角度为斜投影。
- 拖动平行投影滑杆时，投影面和空间形体保持固定，只改变投射线方向及投影位置。
- 性质模块只保留不变性、积聚性、从属性、等比性四个按钮，并一次展示一个图示和一段定义。
- 从属性图面同时标注 `E/F/H`、`e/f/h`、`A/B/C/J` 与 `a/b/c/j`，并与公式解释对应。
- 等比性图面标注 `E/F/H` 与 `e/f/h`，下方继续显示源图形和投影图形的分段比例。
- 页面全部几何由 `projection-method-model.js` 计算，Canvas 绘制集中在 `projection-method-render.js`，页面层只管理交互和动画状态。

## 3. 修改规则

默认不得重构、重命名、格式化、合并文件或顺带调整上述页面。只有以下情形允许修改：

1. 用户明确要求修改投影法基础页。
2. 存在可复现的真实缺陷，并已记录复现步骤、输入和实际结果。

修改前必须阅读本记录；修改后必须更新文件哈希，并至少执行：

```powershell
node --check pages/projection-method/projection-method.js
node --check pages/projection-method/projection-method-model.js
node --check pages/projection-method/projection-method-render.js
node scripts/projection-method-check.cjs
node scripts/run-all.js
git diff --check
```

涉及画布布局、标注、动画或交互的修改，还必须重新在微信开发者工具模拟器中检查相关场景，并单独安排手机和 PAD 真机回归。本地检查通过不代表 CI、真机或线上验收通过。

## 4. 冻结基线验证

本轮冻结前实际执行：

| 检查 | 结果 |
| --- | --- |
| 四个 JavaScript 文件 `node --check` | 全部通过 |
| `node scripts/projection-method-check.cjs` | 2027/2027 通过 |
| `node scripts/run-all.js` | 47/47 项通过 |
| `git diff --check` | 通过 |
| 微信开发者工具打开页面 | 成功渲染 |
| `293×634` 模拟器：从属性 | 点、投影点、空间平面顶点和投影平面顶点标注可见 |
| `293×634` 模拟器：等比性 | 分点及其投影点标注可见 |

本次冻结未执行手机或 PAD 真机回归，因此不把模拟器结果表述为真机验收。

## 5. 回滚与限制

- 当前冻结没有 Git commit 或 tag，只记录工作区文件哈希和已验证行为。
- 哈希可用于判断文件是否被改动，但不能单独恢复文件内容。
- 若后续需要可从 Git 直接恢复的内容快照，应由用户明确授权后提交冻结基线或建立 tag；本记录不擅自执行提交。
- 后续功能优先新增独立知识点页面，不继续扩大投影法基础页职责。
