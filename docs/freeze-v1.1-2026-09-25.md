# 版本冻结记录 v1.1（对外发布更新版）

> 状态：**待完成真机验证后冻结**（本文档先按 v1.0.0 的体例备好，验证通过后补结论并打 tag）
> 上一版本：`v1.0.0`（首发正式版，2026-09-11，tag `v1.0.0`）
> 中间版本：`v1.0.1`（提交 `785da8a`，打包忽略修复）
> 本次分支：`release/v1.1`
> 更新说明：`docs/release-v1.1.md`

---

## 1. 版本定位

v1.0.0 之后的**对外发布更新版本**。相对 v1.0.0 的变化分两类：

1. **v1.0.0 之后已提交的改动**（转发、打包体积修复、学生鉴权重构、教师端数据分线与运维、首页性能优化、模块拆分与检查脚本体系）——见 `docs/release-v1.1.md` 第二节
2. **本次 AI 教师升级**：接入课程检索、回答回归本课程口径、拍照提问（含每日限额）、建议观看的视频、装配图知识补齐——见 `docs/release-v1.1.md` 第一节

**"画布"用词澄清**：v1.0.0 移除的是**尺规作图**（`pages/ruler/*`、`web/ruler.html`、首页"✏ 尺规"入口）；首页**互动教学画布**（点/线/面、基本立体、平面切割立体，`pages/index/`）自 v0.6 起一直保留，本版本未改动。

---

## 2. 提交清单（分支 `release/v1.1`）

| 顺序 | 提交 | 说明 | 改动文件数 |
| --- | --- | --- | --- |
| 1 | `459a15c` | feat(ai): 依据新知识库补齐装配图 G06 知识并修正两处误路由 | 6 |
| 2 | `ae0dee1` | feat(ai): 接入课程检索与视频建议，开通拍照提问（含每日限额） | 18 |
| 3 | `85a3051` | fix(scripts): 修复离线自测 run-quality 的时间夹具 | 1 |
| 4 | `5173939` | docs: v1.1 更新说明（v1.0.0 之后全部改动） | 1 |
| 5 | `3dc4eea` | docs: 新增 AI 教师对接契约（v0.10） | 1 |

基线：`master`（提交 `471f326`，另比 `origin/master` 领先 1 个未推送提交）。

核验：`git log --oneline master..release/v1.1`、`git diff --stat master..release/v1.1`。

---

## 3. 冻结模块改动与授权依据

本版本触及 **C 级冻结模块**，依据如下（`AGENTS.md` C7 / C8）：

| 模块 | 级别 | 改动 | 依据 |
| --- | --- | --- | --- |
| `cloudfunctions/api/knowledge/assembly_drawing.md`（新增）、`cloudfunctions/api/ai/knowledge.js` | C（教学资产 F6） | 新增装配图 G06 知识、修正两处误路由 | **可复现缺陷**：问"装配图怎么看"既不注入知识也不落知识点；问"由装配图拆画零件图"被误判为零件图 G12。复现证据见 `scripts/ai-knowledge-routing-check.cjs` 改动前的 11 项失败 |
| `cloudfunctions/api/ai/{config,conversation,prompt,teacher-service}.js`、`cloudfunctions/api/index.js` | C（F7） | 接入检索服务、生成回归本仓库、拍照链路、每日限额 | **用户明确要求**（2026-09-25 多次裁决，记录见 `docs/AI教师对接契约.md` §12.6）；仅做最小插入，未重构既有分支 |
| `pages/ai/*`（含新增 `pages/video/*`、`app.json`、`app.js`） | B（需先说明） | 知识来源与"建议观看"卡片、拍照提问与限额提示、合规隐私弹窗 | B 级改动已在交付说明中说明范围与回归方式 |

未改动：`pages/index/`（互动画布）、`pages/login/`、`pages/register/`、`utils/geo.js`、`cloudfunctions/teacher/`、教师网页。

---

## 4. 验证证据

