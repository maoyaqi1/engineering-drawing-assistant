# 课程目录与线/面模式 UI 冻结记录（2026-11-07）

> 冻结标识：`course-ui-compact-2026-11-07`
> 冻结日期：2026-11-07
> Git 基准：`12d5f4c`（`v1.6.0`）
> 冻结性质：当前工作区文件快照；不是 Git commit、tag、部署或线上发布

## 1. 冻结范围

本记录冻结本次连续调整形成的课程目录、正投影页、点/线/面模式导航与紧凑头部、投影体系页头，以及对应检查脚本。

不纳入本次冻结：

- 工作区中原有的 AI、登录、问卷、云函数和教师端未提交改动；
- `web-release/`、`screen/` 和用户资料文件；
- 未由本记录列出的其他页面行为。

## 2. 课程目录契约

课程目录以 `config/course-catalog.js` 为唯一数据源，当前关键顺序如下：

1. 第一章：`投影法基础 → 正投影 → 三面投影体系`。
2. 第二章只保留：`直线的投影规律 → 直角三角形法求实长 → 两直线位置关系 → 直角投影定理`。
3. 第三章：`平面的表示方法 → 平面的投影规律 → 属于平面的点和直线 → 最大斜度线`。
4. 第四章只保留：`线面、面面平行 → 线面、面面相交 → 线面、面面垂直`。
5. 第五章：`平面立体的投影 → 曲面立体的投影`。
6. 第六章：`直线与立体相交 → 截交线 → 平面与立体相交`。
7. 第七章只保留：`相贯线 → 两立体相交`。

当前真实映射：

- 正投影：`/pages/orthographic-projection/orthographic-projection`
- 直线的投影规律：`/pages/index/index?mode=line`
- 直角三角形法求实长：`/pages/triangle-method/triangle-method`
- 两直线位置关系：`/pages/two-line-position/two-line-position`
- 直角投影定理：`/pages/right-angle-projection/right-angle-projection`
- 平面的表示方法、平面的投影规律：`/pages/index/index?mode=plane`
- 最大斜度线：`/pages/maximum-slope-line/maximum-slope-line`
- 线面、面面平行：`/pages/parallel-relations/parallel-relations`
- 线面、面面相交：`/pages/line-plane-relation/line-plane-relation`
- 线面、面面相交概览：`/pages/intersection-relations/intersection-relations`
- 面面相交求交线：`/pages/plane-plane-relation/plane-plane-relation`
- 平面立体的投影：`/pages/plane-solid-projection/plane-solid-projection`
- 曲面立体的投影：`/pages/curved-solid-projection/curved-solid-projection`
- 截交线、平面与立体相交：`/pages/index/index?mode=section`

待开放项不得伪造页面映射，包括：属于平面的点和直线、线面/面面垂直、相贯线、两立体相交等。

## 3. 冻结的页面行为

### 正投影页

- 页面只保留“正投影的基本性质”模块，不设顶部独立定义卡。
- 只提供一个 Canvas，统一使用“真实性、积聚性、相似性”。
- 真实性对应投影面平行线、投影面平行平面；积聚性对应投影面垂直线、投影面垂直平面；相似性对应一般位置直线、一般位置平面。
- 投射线为细实线；三种状态共用放大且固定尺寸的投影面。
- 相似性平面在等轴测画面中保持清晰三角形，不近似为直线。

### 点、直线、平面模式

- 点、直线、平面模式不显示卡片内的“首页”入口。
- 直线、平面模式不重复显示“关键知识点”入口。
- 直角三角形法、直角投影定理、最大斜度线、线面关系通过课程首页知识点直接映射。
- 直线、平面模式标题保持单行，副说明在移动端隐藏，重置按钮约 `48×26px` 并靠右。

### 投影体系页

- 不显示“首页”入口。
- 标题“三投影面体系与投影面展开”保持单行。
- 重置按钮缩小并靠右，卡片头与副说明压缩。

## 4. 冻结文件

