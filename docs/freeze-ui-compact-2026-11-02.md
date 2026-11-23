# 学生端紧凑画布 UI 冻结记录（2026-11-02）

> 冻结标识：`ui-compact-2026-11-02`
> Git 基准：`4cc676b`（`v1.3.0`）
> 冻结形态：纳入 `v1.4.0` 发布提交的文件快照
> 用户验收：用户于 2026-11-02 确认实际测试通过

## 1. 冻结范围

本批冻结只包含学生端知识点与画布界面的紧凑布局调整：

- 首页 `point / line / plane / solid / section` 五种模式统一使用紧凑画布；
- `pages/projection/` 投影体系页的黑色空间区与展开投影区压缩；
- `pages/triangle-method/` 直角三角形法页的纵向压缩、三维图满框和摘要删减；
- `pages/right-angle-projection/` 直角投影定理页的紧凑控件、紧凑布局、满框三维图和定理内容；
- 上述页面共用的布局守护检查。

工作区中同时存在的 AI、云函数、教师后台和其他文档改动不属于本冻结批次，不进入下列哈希清单。

## 2. 冻结内容

1. 首页五种空间对象使用同一套紧凑画布尺寸与轴线起点；三维对象比例、投影公式和拖动逻辑不变。
2. 手机竖屏黑色空间区按三维对象内容重新收紧，Z 轴顶端、H 面底边与黑色边界对齐。
3. 投影区原点与可见 X/Y 轴完全重合；拖动可到达坐标轴，但不会越过轴进入相邻投影区域。
4. 投影体系页保留第一分角、八分角以及多角度旋转/展开能力；压缩后所有极限姿态仍在黑框内。
5. 直角三角形法与直角投影定理页使用紧凑按钮、紧凑定理卡及满框三维显示。
6. 三角形法摘要卡不再显示 `G03` 行、A/B 坐标和后续知识点占位。

## 3. 冻结文件哈希

### 3.1 首页与投影体系

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `EE8FB25C37AF859C5F215174631653E4A63BB40BF7BFC49959C1DE13CE74AC5A` |
| `pages/index/index.js` | `6F17ED53CFE3A842FFEF1FB9E7DF30CAB71E9B2A1193A9D1C1E5734B7BB12ED4` |
| `pages/index/index.json` | `EFD7D1ACFB0BB5EF1268FC3893A2DD42D6657E5B4AA28D69955BFBC53A01BF57` |
| `pages/index/index.wxml` | `EC057D867D6503EA70ABD19BD825C37C31F4CC06866FEED8BC9DBE45B67C9533` |
| `pages/index/index.wxss` | `75986A55E285123AECD9B0DCCB5E9F8C45B20081F2AF84ADF6064E91A43F0F99` |
| `pages/index/render-scene.js` | `77F22AA6EC8904AF5AA6F9DEAE232FE09A0A18CCC118403BF5BBD42D990971E9` |
| `pages/projection/projection.js` | `447153FC11221F7DDBED416CF6D7E6DA7112547EE09EB0785E0FE11F5EA6B70C` |
| `pages/projection/projection.wxml` | `EAA3586397FD5DD9F64EF343BB924CBA71986F5305A2973D29B6AFDD4625F15D` |
| `pages/projection/projection.wxss` | `A238D15E74D0B71B5460D577CF44F84E6EAB4AE6F094385484452DD99DC6B44D` |
| `pages/projection/projection.json` | `A0CDD237A7D0FB863B0AFFAC8F3FFE74A1BB533F15A0C52B3DCD4CFB56635087` |
| `pages/projection/unfold.js` | `8BA9BF038BAE4ACA598F65AB62E1FCB2FB789069A8DF1CFC36E5FFF321CE9923` |

### 3.2 直角三角形法

| 文件 | SHA-256 |
| --- | --- |
| `pages/triangle-method/triangle-method.js` | `93A39E13BCD9C4ED741BECA314CEB871A322AB669CB95A061E384D237BE407C2` |
| `pages/triangle-method/triangle-method.wxml` | `731641594163A30494182F6100EA80D4EE391D016C5874E9E68A51DA0F1AAB70` |
| `pages/triangle-method/triangle-method.wxss` | `6CFAFF29E0FC1F5B9CEB55294FA206077E6B08EEAF49D09E89FCDD267B21BDAD` |
| `pages/triangle-method/triangle-method.json` | `3A68D8018BA869D63DB05A0624B685997BB4991D442EF5988B486F962E9FED20` |
| `pages/triangle-method/triangle-metrics.js` | `D83018D193813A5BC2030417329940C5B3ABECC93A5AAF2DC288EEFDD39FF907` |
| `pages/triangle-method/triangle-render.js` | `BFD717406CE9F136C5A08C43A2948A825CD550A77134719A4A46D039B37730E9` |

