# 直角三角形法页面冻结记录（2026-11-01）

## 冻结范围

本记录冻结以下实现：

- `pages/triangle-method/triangle-method.js`
- `pages/triangle-method/triangle-method.wxml`
- `pages/triangle-method/triangle-method.wxss`
- `pages/triangle-method/triangle-method.json`
- `pages/triangle-method/triangle-metrics.js`
- `pages/triangle-method/triangle-render.js`
- `scripts/triangle-method-check.cjs`

## 基线说明

- 冻结日期：2026-11-01
- 最近修订：2026-11-02（用户明确要求压缩纵向布局）
- Git 基准提交：`4cc676b`
- 状态：当前工作区文件快照。因用户未要求提交或建标签，本冻结不是 Git tag。
- 复核方式：先核对下列 SHA-256，再运行 `node scripts/triangle-method-check.cjs`。

## 文件哈希

| 文件 | SHA-256 |
| --- | --- |
| `pages/triangle-method/triangle-method.js` | `662241F348B11BE55C7D910BF4EFC0BD944F108B2D1DACD12EAA434141C31E59` |
| `pages/triangle-method/triangle-method.wxml` | `7738455DE5BD8A2A5F97BBC6ED57BE3D13A00147D0F452D22E28DA5EED2F2489` |
| `pages/triangle-method/triangle-method.wxss` | `7027033669F10408C59BCC1FF9463435FECDA6EA800909872E9196265FDD20CD` |
| `pages/triangle-method/triangle-method.json` | `3A68D8018BA869D63DB05A0624B685997BB4991D442EF5988B486F962E9FED20` |
| `pages/triangle-method/triangle-metrics.js` | `D83018D193813A5BC2030417329940C5B3ABECC93A5AAF2DC288EEFDD39FF907` |
| `pages/triangle-method/triangle-render.js` | `B3A099419D0D434ADADF51BE46B3F87A0173E629B2244A92FAE6B9BC8313AFB3` |
| `scripts/triangle-method-check.cjs` | `810F418EE725A71735C56990AE1ADCD6CDBD89CFB1A4ACD73243FF2E763D7F86` |

## 2026-11-02 授权布局压缩修订

- 触发：用户明确要求参考直角投影定理页的压缩方式，减少直角三角形法页纵向尺寸。
- 复现：修改前 `375` 宽模拟器窗口高度 `753px`，页面滚动高度 `1176px`；画布从 `top=130` 延伸 `700px`，摘要卡底部到 `1176px`。
- 范围：只调整顶部 α/β/γ 按钮、页面间距、标题行、画布高度、页面专属竖屏分区比例和摘要卡间距；不修改 `triangle-metrics.js`、`triangle-render.js`、几何坐标、投影公式或拖动算法。
- 结果：画布 `700px → 460px`，竖屏黑色空间区占画布高度 40%（`184px`），三视图保留 `276px`；页面滚动高度降至 `831px`。
- 模拟器：`375×460` 画布中三维图完整，端点 A 拖动成功；宽屏仍使用共享左右布局。

首轮压缩后的临时哈希（已被下一轮摘要删除修订替代）：

| 文件 | SHA-256 |
| --- | --- |
| `pages/triangle-method/triangle-method.js` | `FF221CDC920F1B0B4E6F61AC304D43AD21FB259E98A909DBA5E8D58D2972E5AC` |
| `pages/triangle-method/triangle-method.wxml` | `077B277F52EDD1A1C55A16048CD939051892FFDDA561200701F9D0C07074C3AB` |
| `pages/triangle-method/triangle-method.wxss` | `0700985391CD58AC2038FEBBA8AAB2822B1ED2745273FFE833A24322702C0242` |
| `scripts/triangle-method-check.cjs` | `DBB4079F357A80C6D23E2C5AD6624B31D7A6BF21C817746E025C12CE6EF3FE4C` |

### 2026-11-02 摘要删除修订

