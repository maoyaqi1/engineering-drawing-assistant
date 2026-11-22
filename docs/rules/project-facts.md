# 专题规则：项目现状事实（project-facts）

> 分层位置：`AGENTS.md` 的专题规则层。
> **性质声明：本文件是“事实层”，不是“规则层”。** 它回答“现在是什么”，不回答“必须怎么做”；其中的事实本身不构成强制要求。规范性约束以 `AGENTS.md` 与其余专题文件为准。
> 权威性：仅 §63 一节为迁移前 `AGENTS.md` 的**逐字原文**（§63 标题即“当前仓库特别说明”，其规则性内容“文档与代码冲突以现有实现为准”同时存在于 `AGENTS.md` C1）；其余为核对记录。
> 加载触发：阅读任何涉及实现状态、版本、页面清单、目录结构、技术栈历史、冻结模块或文档滞后项的规则之前。
> 维护约定：事实变化时先更新本文件，再更新引用它的规则；每次更新必须写明核对日期与核对命令。
> 迁移基线：`docs/rules/AGENTS-pre-layering.snapshot.md`（2026-09-11 快照）。

---

## 来源：AGENTS.md §63

## 63. 当前仓库特别说明

本节写于源码落盘之前。截至 2026-09-10，源码已落盘并可在微信开发者工具中运行（v0.6.2），实现为「原生微信小程序 + 微信云开发 + Canvas 2D」，与本章程原设想的技术栈（浏览器 + Three.js）不同。

因此本章程不能证明项目规格中 Version 4.3 或 Version 5 功能已经存在。

涉及真实坐标系、脚本加载方式和模块边界的条目，凡与现有代码或 `README.md` 冲突者，以现有实现为准并按 §2 报告。

若真实实现与本章程中的“推荐”条目不同，应评估兼容性后再调整。

标记为“必须”或“不得”的正确性、生命周期和产品边界规则仍然有效。

运行方式与操作说明记录在 `README.md`（微信开发者工具导入 → 编译 → 预览）；运行方式变化时必须同步更新该文件。

坐标范围与容差阈值应集中定义；新增判定不得再散落新的魔法阈值。

首次截面实现应优先建立纯数据输出，再交给绘制层渲染。


---

## 现状核对（核对日期 2026-11-22，当前工作区冻结版本 `v1.8.0`）

> **2026-11-22 v1.8.0 工作区冻结**：学生端新增线面/面面垂直页；第五章拆分
> 为平面立体投影与曲面立体投影，AI 教师入口仅保留在平面立体投影页；第六章
> 拆分为平面与平面立体相交、平面与曲面立体相交，平面立体支持棱柱/棱锥及
> `3～8` 棱。当前 `app.json` 注册 24 页，全量本地检查 56 项。版本记录见
> `docs/freeze-v1.8.0-2026-11-22.md`，产品行为与哈希见
> `docs/freeze-student-product-2026-11-22.md` 和同名 `.sha256`。本次冻结随
> `v1.8.0` 提交与 annotated tag 固化，不包含云函数部署或线上发布。

> **2026-11-20 v1.7.0 冻结**：课程首页升级为七章知识点导航并新增课程搜索；新增投影法基础、正投影、两直线位置关系、平面的表示方法、线面/面面平行、相交概览和面面相交求交线页面；线面相交与面面相交完成 H/V/W 辅助面、投影联系、三步作图和重置状态收口；面面相交支持 16 种组合，并统一三类投影面垂直面与一般面的正反方案。线面/面面相交页删除底部数值结果横幅。全量本地检查由 40 项增至 53 项。冻结记录见 `docs/freeze-v1.7.0-2026-11-20.md`。

> **2026-11-22 立体投影拆分（工作区，未提交）**：第五章删除“基本立体的介绍”，新增独立页面 `pages/plane-solid-projection/`（棱柱、棱锥）和 `pages/curved-solid-projection/`（圆柱、圆锥、圆球、圆环）。两页共享原 `pages/index` 的立体几何、三视图、尺寸、姿态和重置实现；AI 教师入口仅保留在平面立体投影页。

> **2026-11-22 平面与立体相交拆分（工作区，未提交）**：第六章删除“截交线”和旧“平面与立体相交”入口，保留“直线与立体相交”为待开放；新增 `pages/plane-solid-intersection/`（棱柱、棱锥及 3～8 棱）与 `pages/curved-solid-intersection/`（圆柱、圆锥、圆球、圆环）。两页共享原 `pages/index` 的截交几何、三视图和截平面控件，旧 section 深链保留兼容。`app.json` 当前注册 24 个页面。

