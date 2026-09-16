# 平面切割曲面立体性能冻结记录（F3 · 2026-09-15）

> 冻结对象：`pages/index/solid-projection.js`（三视图轮廓的可见性判定）——属 F3「平面切割立体的渲染与交互」。
> 改动日期：2026-09-15；真机确认：2026-09-15（用户确认"平面切割曲面立体很丝滑"）；本记录落盘：2026-09-16。
> 授权依据：用户在 2026-09-15 明确要求按「方案 A」改动冻结模块（`AGENTS.md` C7 情形 1 + C8）。
> 缺陷依据：平面切割圆球 / 圆环拖动时明显卡滞（用户反复反馈，已复现，见 §3）。
> 上级规则：`AGENTS.md` C7 / C8 / C10 / C11 / C12；`docs/rules/geometry.md` §29 / §30；`.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` F3 / F8。

## 1. 冻结基线与哈希

| 项 | 值 |
| --- | --- |
| Git 基线提交 | `734feb9`（本次改动之前的 `HEAD`） |
| 改动前 `solid-projection.js` | blob `4ffcfd8874` |
| 改动后 `solid-projection.js` | blob `dd2cf45587`（223 行 / 10687 字节；改动前 197 行） |
| 冻结生效提交 | 代码 `e74b922`（`perf(section): …`）；记录 / `scripts/` / Skill 同步 `ad227ee`（`docs: …`） |
| 推送与 tag | **未推送、未打 tag**（`AGENTS.md` C10：推送由用户决定，认证由用户本人完成） |

本次冻结涉及的文件：

| 文件 | 性质 | blob（前 10 位） |
| --- | --- | --- |
| `pages/index/solid-projection.js` | 修改（冻结模块） | `dd2cf45587` |
| `scripts/section-projection-check.cjs` | 新增（只读守护脚本） | `7374f443ba` |
| `scripts/run-all.js` | 修改（注册新检查） | `7857239a67` |
| `scripts/README.md` | 修改（说明新检查与基准维护） | `5606fab927` |
| `docs/freeze-section-projection-2026-09-15.md` | 新增（本记录） | —（自身） |
| `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` | 修改（Skill 文档 · F3 条目） | `908919c60c` |

未纳入本次冻结：`AGENTS.md`、`docs/rules/**`、`cloudfunctions/**`、`teacher-web/**`、`web/**`、`web-release/**`，以及项目约定保持未跟踪的 `docs/ai_teacher_reflections.txt`、`docs/qrcode.png`、`docs/产品海报.html`、`images/ai-avatar.png`。

## 2. 冻结内容（改了什么）

给三视图轮廓的逐棱遮挡测试加**投影包围盒预筛**，判定公式与容差不变：

1. 新增 `buildViewTriangleIndex(triangles, viewType)`：每个视图把三角形投影一次，并记录各自的屏幕包围盒。
2. `isProjectionEdgeVisible(edge, triangles, viewType, preparedIndex)`：先按包围盒排除不可能包含投影中点的三角形，再对留下的三角形做原来的重心坐标遮挡测试；结果与逐三角形全量测试一致。
3. 新增容差常量 `VIEW_TRIANGLE_BOX_TOLERANCE = 0.02`（逻辑像素）：重心测试本身允许 `-1e-5` 的松弛，折算到屏幕不超过约 5e-3 逻辑像素，留约 4 倍余量。
4. `preparedIndex` 与当前 `triangles` 长度不一致时自动退回全量构建，避免索引错位造成静默误判。

**明确没有改的东西**（冻结的边界）：

- `pages/index/section-geometry.js`（F2 几何真值）**零改动**；截交线、截交面、投影公式一字未动。
- 重绘调度与拖动时序（F8：`scheduleCanvasDraw` 的 `_drawScheduled` 合并、`bindchanging` 拖动期不 `setData`）**零改动**。
- 线型、颜色、虚线 / 实线样式、可见与隐藏棱的判定公式**零改动**（§4 的逐条指令比对即证据）。
- 立体网格分段数、`onUnload` 清理、缓存键与失效点**零改动**。

## 3. 缺陷与改动原因（可复现）

现象：平面切割模式拖「截平面角度 / 平面位置」滑块时，圆球与圆环明显滞后；五棱柱等平面体不受影响。

复现与定量（Node 桩画布加载首页 Page，375×640，每帧都让几何缓存失效，即连续拖动）：

