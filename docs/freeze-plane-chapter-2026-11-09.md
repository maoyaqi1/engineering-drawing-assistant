# 平面章节冻结记录（2026-11-09）

> 冻结标识：`plane-chapter-2026-11-09`
> 冻结日期：2026-11-09
> Git 基准：`12d5f4c`（`v1.6.0`）
> 冻结性质：当前工作区快照；不是 Git commit、tag、部署或线上发布

## 1. 冻结范围

本记录冻结第三章“平面的投影”在课程首页中的入口与当前知识点：

1. 平面的表示方法
2. 平面的投影规律
3. 最大斜度线

“属于平面的点和直线”已按用户要求删除，不属于本章冻结范围，课程目录和 `app.json` 中不得重新出现该知识点或 `/pages/point-line-in-plane/` 路由。

知识点 ID 和页面映射为：

- `plane-representation` → `/pages/plane-representation/plane-representation`
- `plane-positions` → `/pages/index/index?mode=plane`
- `maximum-slope-line` → `/pages/maximum-slope-line/maximum-slope-line`

## 2. 冻结的页面行为

### 平面的表示方法

- 保留五种几何元素表示法：三点定面、点与直线、相交两线、平行两线、平面图形。
- 保留迹线表示法 `P_H`、`P_V`、`P_W`。
- 页面保持单 Canvas、固定单屏和无滚动。
- 空间关系区显示 V/H/W 三个投影面，目标平面与迹线保持清晰边距。
- 三面投影使用完整投影对应线、45° 转位线和文字避让。
- 六个模式按钮保持当前紧凑尺寸，不增加首页入口。

### 平面的投影规律

- 首页平面模式继续保留一般面、水平面、正平面、侧平面、铅垂面、正垂面和侧垂面七种类型。
- 保留 A、B、C 三个空间顶点及九个投影点拖动。
- 三点共线时拒绝更新；特殊位置平面的对应投影积聚为直线。
- 空间平面、三面投影和投射对应关系继续使用同一组顶点数据。

### 最大斜度线

- 保留有限平面块、H/V/W 三条迹线、α/β/γ 切换和方向点拖动。
- 保留平面角、当前直线角、最大值状态及红色高亮。
- 页面不显示首页入口；标题“平面最大斜度线”保持单行，重置按钮保持 `48×26px` 并靠右。
- 空间图和三视图中的投影面平行线、候选线和迹线保持当前细实线宽度；不得恢复加粗衬底。
- H/V/W 标位、直角方框、最大斜度线定义卡和重置行为保持不变。

## 3. 冻结文件

以下独立页面与专项检查为整文件冻结范围：

| 文件 | 行数 | SHA-256 |
| --- | ---: | --- |
| `pages/plane-representation/plane-representation.js` | 159 | `A15C968AAC8A40B6471FB5AC7B4D749C15619382AB7851150307525BAF6B9416` |
| `pages/plane-representation/plane-representation.json` | 6 | `482352D84FA95709A20ADEF802C36CD2337FF4661EC90E2D6FF921C017EACEE1` |
| `pages/plane-representation/plane-representation.wxml` | 40 | `471D060378319374FD41D0A820D554EDED2697C4E582E09A116F850102D0AE82` |
| `pages/plane-representation/plane-representation.wxss` | 272 | `D3C76A8D6A3B782277CB64FC239C9C11FEBA12C0B16B8ADAF700F08A3648208D` |
| `pages/plane-representation/plane-representation-model.js` | 367 | `ED393C055786ECD5BB4EF2646227AEF454B14C178EEB0DE9F658F27271D99379` |
| `pages/plane-representation/plane-representation-render.js` | 888 | `FB355F4B605BF5E2CA34D60AEF4B8E309C4E5AC3BA7831A7DC9FB4515F8611FA` |
| `pages/maximum-slope-line/maximum-slope-line.js` | 289 | `17A90616FA999010086F1E04B5CFB53332C7F097ADE3D47F4F0B3B025957B7BE` |
| `pages/maximum-slope-line/maximum-slope-line.json` | 6 | `4D798ADCD9BE54DB3DA1618A65DCF6850FEA9EF2A255DBBF1A3916A9F2E1DF80` |
| `pages/maximum-slope-line/maximum-slope-line.wxml` | 81 | `C7BA645717DEFB6DC980EFEB0F388CA06880A6D1C746718BB09DC32D626D60F3` |
| `pages/maximum-slope-line/maximum-slope-line.wxss` | 235 | `6A1672EC7FAC4A2FD49100DB08A890775739290D6F3A2B886A647BD7DB708DD7` |
| `pages/maximum-slope-line/maximum-slope-model.js` | 592 | `6FCE9ED326C9A90C233D97A9360FA2D39B0CFBF5B0CAD4D764DA087C74B1EB50` |
| `pages/maximum-slope-line/maximum-slope-render.js` | 619 | `31E5A90B20E5B0AA5487D0867762EFC888C818DF2CC040820048D429795CB885` |
| `scripts/plane-representation-check.cjs` | 383 | `A6F5C33B8B4BB78F64EB7248A5F7BF95B5465B856776340C0050D1A6A9638B97` |
| `scripts/maximum-slope-line-check.cjs` | 527 | `780ADF1D0B542C8FE656335E5AB2CE629CE0F53AEA4003A74CEF5FDE480FCFC4` |

`pages/index/`、`config/course-catalog.js`、`app.json` 同时服务其他章节，因此不按整文件锁定。后续修改共享文件时必须保持：

- 第三章顺序为“平面的表示方法 → 平面的投影规律 → 最大斜度线”；
- 上述三个知识点 ID 和路由不变；
- 首页平面模式七种类型、顶点拖动和三视图关系不变；
- `point-line-in-plane` 不重新进入课程目录或页面注册。

## 4. 修改规则

默认不得再修改冻结页面或弱化已经确认的行为。只有以下情形允许修改：

1. 用户明确要求调整平面章节；
2. 存在可复现的真实缺陷，并已记录复现步骤、输入和实际结果。

修改共享文件后，至少执行：

```powershell
node scripts/plane-representation-check.cjs
node scripts/maximum-slope-line-check.cjs
node scripts/home-course-check.cjs
node scripts/index-mode-route-check.cjs
node scripts/navigation-migration-check.cjs
node scripts/page-session-lifecycle-check.cjs
node scripts/run-all.js
git diff --check
```

涉及 Canvas 或布局的修改还必须在微信开发者工具中检查手机与 PAD 尺寸，并安排真机回归。

## 5. 冻结前验证

| 检查 | 结果 |
| --- | --- |
| 平面的表示方法专项检查 | `121/121` 通过 |
| 最大斜度线专项检查 | `734/734` 通过 |
| 课程首页检查 | `176/176` 通过 |
| index 五模式深链检查 | `65/65` 通过 |
| 导航迁移检查 | `152/152` 通过 |
| 学习页会话生命周期检查 | `161/161` 通过 |
| 全量本地检查 | `50/50` 通过 |
| `git diff --check` | 通过 |
| 微信开发者工具 | 已检查平面的表示方法、首页平面模式和最大斜度线 |

本次未执行手机或 PAD 真机回归，因此不把模拟器检查表述为真机验收。

## 6. 回滚与限制

- 当前冻结不是 Git commit 或 tag，只记录当前工作区文件哈希和已验证行为。
- 哈希可用于判断文件是否被改动，但不能单独恢复文件内容。
- 共享页面为其他章节保留实现空间；保护范围是平面章节行为与回归结果，不是共享文件整文件零改动。
- 后续若修改共享课程目录，必须重新核对第三章三项顺序与路由。