> **2026-11-22 立体投影冻结（工作区，未提交）**：两个立体投影页、共享装配/视图/姿态行、原立体几何与三视图依赖、课程入口和专项检查冻结为 `solid-projection-2026-11-22`。行为契约见 `docs/freeze-solid-projection-2026-11-22.md`，逐文件哈希见 `docs/freeze-solid-projection-2026-11-22.sha256`。该冻结不是 Git commit、tag、部署或线上发布。

> **2026-10-28 设计审查修复**：知识点匹配改为“显式关键词优先于纯追问继承”；外部课程检索不再发送历史对话；历史测试账号只由 `teacher` 环境变量 `LEGACY_TEST_ACCOUNT_KEYS` 提供，源码和离线夹具改用合成标识；注册页增加本地登录态守卫。

> **2026-11-01 知识点页更新**：`pages/triangle-method/` 以工作区文件哈希冻结；新增 `pages/right-angle-projection/` 第一阶段原型并从首页“直线”模式关键知识点入口进入。

> **2026-11-03 v1.5.0 冻结**：新增 `pages/maximum-slope-line/` 独立互动页并从首页“平面”模式进入；首页点、直线、平面删除“类型”标题，基本立体删除“尺寸”“姿态”行首标签并将尺寸控件改为弹性单行；AI 教师改为仅在基本立体模式且服务端准入通过后显示的隐藏入口。`node scripts/run-all.js` 当前汇总 39 项检查。

> **2026-11-04 v1.6.0 冻结**：新增 `pages/line-plane-relation/` 线面相交求交点独立互动页并从首页“平面”模式进入；支持四种直线与四种平面组合、H/V/W 辅助垂直面、积聚性求交和三步引导作图；新增专项检查接入后，`node scripts/run-all.js` 当前汇总 40 项检查。

> **2026-11-07 投影法基础页面（工作区，未提交）**：新增 `pages/projection-method/`，只提供中心/平行投影方法演示与不变性、积聚性、从属性、等比性四项性质互动演示；首页第一章原“投影的基本概念”更名为“投影法基础”，保留知识点 ID `projection-basic` 并改指向新页面。该页已以 2026-11-07 工作区哈希冻结，记录见 `docs/freeze-projection-method-2026-11-07.md`；该轮新增专项检查后，`node scripts/run-all.js` 当时汇总 47 项。

> **2026-11-07 正投影页面（工作区，未提交）**：新增 `pages/orthographic-projection/` 并从首页第一章“投影法基础”之后进入，章节顺序为“投影法基础 → 正投影 → 三面投影体系”。页面标题为“正投影的基本性质”，不设顶部独立定义卡，只用一个 Canvas 统一使用真实性、积聚性、相似性，以细实线投射线演示线段和平面图形在三类位置关系下的投影；真实性对应投影面平行线和投影面平行平面，积聚性对应投影面垂直线和投影面垂直平面，相似性对应一般位置直线和一般位置平面。三种状态共用一个放大并固定尺寸的投影面。页面同时说明其与后续求解的衔接。新增专项检查后，`node scripts/run-all.js` 当前汇总 48 项。

> **2026-11-07 课程目录与线/面模式 UI 冻结（工作区，未提交）**：课程目录、正投影页、点/直线/平面模式导航、投影体系页头及相关检查已冻结为 `course-ui-compact-2026-11-07`，记录见 `docs/freeze-course-ui-2026-11-07.md`。当前冻结不是 Git commit、tag 或部署。

> **2026-11-08 两直线位置关系页（工作区，未提交）**：`pages/two-line-position/` 从首页第二章直接进入。页面第一排为“平行判断 / 相交判断”，第二排为“一般位置直线 / 特殊位置直线”，默认平行判断、一般位置直线；不提供端点拖动、旋转、重置、交叉选项或“为什么”。一般位置案例三面投影符合平行或相交规律；特殊位置平行反例使用两条方向不同的侧平线，正面、水平投影看似平行但侧面投影不平行；特殊位置相交反例使用水平线和正平线，正面、水平视交点不满足长对正，侧面视交点也不能对应同一空间点。底部按当前判断类型显示准则正文及一般/特殊位置高亮要点。专项检查更新后，`node scripts/run-all.js` 当前汇总 49 项。

