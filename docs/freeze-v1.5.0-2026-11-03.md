# 版本冻结记录 v1.5.0

> 版本号：`v1.5.0`
> 冻结日期：2026-11-03
> 上游版本：`v1.4.1`（提交 `8bca382`，Git tag `v1.4.1`）
> 冻结性质：Git 源码、测试和文档版本；不代表云函数已部署、小程序已上传/发布或教师网页已发布

## 1. 版本定位

`v1.5.0` 汇总 `v1.4.1` 之后当前工作区中通过本地检查的改动：

- 新增“最大斜度线”独立互动页，覆盖最大平面块、H/V/W 迹线、α/β/γ 切换、方向点拖动、实时双角度比较、最大值高亮、知识卡和完整响应式布局；
- 首页点、直线、平面删除“类型”标题，基本立体删除“尺寸”“姿态”行首标签，并进一步压缩类型、尺寸和姿态参数区；
- AI 教师改为“基本立体”模式中的隐藏功能，仅服务端准入为 `student` 时显示；无权限用户不显示入口和准入提示，直接访问时静默返回首页；
- 同步纳入 `v1.4.1` 后工作区中已完成的 AI 会话/图片配额/归属、教师端健壮性、依赖声明和相关文档/测试改动；
- 页面注册增至 10 个，学生端需求更新至 `STU-59`，AI 需求更新至 `AI-43`。

## 2. 冻结范围

本版本有意冻结截至 2026-11-03 工作区中除第 5 节排除项以外的全部已跟踪修改和新增开发文件。主要范围：

- `pages/maximum-slope-line/` 全部源码和 `scripts/maximum-slope-line-check.cjs`；
- `pages/index/` 的入口、紧凑布局、AI 准入刷新和相关首页模块改动；
- `pages/ai/` 的隐藏准入逻辑、会话、输入和隐私模块；
- `app.json`、`README.md`、`AGENTS.md`、`.agent/`、`.agents/`、`docs/`、`scripts/` 中的当前状态、需求、测试与规则同步；
- `cloudfunctions/api/`、`cloudfunctions/teacher/` 及其离线测试、依赖声明和 `npm-shrinkwrap.json`；
- `teacher-web/`、`utils/api.js`、`project.config.json` 中与当前未发布批次同步的改动；
- `THIRD_PARTY_NOTICES.md` 和当前项目使用的原创 `images/ai-avatar.png`。

`v1.5.0` 是综合性源码冻结版本，不把其中任何云函数或教师网页改动视为已经部署。

## 3. 行为与验收

### 最大斜度线

1. 页面从首页“平面”模式的关键知识点入口进入。
2. 平面块与 X/Y/Z 轴均交于 `8`，显示 `P_H`、`P_V`、`P_W` 三条迹线。
3. 默认显示最大斜度线；α/β/γ 分别切换 H/V/W，禁止与当前投影面夹角实时显示。
4. 三维最大斜度线与其投影辅助线在迹线处共端点，均为细实线；三维角度值为右侧黑区白字。
5. 底部三视图线型等粗；角度值固定在右下角，非最大为黑色、最大为红色。
6. 数据栏以 `>`/`=` 对比平面角和当前直线角；相等时统一红色并显示“最大斜度线状态”。
7. 知识卡和 H/V/W 角落标注符合当前需求。

### 首页与 AI 教师

1. 点、直线、平面不显示“类型”标题；基本立体不显示“尺寸”“姿态”标题，三类尺寸控件在单行弹性排列。
2. AI 教师仅在基本立体模式、且服务端返回 `level=student` 时显示。
3. 游客、未注册、未分班、班级停用或检查失败时不显示入口和“未注册不能使用”提示；直接访问 AI 页时静默返回首页。
4. 服务端 `resolveAccess`、AI 拒绝码和每次请求的鉴权保持不变。

## 4. 验证证据

| 检查 | 结果 |
| --- | --- |
| `node scripts/run-all.js` | 39/39 项通过 |
| `node scripts/maximum-slope-line-check.cjs` | 733/733 通过 |
| `node scripts/triangle-method-check.cjs` | 155/155 通过 |
| `node scripts/right-angle-projection-check.cjs` | 744/744 通过 |
| `node scripts/section-projection-check.cjs` | 17/17 通过 |
| `node scripts/layout-check.cjs` | 全部通过 |
| `node scripts/pad-fit-check.cjs` | 全部用例一屏放下 |
| `node scripts/phone-fit-check.cjs` | 三列尺寸控件可容纳；参数区高度显著压缩（仅估算） |
| `node scripts/ai-page-check.cjs` | 通过 |
| `node scripts/ruler-removal-selfcheck.cjs` | 16/16 通过 |
| `node scripts/test-case-coverage-check.cjs` | 259/259 条需求有映射，共 59 个用例 |
| `node scripts/offline/run-access.cjs` | 24/24 通过 |
| `node scripts/offline/run-access2.cjs` | 44/44 通过 |
| `node scripts/full-check.cjs` | 11/11 通过 |

项目没有 CI。上述结果不是 CI、云函数部署、小程序审核或线上发布结果。

## 5. 不纳入本版本控制的内容

- `docs/ai_teacher_reflections.txt`：用户教学反思资产；
- `web-release/`：网页发布快照；
- `screen/`：本地截图目录；
- 任何 `.env`、私钥、Token、密码或真实账号数据。

## 6. 未完成验证与生效边界