| 环节 | 实测 |
| --- | --- |
| `getSectionResult`（4096 三角形求交 + 裁剪 + 截交面） | 0.28 ms/帧 → **不是瓶颈** |
| 空间图 `drawSectionIsometricOverlay` | 约 1 ms/帧 |
| 三视图 `drawSectionProjectionOverlay` | 82.7 ms/帧（圆球）/ 117 ms/帧（圆环） |
| 其中 `getProjectionLineSets`（三视图轮廓） | 80.7 ms/帧，占整帧约 97% |

根因：`isProjectionEdgeVisible` 对每条候选棱都要遍历截断后立体的**全部**三角形（O(候选棱 × 三角形)）。圆球在正视图中是 235 条候选棱 × 618 个三角形 ≈ 14.5 万次重心判定，三个视图约 43 万次/帧；截断后的立体每帧都是新对象，`sectionResultCache` 必然失效，因此这个代价每帧都要重付。

改动后同条件实测（同一进程内 A/B、三轮中位数）：

| 立体 | 手机 375×640 | 平板横屏 1053×445 |
| --- | --- | --- |
| 圆球 | 73.98 → **11.52 ms/帧**（6.4×） | 137.52 → **12.52 ms**（11.0×） |
| 圆环 | 126.82 → **16.33 ms/帧**（7.8×） | 204.94 → **17.55 ms**（11.7×） |
| 圆柱 | 37.79 → 8.43 ms | 66.96 → 10.73 ms |
| 圆锥 | 14.50 → 4.04 ms | 25.81 → 5.58 ms |
| 五棱柱 | 0.70 → 0.46 ms | 0.91 → 0.46 ms |

## 4. 冻结前验证证据

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 绘制输出零差异（最强证据） | 把整帧 Canvas 调用录成轨迹（含每次坐标与样式，圆球单帧 8 千余条、圆环 1.3 万余条），与改动前实现逐条比对；4 种画布尺寸（375×640 / 1053×445 / 1339×620 / 857×620）× 切割模式 6 种立体 × 35 组角度位置（210 帧/尺寸）+ 基本立体模式 6 种 × 4 组参数（24 帧/尺寸） | **936 帧，不一致 0 处** |
| 逐棱分类一致性 | 6 种立体 × 900 组视图，比对可见棱 / 隐藏棱集合 | 不一致 0 组（容差取 0.01–0.02 px 时；不留容差会出现极少数相切棱翻转，因此容差是必需的） |
| 项目只读检查 | `node scripts/run-all.js` | **24/24 通过**（新增「截交三视图等价性守护」一项） |
| 新增守护脚本 | `node scripts/section-projection-check.cjs` | **17/17 通过**；重心判定调用次数 11156 次 vs 基准 162690 次（14.6×），俯视 / 侧视 100 倍以上 |
| 语法与静态接线 | `node --check`、`integrity-check.js`、`full-check.cjs` | 通过（`full-check` 11/11） |
| 几何真值回归 | `scripts/geometry-test.js` | 通过（未改 F2，数值与拓扑基准未变） |

## 5. 真机验证（用户确认）

| 项 | 状态 |
| --- | --- |
| 平面切割曲面立体拖动跟随性 | 用户于 2026-09-15 确认："这次优化后平面切割曲面立体很丝滑了" |
| 其余 C11 回归底线 | 同一次反馈中未报告异常；后续任何改动仍需重跑（登录 / 注册、点线面拖动、基本立体） |

> 说明：Agent 无法运行微信开发者工具与真机，§4 的结论全部来自离线台架；真机结论以用户反馈为准（`AGENTS.md` C11：未部署 / 未真机不算验证）。

## 6. 冻结期间的约束

1. `pages/index/solid-projection.js` 的 `getProjectionLineSets` / `buildViewTriangleIndex` / `isProjectionEdgeVisible` 属冻结实现：不得以「更整洁 / 更统一」为由删掉预筛、改容差或重写判定顺序。
2. 改动这三个函数中的任何一个后，必须 `node scripts/section-projection-check.cjs` 全绿，并重跑 `node scripts/run-all.js`；真机需复测圆球与圆环的连续拖动。
3. 若要有意改变可见性判定算法（例如改用面的朝向分类），属于产品可见行为变化：先确认 `docs/rules/geometry.md` §25 / §30 与 F3 的约束，更新 `scripts/section-projection-check.cjs` 内嵌基准，并在本记录追加修订行。
4. 容差 `VIEW_TRIANGLE_BOX_TOLERANCE` 是**屏幕空间**常量。目前最大验证到 1339×620 画布；若将来大幅改变投影比例尺（例如新增缩放或更大的画布分区），需重新跑 §4 的轨迹比对。
5. 几何真值层（`section-geometry.js`）与节流时序（F8）不在本次改动范围内，仍按原冻结规则执行。