### 3.3 直角投影定理

| 文件 | SHA-256 |
| --- | --- |
| `pages/right-angle-projection/right-angle-projection.js` | `4E5D77F48E9C750912EEE4DCC5BD535359EFDB4B5CC530BEEDCF8C0E953C2DD1` |
| `pages/right-angle-projection/right-angle-projection.wxml` | `C3133A45F249434BF1B575775D38771D8AF3FE543F974EA9B8B86E590F953A41` |
| `pages/right-angle-projection/right-angle-projection.wxss` | `981E66DA7DEDDFF0CA6E6FB98D6B9E972092D1E0B737D3D99BC7DE65618D0241` |
| `pages/right-angle-projection/right-angle-projection.json` | `0FF84E1F4D722D1550DE5E64B04BA94190C128E2C8A06FCEEB2C2612A6C94812` |
| `pages/right-angle-projection/right-angle-model.js` | `024A04FF3D901E7826F70AEDA167DC0649B01D62AB9FDFDB306456A3A7B5F690` |
| `pages/right-angle-projection/right-angle-render.js` | `447BD7764A0DFBCFF5E2373D03E2E4A0E5AC919D10263E72DD7DA7EE8AB1C1F0` |

### 3.4 守护脚本与设计记录

| 文件 | SHA-256 |
| --- | --- |
| `scripts/layout-check.cjs` | `868D0317C9489835B482FBF37B091213C4FF62059C0B85399E126806F08C9F38` |
| `scripts/triangle-method-check.cjs` | `7688219A584959F3EDEA334E0DF05CC55B421A789FDDE64D6056E27DE9C308AB` |
| `scripts/right-angle-projection-check.cjs` | `B8F8E1450A176A059975158DEA66668AD0C2939199B4FEED23B75CA17F033D55` |
| `docs/design/triangle-method-stage1.md` | `3C332EACF3EB0304D059A09AE958BE85A4E44EF207A054804723C8632BF348AC` |
| `docs/design/right-angle-projection-stage1.md` | `A74922335100277D0780B2CDC1FA3615988BAE5A10B0A7A2E14812BEF08DD899` |
| `docs/freeze-triangle-method-2026-11-01.md` | `8F0D506C4FE251E88E193F80341107F0DB45B5B8E46CAA38E9A17075BD4F2BBF` |

## 4. 验证证据

| 检查 | 结果 |
| --- | --- |
| `node scripts/run-all.js`（v1.4.0 隔离发布树） | 31/31 项通过 |
| 几何真值回归 | 289/289 通过 |
| 首页布局校验（五模式 + 投影体系） | 全部通过 |
| 直角三角形法专项 | 155/155 通过 |
| 直角投影定理专项 | 743/743 通过 |
| 静态接线检查 | 29/29 通过 |
| 截交三视图等价性守护 | 17/17 通过 |
| 模拟器：首页五模式 | 三维图、三视图、参数区与拖动均已检查 |
| 模拟器：投影体系 | 第一分角、八分角、多档视角与 0/45/90° 展开无裁切 |
| 模拟器：两个知识点页 | 紧凑布局、拖动、高亮、定理内容均正常 |
| 真实设备 | 用户确认测试通过（未提供设备型号与系统版本） |

以上本地检查不等同于 CI；云函数、数据库和教师后台不在本批冻结范围。

## 5. 冻结约束

1. 表内源码在冻结后不得以“整理、统一、更美观”为由重构。
2. 后续修改须由用户明确要求，并能指出可复现问题或具体产品需求。
3. 修改后必须重跑专项检查、`node scripts/layout-check.cjs` 和 `node scripts/run-all.js`，并在完成后更新本记录哈希。
4. 本批冻结纳入 `v1.4.0` 发布提交；上传、审核和线上发布状态以版本冻结记录及微信公众平台为准。
5. 工作区中的其他未提交改动不属于本冻结批次，不得据此覆盖或回滚。

