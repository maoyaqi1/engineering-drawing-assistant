# 立体投影冻结记录（2026-11-22）

> 冻结标识：`solid-projection-2026-11-22`
> 冻结性质：当前工作区文件哈希冻结；不是 Git commit、tag、部署或线上发布
> Git 基础：`c7b2737`（`v1.7.0`）之上的未提交工作区

## 1. 冻结范围

本记录冻结第五章“立体的投影”当前产品行为及以下实现：

- `pages/plane-solid-projection/`：棱柱、棱锥；
- `pages/curved-solid-projection/`：圆柱、圆锥、圆球、圆环；
- `pages/index/solid-projection-page.js`：两个页面的共享装配；
- `pages/index/solid-projection-view.wxml`：两个页面的共享参数、Canvas 和 AI 入口结构；
- `pages/index/solid-pose-compact.wxss`：两个页面共用的旋转/平移紧凑布局；
- `pages/index/basic-solid.js`、`render-scene.js`、`projection.js` 等原立体几何、三视图与布局依赖；
- `config/course-catalog.js`、`app.json` 中的两个第五章入口；
- `scripts/solid-projection-split-check.cjs`。

逐文件哈希清单位于：

- `docs/freeze-solid-projection-2026-11-22.sha256`

## 2. 冻结行为

### 第五章课程结构

- 课程目录只保留“平面立体的投影”和“曲面立体的投影”；
- “基本立体的介绍”不再作为课程知识点；
- 两个页面均不显示“首页”按钮，使用微信原生返回。

### 平面立体的投影

- 只提供棱柱、棱锥；
- 第一行显示缩窄的棱柱/棱锥按钮和右移的棱数步进器；
- 第二行显示半径、高度滑杆，滑轨保持加长；
- 旋转/平移、坐标轴 X/Y/Z、旋转 90° 在同一行；
- Y 保持中轴，坐标轴文字和 X、Z 向 Y 收紧；
- 角度/平移量滑杆位于下一行；
- AI 教师入口仅在本页且服务端准入为 `student` 时显示。

### 曲面立体的投影

- 只提供圆柱、圆锥、圆球、圆环；
- 类型和尺寸参数布局保持拆分后的现有形式；
- 旋转/平移行复用平面立体页的共享紧凑布局；
- 不显示 AI 教师入口。

### 不变的底层功能

- 两个页面复用原 `pages/index` 的立体几何、三视图、尺寸、旋转/平移、旋转 90° 和重置模块；
- 不改写 `basic-solid.js` 的几何构造；
- 学习会话仍使用原 `solid` 模块标识；
- 无权限用户不显示 AI 入口或权限提示，服务端鉴权不变。

## 3. 冻结前验证

| 检查 | 实际结果 |
| --- | --- |
| `node scripts/solid-projection-split-check.cjs` | `60/60` 通过 |
| `node scripts/page-session-lifecycle-check.cjs` | `239/239` 通过 |
| `node scripts/ai-page-check.cjs` | 通过 |
| `node scripts/run-all.js` | `55/55` 项通过 |
| `git diff --check` | 通过 |
| 手机/宽屏布局等价断言 | 通过 |

项目没有 CI。上述结果不代表微信开发者工具模拟器、真机、云函数部署或线上发布已验收。

## 4. 修改规则

默认不得重构、重命名、批量格式化或顺带调整本冻结范围内的页面、共享布局、课程路由和立体行为。

只有以下情形允许修改：

1. 用户明确要求调整立体投影；
2. 存在可复现的真实缺陷，并记录复现步骤、输入和实际结果。

修改后必须：

1. 阅读本冻结记录和相关需求/测试；
2. 更新对应需求与测试用例；
3. 重新生成 SHA-256 清单；
4. 执行 `solid-projection-split-check.cjs`、`page-session-lifecycle-check.cjs`、`run-all.js` 和 `git diff --check`；
5. 涉及布局或 Canvas 时，在微信开发者工具检查手机与 PAD，并另行安排真机回归。

## 5. 已知限制

- 当前冻结是工作区哈希记录，不是可独立恢复全部内容的 Git 快照；
- 未完成微信开发者工具逐项点按、手机/PAD 真机和线上发布验收；
- 云函数、数据库与教师后台不在本次冻结范围。

## 6. 共享接线修订

2026-11-22 第六章拆分平面与立体相交页面后，`app.json`、`config/course-catalog.js`
和 `pages/index/session.js` 仅增加第六章页面注册、课程知识点与学习页会话接入。
两个立体投影页、共享立体装配/视图/姿态样式、AI 入口边界及原立体几何/三视图行为未改动。
对应 SHA-256 已同步至同目录清单，`solid-projection-split-check.cjs` 与
`section-solid-split-check.cjs` 均需通过。