> **2026-11-19 线面、面面平行页（工作区，未提交）**：新增 `pages/parallel-relations/` 静态图文页，课程首页第四章“线面、面面平行”改为直接映射。页面用两幅静态 Canvas 表达线面、面面平行条件，提供两个 `wx.openChannelsActivity` 视频号入口；视频身份与 feedId 集中配置，未配置时不伪造播放。

> **2026-11-19 线面、面面相交概览页（工作区，未提交）**：新增 `pages/intersection-relations/`，课程首页第四相交知识点先进入概念概览页；“线面相交”进入既有求交点页，“面面相交”保留入口并提示互动页暂未开放。

> **2026-11-19 面面相交求交线页（工作区，未提交）**：新增 `pages/plane-plane-relation/`，沿用线面求交点页格式，两个平面选择器均提供四类平面；13 种组合生成交线，3 种同向特殊平面识别为平行；所有组合均使用三角形 ABC、EFG 表示两块平面，且每个三角形边至少具有两个非零坐标分量，不平行于 X/Y/Z 任一轴；ABC 整体向原点适度内移，AB 与 EF 不重合，空间及三视图中的顶点均与另一平面边线保持可见间距；特殊位置 ABC 的 B、C 点位于较高 Z 范围且 B 点 Z 明显大于 C 点；两次线面求交分别显示辅助投影面垂直面、积聚迹线及 K/E 的投影联系，再连接成交线；第一次求 K 的构造系统使用紫色，第二次求 E 使用蓝色，各构造交线端点投影到三视图并绘制同色联系线；特殊位置交点与交线端点使用同一几何数据，P/Q 与积聚标签在几何和交点之后进行碰撞避让。概览页“面面相交”已接入本页。

> **2026-11-19 面面相交 EG/EF 与 H 面标签补充（工作区，未提交）**：P 有积聚性而 Q 为一般位置平面时，交点 1 精确取 `EG ∩ P`，交点 2 精确取 `EF ∩ P`；H 面 P 标签左移、a 标签上移，P/Q 与积聚标签在几何和交点之后绘制并避让。

> **2026-11-19 面面相交投影错开补充（工作区，未提交）**：全部 16 种组合在 V/H/W 三视图中检查跨平面的近于平行边对及点与点、点与边净距；相交与平行分支均重新选择三角形显示范围，使边对垂直净距不小于 `0.35`，点相关净距不小于 `0.15` 个模型单位。

> **2026-11-19 面面相交交线长度补充（工作区，未提交）**：特殊位置可见交线长度约束为不小于 `1.5` 个模型单位，避免为了避让投影而把 1、2 两点压缩到近似重合。

> **2026-11-19 面面相交命名补充（工作区，未提交）**：学生界面统一使用平面 ABC、EFG，不再显示 P/Q 名称；内部 `planeP`、`planeQ` 仅作为代码变量。

> **2026-11-20 面面相交垂直面统一方案（工作区，未提交）**：“铅垂面、正垂面或侧垂面 ABC × 一般面 EFG”分别作为对应组合的唯一基准；切换成“一般面 ABC × 铅垂面、正垂面或侧垂面 EFG”时直接复用对应基准三角形和交线，仅交换 ABC、EFG 角色及积聚性，不重新选择等价方案。

> **2026-11-20 相交页结果横幅移除（工作区，未提交）**：线面相交页和面面相交页移除底部单独的“作图结果/交线结果”数值横幅，同时删除不再使用的结果状态字段与样式；作图结果继续由画布、步骤说明和三面投影表达。

> **2026-11-20 学生端产品基线冻结（工作区，未提交）**：当时学生端根入口、19 个已注册页面、课程配置、客户端工具、检查脚本、需求测试文档和项目事实冻结为 `student-product-2026-11-20`；完整文件哈希见 `docs/freeze-student-product-2026-11-20.sha256`，行为契约与验证见 `docs/freeze-student-product-2026-11-20.md`。该冻结不是 Git commit、tag、部署或线上发布；后续工作区新增的线面、面面垂直页不改变上述 `v1.7.0` 历史快照。

> **2026-11-08 直线章节冻结（工作区，未提交）**：第二章“直线的投影”四个知识点冻结为 `line-chapter-2026-11-08`，记录见 `docs/freeze-line-chapter-2026-11-08.md`。三个独立知识点页及专项检查按整文件冻结；共享的 `pages/index/`、课程目录和 `app.json` 仍允许平面章节开发修改，但必须保持第二章顺序、路由、七种直线类型、投影拖动和三个知识点的既有行为，并重新通过直线章节回归。

