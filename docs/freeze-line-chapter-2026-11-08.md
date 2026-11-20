# 直线章节冻结记录（2026-11-08）

> 冻结标识：`line-chapter-2026-11-08`
> 冻结日期：2026-11-08
> Git 基准：`12d5f4c`（`v1.6.0`）
> 冻结性质：当前工作区快照；不是 Git commit、tag、部署或线上发布

## 1. 冻结范围

本记录冻结第二章“直线的投影”在课程首页中的入口与下列四个知识点：

1. 直线的投影规律
2. 直角三角形法求实长
3. 两直线位置关系
4. 直角投影定理

知识点 ID 和页面映射为：

- `line-projection` → `/pages/index/index?mode=line`
- `triangle-method` → `/pages/triangle-method/triangle-method`
- `two-line-position` → `/pages/two-line-position/two-line-position`
- `right-angle-projection` → `/pages/right-angle-projection/right-angle-projection`

## 2. 冻结的页面行为

### 直线的投影规律

- 首页直线模式保留一般线、水平线、正平线、侧平线、铅垂线、正垂线和侧垂线七种类型。
- 保留空间直线、第一角三视图和投影端点拖动。
- 三视图分别使用小写投影点、细实投影对应线和 `Y_H`–`Y_W` 转位关系。
- 标题保持单行，重置按钮保持紧凑并靠右；不恢复已删除的关键知识点入口。

### 直角三角形法求实长

- 保留 H/V/W 页签、实长与倾角计算、空间及投影直角三角形和端点拖动。
- 页面继续作为独立知识点页使用，不并入首页直线模式。

### 两直线位置关系

- 第一排固定为“平行判断 / 相交判断”，第二排固定为“一般位置直线 / 特殊位置直线”。
- 默认状态为“平行判断 + 一般位置直线”。
- 一般位置案例使用一般位置直线；特殊位置平行反例使用侧平线，特殊位置相交反例使用水平线与正平线。
- 特殊位置反例必须体现投影表象与真实空间关系的差异，并使用空心点标识非空间交点的投影视交点。
- 空间图不显示端点黑字和最近距离 `d=` 文本；空间投影线保持高对比度。
- 不恢复端点拖动、旋转、重置、交叉选项、关系分析卡或“为什么”入口。
- 底部保留平行/相交判别准则正文及一般/特殊位置高亮判断要点。

### 直角投影定理

- 保留水平线、正平线、侧平线三种状态，以及空间垂直、对应投影直角的联动验证。
- 保留已有的 C/D 端点拖动、重置和定理 I/II 文案。

## 3. 冻结文件

以下独立知识点页和专项检查为整文件冻结范围：