## 6. 回滚边界

本冻结对应已修改或新增的工作区文件。回滚应由用户在明确目标后执行；Agent 不代为丢弃工作区改动。核对命令：

```powershell
Get-FileHash app.json,pages/index/index.js,pages/index/render-scene.js,pages/index/index.wxss -Algorithm SHA256
node scripts/layout-check.cjs
node scripts/run-all.js
```

## 7. 2026-11-03 v1.4.1 冻结后修订

根据用户明确要求，在 `v1.4.0` 冻结后仅修订直角投影定理页：

- C/D 投影拖动圈由 10/8px 缩小为 6/5px，与其他点标记尺寸协调；拖动命中半径、几何真值和投影公式不变；
- 定理 I 的“垂直相交”改为“垂直相交或交叉”，定理 II 的“相交两直线”改为“相交或交叉两直线”；
- 专项检查新增 C/D 拖动圈尺寸断言，防止视觉尺寸回退。

本轮实际验证：

| 检查 | 结果 |
| --- | --- |
| `node scripts/right-angle-projection-check.cjs` | 744/744 通过 |
| `node scripts/run-all.js` | 38/38 项通过 |
| 微信开发者工具模拟器（375px 手机竖屏） | C/D 圆圈、拖动单端固定、灰显/高亮、90° 标记、两条定理文案均正常 |

本轮已纳入 `v1.4.1` 发布（提交 `8bca382`，tag `v1.4.1`），详见 `docs/freeze-v1.4.1-2026-11-03.md`。

## 8. 2026-11-05 导航职责迁移修订

用户明确要求将课程导航从学习页迁回课程首页，并保留原生标题栏、原生返回以及全部教学控件。本轮只修改以下页面导航结构和样式：

- 移除 `pages/index/index.wxml` 顶部的个人信息、投影体系和模块选择器常驻工具条；
- 保留 `handleModulePicker`、`moduleOptions`、`moduleIndex` 等 Web 兼容接口；
- 移除 `pages/projection/projection.wxml` 的深色常驻工具栏，将投影范围和展开状态放回内容区；
- 在首页画布卡片及投影体系、直角三角形法、直角投影定理页增加紧凑的“首页”入口；
- 不修改 Canvas 绘制、几何算法、投影公式、触摸处理、学习会话或教学参数逻辑。

本轮修改后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `83D4FFABA7F74A57C774AD826CB3A7623CE92B334136851DE4C65437CCDCDBE4` |
| `pages/index/index.js` | `9EABB1ABB26CBB890E115F1BC53C464169506AAF63066FEA55176ACC75448A02` |
| `pages/index/index.wxml` | `696E7F309964FAB71F3C6BA3F59DDF19E9D22E649F7D47E914411474D84770E6` |
| `pages/index/index.wxss` | `3C5E543445F264DA298B0994CE5514722644D0C38C9654F5C4F8AB9306642B82` |
| `pages/projection/projection.wxml` | `C29B13DC992A097B75AC802E61C55AF41C10790448A37CA7A9AD9552DE15D01B` |
| `pages/projection/projection.wxss` | `6BC34C6208C43AF8E16AE3EE76F88E67A9F27DE7B6542C08637DE8850CDB1709` |
| `pages/triangle-method/triangle-method.wxml` | `D47238DE547B1E929EFEF2B009C7F49AA08123F4815915B8520F3C1ED63755BA` |
| `pages/triangle-method/triangle-method.wxss` | `78E5BA388C33E3AC43D3049FFA44388C299A2C656A51D54B95298ECE3B76394A` |
| `pages/right-angle-projection/right-angle-projection.wxml` | `700C216D2BF2F58A163C19B1B7709775E22EF6615723172B8F7B75B77544A67F` |
| `pages/right-angle-projection/right-angle-projection.wxss` | `E831E110F3A7CAE65E0FFA263E5E8D40DDCB104B4D53D0A12D310675BED30FEB` |

本轮验证：`node scripts/navigation-migration-check.cjs` 100/100、`node scripts/layout-check.cjs`、`node scripts/pad-fit-check.cjs` 和 `node scripts/run-all.js` 43/43 均通过。微信开发者工具和真机验收状态以当轮交付报告为准，不得用本地检查替代。