> **2026-11-02 紧凑画布 UI 冻结**：首页五模式、投影体系、直角三角形法和直角投影定理页完成用户验收，以工作区文件哈希冻结为 `ui-compact-2026-11-02`；详见 `docs/freeze-ui-compact-2026-11-02.md`。该冻结不是 Git commit/tag。

> **2026-11-03 v1.4.1 发布**：在 `v1.4.0` 基础上缩小直角投影定理页 C/D 拖动圈，扩展两条定理的交叉直线适用范围，并将直角三角形法、直角投影定理的稳定需求与测试用例同步至统一规格；Git 发布提交为 `8bca382`，tag `v1.4.1` 已推送。详见 `docs/freeze-v1.4.1-2026-11-03.md`。

> **2026-10-31 知识产权整改**：课程内容由用户确认全部为个人资料；含疑似第三方标识的 AI 头像原件移至仓库外，项目内替换为原创几何头像；三个云函数固定直接依赖并生成 `npm-shrinkwrap.json`，补齐 `THIRD_PARTY_NOTICES.md`；GeoGebra 离线包移至仓库外。权属、依赖和剩余专利核验边界见 `docs/素材权属与第三方依赖记录.md`。

> **2026-09-14 事实更新（REQ-003 第二阶段，已实施待部署）**：学生端 AI 放行判定源已从 `roster` 白名单改为
> `students` 名册（按键查询）+ `classes` 状态；`roster` 集合与 `roster.import/list/remove/clear` 已下线（仅保留
> `roster.status` action 名）；`roster.backfill`、`data.reset`、`data.emptyAccounts`、`data.legacyRoster`、
> `student.purge` 均已下线并回 `ACTION_RETIRED`；`api` 与 `teacher` 云函数新增环境变量 `INTERNAL_OPENIDS`。
> 详见 `docs/requirements/REQ-003-phase2-plan.md` 与 `docs/用户与鉴权模型.md`。
> （以下 09-11 各节为当次核对记录，凡与上述更新冲突处，以上述更新与代码为准。）

> **2026-09-14 事实更新（教师后台版本冻结）**：`teacher-web/`（主仓）与发布仓库 `maoyaqi1/hfjh-teacher-preview`（`main`）
> 已冻结为 **`teacher-web-v1.0.0`**：主仓基线 `a853878`（教师网页最后改动在 `6242b48`）、预览仓发布提交 `2caa5d8`、
> 脚本缓存版本 `?v=20260914b`，两仓 6 个文件的 blob 哈希逐字节一致。此后改动需"用户明确要求 + 可复现的真实缺陷"，
> 并重新发布预览仓、更新 `?v=` 与冻结记录哈希。基线、权限语义与回滚见 `docs/freeze-teacher-web-2026-09-14.md`。
> 数据库侧 `roster` 集合已于 2026-09-14 由用户删除。

> **2026-09-16 事实更新（平面切割曲面立体性能冻结 · F3）**：`pages/index/solid-projection.js`
> 的三视图轮廓可见性判定（`getProjectionLineSets` / `buildViewTriangleIndex` / `isProjectionEdgeVisible`）
> 已冻结为附注 tag **`perf-section-v1`**：代码提交 `e74b922`、记录与守护脚本提交 `ad227ee` / `660e389` / tag 所在提交；
> 改动内容仅为「投影包围盒预筛」，判定公式与容差（`VIEW_TRIANGLE_BOX_TOLERANCE = 0.02` 逻辑像素）未变，
> 4 种画布尺寸 × 切割 6 种立体 + 基本立体 6 种的整帧 Canvas 指令轨迹 936 帧完全一致；
> 离线台架单帧 JS：圆球 73.98→11.52 ms、圆环 126.82→16.33 ms（375×640，每帧几何缓存失效）。
> 该函数**只被 F3 调用**（`drawSectionProjectionOverlay` → `drawSolidProjection`）；F4 基本立体走 `basic-solid.js`
> 自己的 `edgeStyle`，不经此处——此前"F3/F4 共享"的说法不准确，以本条为准。
> 核对命令：`git -C G:\HFJH show perf-section-v1 --stat`、`node scripts/run-all.js`（24 项，含 `section-projection-check`）。
> 详见 `docs/freeze-section-projection-2026-09-15.md`。