1. 本轮没有执行独立测试角色的最终复测。
2. 本轮没有重新完成手机和平板真机上的全页面验收；用户提供的模拟器截图用于交互设计反馈，不替代正式验收。
3. `cloudfunctions/api` 和 `cloudfunctions/teacher` 的改动未因本次冻结自动部署。
4. 小程序 `1.5.0` 未上传、未提审、未正式发布。
5. 教师网页预览仓库未发布。
6. 新依赖或集合相关生效条件仍按部署清单执行；未部署代码不得宣称线上生效。

## 7. 核心文件哈希（SHA-256）

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `4B9D91614A35D1DC8AB17AB5871573E51369FBB939B1E53D78075A86E5404F4B` |
| `README.md` | `2D41D6BF30A5A94B30A9429EFB91CD86DBB93B8EB05B688FB1A22EB5EEE4C111` |
| `AGENTS.md` | `5B64A39AFCCDF94FD23337205970CDA10A79868ABD1D866744B750C1564CF3E2` |
| `pages/index/index.js` | `87B107F7B72308CC0F971160D99E5E716CDF3328CBA03E9C6A1A1E4CE1DE37A9` |
| `pages/index/index.wxml` | `B7180A710EAA337D8BF495485A666808061A9F4BC2A53563530D1EF5F8B2AADB` |
| `pages/index/index.wxss` | `713C0B3BDD0D3C105D468554CA5FDEFEEAD240C2FDE883DFB875BAD3C877CB2B` |
| `pages/index/session.js` | `59FF36A7E794FE34AF3B6428D1D7D84E592CB7F03D07819544957C3A274347CF` |
| `pages/index/ui-handlers.js` | `7736F73EB8DAEAA75042BE2C8B0326A5A6A2BFF3AA7289478116237CC52E11A7` |
| `pages/ai/ai.js` | `6BBC0456E04CDE97AE7D572B4ED4A7BC8C1A17738E7416B08539AE68845FA77B` |
| `pages/ai/ai-access.js` | `28234E8C974C66544B25084CB8131B3E715503D7E233790AAD7271E97A378C8A` |
| `pages/ai/ai-conversation.js` | `3000D626EB30F8276C367FFB93D418B11A9D6CABE8222537100F33FBD48262CC` |
| `pages/ai/ai.wxml` | `F6D7AE0A105AEB5D9840D2B9FA21E4ADCB051F603E2C6789FBC5E5D7F2CE1099` |
| `pages/maximum-slope-line/maximum-slope-model.js` | `6FCE9ED326C9A90C233D97A9360FA2D39B0CFBF5B0CAD4D764DA087C74B1EB50` |
| `pages/maximum-slope-line/maximum-slope-line.js` | `FD337A04E05313B23A3AA21C721574D925895235D9AFAD703169E6E7DCDD5950` |
| `pages/maximum-slope-line/maximum-slope-line.wxml` | `1D0B1B63CA645021B2B63226CC3637DD20013EED1892160028FC1833850AB0B7` |
| `pages/maximum-slope-line/maximum-slope-line.wxss` | `33D58FF2793B6B86660C8C5EB8076CEE7EE04ACF89CAFB4E8C582DAE5ED6E5F6` |
| `pages/maximum-slope-line/maximum-slope-render.js` | `7780778FF15A80395203F6B188DFBA242466F60E796C59D2A7D7E20472CA090C` |
| `scripts/maximum-slope-line-check.cjs` | `2FA44F9FF54D899A48841C5FDE844D289534888A32460121C6C7780D2B840B13` |
| `scripts/ai-page-check.cjs` | `0B5CD6E0ED8278FCD8785D97079E96F4E69A39BC01D2DB27809FD9B023B72E4B` |
| `scripts/ruler-removal-selfcheck.cjs` | `6076420FD4D7AB585C0FB133F119B0D67C9BF3B5DA96821E6B95F2361C5B446D` |
| `scripts/phone-fit-check.cjs` | `15BE0138CD17CE81F9D8F21576BB14AA51D9292819CE3397E86882622002EC47` |
| `docs/requirements/系统需求规格.md` | `E1059985C00C26107E126E9DE9E4E41291E57D61D4D0829030E82B1EA07F78DA` |
| `docs/test/系统测试用例.md` | `472D0203A833B67FD3813F48F1DFA4DFCDCD4D1A535F483A61257F9439358639` |
| `docs/AI教师对接契约.md` | `D89B8649C9A1F3F122D307DFB7BEF6FD808C5C16E40E5360522415A2E451A374` |
| `docs/交接说明.md` | `AB5435E49A30DB834CF938FE140CFA6E201AAD5B488AE5993DF0138C9C82CF2E` |
| `docs/rules/project-facts.md` | `531EC26BE664A88FDA8983B8BC4C9AF45D1CABED92D697C38335F66316BE6B84` |
| `docs/rules/git-release.md` | `D50E7415C02DE8A34EE531A81EB7BB1552EEB7CFB9601C09E96E5D3C4A763DC5` |

提交和 tag 本身是完整冻结范围的权威标识；可用以下命令核对：

```powershell
git show --stat v1.5.0
git diff --stat v1.4.1..v1.5.0
```

## 8. Git 与回滚边界

- 冻结提交：`v1.5.0` tag 指向的本地提交；
- tag：annotated tag `v1.5.0`，默认不推送；
- 回退源码前必须先确认已部署云函数、数据库和教师网页状态；
- 不得用 `reset --hard` 或覆盖工作区的方式回退；
- `v1.5.0` 冻结不包含小程序上传、审核、发布，也不包含云函数与教师网页部署。