## 9. 2026-11-07 投影法基础入口登记

用户明确要求将课程目录中的“投影的基本概念”更名为“投影法基础”，并跳转新增的 `pages/projection-method/projection-method`。本轮只更新 `app.json` 的页面注册和课程目录路由，不修改本记录中的页面导航结构、Canvas 尺寸或教学触摸逻辑。

更新后的 `app.json` SHA-256：

`83D4FFABA7F74A57C774AD826CB3A7623CE92B334136851DE4C65437CCDCDBE4`

## 10. 2026-11-07 正投影入口登记

用户明确要求在“投影法基础”之后新增“正投影”知识点。本轮注册独立页面 `pages/orthographic-projection/orthographic-projection`，并在课程目录中形成“投影法基础 → 正投影 → 三面投影体系”的顺序。

本轮只更新 `app.json` 的页面注册和课程目录路由，不修改本记录中的页面导航结构、Canvas 尺寸或教学触摸逻辑。更新后的 `app.json` SHA-256：

`873FBAA440DCAC7D5D17A35F05D48E8C6CE44EDED427F1FBA83A73B2AC94C996`

## 11. 2026-11-07 投影体系与点投影首页入口删减

用户明确要求删除投影体系页以及点的投影页面中的“首页”入口。本轮删除 `pages/projection/projection.wxml` 的首页导航及对应私有样式；`pages/index/index.wxml` 由五种模式共用，因此只在 `mode === 'point'` 时隐藏首页入口，直线、平面、基本立体和平面切割立体模式保持原导航。

本轮不修改 Canvas 尺寸、几何算法、投影公式、触摸处理或学习会话。更新后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `pages/index/index.wxml` | `040B27B7EDA7FBFA09EDB7E4F9484A166C6E2E4BC8CCCA1DEB4F52272140CD71` |
| `pages/projection/projection.wxml` | `59E8523A42ABA046D69B81C47F190EB233E676B0E694D7F84226E5B2C73DF800` |
| `pages/projection/projection.wxss` | `A6E4A77C3027E87D525F5E80D0F055A783EE3FDDFEB4ECA463C06E2740AB36BA` |

## 12. 2026-11-07 投影体系卡片头压缩

用户明确要求把“三投影面体系与投影面展开”标题尽量保持在一排，缩小重置按钮并放到最右侧，同时节约纵向空间。本轮只压缩卡片头和副说明，不修改 Canvas 尺寸、投影算法、展开逻辑或触摸交互。

更新后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `pages/projection/projection.wxml` | `BCF0147B705B971A9B21448C912EC9CFDC5A47F85CD6CCBE50F7090496267499` |
| `pages/projection/projection.wxss` | `EAEFF5D7D696F0C0BC80E347256F54A1CE04EBAED6FFF838D3525B3F6AF99214` |

## 13. 2026-11-07 直线模式关键知识点入口删减

用户明确要求删除直线投影页面中的“关键知识点”入口区。直角三角形法与直角投影定理继续通过课程首页第二章知识点直接映射到对应独立页面；平面模式的“最大斜度线”和“直线与平面”入口保持不变。

本轮不修改直线几何、拖动、三视图或页面会话逻辑。更新后的 `pages/index/index.wxml` SHA-256：

`34D7DED986BE7CCC2FB042A2E51E688F531D0816FEAC1E5718AB4F1D0FDF3D93`

## 14. 2026-11-07 直线章节页面紧凑头部修订

用户明确要求检查直线章节所有页面，删除首页入口、缩小重置按钮并靠右、左侧标题单行显示，以节约高度空间。本轮涉及直线投影模式、直角三角形法和直角投影定理三个实际页面；“两直线位置关系”没有独立页面，不涉及布局。

本轮不修改几何真值、投影公式、Canvas 尺寸、拖动或学习会话。更新后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `pages/index/index.wxml` | `51673D4AE9E5DC38696FE1C842F1A7C888C433AD976951A3AAA534803DBAEA35` |
| `pages/index/index.wxss` | `DA0C719E55EED4B0F0A437946B844D625448DFF29E21EFB14BC62EACA23E0F42` |
| `pages/triangle-method/triangle-method.wxml` | `6746A4285EECDFFD2CE1C6D35F392B14E8858167168F9182E9959425B64C3B4B` |
| `pages/triangle-method/triangle-method.wxss` | `5CD4F958E54CFE9229EAEE0ACEB3622D576D18CCFFB11A9CB211588673FD71B5` |
| `pages/right-angle-projection/right-angle-projection.wxml` | `7111B55C1108956861E334B80269D9C5E2F2B21555AC3BA6951BA67E2FD1419C` |
| `pages/right-angle-projection/right-angle-projection.wxss` | `E1258428B2CA89C8054A7DDB1487197903BA1FF8E97C1FBE286B93BD887D52E3` |

