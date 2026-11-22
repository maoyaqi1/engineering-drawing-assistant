# 版本冻结记录 v1.8.0

> 版本号：`v1.8.0`
> 冻结日期：2026-11-22
> 上游版本：`v1.7.0`（提交 `c7b2737`）
> 冻结点：`v1.8.0` 版本提交
> 冻结性质：学生端源码、测试与文档的 Git 版本冻结；不代表部署云函数、上传小程序或线上发布

## 1. 版本定位

`v1.8.0` 是一次学生端知识点页面拆分与截交互动能力扩展。相较 `v1.7.0`，
本版本补齐线面/面面垂直图文页，将第五章立体的投影和第六章平面与立体相交
拆分为独立页面，并让第六章平面立体相交支持棱柱、棱锥及 `3～8` 棱。

本版本不改变学生端 AI 鉴权、数据库字段、AI 知识库或 Prompt。

## 2. 与 v1.7.0 的主要差异

| 领域 | v1.7.0 | v1.8.0 |
| --- | --- | --- |
| 页面规模 | `app.json` 注册 19 页 | 注册 24 页 |
| 线面、面面垂直 | 无独立页面 | 新增参考图与视频号入口图文页 |
| 第五章立体投影 | 由 `pages/index` solid 模式承载 | 拆分为平面立体、曲面立体两个独立页面 |
| AI 教师入口 | 旧立体模式内隐藏入口 | 仅平面立体投影页按服务端准入显示 |
| 第六章平面与立体相交 | 同一 section 模式、固定三棱锥/五棱柱 | 平面立体、曲面立体两个独立页面 |
| 平面立体相交类型 | 三棱锥、五棱柱固定类型 | 棱柱、棱锥，支持 `3～8` 棱步进 |
| 截交缓存 | 只区分立体类型、角度、位置 | 增加棱数作为几何与截面缓存键 |
| 全量本地检查 | 53 项 | 56 项 |

## 3. 新增页面与入口

相对 `v1.7.0`，本版本新增并在 `app.json` 注册：

- `pages/perpendicular-relations/perpendicular-relations`：线面、面面垂直条件；
- `pages/plane-solid-projection/plane-solid-projection`：棱柱、棱锥的投影；
- `pages/curved-solid-projection/curved-solid-projection`：圆柱、圆锥、圆球、圆环的投影；
- `pages/plane-solid-intersection/plane-solid-intersection`：棱柱/棱锥与截平面相交；
- `pages/curved-solid-intersection/curved-solid-intersection`：四种曲面立体与截平面相交。

课程首页、章节顺序、知识点 ID、真实路由和待开放状态以
`config/course-catalog.js` 与 `app.json` 为当前真值。

## 4. 冻结的产品行为

### 第五章立体的投影

- 平面立体页只提供棱柱、棱锥；
- 曲面立体页只提供圆柱、圆锥、圆球、圆环；
- 两页复用原立体几何、三视图、尺寸、姿态和重置模块；
- AI 教师入口只在平面立体页且服务端准入成功时显示。

### 第六章平面与立体相交

- “直线与立体相交”保留待开放，无页面路由；
- “平面与平面立体相交”提供棱柱/棱锥及 `3～8` 棱，默认五棱柱；
- “平面与曲面立体相交”提供圆柱、圆锥、圆球、圆环；
- 两页共用 `section-geometry.js` 截交真值、空间绘制和三视图判定；
- 截平面支持水平面、正垂面、侧平面、`0°～180°` 角度与位置调整；
- 切换立体类型或棱数必须重建几何，重置只恢复截平面参数。

### 既有能力

- 点、线、面、投影体系、平面切割兼容深链和课程目录继续可用；
- 线面/面面相交与平行关系页保持既有行为；
- 学习会话、问卷邀请、登录注册与 AI 权限模型不变。

## 5. 冻结范围

纳入本次冻结：

- `app.js`、`app.json`、`app.wxss`、`sitemap.json`、`project.config.json`；
- `pages/` 全部源码，包括当前微信小程序页面和未注册的兼容源码；
- `config/`、`utils/`；
- `scripts/` 全量检查和页面专项检查；
- 当前需求规格、系统测试用例、交接说明、项目事实与相关冻结记录；
- `docs/freeze-student-product-2026-11-22.sha256` 逐文件清单。

不纳入本次冻结：

- `cloudfunctions/` 源码与部署状态；
- `teacher-web/`、`web/`、`web-release/`；
- `screen/`、`docs/ai_teacher_reflections.txt`、真实密钥与本地环境文件；
- 数据库、云环境、小程序提审/发布和教师网页发布状态。

## 6. 验证证据

| 检查 | 实际结果 |
| --- | --- |
| `node scripts/run-all.js` | `56/56` 项通过 |
| `node scripts/geometry-test.js` | `332/332` 通过 |
| `node scripts/section-solid-split-check.cjs` | `118/118` 通过 |
| `node scripts/solid-projection-split-check.cjs` | `60/60` 通过 |
| `node scripts/section-projection-check.cjs` | `21/21` 通过 |
| `node scripts/test-case-coverage-check.cjs` | 需求与测试映射通过（不等同执行） |
| `git diff --check` | 通过 |
| 冻结 SHA-256 复核 | 通过 |

项目没有 CI。上述结果不代表微信开发者工具、手机/PAD 真机、云函数部署、
小程序上传审核或线上发布已经验收。

## 7. 冻结标识

- 产品版本：`v1.8.0`
- 行为记录：`student-product-2026-11-22`
- 行为契约：`docs/freeze-student-product-2026-11-22.md`
- SHA-256 清单：`docs/freeze-student-product-2026-11-22.sha256`
- 清单文件数：248
- Git 标识：`v1.8.0` annotated tag

## 8. Git 与发布边界

- 本次冻结按用户明确要求提交并推送 `master` 与 `v1.8.0` tag；
- 不得用 `reset --hard`、`checkout --` 或覆盖工作区的方式回退；
- 云函数、小程序体验版/线上版和教师网页是否部署，必须以各自控制台状态另行确认。