| 文件 | 行数 | SHA-256 |
| --- | ---: | --- |
| `pages/triangle-method/triangle-method.js` | 272 | `E23FD0977A05028F69067948E0DFFB73A10DC6424336CB572159AC9CABB66494` |
| `pages/triangle-method/triangle-method.json` | 6 | `3A68D8018BA869D63DB05A0624B685997BB4991D442EF5988B486F962E9FED20` |
| `pages/triangle-method/triangle-method.wxml` | 80 | `6746A4285EECDFFD2CE1C6D35F392B14E8858167168F9182E9959425B64C3B4B` |
| `pages/triangle-method/triangle-method.wxss` | 206 | `5CD4F958E54CFE9229EAEE0ACEB3622D576D18CCFFB11A9CB211588673FD71B5` |
| `pages/triangle-method/triangle-metrics.js` | 192 | `D83018D193813A5BC2030417329940C5B3ABECC93A5AAF2DC288EEFDD39FF907` |
| `pages/triangle-method/triangle-render.js` | 614 | `BFD717406CE9F136C5A08C43A2948A825CD550A77134719A4A46D039B37730E9` |
| `pages/two-line-position/two-line-position.js` | 321 | `DCB721456F2AD05E94983A93F4B25121AA77A12C0F49A24DF2DBB22D0BAEF0BF` |
| `pages/two-line-position/two-line-position.json` | 8 | `8CF662AB33F9CECF7B1FF9662A16F9C696B26733E14A5F0028F9165DD5F48F96` |
| `pages/two-line-position/two-line-position.wxml` | 60 | `4E5378DFBA397AEF8B698683D889137ACC39FF7F51963938CC9E3C8C1714323E` |
| `pages/two-line-position/two-line-position.wxss` | 257 | `70A25739F1F05C10E5EE93B25E74369051E328CBE2C5029948F0D6B6B1E0E3D9` |
| `pages/two-line-position/two-line-position-model.js` | 397 | `8B53645E3830EA03D659F4FB8A4CAF3D794E7847C63BFDC56179C47256A35420` |
| `pages/two-line-position/two-line-position-render.js` | 488 | `1C1B5E2AB66D38A5083E8526664BA46B02FC598A7943ED315AA73A6B4EC42646` |
| `pages/right-angle-projection/right-angle-projection.js` | 340 | `2E914958068274D8D1FD52792F38C1F81ADC6003155997B9B202B917CC454BDF` |
| `pages/right-angle-projection/right-angle-projection.json` | 6 | `0FF84E1F4D722D1550DE5E64B04BA94190C128E2C8A06FCEEB2C2612A6C94812` |
| `pages/right-angle-projection/right-angle-projection.wxml` | 72 | `7111B55C1108956861E334B80269D9C5E2F2B21555AC3BA6951BA67E2FD1419C` |
| `pages/right-angle-projection/right-angle-projection.wxss` | 203 | `E1258428B2CA89C8054A7DDB1487197903BA1FF8E97C1FBE286B93BD887D52E3` |
| `pages/right-angle-projection/right-angle-model.js` | 331 | `024A04FF3D901E7826F70AEDA167DC0649B01D62AB9FDFDB306456A3A7B5F690` |
| `pages/right-angle-projection/right-angle-render.js` | 528 | `447BD7764A0DFBCFF5E2373D03E2E4A0E5AC919D10263E72DD7DA7EE8AB1C1F0` |
| `scripts/triangle-method-check.cjs` | 417 | `5370DF9B41FD46E6E671C6FC61E7E278D991E4115C6C640355BF84CB0219DF3D` |
| `scripts/two-line-position-check.cjs` | 492 | `4E81C454ADAE09A859B2004D1957A24571F2336D0ABC89AB22CA0A4F2BAE053B` |
| `scripts/right-angle-projection-check.cjs` | 544 | `337D5415844E72FC90E22D542656D9C64BA0EC43B00CC66E9D1AD55AB4682289` |

共享文件 `pages/index/`、`config/course-catalog.js`、`app.json` 同时服务平面、立体和课程结构，因此不按整文件锁定。后续修改这些共享文件时，直线模式及第二章四个知识点必须保持本节行为，并重新通过直线章节回归。

## 4. 修改规则

默认不得再修改上述独立知识点页或弱化已经确认的直线章节行为。只有以下情形允许修改：

1. 用户明确要求调整直线章节；
2. 存在可复现的真实缺陷，并已记录复现步骤、输入和实际结果。

平面章节开发可以修改共享文件，但不得改变直线章节的课程顺序、路由、七种直线类型、投影拖动、三点知识页交互或文案。发生共享文件变更后，必须重新执行直线章节全部专项检查。

## 5. 冻结前验证

| 检查 | 结果 |
| --- | --- |
| 直角三角形法专项检查 | `156/156` 通过 |
| 直角投影定理专项检查 | `744/744` 通过 |
| 两直线位置关系专项检查 | `2131/2131` 通过 |
| 课程首页检查 | `176/176` 通过 |
| 导航迁移检查 | `146/146` 通过 |
| 全量本地检查 | `49/49` 通过 |
| `git diff --check` | 通过 |
| 微信开发者工具 | 已检查两直线位置关系四种组合、空间投影线、文字间距和投影面角标 |

本次未执行手机或 PAD 真机回归，因此不把模拟器检查表述为真机验收。

## 6. 回滚与限制

- 当前冻结不是 Git commit 或 tag，只记录当前工作区文件哈希和已验证行为。
- 哈希可用于判断文件是否被改动，但不能单独恢复文件内容。
- 共享页面为平面章节保留实现空间；其保护范围是直线模式行为与回归结果，不是整文件零改动。

## 7. 2026-11-08 顶部按钮防重叠修订

用户明确指出“两直线位置关系”页顶部两排四个按钮存在文字框重叠。本轮仅修改 `pages/two-line-position/two-line-position.wxss`：

- 两排按钮容器强制 `width: 100%`、`box-sizing: border-box` 和 `overflow: hidden`；
- 每个按钮强制占满自身网格列，限制 `max-width: 100%` 并启用单行省略；
- 不改变判断类型、位置类型、预设几何、Canvas 绘制、会话记录或底部判别准则。

修改后专项检查更新为 `2132/2132` 通过，并纳入直线章节冻结哈希。