| 文件 | 行数 | SHA-256 |
| --- | ---: | --- |
| `app.json` | 29 | `873FBAA440DCAC7D5D17A35F05D48E8C6CE44EDED427F1FBA83A73B2AC94C996` |
| `config/course-catalog.js` | 256 | `30165ABB7BA40B311072182EB721F4E38DEBCE2CA1C96BEC6B0E785AA15CC3CF` |
| `pages/index/index.wxml` | 252 | `6C7C556AC4DDF0DFB3FE892F33D0287C62CFBEA8119F996F1F529EAAAC27C90B` |
| `pages/index/index.wxss` | 405 | `B5BDC92A474315A35C7E3EDF6D1C2952B3603446EB9FC32FEB7C16D1B537015B` |
| `pages/projection/projection.wxml` | 70 | `BCF0147B705B971A9B21448C912EC9CFDC5A47F85CD6CCBE50F7090496267499` |
| `pages/projection/projection.wxss` | 140 | `EAEFF5D7D696F0C0BC80E347256F54A1CE04EBAED6FFF838D3525B3F6AF99214` |
| `pages/orthographic-projection/orthographic-projection.js` | 295 | `595FC44DF74759AE0958E46A324FB0505D0230EC41BFA2AC8761E7C8298B62B4` |
| `pages/orthographic-projection/orthographic-projection-model.js` | 334 | `0F45084DA941BC3D1BCC10F364D4BC5F198AF72AEB1E5960ABFD7B7F158F65D5` |
| `pages/orthographic-projection/orthographic-projection-render.js` | 458 | `06BBB02604CC5FB9D944E196B786DBDD88582427417CB5863C5382C9AA80EEE0` |
| `pages/orthographic-projection/orthographic-projection.wxml` | 84 | `D666E7D107E7E391578D73F144B8837AC28101559B5CE9CA5DCF5D3AD54A020E` |
| `pages/orthographic-projection/orthographic-projection.wxss` | 356 | `B03836E85CC4E0E4163D8E173320B965BDA5924BD4D2BEA3E0BBDC06E463CC06` |
| `pages/orthographic-projection/orthographic-projection.json` | 8 | `CF81E1E3E068C5E50E99E768E33CFAEA38B6B198A6A9AC1D013DC506FA999E05` |
| `pages/triangle-method/triangle-method.wxml` | 80 | `6746A4285EECDFFD2CE1C6D35F392B14E8858167168F9182E9959425B64C3B4B` |
| `pages/triangle-method/triangle-method.wxss` | 206 | `5CD4F958E54CFE9229EAEE0ACEB3622D576D18CCFFB11A9CB211588673FD71B5` |
| `pages/right-angle-projection/right-angle-projection.wxml` | 72 | `7111B55C1108956861E334B80269D9C5E2F2B21555AC3BA6951BA67E2FD1419C` |
| `pages/right-angle-projection/right-angle-projection.wxss` | 203 | `E1258428B2CA89C8054A7DDB1487197903BA1FF8E97C1FBE286B93BD887D52E3` |
| `scripts/run-all.js` | 109 | `10DE41C4BD5825DF372D45FFB252EAA5555795BAC05ED7613DAF43B2092AE827` |
| `scripts/home-course-check.cjs` | 300 | `6E8DADF8CD26B0BBED567C546EFEC2E72DDB85BF336B442C00C9D878D9B90A7F` |
| `scripts/navigation-migration-check.cjs` | 274 | `E38741BC42E2436DA9E2407CCC030092822ABE34949D09942417BD4DFA4EAA1D` |
| `scripts/orthographic-projection-check.cjs` | 348 | `4066B781FA513B0AB6A3AA16BEB9407CCA3269FD60A359D97A2C47C351DBF556` |
| `scripts/triangle-method-check.cjs` | 417 | `5370DF9B41FD46E6E671C6FC61E7E278D991E4115C6C640355BF84CB0219DF3D` |
| `scripts/right-angle-projection-check.cjs` | 544 | `337D5415844E72FC90E22D542656D9C64BA0EC43B00CC66E9D1AD55AB4682289` |
| `scripts/maximum-slope-line-check.cjs` | 527 | `780ADF1D0B542C8FE656335E5AB2CE629CE0F53AEA4003A74CEF5FDE480FCFC4` |
| `scripts/line-plane-relation-check.cjs` | 584 | `00DBEF8E73249762AF595F128A2E796A86039D12DC4CF8716020B49BE00FBACD` |

## 5. 修改规则

默认不得重构、重命名、格式化、合并文件或顺带调整上述页面与课程目录。只有以下情形允许修改：

