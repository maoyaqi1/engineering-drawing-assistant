# 项目架构（以实际代码为准）

## 1. 真实技术栈

- 原生微信小程序：WXML / WXSS / JavaScript，无 npm、无构建步骤。
- 渲染：**Canvas 2D**（`canvas type="2d"`）。**不是 Three.js**，没有 WebGL 场景图。
- 后端：微信云开发 —— 云函数 + 云数据库（+ 云存储预留）。
- 网页版：`web/` 复用小程序的几何与绘制逻辑；`web-release/` 为发布快照。

> 注意：§7、§17、§25、§48 等专题规则中保留的 Three.js / WebGL 内容是历史或前瞻表述；当前实现以本文件描述的原生小程序 + Canvas 2D 为准。

## 2. 目录职责

| 路径 | 职责 |
|---|---|
| `app.js` | 云开发初始化、隐私授权、`globalData.user` 与本地缓存 |
| `app.json` | 页面注册（10 个页面） |
| `pages/index/` | 核心教学画布（点/线/面/基本立体/平面切割立体） |
| `pages/projection/` | 投影体系与投影面展开 |
| `pages/triangle-method/` | 直角三角形法求实长与倾角；2026-11-01 工作区文件哈希冻结 |
| `pages/right-angle-projection/` | 直角投影定理第一阶段互动原型（平面平行线 + 可拖动的一般位置线） |
| `pages/maximum-slope-line/` | 最大斜度线、H/V/W 迹线和实时倾角互动页 |
| `pages/login/`、`pages/register/` | 微信登录、实名注册（学校/姓名/学号） |
| `pages/ai/` | AI 教师对话界面 |
| `pages/survey/` | 学习效果调查问卷 |
| `pages/terms/` | 用户协议 / 隐私政策 |
| `utils/api.js` | 学生端调用云函数 `api` 的封装 |
| `cloudfunctions/api/` | 学生端云函数（登录/注册/名册/会话/问卷/AI） |
| `cloudfunctions/teacher/` | 教师端云函数（入口、runtime、身份、班级、统计与治理） |
| `web/` | 网页版（可直接打开，用于公众号/浏览器演示） |
| `web-release/` | 网页版发布快照（含重复文件，见 §6） |
| `teacher-web/` | 教师后台网页版 |
| `docs/` | 设计文档、教学资料、海报、二维码 |
| `images/` | 产品图片资源 |

## 3. 学生端页面

`app.json` 当前注册：`pages/login`、`pages/register`、`pages/index`、`pages/projection`、`pages/survey`、`pages/ai`、`pages/terms`、`pages/triangle-method/triangle-method`、`pages/right-angle-projection/right-angle-projection`、`pages/maximum-slope-line/maximum-slope-line`。

`pages/triangle-method` 已按 `docs/freeze-triangle-method-2026-11-01.md` 冻结；它和 `pages/right-angle-projection` 都从首页“直线”模式进入，`pages/maximum-slope-line` 从首页“平面”模式进入。`pages/video` 源码保留但未注册、不进入小程序包。`pages/roster`、`pages/teacher`、`pages/ruler` 已删除。

## 4. 几何核心与数据流

```
用户手势 (index.wxml bindtouch*)
   → pages/index/touch.js + ui-handlers.js  交互处理
   → 页面 data 状态（point / line / plane / solid / section）
   → 几何计算
        · 点线面投影：pages/index/projection.js / math-utils.js
        · 平面切割立体：pages/index/section-geometry.js（几何真值）
        · 基本立体：pages/index/basic-solid.js（buildSolidGeometry 等）
   → Canvas 2D 绘制（draw-helpers.js / render-scene.js / section-render.js）
```

分层约定：

- **几何真值**独立于渲染，渲染对象不得成为几何状态的唯一来源。
- `section-geometry.js` 只做几何计算（`createSolid` / `intersectSolid` / `createSectionLoops` / `createSectionCaps` / `createCuttingPlane`），返回数据，不依赖 Canvas。
- `index.js` 只保留页面 data、生命周期与模块装配（约 104 行）。
- 各领域模块仍通过 Page `this` 隐式协作；这是当前架构债务，详见 `docs/architecture-optimization-plan-2026-10-24.md`。

关键方法的实际模块：

- `presets.js`：点线面预设；
- `ui-handlers.js`：类型、滑块、模块切换；
- `touch.js`：投影点/端点/顶点拖动；
- `projection.js`：布局、等轴测与三视图映射；
- `section-geometry.js` / `section-math.js` / `section-render.js`：截交计算与绘制；
- `basic-solid.js` / `solid-projection.js`：基本立体与三视图轮廓；
- `session.js`：学习会话与事件。

## 5. 数据库集合（按代码实际使用）

学生端 `api` 云函数：

- `users`：微信身份 + 实名信息（openid / name / school / student_id / role / status）
- `learning_sessions`：学习会话（user_id / openid / module / duration / interaction_count / is_valid）
- `learning_records`：学习行为事件与身份快照
- `survey_responses`、`survey_invites`：问卷与触发记录

AI 模块（`cloudfunctions/api/ai/conversation.js`）：

- `ai_conversations`：对话头（openid / title / knowledge_point）
- `ai_messages`：消息（conversation_id / role / content / knowledge_point / model / tokens）
- `ai_teaching_events`：推荐、打开、完成事件
- `ai_photo_quota_daily`：每日拍照配额预占/确认租约，不保存图片正文

教师端 `teacher` 云函数：

- `teachers`：教师账号（username / password_hash / salt / role / status）
- `teacher_sessions`：登录 token（token / expires_at）
- `classes`、`students`：班级实体与教师名册；`students.class_id` 是当前班级归属权威
- `teacher_classes`：遗留关系，不参与当前归属判定
- `ai_teaching_events`：视频推荐、打开与完成事件

> 修改数据库前必须先确认集合与字段现状，不得凭猜测增删。

## 6. `web/` 与 `web-release/` 的区别

- `web/`：**开发中的网页版**。含 `index.html`、`runtime.js`、`style.css`。
- `web-release/`：**发布快照**，非开发入口。内部存在重复文件：
  - `geometry-page.js` 与 `js/index.js` 内容相同
  - `geometry-core.js` 与 `js/section-geometry.js` 内容相同
- 两者均**不参与小程序运行**，改动前先确认用户是否需要同步。

## 7. 已知架构债务（记录，不主动重构）

1. **首页模块通过 Page `this` 隐式协作**：`Object.assign` 装配存在静默覆盖风险，需按 `docs/architecture-optimization-plan-2026-10-24.md` 渐进处理。
2. **教师云函数与教师网页仍是单体大文件**：入口职责已部分分层，但业务服务与视图尚未拆分，具体方案见架构优化文档。
3. **教师端只有网页版**：`teacher-web/` 经 CloudBase HTTP 网关调用 `teacher` 云函数。
4. **本地检查与离线测试可自动执行，但没有 CI**。
5. **网页版教师端受静态网站默认域名风控影响**（418），需备案自定义域名才能稳定访问。
