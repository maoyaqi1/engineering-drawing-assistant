# 版本冻结记录 v1.6.0

> 版本号：`v1.6.0`
> 冻结日期：2026-11-04
> 上游版本：`v1.5.1`（用户确认的上一冻结版本；当前本地仓库无同名 Git tag）
> 冻结性质：Git 源码、测试和文档版本；不代表云函数已部署、小程序已上传/审核/发布或教师网页已发布

## 1. 版本定位

`v1.6.0` 在上一冻结版本 `v1.5.1` 的基础上，新增“直线与平面相交求交点”独立知识点互动页，并同步页面注册、首页平面模式入口、专项检查、统一需求、测试用例和项目版本事实。

本版本属于学生端教学功能增量。云函数、数据库结构、教师权限模型和 AI 教学资产均未因本功能改变。

## 2. 冻结范围

### 2.1 代码与入口

- 新增 `pages/line-plane-relation/` 页面目录及纯几何模型、Canvas 绘制、WXML、WXSS 和页面配置；
- 在 `app.json` 注册 `pages/line-plane-relation/line-plane-relation`，页面总数变为 11；
- 在 `pages/index/index.wxml` 的“平面”模式关键知识点区域增加“直线与平面 / 相交求交点”入口；
- 新增 `scripts/line-plane-relation-check.cjs`，并接入 `scripts/run-all.js`，全量检查由 39 项变为 40 项。

### 2.2 文档

- `README.md`、`AGENTS.md`、`docs/交接说明.md`；
- `docs/requirements/系统需求规格.md`、`docs/requirements/README.md`；
- `docs/test/系统测试用例.md`；
- `docs/rules/project-facts.md`、`docs/rules/git-release.md`、`docs/rules/coding.md`、`docs/rules/teacher-backend.md`、`docs/rules/teaching-app.md`；
- 本冻结记录。

## 3. 冻结行为

1. 页面从首页“平面”模式的“关键知识点”入口进入，独立标题为“线面相交求交点”。
2. 顶部只保留一排选择：直线可选一般位置直线、铅垂线、正垂线、侧垂线；平面可选一般位置平面、铅垂面、正垂面、侧垂面。
3. 页面按四种直线 × 四种平面共十六种组合自动判定关系；十三种组合得到唯一交点，三种同向积聚组合识别为直线在平面内，不伪造交点。
4. 一般位置直线与一般位置平面使用辅助平面法：建立一个包含整条 EF 的投影面垂直面 Q，可选择垂直于 H、V、W，并提示推荐方向；Q 与平面 ABC 的交线 12 高亮并标出点 1、2。
5. 辅助平面仅在投影图中以具有积聚性的那一面投影表示，用两端带小长矩形的实线迹线绘制；三维图只显示包含 EF 的 Q，不显示其他辅助面或多余迹线。
6. 作图按三步单步引导：第一步显示 Q、迹线和交线 12；第二步补齐 1、2 的另外两面投影和细实线投影连线；第三步求 K、补齐三面投影、显示 K 的投影连线并高亮最终结果。
7. 平面使用留边的大三角形，边缘不平行于任一投影面；A、B、C 只按所属投影象限标注为 `a/a′/a″`、`b/b′/b″`、`c/c′/c″`，不跨投影轴。
8. EF、辅助面/迹线和构造交线使用不同颜色；点和交点尺寸紧凑，标注避开线面。
9. 重置只清除当前已选直线、平面和辅助方向下的作图进度，保留当前选择与几何，不回到默认类型。

## 4. 验证证据

| 检查 | 实际结果 |
| --- | --- |
| `node scripts/line-plane-relation-check.cjs` | 405/405 通过 |
| `node scripts/run-all.js` | 40/40 项通过 |
| `node scripts/test-case-coverage-check.cjs` | 265/265 条当前需求有映射，共 60 个用例 |
| `node --check`（页面、模型、绘制、专项脚本） | 全部通过 |
| 敏感信息扫描 | 未命中 `sk-`、明文 API Key/Secret/Token/Password 赋值 |
| `git -c core.whitespace=cr-at-eol diff --check` | 通过 |

项目没有 CI。上述结果只表示本地只读检查和离线行为检查通过，不表示云函数部署、微信开发者工具逐项点按、真机或线上发布通过。

## 5. 不纳入本版本控制的内容

- `docs/ai_teacher_reflections.txt`：用户教学反思资产；
- `web-release/`：网页发布快照；
- `screen/`：本地截图目录；
- 任何 `.env`、私钥、Token、密码或真实账号数据。

## 6. 未完成验证与生效边界