### 1. 小程序页面清单

`app.json` 的 `pages` 数组当前注册 24 个页面：`pages/login/login`、`pages/register/register`、`pages/home/home`、`pages/index/index`、`pages/plane-solid-projection/plane-solid-projection`、`pages/curved-solid-projection/curved-solid-projection`、`pages/plane-solid-intersection/plane-solid-intersection`、`pages/curved-solid-intersection/curved-solid-intersection`、`pages/projection-method/projection-method`、`pages/orthographic-projection/orthographic-projection`、`pages/two-line-position/two-line-position`、`pages/plane-representation/plane-representation`、`pages/projection/projection`、`pages/survey/survey`、`pages/ai/ai`、`pages/terms/terms`、`pages/triangle-method/triangle-method`、`pages/right-angle-projection/right-angle-projection`、`pages/maximum-slope-line/maximum-slope-line`、`pages/parallel-relations/parallel-relations`、`pages/perpendicular-relations/perpendicular-relations`、`pages/intersection-relations/intersection-relations`、`pages/plane-plane-relation/plane-plane-relation`、`pages/line-plane-relation/line-plane-relation`。`pages/parallel-relations/` 与 `pages/perpendicular-relations/` 分别提供平行、垂直条件静态图文；第五、第六章各有两个独立立体互动页，共享 `pages/index` 的相应几何与三视图模块；`pages/intersection-relations/` 先提供相交概念概览，再分别进入线面求交点页和面面求交线页。

### 2. 目录结构（顶层）

`app.js`、`app.json`、`app.wxss`、`sitemap.json`、`project.config.json`、`AGENTS.md`、`README.md`、`.gitignore`、`.agent/`、`.agents/`、`cloudfunctions/`、`docs/`、`images/`、`pages/`、`screen/`（已忽略）、`teacher-web/`、`utils/`、`web/`、`web-release/`（默认不纳入 Git）。