## 7. 已知限制与后续

1. **本记录量化不到真机栅格化耗时**。改动后每帧仍有约 960–1330 次路径调用（圆球 fill 962 / stroke 1009，圆环 1210 / 1328，375×640）。若将来在低端机上仍有感知，下一步是「方案 B」：同一线型合并成一条 path 一次 `stroke`、幽灵（切除部分）合并成一次同色填充——该项会改变 Canvas 调用序列，需要重新做 §4 的轨迹比对并接受新的视觉核对。
2. **方案 C（拖动期降精度）未采纳**：`bindchanging` / `bindchange` 已分层，技术上可接，但会让拖动期轮廓变折线，且 A 之后收益有限；如将来要动，属于改 F8 手感，需用户明确接受。
3. `isProjectionEdgeVisible` 现在只被 F3 使用（`drawSectionProjectionOverlay` → `drawSolidProjection`）；基本立体（F4）走 `basic-solid.js` 自己的 `edgeStyle`，本次改动不影响 F4。此前口头描述"F3/F4 共享"不准确，以本条为准。
4. **Skill 文档已同步**：`.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` 的 F3 条目原先写着已拆分的 `pages/index/index.js` 路径；2026-09-16 已在用户授权下补上「更新（2026-09-15 性能冻结）」段（文件 blob `d439ee0…` → `908919c60c`，+6 行），指向本记录与 `scripts/section-projection-check.cjs`。
   该目录在本会话被沙箱标为只读，`apply_patch` 无法写入，因此这次是对**单个已跟踪文件**的受控写入：写入前校验锚点（锚点缺失即抛错）、写入后立即 `git diff` 核对，随时可用 `git checkout` 回滚。

## 8. 提交清单（待用户执行）

建议提交信息（沿用现有风格）：

```text
perf(section): 三视图轮廓加投影包围盒预筛，曲面体切割拖动 74→11ms（球）/ 127→16ms（环）

docs: 平面切割曲面立体性能冻结记录（F3）+ scripts 等价性守护
```

第一条是代码改动（`pages/index/solid-projection.js`）；第二条是本记录、`scripts/` 的三个文件，以及
`.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` 的 F3 条目同步。
`AGENTS.md` C10：提交由用户授权后执行；推送与 tag（如 `perf-section-v1`）由用户决定。

实际提交（2026-09-16，用户授权）：

| 顺序 | 提交 | 内容 |
| --- | --- | --- |
| 1 | `e74b922` `perf(section): …` | `pages/index/solid-projection.js`（1 file，+44 / −9） |
| 2 | `ad227ee` `docs: …` | `docs/freeze-section-projection-2026-09-15.md`、`scripts/section-projection-check.cjs`、`scripts/run-all.js`、`scripts/README.md`、`.agents/.../references/frozen-modules.md`（5 files，+369） |

提交前核对：`git rev-parse HEAD:<文件>` 与 §1 的 blob 表逐项一致；6 个待提交文件敏感信息扫描无命中；
项目约定保持未跟踪的资产（`web-release/`、`docs/ai_teacher_reflections.txt`、`docs/qrcode.png`、`docs/产品海报.html`、`images/ai-avatar.png` 等）未纳入提交。

## 9. 回滚

```powershell
# 只回滚本次性能改动（恢复改动前实现，blob 4ffcfd8874）
git -C G:\HFJH checkout 734feb9 -- pages/index/solid-projection.js

# 同时移除新的守护脚本（可选）
Remove-Item -LiteralPath G:\HFJH\scripts\section-projection-check.cjs
git -C G:\HFJH checkout 734feb9 -- scripts/run-all.js scripts/README.md
```

回滚后 `node scripts/geometry-test.js` 与 `node scripts/run-all.js`（此时不含新检查）应仍全绿；真机上曲面体拖动会回到改动前的卡顿状态——这正是本次要修的问题。

## 10. 修订记录

| 日期 | 修订 | 影响文件 | 说明 |
| --- | --- | --- | --- |
| 2026-09-15 | 首次冻结（方案 A：投影包围盒预筛） | `pages/index/solid-projection.js`（`4ffcfd8874` → `dd2cf45587`）、新增 `scripts/section-projection-check.cjs`、`scripts/run-all.js`、`scripts/README.md` | 936 帧绘制指令完全一致；圆球 6.4×、圆环 7.8×（手机竖屏）；真机确认丝滑 |
| 2026-09-16 | 同步 Skill 文档 F3 条目 | `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md`（`908919c60c`，+6 行） | 补上拆分后的文件路径、预筛容差约束、`section-projection-check.cjs` 的重跑要求；经用户授权写入 |