1. 本轮未重新完成微信开发者工具中的全组合逐项点按验收。
2. 本轮未重新完成手机和平板真机验收。
3. 本功能没有要求云函数或数据库变更，因此未执行部署。
4. 小程序 `1.6.0` 未上传、未提审、未正式发布。
5. 教师网页预览仓库未发布。
6. 本项目 Skill 的 `references/architecture.md` 在当前主机属于只读范围，未能同步更新其中旧的“10 个页面”事实；当前页面事实以 `app.json`、`AGENTS.md` 和 `docs/rules/project-facts.md` 为准。

## 7. 核心文件哈希（SHA-256）

| 文件 | SHA-256 |
| --- | --- |
| `app.json` | `AF208FAA7D73A2D7FDDC6EE0F5A658FFF3DE18638E0D8E4BD5FDED86E49AAC8D` |
| `README.md` | `2C860449AB46482C1D9D62FF528DA1871264C6836B16DBCBBA2A3B9599485460` |
| `AGENTS.md` | `F1DA71D158ED0FE516C7F8F6F5DA639F12F87D39661C9D8F7E5C6E100AF06733` |
| `pages/index/index.wxml` | `BEDA478437255EAA67AA9CB3D7F88EB74E6346A95289982DB8C05FA0B30B05F9` |
| `pages/line-plane-relation/line-plane-relation.js` | `E338402EA0F6A2EDE4B057E0ACF3F3727AD971060222AB3E3EF00C3E1749E5B3` |
| `pages/line-plane-relation/line-plane-relation.wxml` | `813849C44655BA6004C297244E118B9DE067C8C3E727F05ABDFF6CA4A8AA5447` |
| `pages/line-plane-relation/line-plane-relation.wxss` | `D43F76A55355A796A2D2549CE8280B811389A05EE0DF7650017FF23B396F0D71` |
| `pages/line-plane-relation/line-plane-relation.json` | `615AB1021DD420E5AB412BD215AD0EBE7CCD5B0000AF216CD3C8E171D4771C77` |
| `pages/line-plane-relation/line-plane-model.js` | `5D728FD9B79C878346D3D2E315D602DDD729331869B645428E8F32A7B92CB6C0` |
| `pages/line-plane-relation/line-plane-render.js` | `ADAB7B54057478CDC70A6E2DBE0C9807552F99C293388A82CBE6A8BAAF20C63C` |
| `scripts/line-plane-relation-check.cjs` | `22F821E6CD5F20DD6B11B8600CA29A8F98EF9F14BDAFD6DC1BBC8201FE48AFDD` |
| `scripts/run-all.js` | `12E40B29B1847546A7871452BD70BD9545CE7B3F067DF87B3DE92F23D26A66FD` |
| `docs/交接说明.md` | `ACC81EC61BA6F7E676DD71942A3CA12B7A7B126DC684D94C245F93F24EC56CF4` |
| `docs/requirements/系统需求规格.md` | `294149CAF2A8E3645210F2C5F15EC31258708A2384965832C257E505B1344CDE` |
| `docs/requirements/README.md` | `2D9450031A4A562A429CEE4077B21C98C44A3C236DE1B9C1EAA96144A78ED906` |
| `docs/test/系统测试用例.md` | `14D0EC1739A98BAC276F34C059CB601AC213902F637AE4E05AE521C185137B73` |
| `docs/rules/project-facts.md` | `B1878E9E9948BB29A4341883868C07F44F318988C71B97EE4E575BC9A767D07D` |
| `docs/rules/git-release.md` | `A183E77DEC3C705A84ACC7DA082D567062F7EB87E66048F36B281FE126617154` |
| `docs/rules/coding.md` | `7127A7F2C0E2005327345DA87F32D470320A05B62F85B9E37AF049914288BA69` |
| `docs/rules/teacher-backend.md` | `0C976261C89488FB0813721D2369411155AFF2A1D084A148B3830EEA21B9C46C` |
| `docs/rules/teaching-app.md` | `A4A6706ADA7DF48A0CEDA7853176F7E90C93591CD4C62A3F505E4C5BF52C4B19` |

提交和 annotated tag 共同构成冻结范围的权威标识。可用以下命令核对：

```powershell
git show --stat v1.6.0
git diff --stat v1.5.0..v1.6.0
```

## 8. Git 与回滚边界

- 冻结提交：`v1.6.0` tag 指向的本地提交；
- tag：annotated tag `v1.6.0`，默认不推送；
- 回退源码前必须先确认已部署云函数、教师网页和线上小程序状态；
- 不得用 `reset --hard` 或覆盖工作区的方式回退；
- `v1.6.0` 冻结不包含小程序上传、审核、发布，也不包含云函数与教师网页部署。