原 `geogebra-offline/` 已于 2026-10-31 移至仓库外 `G:\HFJH_资料文档\第三方工具\GeoGebra-5-非商业许可\`；当前项目代码没有引用该目录。

目录职责、稳定/冻结/探索状态以 `AGENTS.md` C4 为权威。

### 3. 技术栈现状

| 层 | 现状 |
| --- | --- |
| 小程序端 | 原生 WXML / WXSS / JavaScript，无构建步骤、无包管理器；几何渲染为 Canvas 2D（`canvas type="2d"`） |
| 后端 | 微信云开发云函数 `api`（学生端）与 `teacher`（教师端），依赖 `wx-server-sdk` |
| 数据库 | 微信云数据库（集合清单见 `docs/rules/cloud-database.md`） |
| 教师网页 | `teacher-web/` 原生 HTML / CSS / JS，经 CloudBase HTTP 网关调用 `teacher` 云函数 |
| 网页版几何演示 | `web/index.html` 可直接用浏览器打开 |
| 共享工具 | `utils/` 当前只有 `api.js`（学生端云函数调用封装）；不存在 `geo.js` 或 `teacher-api.js` |

### 4. 自动化测试与 CI

仓库已有可自动执行的本地只读检查、离线行为测试、故障注入和大规模记录检查，统一入口为 `node scripts/run-all.js`，当前汇总 56 项。仓库**没有 CI、没有测试框架托管执行**；真实云环境、浏览器和真机验收仍需单独完成。

### 5. 云函数结构

`cloudfunctions/api/`：`index.js`、`package.json`、`ai/`、`knowledge/`（16 个 `.md`）、`prompts/`（2 个 `.md`）。
`cloudfunctions/teacher/`：`index.js`、`package.json`、`lib/runtime.js`、`lib/identity.js`、`lib/class-model.js`。

### 6. Web 后台结构

`teacher-web/`：`index.html`、`css/`、`js/`、`README.md`。发布仓库为 `maoyaqi1/hfjh-teacher-preview`、分支 `main`（GitHub Pages）。

### 7. 冻结模块现状

冻结基线 v0.6.2 = `aaf75d0`；F1–F8 细目见 `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` 与 `docs/交接说明.md` 第 10 节；核查命令：

```powershell
git -C G:\HFJH diff --stat aaf75d0 HEAD -- pages/ cloudfunctions/ utils/ web/
```

### 8. 已知文档滞后项

| 编号 | 滞后内容 | 证据 |
| --- | --- | --- |
| L1 | 已关闭：`AGENTS.md` 页面清单、`utils/` 内容、当前渲染与本地检查事实已按 2026-10-24 代码更新 | `AGENTS.md` C1/C4/C11；`app.json`；`utils/` |
| L2 | §5 的原文仍保留源码落盘前的历史目录设想；事实注记已声明以 C4 和 `app.json` 为准 | `docs/rules/coding.md` §5；`AGENTS.md` C4 |
| L3 | 已关闭：`cloudfunctions/api/knowledge/` 当前 16 篇 | 目录列举 2026-10-24 |
| L4 | §16 实体清单列六类实体，未列圆环 `torus`；§53 曲面测试亦无圆环 | §16/§53 原文；`pages/index/basic-solid.js` 的 `buildTorus` |
| L5 | §21/§23 要求“解析或半解析优先、不得只依赖渲染网格”，现实现为独立参数网格 + 三角形—平面求交（设计差异，未判违规） | `pages/index/section-geometry.js` |
| L6 | §7、§17、§25、§48 含 Three.js/WebGL 时代表述（场景分组、材质模板、polygon offset、BufferGeometry、InstancedMesh、`renderer.info`） | 各节原文；当前渲染层为 Canvas 2D |
| L7 | §34、§36、§43 描述的状态机、动画系统、事件总线在当前 `pages/index/index.js` 未发现实现 | 关键词检索 2026-09-11 |
| L8 | 已关闭：README、Skill、architecture 与 frozen-modules 已移除当前功能中的已删除页面和尺规模块表述 | `README.md`；项目 Skill |
| L9 | 已关闭：`.agent/`、`docs/requirements/`、`docs/test/`、`docs/rules/` 已纳入版本控制；未跟踪资产只保留 C10 明确列出的用户文件 | `git ls-files` |
| L10 | 各基线含义不同：冻结基线 `aaf75d0`、历史版本 `v1.5.1`/`v1.6.0`、上一发布版本 `v1.7.0`、当前发布版本 `v1.8.0`（tag `v1.8.0`） | C7、C10、`docs/交接说明.md`、`docs/freeze-v1.6.0-2026-11-04.md`、`docs/freeze-v1.7.0-2026-11-20.md`、`docs/freeze-v1.8.0-2026-11-22.md`、C1 |
| L11 | C1 与 §2 的指令优先级次序冲突已关闭：2026-09-11 用户裁决采用 C1 的六级次序，§2 已按其重写；§2 原文（“用户 > 更深目录 AGENTS.md > 本文件 > README 与项目规格 > 注释”）仅存于快照第 294–307 行 | `AGENTS.md` C1/§2；`docs/rules/AGENTS-pre-layering.snapshot.md` |

以上均为事实登记，**未对规则文字做任何修改**；是否修订由用户裁决。

### 9. 本次分层迁移引入的文件（事实登记）

| 文件 | 用途 |
| --- | --- |
| `docs/rules/AGENTS-pre-layering.snapshot.md` | 迁移前 `AGENTS.md` 的只读校验副本（54,245 字节 / 1,489 行），不是规则权威来源，不在常规加载路径 |
| `docs/rules/RULE-MIGRATION-MAP.md` | §1–§64 逐条迁移映射 |
| `docs/rules/AGENT-RULE-MIGRATION-MAP.md` | C1–C12 逐条迁移映射 |
| `AGENTS.md`（分层结构） | 三段：第一部分 C1–C12（逐字保留）→ 第二部分 §1–§64（§1/§2/§3/§61/§62/§64 正文保留，其余章节指向专题）→ 路由层（结构总览、分层结构、权威与冲突、全局安全门禁索引、加载协议、专题规则加载表、必须阅读条件、专题规则索引、原章节位置索引、回滚与校验）。`docs/rules/` 的专题文件为 8 个：`geometry.md`、`coding.md`、`teaching-app.md`、`testing.md`、`cloud-database.md`、`teacher-backend.md`、`git-release.md`、`project-facts.md` |

### 10. 核对命令

```powershell
git -C G:\HFJH status --short
git -C G:\HFJH log -1 --oneline
Get-Content -Raw -LiteralPath 'G:\HFJH\app.json'
Get-ChildItem -LiteralPath 'G:\HFJH\cloudfunctions\api\knowledge' -File
node scripts/run-all.js
```