1. 用户明确要求修改对应页面或课程结构。
2. 存在可复现的真实缺陷，并已记录复现步骤、输入和实际结果。

修改后至少执行：

```powershell
node scripts/home-course-check.cjs
node scripts/navigation-migration-check.cjs
node scripts/orthographic-projection-check.cjs
node scripts/triangle-method-check.cjs
node scripts/right-angle-projection-check.cjs
node scripts/maximum-slope-line-check.cjs
node scripts/line-plane-relation-check.cjs
node scripts/run-all.js
git diff --check
```

涉及布局、Canvas 或交互的修改还必须重新在微信开发者工具检查手机/PAD 尺寸，并安排真机回归。本地检查通过不代表 CI、真机或线上验收通过。

## 6. 冻结前验证

| 检查 | 结果 |
| --- | --- |
| 课程首页检查 | `173/173` 通过 |
| 导航迁移检查 | `135/135` 通过 |
| 正投影专项检查 | `1390/1390` 通过 |
| 直角三角形法专项检查 | `156/156` 通过 |
| 直角投影定理专项检查 | `744/744` 通过 |
| 最大斜度线专项检查 | `733/733` 通过 |
| 线面关系专项检查 | `404/404` 通过 |
| 全量本地检查 | `48/48` 通过 |
| `git diff --check` | 通过 |
| 微信开发者工具 | 已检查课程目录、正投影、投影体系、直线投影、平面投影、直角三角形法、直角投影定理 |

本次未执行手机或 PAD 真机回归，因此不把模拟器检查表述为真机验收。

## 7. 回滚与限制

- 当前冻结没有 Git commit 或 tag，只记录工作区文件哈希和已验证行为。
- 哈希可用于判断文件是否被改动，但不能单独恢复文件内容。
- 若后续需要可直接恢复的 Git 快照，应由用户明确授权后提交或建立 tag；本记录不擅自执行。
- 线面、面面相交目前复用线面相交页；完整面面相交仍需后续扩展。

## 8. 2026-11-07 两直线位置关系页接入

用户明确要求实现单页探索版“两直线位置关系”。课程目录中的 `two-line-position` 已从待开放改为可打开，并映射到 `/pages/two-line-position/two-line-position`。

页面只提供平行判断、相交判断，不含垂直、交叉选项、挑战模式、专项训练和保存回放。用户后续确认页面应以判别方法为主：第一排仅显示“平行判断 / 相交判断”，第二排仅显示“一般位置直线 / 特殊位置直线”，默认平行判断、一般位置直线；旋转、重置和关系分析卡均已删除。一般位置案例使用两条一般位置直线；特殊位置平行反例使用两条方向不同的侧平线，使正面、水平投影看似平行而侧面投影不平行；特殊位置相交反例使用水平线和正平线，使正面、水平投影各有视交点但交点不符合点的投影规律。底部“判别准则”卡显示准则正文，并以高亮块区分一般位置与特殊位置判断要点。新页面尚未纳入当前冻结文件表；本次只更新课程入口相关哈希。

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `DA28665B782FCE8EDC409962389B591BD0D98C9A742C075547D2D7EFC23234F1` |
| `config/course-catalog.js` | `0847D075AE3AB0DE2EA2B6F8EE1078C6703ACDCE5276F534B3BCFBEC910E8009` |

## 9. 2026-11-08 平面的表示方法页接入

第三章“平面的表示方法”改为独立页面 `/pages/plane-representation/plane-representation`，原“平面的投影规律”继续映射到 `/pages/index/index?mode=plane`。新页提供五种几何元素表示法和迹线表示法共六种模式，页面固定为单屏高度且不使用 `scroll-view`。

本次只新增页面、专项检查并更新课程路由与 `app.json` 注册；首页平面画布、直线章节独立知识点页及既有页面交互未修改。该页当前等待用户视觉确认，尚未执行真机验收。

## 10. 2026-11-08 最大斜度线页头部与线宽修订

用户明确要求删除首页入口、压缩重置按钮并靠右、让“平面最大斜度线”标题单行显示，同时把空间图和三视图中的投影面平行线及最大斜度线改细。

