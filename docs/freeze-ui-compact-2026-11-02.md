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
| `pages/right-angle-projection/right-angle-projection.wxml` | `98C4DB20589E70659C79F708BD5A8C477038B29C8601E80CA129A5AB55F98B23` |
| `pages/right-angle-projection/right-angle-projection.wxss` | `981E66DA7DEDDFF0CA6E6FB98D6B9E972092D1E0B737D3D99BC7DE65618D0241` |
| `pages/right-angle-projection/right-angle-projection.json` | `0FF84E1F4D722D1550DE5E64B04BA94190C128E2C8A06FCEEB2C2612A6C94812` |
| `pages/right-angle-projection/right-angle-model.js` | `024A04FF3D901E7826F70AEDA167DC0649B01D62AB9FDFDB306456A3A7B5F690` |
| `pages/right-angle-projection/right-angle-render.js` | `B67DDA356700A78D385260EBDB7A8A3D2D3333827353734EC629FFAD2A2CD908` |

### 3.4 守护脚本与设计记录

| 文件 | SHA-256 |
| --- | --- |
| `scripts/layout-check.cjs` | `868D0317C9489835B482FBF37B091213C4FF62059C0B85399E126806F08C9F38` |
| `scripts/triangle-method-check.cjs` | `7688219A584959F3EDEA334E0DF05CC55B421A789FDDE64D6056E27DE9C308AB` |
| `scripts/right-angle-projection-check.cjs` | `DC0567C13680E280C42473B9B9DBA4CF25C8A08470F35A0283286CBB1026F2B4` |
| `docs/design/triangle-method-stage1.md` | `3C332EACF3EB0304D059A09AE958BE85A4E44EF207A054804723C8632BF348AC` |
| `docs/design/right-angle-projection-stage1.md` | `B556378EC7B05E3BEA9CDAB94710D3F2CBAEBAEFFB67C93FBED6A3F2F61DCAE3` |
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
