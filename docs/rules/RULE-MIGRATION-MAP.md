# §1–§64 规则迁移映射表

> 用途：保证原《开发章程》§1–§64 每一条都能追溯到权威位置；本表是“搬家清单”，不是规则正文。
> 核对日期：2026-09-11 ｜ 迁移前快照：`docs/rules/AGENTS-pre-layering.snapshot.md`（54,245 字节 / 1,489 行）
> 迁移方式：逐字搬迁，未改写、未摘要、未弱化；每条正文在其新文件中以“## 来源：AGENTS.md §N”标注。
> 校验：脚本对 76 个章节（C1–C12 + §1–§64）逐条比对，确认每个章节正文在所有规则文件中**恰好出现一次**（唯一权威）。

## 汇总

| 项 | 数量 |
| --- | --- |
| 原章节总数 | 64 |
| 逐字迁移到专题文件 | 58 |
| 保留在 AGENTS.md | 6（§1、§2、§3、§61、§62、§64） |
| 未找到的章节 | 0 |

## 迁移前位置对照

| 原章节 | 原位置 | 新位置 | 是否完整搬迁 | 是否存在交叉依赖 / 备注 |
| --- | --- | --- | --- | --- |
| §1 | AGENTS.md（迁移前第 280–293 行，标题：章程目的） | AGENTS.md（保留） | 未迁移 | 保留在 AGENTS.md，原因：产品定位与非 CAD 边界必须每次任务可见；与 C2、§37、§64 为既有近重复（本次不合并，避免改写） |
| §2 | AGENTS.md（迁移前第 294–307 行，标题：指令优先级） | AGENTS.md（保留） | 未迁移；**正文已于 2026-09-11 按用户裁决修订** | 保留在 AGENTS.md，原因：指令优先级与冲突处理必须全局可见；原次序“用户 > 更深目录 AGENTS.md > 本文件 > README 与项目规格 > 注释”与 C1 在“更深目录 AGENTS.md”一格上相反，经用户裁决后 §2 已改为与 C1 一致的六级（用户 > 第一部分 > 更深目录 AGENTS.md > 第二部分 > 交接说明/README/Skill > 注释与惯例）；原文见快照第 294–307 行 |
| §3 | AGENTS.md（迁移前第 308–327 行，标题：技术边界） | AGENTS.md（保留） | 未迁移 | 保留在 AGENTS.md，原因：技术栈硬边界（Canvas 2D、禁 WebGL/框架/构建链）必须全局可见；与 C3 为既有近重复 |
| §4 | AGENTS.md（迁移前第 328–349 行，标题：工作流程） | docs/rules/coding.md §4 | 是（逐字搬迁） | 与 C6、C8、§59 重复；开工门禁要点仍在 AGENTS.md C8 |
| §5 | AGENTS.md（迁移前第 350–366 行，标题：推荐目录职责） | docs/rules/coding.md §5 | 是（逐字搬迁） | 目录清单已过期（权威为 AGENTS.md C4 与 app.json）；与 C4 重叠；见 project-facts L2 |
| §6 | AGENTS.md（迁移前第 367–388 行，标题：应用分层） | docs/rules/geometry.md §6 | 是（逐字搬迁） | 与 C9、§29、§64 重复；“几何真值独立于渲染”同时在 §64 保留 |
| §7 | AGENTS.md（迁移前第 389–404 行，标题：场景层级） | docs/rules/geometry.md §7 | 是（逐字搬迁） | Three.js 场景分组属历史设想；与 §17、§25、§28、§48 相关；见 project-facts L6 |
| §8 | AGENTS.md（迁移前第 405–430 行，标题：坐标系） | docs/rules/geometry.md §8 | 是（逐字搬迁） | 与 §31、§33、§40 命名相关；与 C9 命名清单重复 |
| §9 | AGENTS.md（迁移前第 431–460 行，标题：投影面定义） | docs/rules/geometry.md §9 | 是（逐字搬迁） | 与 §15（迹线）、§31（投影面）相关 |
| §10 | AGENTS.md（迁移前第 461–486 行，标题：第一角投影） | docs/rules/geometry.md §10 | 是（逐字搬迁） | 与 §31、§39、§54 相关；第一角为硬约束，README 亦有教学描述 |
| §11 | AGENTS.md（迁移前第 487–510 行，标题：投影图元） | docs/rules/geometry.md §11 | 是（逐字搬迁） | 与 §24、§29、§30 相关 |
| §12 | AGENTS.md（迁移前第 511–542 行，标题：数学基础） | docs/rules/geometry.md §12 | 是（逐字搬迁） | 与 C9、§44（coding.md）、§55（testing.md）重复/依赖 |
| §13 | AGENTS.md（迁移前第 543–562 行，标题：点模型） | docs/rules/geometry.md §13 | 是（逐字搬迁） | 与 §32、§33、§50 相关 |
| §14 | AGENTS.md（迁移前第 563–586 行，标题：线模型） | docs/rules/geometry.md §14 | 是（逐字搬迁） | 与 §50 相关 |
| §15 | AGENTS.md（迁移前第 587–608 行，标题：平面模型） | docs/rules/geometry.md §15 | 是（逐字搬迁） | 与 §51 相关 |
| §16 | AGENTS.md（迁移前第 609–632 行，标题：实体领域模型） | docs/rules/geometry.md §16 | 是（逐字搬迁） | 与 §17、§27、§52 相关；实体清单缺圆环 torus，见 project-facts L4 |
| §17 | AGENTS.md（迁移前第 633–646 行，标题：显示模式） | docs/rules/geometry.md §17 | 是（逐字搬迁） | 材质模板属 WebGL 时代表述；与 §25、§28 相关；见 project-facts L6 |
| §18 | AGENTS.md（迁移前第 647–666 行，标题：截平面模型） | docs/rules/geometry.md §18 | 是（逐字搬迁） | 与 §19–§24、§32、§33 相关 |
| §19 | AGENTS.md（迁移前第 667–706 行，标题：多面体截交算法） | docs/rules/geometry.md §19 | 是（逐字搬迁） | 冻结模块 F2 核心；与 §52 相关 |
| §20 | AGENTS.md（迁移前第 707–724 行，标题：多面体退化情形） | docs/rules/geometry.md §20 | 是（逐字搬迁） | 与 §24、§52 相关 |
| §21 | AGENTS.md（迁移前第 725–746 行，标题：圆柱截交） | docs/rules/geometry.md §21 | 是（逐字搬迁） | 与 §53 相关；“解析优先”与参数网格实现的关系见 project-facts L5 |
| §22 | AGENTS.md（迁移前第 747–764 行，标题：圆锥截交） | docs/rules/geometry.md §22 | 是（逐字搬迁） | 与 §53 相关 |
| §23 | AGENTS.md（迁移前第 765–782 行，标题：球截交） | docs/rules/geometry.md §23 | 是（逐字搬迁） | 与 §53 相关；圆环无规则与测试缺口见 project-facts L4 |
| §24 | AGENTS.md（迁移前第 783–798 行，标题：截面输出模型） | docs/rules/geometry.md §24 | 是（逐字搬迁） | 冻结模块 F2 接口契约；与 §11、§52、§53 相关 |
| §25 | AGENTS.md（迁移前第 799–816 行，标题：截面渲染） | docs/rules/geometry.md §25 | 是（逐字搬迁） | Z-fighting / BufferGeometry 属 WebGL 表述；与 §28、§30 相关；见 project-facts L6 |
| §26 | AGENTS.md（迁移前第 817–830 行，标题：相贯线边界） | docs/rules/geometry.md §26 | 是（逐字搬迁） | 相贯线尚未实现，属前瞻边界；与 project-facts 相关 |
| §27 | AGENTS.md（迁移前第 831–850 行，标题：变换规则） | docs/rules/geometry.md §27 | 是（逐字搬迁） | 与 §16、§19 相关 |
| §28 | AGENTS.md（迁移前第 851–866 行，标题：渲染资源所有权） | docs/rules/geometry.md §28 | 是（逐字搬迁） | 与 §30、§33、§39 相关 |
| §29 | AGENTS.md（迁移前第 867–884 行，标题：几何复用与缓存） | docs/rules/geometry.md §29 | 是（逐字搬迁） | 与 §11、§30 相关 |
| §30 | AGENTS.md（迁移前第 885–906 行，标题：重绘调度与性能） | docs/rules/geometry.md §30 | 是（逐字搬迁） | 与 §31、§48（coding.md）相关 |
| §31 | AGENTS.md（迁移前第 907–922 行，标题：视图与投影布局） | docs/rules/geometry.md §31 | 是（逐字搬迁） | 与 §10、§32、§33、§39 相关 |
| §32 | AGENTS.md（迁移前第 923–942 行，标题：拾取与选择） | docs/rules/geometry.md §32 | 是（逐字搬迁） | 冻结模块 F1/F8；与 §33、§54 相关 |
| §33 | AGENTS.md（迁移前第 943–964 行，标题：拖动交互） | docs/rules/geometry.md §33 | 是（逐字搬迁） | 冻结模块 F1/F8；与 §8、§13–§15、§32 相关 |
| §34 | AGENTS.md（迁移前第 965–980 行，标题：UI 状态机） | docs/rules/teaching-app.md §34 | 是（逐字搬迁） | 当前未发现状态机实现，属前瞻规则；与 §43（coding.md）相关；见 project-facts L7 |
| §35 | AGENTS.md（迁移前第 981–994 行，标题：状态栏） | docs/rules/teaching-app.md §35 | 是（逐字搬迁） | “相机状态”与现状不符（当前无自由旋转相机） |
| §36 | AGENTS.md（迁移前第 995–1016 行，标题：动画系统） | docs/rules/teaching-app.md §36 | 是（逐字搬迁） | 当前无动画系统，属前瞻规则；见 project-facts L7 |
| §37 | AGENTS.md（迁移前第 1017–1034 行，标题：教学呈现） | docs/rules/teaching-app.md §37 | 是（逐字搬迁） | 与 C2、§64 重复 |
| §38 | AGENTS.md（迁移前第 1035–1052 行，标题：可访问性） | docs/rules/teaching-app.md §38 | 是（逐字搬迁） | 键盘焦点等内容属网页端；与 §46、§47（coding.md）相关 |
| §39 | AGENTS.md（迁移前第 1053–1066 行，标题：响应式布局） | docs/rules/teaching-app.md §39 | 是（逐字搬迁） | 与 §30、§31 的画布尺寸与布局联动 |
| §40 | AGENTS.md（迁移前第 1067–1090 行，标题：命名规范） | docs/rules/coding.md §40 | 是（逐字搬迁） | 与 C9 命名清单逐字重复（既有重复，本次未合并） |
| §41 | AGENTS.md（迁移前第 1091–1108 行，标题：函数设计） | docs/rules/coding.md §41 | 是（逐字搬迁） | 与 C9 相关 |
| §42 | AGENTS.md（迁移前第 1109–1122 行，标题：类与组合） | docs/rules/coding.md §42 | 是（逐字搬迁） | 与 §6（geometry.md）的分层原则相关 |
| §43 | AGENTS.md（迁移前第 1123–1140 行，标题：事件与数据流） | docs/rules/coding.md §43 | 是（逐字搬迁） | 当前未发现事件总线，属前瞻规则；示例事件名取自几何领域；见 project-facts L7 |
| §44 | AGENTS.md（迁移前第 1141–1158 行，标题：错误处理） | docs/rules/coding.md §44 | 是（逐字搬迁） | 与 C9、§12（geometry.md）、§57 相关 |
| §45 | AGENTS.md（迁移前第 1159–1174 行，标题：注释规范） | docs/rules/coding.md §45 | 是（逐字搬迁） | 与 §12、§19 相关 |
| §46 | AGENTS.md（迁移前第 1175–1190 行，标题：CSS 规范） | docs/rules/coding.md §46 | 是（逐字搬迁） | 面向浏览器端（web/、web-release/、teacher-web/）；与 §38 相关 |
| §47 | AGENTS.md（迁移前第 1191–1206 行，标题：HTML 规范） | docs/rules/coding.md §47 | 是（逐字搬迁） | 面向浏览器端；与 §56、§57 相关 |
| §48 | AGENTS.md（迁移前第 1207–1226 行，标题：性能预算） | docs/rules/coding.md §48 | 是（逐字搬迁） | InstancedMesh / renderer.info 属 WebGL 表述；与 §30 重复或部分冲突；见 project-facts L6 |
| §49 | AGENTS.md（迁移前第 1227–1242 行，标题：验证层次） | docs/rules/testing.md §49 | 是（逐字搬迁） | 与 C11 重复；“资源释放”属 WebGL 表述 |
| §50 | AGENTS.md（迁移前第 1243–1258 行，标题：点与线测试基准） | docs/rules/testing.md §50 | 是（逐字搬迁） | 对应 §13、§14 |
| §51 | AGENTS.md（迁移前第 1259–1274 行，标题：平面测试基准） | docs/rules/testing.md §51 | 是（逐字搬迁） | 对应 §15 |
| §52 | AGENTS.md（迁移前第 1275–1296 行，标题：多面体截面测试基准） | docs/rules/testing.md §52 | 是（逐字搬迁） | 对应 §19、§20 |
| §53 | AGENTS.md（迁移前第 1297–1310 行，标题：曲面截面测试基准） | docs/rules/testing.md §53 | 是（逐字搬迁） | 对应 §21–§23；缺圆环测试，见 project-facts L4 |
| §54 | AGENTS.md（迁移前第 1311–1326 行，标题：回归检查） | docs/rules/testing.md §54 | 是（逐字搬迁） | 与 §10、§31、§32、§33 相关；“相机冲突 / GPU 增长”属 WebGL 表述 |
| §55 | AGENTS.md（迁移前第 1327–1340 行，标题：测试数据原则） | docs/rules/testing.md §55 | 是（逐字搬迁） | 与 §12 的容差策略相关 |
| §56 | AGENTS.md（迁移前第 1341–1354 行，标题：兼容性） | docs/rules/coding.md §56 | 是（逐字搬迁） | 面向浏览器端（file://、Pointer Events） |
| §57 | AGENTS.md（迁移前第 1355–1366 行，标题：安全与稳健性） | docs/rules/coding.md §57 | 是（逐字搬迁） | 与 C5.4/C10 密钥禁令、cloud-database.md 的输入校验相关 |
| §58 | AGENTS.md（迁移前第 1367–1380 行，标题：版本与迁移） | docs/rules/git-release.md §58 | 是（逐字搬迁） | 轴的语义与投影展开同时约束 geometry.md；字段复用与 ID 稳定属代码规范 |
| §59 | AGENTS.md（迁移前第 1381–1394 行，标题：变更范围控制） | docs/rules/coding.md §59 | 是（逐字搬迁） | 与 C7、C8、§4 重复 |
| §60 | AGENTS.md（迁移前第 1395–1410 行，标题：提交质量门槛） | docs/rules/git-release.md §60 | 是（逐字搬迁） | 与 C10、§59 重复 |
| §61 | AGENTS.md（迁移前第 1411–1430 行，标题：完成定义） | AGENTS.md（保留） | 未迁移 | 保留在 AGENTS.md，原因：完成定义是跨专题公共契约；与 §49、§62、C12 相关 |
| §62 | AGENTS.md（迁移前第 1431–1446 行，标题：交付摘要模板） | AGENTS.md（保留） | 未迁移 | 保留在 AGENTS.md，原因：C12 正文直接引用“模板见 §62”，移出会造成引用断裂；与 C5.2、.agent/developer.md 重复 |
| §63 | AGENTS.md（迁移前第 1447–1464 行，标题：当前仓库特别说明） | docs/rules/project-facts.md §63 | 是（逐字搬迁） | 与 C1、README、交接说明重复；“文档与代码冲突以现有实现为准”同时保留在 C1 |
| §64 | AGENTS.md（迁移前第 1465–1490 行，标题：最终原则） | AGENTS.md（保留） | 未迁移 | 保留在 AGENTS.md，原因：最终原则总纲，篇幅短且跨全部专题；与 C2、§1、§6、§24、§29、§61 为既有近重复 |

## 未迁移章节汇总（均注明保留原因）

| 原章节 | 保留位置 | 保留原因 |
| --- | --- | --- |
| §1 | AGENTS.md | 产品定位与非 CAD 边界必须每次任务可见 |
| §2 | AGENTS.md | 指令优先级与冲突处理必须全局可见 |
| §3 | AGENTS.md | 技术栈硬边界必须全局可见 |
| §61 | AGENTS.md | 完成定义是跨专题公共契约 |
| §62 | AGENTS.md | C12 正文引用“模板见 §62”，移出会造成引用断裂 |
| §64 | AGENTS.md | 最终原则总纲，跨全部专题 |

## 交叉引用说明

1. 本表第 3 列中的 `§N` 指该专题文件内“来源：AGENTS.md §N”对应的原文，不是原 AGENTS.md 的行号。
2. 原文中的 `见 §N` 引用统一由 `AGENTS.md` 的“原章节位置索引”解析。
3. 既有近重复（例如 C9 与 §40–§47、C2 与 §1/§37/§64、C12 与 §62）在迁移前就存在；本次**未合并、未改写**，仅登记在本表备注列。