### 4.1 本仓库只读检查（已完成，2026-09-25）

`node scripts/run-all.js`：**26 项 26 通过**，其中与本次相关：

| 检查 | 结果 |
| --- | --- |
| AI 教师知识点路由检查（含装配图 G06） | 126 项全绿（改动前 11 项失败） |
| 离线云函数自测 · photo-quota（拍照每日限额） | 12 项全绿 |
| 离线云函数自测（access / access2 / quality 等 14 套） | 全绿（`run-quality` 时间夹具修复后首次全绿） |
| 静态接线、整体静态检查（含敏感信息扫描） | 全绿 |
| 截交三视图等价性守护、几何真值回归、布局/一屏检查 | 全绿 |

链路级验证（离线桩，2026-09-25）：方案 C 下回答确由本仓库生成（`model=deepseek-chat`）、检索片段正确注入提示词、`video_refs` 仍带云存储地址；拍照场景下服务侧优先读题、失败回落本地视觉链路。

### 4.2 服务侧接口契约（部分完成）

- 负向检查（公网）：`GET /healthz` 200 且记录数 2725、无 token 401、错误 token 401、未知路由 404 —— **5/5 通过**
- 正向 §9 四条用例：**待 token**（`node scripts/ai-teacher-contract-check.cjs`，设置 `QWEN_TEACHER_TOKEN`）
- 回答质量盲评（A/B/C 三配置）：**待服务侧支持 `sources[].text` 后执行**（`node scripts/ai-answer-blind-eval.cjs`）

### 4.3 真机验证（待完成 —— 冻结前置条件）

部署云函数 `api`（含环境变量 `QWEN_TEACHER_BASE_URL` / `QWEN_TEACHER_TOKEN`）后，在体验版逐条确认：

1. 课程内问题：回答为文字讲解（一屏内、先结论后引导、**不复述题目**）+ 知识来源 + "建议观看"卡片可播放（从片段起点开始）
2. 课程外问题：正常回答、无知识来源
3. 拍照提问：可拍题；同一账号第 3 次提示"今天的拍照提问已用完"（测试账号不受限）
4. 降级：把 `QWEN_TEACHER_BASE_URL` 临时改错，回答仍正常（回落原有链路）

---

## 5. 回滚方式（任一开关即刻生效，无需重新提审）

| 场景 | 操作 |
| --- | --- |
| 视频播放入口有合规风险 | 云函数环境变量 `VIDEO_PLAYBACK=off`（卡片退回"只显示标题与时间点"） |
| 视觉调用成本失控 | `AI_IMAGE=off`（图片通道整体关停，文字提问不受影响） |
| 检索服务异常 | 无需操作：未配置/超时/未命中自动回落既有链路 |
| 整体回退本版本 | 放弃 `release/v1.1` 分支（`master` 未曾改动，未被影响） |

---

## 6. 冻结后约束（验证通过、打 tag 之后生效）

1. 本版本的 5 个提交与 tag `v1.1.0` 构成冻结基线；此后修改冻结模块需"用户明确要求 + 可复现问题"。
2. 修改任一相关文件后须重跑：`node scripts/run-all.js`（26 项）与 `node scripts/ai-knowledge-routing-check.cjs`。
3. 云函数改动必须**重新部署**才算完成（未部署不算验证）。
4. 已知限制见 `docs/release-v1.1.md` 第四节（类目合规待提审结论、机械制图 45 个视频未上传、16 篇知识库待人工审核、检索片段字段待服务侧）。

---

## 7. 冻结动作清单（验证通过后执行）

1. 补记 §4.3 真机验证结论到本文档
2. 打附注 tag：`git tag -a v1.1.0 -m "v1.1 对外发布更新版（AI 教师升级）"`（指向 `3dc4eea`）
3. 推送：`git push origin master`、`git push -u origin release/v1.1`、`git push origin v1.1.0`
4. 是否需要把 `release/v1.1` 合并回 `master` —— 由用户决定