## 15. 2026-11-07 平面模式关键知识点与紧凑头部修订

用户明确要求删除“平面的投影规律”页面中的关键知识点入口，并按直线章节规格优化首页、重置按钮、单行标题和纵向空间。本轮删除最大斜度线与线面关系重复入口；两项继续由课程首页第三、四章直接映射。平面模式隐藏首页入口，标题保持单行，重置按钮使用紧凑尺寸并靠右。

本轮不修改平面顶点、三视图、拖动或会话逻辑。更新后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `pages/index/index.wxml` | `6C7C556AC4DDF0DFB3FE892F33D0287C62CFBEA8119F996F1F529EAAAC27C90B` |
| `pages/index/index.wxss` | `B5BDC92A474315A35C7E3EDF6D1C2952B3603446EB9FC32FEB7C16D1B537015B` |

## 16. 2026-11-07 两直线位置关系页注册

用户明确要求在第二章新增并开放“两直线位置关系”单页探索版本。本轮只更新 `app.json` 页面注册和课程目录路由；新页面自身待视觉确认，尚未纳入本记录的文件冻结表。

更新后的 `app.json` SHA-256：

`5ED6501E1177BEB00D1F7E26B24E69335728CC479CF382A58850E80C764AA8AA`

### 2026-11-08 平面的表示方法页接入

新增 `pages/plane-representation/plane-representation` 并注册到 `app.json`，课程目录的“平面的表示方法”改为该独立页面。“平面的投影规律”仍使用原平面模式。更新后的 `app.json` SHA-256：

`62CBA1ECB3C3D66837B4FCCA262DD6FA6126862132A758101FD8C5A93263926D`

### 2026-11-22 线面、面面垂直页接入

新增并注册 `pages/perpendicular-relations/perpendicular-relations`，课程首页第四章“线面、面面垂直”改为进入该静态图文页。本次不修改首页紧凑画布、点/线/面拖动、投影体系或既有知识页交互。更新后的 `app.json` SHA-256：

`2FBDAA6C0E23D52CEDEFDF7B0D148845CF2204BC39114D6E6BD1C48279CF5743`

### 2026-11-22 立体投影拆分

新增 `pages/plane-solid-projection/plane-solid-projection` 与 `pages/curved-solid-projection/curved-solid-projection`，复用原首页立体几何、三视图和参数模块。旧 `pages/index` 保留兼容深链，但不再显示 AI 入口。更新后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `9B378833F7E00D972EA3765E0071033754221C02DC82FEE4C0AF6670421D8610` |
| `pages/index/index.js` | `BB9C4079D382BD829EBA3702A6BAE74CEA3F51F340190E5EEA7B4ADB2E42F8BF` |
| `pages/index/index.wxml` | `B06DCC68A8E8676424E2A92E3C520E9681F5C14B413E122E36B6C6E2BC4284D5` |

### 2026-11-22 第六章平面与立体相交拆分

新增 `pages/plane-solid-intersection/plane-solid-intersection` 与
`pages/curved-solid-intersection/curved-solid-intersection`。两页复用原
`pages/index` 的截交几何、空间绘制、三视图和截平面控件；旧 section 深链保留兼容。
更新后的 `app.json` SHA-256：

`11EB6688994D96D3A6F860191440C875FFAE512DFDCF7DA463BFCEAFB019F7CA`

### 2026-11-22 产品理念入口授权扩展

用户明确要求为首页产品名称和三个育人理念卡新增独立介绍页。`app.json`
只增加“关于我们、动脑思考、动手探索、善用工具”四个页面注册，首页课程章节、
知识点、搜索及原个人信息入口保持不变。更新后的 `app.json` SHA-256：

`01A8E65AC93125D2648D1D10644556FCCDF06CFBBF7C289A47873C00C9B87816`