本次仅修改卡片头布局和绘制线宽，不改变最大斜度线几何模型、方向点拖动、H/V/W 切换、角度计算、重置状态或知识卡内容。更新后的相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `pages/maximum-slope-line/maximum-slope-line.wxml` | `C7BA645717DEFB6DC980EFEB0F388CA06880A6D1C746718BB09DC32D626D60F3` |
| `pages/maximum-slope-line/maximum-slope-line.wxss` | `6A1672EC7FAC4A2FD49100DB08A890775739290D6F3A2B886A647BD7DB708DD7` |
| `pages/maximum-slope-line/maximum-slope-render.js` | `31E5A90B20E5B0AA5487D0867762EFC888C818DF2CC040820048D429795CB885` |

验证：最大斜度线专项 `734/734`、导航迁移 `152/152`、全量本地检查 `50/50` 通过；微信开发者工具已检查头部、空间图和三视图，控制台无错误。

## 11. 2026-11-09 属于平面的点和直线页移除

用户最终决定第三章不保留“属于平面的点和直线”知识点。本轮已从课程目录和 `app.json` 删除该入口，移除 `pages/point-line-in-plane/` 页面源码及专项检查，并清理首页、导航和会话测试中的引用。

第三章当前只保留：`平面的表示方法 → 平面的投影规律 → 最大斜度线`。

更新后的课程入口相关哈希：

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `62CBA1ECB3C3D66837B4FCCA262DD6FA6126862132A758101FD8C5A93263926D` |
| `config/course-catalog.js` | `2A0C23E2C9EDE153262344CABEBB23C78375112B4FA93C4F376FF2097BD2B7AE` |
| `scripts/home-course-check.cjs` | `9DCB292F1A1F026DD95F2F57EC863BA38FD4B58E5377AFA2B280C1B3C72841BB` |
| `scripts/navigation-migration-check.cjs` | `90BD3D50D7464143D92320AE074FB4F5C6F663373BF4F69908D1A57321AE11E1` |

## 12. 2026-11-09 课程章节默认收起

用户要求课程首页默认全部收起。`defaultExpandedChapterId` 已由 `chapter-1` 改为空字符串；首页加载时所有多知识点章节均折叠，点击章节后仍按原有单章节展开/收起逻辑工作。

本轮验证：课程首页 `176/176`、导航迁移 `152/152`、全量本地检查 `50/50` 通过；微信开发者工具已确认首次进入时七章全部收起，点击第一章后可正常展开。

| 文件 | SHA-256 |
| --- | --- |
| `config/course-catalog.js` | `2A0C23E2C9EDE153262344CABEBB23C78375112B4FA93C4F376FF2097BD2B7AE` |
| `pages/home/home-search.js` | `126201CDAE0E502B8F7DFF413600FBC06643C1327B247D8108CC1B23AA236FC7` |
| `scripts/home-course-check.cjs` | `9DCB292F1A1F026DD95F2F57EC863BA38FD4B58E5377AFA2B280C1B3C72841BB` |

## 13. 2026-11-19 线面、面面平行页

按用户要求新增 `pages/parallel-relations/parallel-relations` 静态图文页，并将第四章“线面、面面平行”从待开放改为可进入。页面仅保留两条平行几何条件、两幅静态示意图和两个视频号入口，不扩展几何拖动。

## 14. 2026-11-19 线面、面面相交概览页

按用户要求新增 `pages/intersection-relations/intersection-relations`：课程首页先进入概念概览页；“线面相交”按钮进入原 `pages/line-plane-relation/`，“面面相交”按钮进入新的 `pages/plane-plane-relation/`。概览页按课程图片集中表达积聚性投影、辅助平面法和两平面交线求法。

## 15. 2026-11-19 面面相交求交线页

按用户要求新增 `pages/plane-plane-relation/plane-plane-relation`，沿用线面求交点页的界面与三步引导格式。两个平面选择器均提供四种平面类型；13 种组合生成交线，3 种同向特殊平面识别为平行。相交概览页的“面面相交”按钮已改为进入本页。

## 16. 2026-11-22 线面、面面垂直页接入

按用户要求新增 `pages/perpendicular-relations/perpendicular-relations` 静态图文页，课程首页第四章“线面、面面垂直”由待开放改为可进入。页面最终使用两张用户确认的参考图表达“直线与平面垂直”和“两平面垂直”，并预留“过平面外一点作给定平面的法线”和“过平面外一点作一平面垂直于给定平面”两个视频号入口；不提供几何拖动、参数互动或 Canvas。

