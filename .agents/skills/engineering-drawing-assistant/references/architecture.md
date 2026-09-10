# 项目架构（以实际代码为准）

## 1. 真实技术栈

- 原生微信小程序：WXML / WXSS / JavaScript，无 npm、无构建步骤。
- 渲染：**Canvas 2D**（`canvas type="2d"`）。**不是 Three.js**，没有 WebGL 场景图。
- 后端：微信云开发 —— 云函数 + 云数据库（+ 云存储预留）。
- 网页版：`web/` 复用小程序的几何与绘制逻辑；`web-release/` 为发布快照。

> 注意：`AGENTS.md` 描述的 Three.js / `js/` 分层架构与当前实现不一致。按本文件理解项目。

## 2. 目录职责

| 路径 | 职责 |
|---|---|
| `app.js` | 云开发初始化、隐私授权、`globalData.user` 与本地缓存 |
| `app.json` | 页面注册（9 个页面） |
| `pages/index/` | 核心教学画布（点/线/面/基本立体/平面切割立体） |
| `pages/login/`、`pages/register/` | 微信登录、实名注册（学校/姓名/学号） |
| `pages/ai/` | AI 教师对话界面 |
| `pages/roster/` | 名单管理（管理员用，AI 提问白名单） |
| `pages/teacher/` | 教师后台（小程序端） |
| `pages/ruler/` | 尺规作图（点/直尺/中心线/圆规/回放） |
| `pages/survey/` | 学习效果调查问卷 |
| `pages/terms/` | 用户协议 / 隐私政策 |
| `utils/api.js` | 学生端调用云函数 `api` 的封装 |
| `utils/teacher-api.js` | 教师端调用云函数 `teacher` 的封装 |
| `utils/geo.js` | 尺规作图纯几何工具（线线/线圆/圆圆求交），不碰 DOM |
| `cloudfunctions/api/` | 学生端云函数（登录/注册/名单/会话/问卷/AI） |
| `cloudfunctions/teacher/` | 教师端云函数（教师登录/鉴权/教师管理/统计） |
| `web/` | 网页版（可直接打开，用于公众号/浏览器演示） |
| `web-release/` | 网页版发布快照（含重复文件，见 §6） |
| `teacher-web/` | 教师后台网页版 |
| `docs/` | 设计文档、教学资料、海报、二维码 |
| `images/` | 产品图片资源 |

## 3. 学生端页面

`pages/login`、`pages/register`、`pages/index`、`pages/survey`、`pages/ai`、`pages/roster`、`pages/teacher`、`pages/terms`、`pages/ruler`。

## 4. 几何核心与数据流

```
用户手势 (index.wxml bindtouch*)
   → pages/index/index.js  交互处理（handleTouchStart/Move/End、handleXxxType、handleXxxSlider）
   → 页面 data 状态（point / line / plane / solid / section）
   → 几何计算
        · 点线面投影：index.js 内部（worldToView / projectPointToView 等）
        · 平面切割立体：pages/index/section-geometry.js（几何真值）
        · 基本立体：pages/index/basic-solid.js（buildSolidGeometry 等）
   → Canvas 2D 绘制（drawScene / drawXxxOverlay）
```

分层约定：

- **几何真值**独立于渲染，渲染对象不得成为几何状态的唯一来源。
- `section-geometry.js` 只做几何计算（`createSolid` / `intersectSolid` / `createSectionLoops` / `createSectionCaps` / `createCuttingPlane`），返回数据，不依赖 Canvas。
- `index.js` 负责状态管理 + 交互 + 渲染编排（该文件约 1900 行，属已知债务）。
- `utils/geo.js` 是尺规模块的独立纯几何层。

关键方法（`pages/index/index.js`）：

- 点：`handlePointType` / `getPointTypePreset`
- 线：`handleLineType` / `getLineTypePreset` / `handleLineTouchStart` / `drawLineIsometricOverlay` / `drawLineProjectionOverlay`
- 面：`handlePlaneType` / `getPlaneTypePreset` / `handlePlaneTouchStart` / `drawPlaneIsometricOverlay` / `drawPlaneProjectionOverlay`
- 切割：`getSectionResult` / `drawSectionIsometricOverlay` / `drawSpatialSolidEdges` / `clipPolygonByPlane` / `drawSectionProjectionOverlay`
- 基本立体：`handleBasicSolidType` / `handleSizeSlider` / `handleRotationAxis` / `handleTranslation`

## 5. 数据库集合（按代码实际使用）

学生端 `api` 云函数：

- `users`：微信身份 + 实名信息（openid / name / school / student_id / role / status）
- `roster`：AI 提问白名单（仅 `student_id`）
- `learning_sessions`：学习会话（user_id / openid / module / duration / interaction_count / is_valid）
- `survey_responses`、`survey_invites`：问卷与触发记录

AI 模块（`cloudfunctions/api/ai/conversation.js`）：

- `ai_conversations`：对话头（openid / title / knowledge_point）
- `ai_messages`：消息（conversation_id / role / content / knowledge_point / model / tokens）

教师端 `teacher` 云函数：

- `teachers`：教师账号（username / password_hash / salt / role / status）
- `teacher_sessions`：登录 token（token / expires_at）
- `teacher_classes`：教师-班级关系
- `schools`、`classes`、`students`：**已声明但尚未真正启用**（班级/学生档案功能未完成）

> 修改数据库前必须先确认集合与字段现状，不得凭猜测增删。

## 6. `web/` 与 `web-release/` 的区别

- `web/`：**开发中的网页版**。含 `index.html`、`ruler.html`（尺规作图网页版）、`runtime.js`、`style.css`。
- `web-release/`：**发布快照**，非开发入口。内部存在重复文件：
  - `geometry-page.js` 与 `js/index.js` 内容相同
  - `geometry-core.js` 与 `js/section-geometry.js` 内容相同
- 两者均**不参与小程序运行**，改动前先确认用户是否需要同步。

## 7. 已知架构债务（记录，不主动重构）

1. **`pages/index/index.js` 约 1900 行**：几何、状态、交互、渲染混在一个文件。属于已知债务，**不因偏好而拆分**。
2. **`AGENTS.md` 与实际实现不一致**：文档描述 Three.js 分层架构，实际是 Canvas 2D + 单文件核心。**不得为迎合文档而重构代码**，应先向用户报告冲突。
3. **教师端双前端**（`pages/teacher/` 与 `teacher-web/`）功能重叠，需保持同步。
4. **README 版本号滞后**：README 标注 v0.6.2，但教师端、尺规等新功能未记入版本历史。
5. **`docs/产品海报.html` 内容陈旧**（旧名 + v0.5.0）。
6. **网页版教师端受静态网站默认域名风控影响**（418），需备案自定义域名才能稳定访问。