- 触发：用户明确圈出 `G03 · 一般位置直线`、A/B 坐标行和“后续知识点：直角投影定理 / 预留”，要求删除。
- 范围：删除上述 WXML、对应派生展示字段、空样式；保留“直角三角形四要素”及其全部内容。
- 结果：摘要卡由约 `269px` 压缩到约 `180px`，底部到 `742px`，可在 `753px` 高的模拟器窗口内完整显示。
- 验证：端点 A 拖动后坐标和 H 面四要素同步更新；专项检查扩展到 `150/150`。

摘要删除修订后的临时哈希（已被下一轮空间适配修订替代）：

| 文件 | SHA-256 |
| --- | --- |
| `pages/triangle-method/triangle-method.js` | `93A39E13BCD9C4ED741BECA314CEB871A322AB669CB95A061E384D237BE407C2` |
| `pages/triangle-method/triangle-method.wxml` | `731641594163A30494182F6100EA80D4EE391D016C5874E9E68A51DA0F1AAB70` |
| `pages/triangle-method/triangle-method.wxss` | `6CFAFF29E0FC1F5B9CEB55294FA206077E6B08EEAF49D09E89FCDD267B21BDAD` |
| `scripts/triangle-method-check.cjs` | `2EF9CE564152B29DA2E3B6CFB0EF4C88935E5E74F032E72F4FD1DA623AB98843` |

### 2026-11-02 三维图填满黑框修订

- 触发：用户明确要求黑色背景尺寸不变，将三维图尽量放大，Z 轴箭头顶住上边、H 面最低边贴住下边，Z 标签移到右侧。
- 范围：只改 `triangle-render.js` 的空间屏幕映射和 Z 标签位置；不修改投影公式、模型坐标、三视图尺寸或拖动算法。
- 实现：空间比例按 `Z 轴 10 个显示单位 + H 面最低深度 5.79 个显示单位` 计算，上下各留 `2px`；三维屏显单位由约 `7.7px` 提升到约 `11.4px`。
- 结果：Z 轴末端位于黑框上边内 `2px`，H 面最低角点位于下边内 `2px`，Z 标签向右下偏移。
- 验证：`375×460` 与 `900×420` 布局边界均通过；模拟器视觉验收通过；专项检查 `155/155`。

当前相关文件哈希：

| 文件 | SHA-256 |
| --- | --- |
| `pages/triangle-method/triangle-method.js` | `93A39E13BCD9C4ED741BECA314CEB871A322AB669CB95A061E384D237BE407C2` |
| `pages/triangle-method/triangle-method.wxml` | `731641594163A30494182F6100EA80D4EE391D016C5874E9E68A51DA0F1AAB70` |
| `pages/triangle-method/triangle-method.wxss` | `6CFAFF29E0FC1F5B9CEB55294FA206077E6B08EEAF49D09E89FCDD267B21BDAD` |
| `pages/triangle-method/triangle-method.json` | `3A68D8018BA869D63DB05A0624B685997BB4991D442EF5988B486F962E9FED20` |
| `pages/triangle-method/triangle-metrics.js` | `D83018D193813A5BC2030417329940C5B3ABECC93A5AAF2DC288EEFDD39FF907` |
| `pages/triangle-method/triangle-render.js` | `BFD717406CE9F136C5A08C43A2948A825CD550A77134719A4A46D039B37730E9` |
| `scripts/triangle-method-check.cjs` | `7688219A584959F3EDEA334E0DF05CC55B421A789FDDE64D6056E27DE9C308AB` |

## 冻结后的约束

- 默认不得重构、重命名、格式化或顺带修改上述文件和当前交互。
- 页面继续使用首页冻结的投影、触摸、Canvas 生命周期和三视图模块；不得让旧知识页承担新知识点扩展。
- 只有用户明确要求或存在可复现真实缺陷时才允许修改。
- 修改前必须记录复现步骤、影响范围与回归方式；修改后至少执行专项检查、全量本地检查、微信开发者工具编译和真机回归。
- 直角投影定理等后续知识点应放入独立页面，不继续扩大本页职责。

## 基线验证

```powershell
node scripts/triangle-method-check.cjs
node scripts/run-all.js
```

当前冻结时专项检查为 `104/104` 通过，全量本地检查为 `36/36` 通过。该结果不代表 CI、模拟器或真机验收通过。