本轮仅新增页面、专项检查并更新课程路由与 `app.json` 注册，不修改首页点/线/面、立体、截交、已有知识页或并行关系页。更新后的 `app.json`：

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `2FBDAA6C0E23D52CEDEFDF7B0D148845CF2204BC39114D6E6BD1C48279CF5743` |

## 17. 2026-11-22 平面/曲面立体投影拆分

第五章删除“基本立体的介绍”，只保留“平面立体的投影”和“曲面立体的投影”。两页分别承载棱柱/棱锥和圆柱/圆锥/圆球/圆环，共享原 `pages/index` 的立体几何、三视图、尺寸、姿态和重置模块。旧 `pages/index?mode=solid` 保留兼容，但不再展示 AI 教师入口；AI 入口仅在新平面立体投影页按服务端准入显示。

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `9B378833F7E00D972EA3765E0071033754221C02DC82FEE4C0AF6670421D8610` |
| `pages/index/index.js` | `BB9C4079D382BD829EBA3702A6BAE74CEA3F51F340190E5EEA7B4ADB2E42F8BF` |
| `pages/index/index.wxml` | `B06DCC68A8E8676424E2A92E3C520E9681F5C14B413E122E36B6C6E2BC4284D5` |

## 18. 2026-11-22 平面与立体相交拆分

第六章删除“截交线”和旧“平面与立体相交”入口；“直线与立体相交”保留待开放。
新增“平面与平面立体相交”和“平面与曲面立体相交”两个独立页面，分别提供
棱柱/棱锥（3～8 棱步进）和圆柱/圆锥/圆球/圆环。两页共享
`pages/index/section-solid-page.js`、`section-solid-view.wxml` 和
`section-geometry.js` 截交真值，不复制几何算法；旧
`pages/index?mode=section` 保留历史深链兼容。

本轮验证：几何真值回归 `332/332`、平面与立体相交拆分 `118/118`、
截交三视图等价性 `21/21`、课程首页 `191/191`、导航迁移
`191/191`、学习页会话生命周期 `267/267`、全量本地检查 `56/56` 通过。
微信开发者工具手机/PAD 点按和真机拖动仍需人工验收。

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `11EB6688994D96D3A6F860191440C875FFAE512DFDCF7DA463BFCEAFB019F7CA` |
| `config/course-catalog.js` | `10BADA7BD795DB7386FCBFFD1062CE45956E05817384D64713127FB78C224AC9` |
| `pages/index/section-geometry.js` | `9348F8913AD20D5E3B0C885CA05B013A16C62BEC9EC66EC3568E4616A8258A77` |
| `pages/index/section-render.js` | `1710F39062E837066B6E761503086F3EFED91404B2B18C0ED2E2D8D85F7F1C04` |
| `pages/index/section-solid-page.js` | `EF220F1BA4055787A2E2402F5EB893C609A287F72C815CAAB8B1C3D6F08C56FB` |
| `pages/index/section-solid-view.wxml` | `5FACB012E077C0104631C412F2DF2C71259C545C50A53570CB6619EB0EFF69A1` |
| `pages/index/section-solid-split.wxss` | `48485E99CA10063E54F92016960DFC76E86BA717D15BAD3C28F8AD65A339BA96` |
| `scripts/geometry-test.js` | `7E57C825B88280095B251C95BB72DC6C540E027FC453FF67841D3A371D9BE442` |
| `scripts/section-solid-split-check.cjs` | `D8380288B6CD09E90B4536DD7DEF7922FEFFB7578050507E8DC94522F092D209` |
| `scripts/section-projection-check.cjs` | `C81F28F8792103A8D48640304D06DDF4411390EE4E10C7023A65C0B0A82ACCA6` |

## 19. 2026-11-22 产品理念入口授权扩展

用户明确要求在产品名称及“动脑思考 / 动手探索 / 善用工具”三个首页理念入口
新增独立介绍页。`app.json` 仅增加四个页面注册，课程章节、知识点顺序、搜索、
点线面模式、立体和截交页面均未改变。

本轮 `app.json` 新哈希：

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `01A8E65AC93125D2648D1D10644556FCCDF06CFBBF7C289A47873C00C9B87816` |
