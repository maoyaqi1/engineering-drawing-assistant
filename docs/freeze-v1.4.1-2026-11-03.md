# 版本冻结记录 v1.4.1

> 版本号：`v1.4.1`
> 冻结日期：2026-11-03
> 上游版本：`v1.4.0`（Git tag / 提交 `fc108fa`）
> 冻结性质：工作区补丁快照；不代表已创建 Git tag、已上传体验版或已正式发布

## 1. 版本定位

`v1.4.1` 是 `v1.4.0` 之后的直角投影知识点补丁版本，用于固化以下优化：

- 将直角投影定理页 C/D 投影拖动圈由 10/8px 缩小为 6/5px，与其他点标记保持紧凑协调；
- 将定理表述扩展为“垂直相交或交叉”和“相交或交叉”，覆盖相交与交叉两类空间直线；
- 保留“空间垂直成立时高亮并显示直角、不成立时灰显且不显示直角”的教学因果关系；
- 增加 C/D 拖动圈尺寸回归断言；
- 将直角三角形法与直角投影定理的稳定行为、验收标准和测试映射同步到统一需求规格。

本版本不改变三视图投影公式、空间点真值、C/D 拖动命中半径、页面布局或学习会话接口。

## 2. 冻结范围

本冻结以 `v1.4.0 = fc108fa` 为上游，只认证下列补丁路径：

- `pages/right-angle-projection/` 的页面源码与绘制代码；
- `scripts/right-angle-projection-check.cjs`；
- `docs/design/right-angle-projection-stage1.md`；
- `docs/requirements/系统需求规格.md`、`docs/requirements/README.md`；
- `docs/test/系统测试用例.md`；
- `README.md` 及本版本相关状态、冻结和交接文档。

工作区中同时存在的 AI、云函数、教师后台、其他页面源码和其他未提交改动不属于 `v1.4.1` 认证范围，不得据此宣称它们已完成、已部署或已发布。

## 3. 行为与验收

### 直角投影定理

1. α、β、γ 分别对应水平线、正平线、侧平线三种固定平行线 `l`。
2. 一般位置直线 `m` 的 C、D 两端均可在正、俯、左任一投影视图中拖动；一次只移动被拖端点，另一端保持原坐标。
3. 当 `l` 平行于所选投影面且空间 `m ⟂ l` 时：
   - `l`、`m` 在空间图中高亮；
   - 空间交点显示直角标记和 `90°`；
   - 对应投影视图显示直角。
4. 当空间垂直条件不满足时，`m` 及其投影灰显，不显示直角；A/B/C/D/P 点标注与投影对应线继续保留。
5. 定理 I、II 使用包含“交叉”的最终表述；定理卡保持单一框格。
6. 重置恢复水平线/H 面默认构型，空间图和三视图使用同一组 A/B/C/D 几何真值。

### 直角三角形法

统一需求同时固化 `v1.4.0` 已交付的直角三角形法行为：α/β/γ 切换 H/V/W；由同一组 A/B 派生投影长、坐标差、实长和倾角；三个投影视图支持端点拖动；重置恢复默认一般位置直线和 H 面；退化线不得产生 `NaN` 或中断绘制。

## 4. 验证证据

| 检查 | 结果 |
| --- | --- |
| `node --check pages/right-angle-projection/right-angle-render.js` | 通过 |
| `node --check scripts/right-angle-projection-check.cjs` | 通过 |
| `node scripts/right-angle-projection-check.cjs` | 744/744 通过 |
| `node scripts/layout-check.cjs` | 全部通过 |
| `node scripts/run-all.js` | 38/38 项通过 |
| `node scripts/test-case-coverage-check.cjs` | 250/250 条需求有测试映射，共 56 个用例 |
| 微信开发者工具模拟器，375px 手机竖屏 | C/D 圆圈尺寸、C/D 单端拖动、另一端固定、非垂直灰显、垂直高亮、空间/投影直角和两条定理文案均正常 |

项目没有 CI；上述结果不等同于小程序提审、正式发布、云函数部署或真机最终验收。

## 5. 冻结文件哈希（SHA-256）

### 5.1 直角投影定理源码与专项检查

| 文件 | SHA-256 |
| --- | --- |
| `pages/right-angle-projection/right-angle-projection.js` | `4E5D77F48E9C750912EEE4DCC5BD535359EFDB4B5CC530BEEDCF8C0E953C2DD1` |
| `pages/right-angle-projection/right-angle-projection.wxml` | `C3133A45F249434BF1B575775D38771D8AF3FE543F974EA9B8B86E590F953A41` |
| `pages/right-angle-projection/right-angle-projection.wxss` | `981E66DA7DEDDFF0CA6E6FB98D6B9E972092D1E0B737D3D99BC7DE65618D0241` |
| `pages/right-angle-projection/right-angle-projection.json` | `0FF84E1F4D722D1550DE5E64B04BA94190C128E2C8A06FCEEB2C2612A6C94812` |
| `pages/right-angle-projection/right-angle-model.js` | `024A04FF3D901E7826F70AEDA167DC0649B01D62AB9FDFDB306456A3A7B5F690` |
| `pages/right-angle-projection/right-angle-render.js` | `447BD7764A0DFBCFF5E2373D03E2E4A0E5AC919D10263E72DD7DA7EE8AB1C1F0` |
| `scripts/right-angle-projection-check.cjs` | `B8F8E1450A176A059975158DEA66668AD0C2939199B4FEED23B75CA17F033D55` |
| `docs/design/right-angle-projection-stage1.md` | `A74922335100277D0780B2CDC1FA3615988BAE5A10B0A7A2E14812BEF08DD899` |

### 5.2 需求、测试与版本记录

| 文件 | SHA-256 |
| --- | --- |
| `docs/requirements/README.md` | `77E219A308BF43CB747C575C735CAEFF45A35738FAC97ED982089642877FAA69` |
| `docs/requirements/系统需求规格.md` | `EE58EB341B3932D29E362164856D258C87E0541E112975D48BD659AE2FACCB63` |
| `docs/test/系统测试用例.md` | `68EBB41CE84D23D319E04852563FF99A1AD2BBB20EE59D7D7FCC44AE2EEC5884` |
| `README.md` | `30B072266187231DD316C50133300750B5D8D47E3A47EB9F2D5C64D290C9AD9F` |
| `AGENTS.md` | `87926919A71F7F7D82CD808E68EE0701972AD821BAD4D3A25FCACE1667F61EB6` |
| `docs/交接说明.md` | `1B993AAF0500B2E19E70994621281BE92D7AC0A6F186AD40FF156E55D88C84D8` |
| `docs/rules/project-facts.md` | `1B5E48A85CB4189281EA7B8C717C932DE30291C698F66DEDC826E3A4C3A01CCA` |
| `docs/rules/git-release.md` | `49422F1536A5640F891EF3CA90936F3B212BB530C63562F4F68FBA331A7FEC03` |
| `.agents/skills/engineering-drawing-assistant/references/frozen-modules.md` | `E6D84C09E91696C539F88C1F0ADA824208EADAC98F97EDB61A3FEECD27887F25` |
| `docs/freeze-ui-compact-2026-11-02.md` | `D529E8ADAC82B334340975BBA9B29A93726B924C02765A1271E52E46B39E0971` |
| `docs/freeze-v1.4.0-2026-11-02.md` | `126AE0D97FFD6E4D6039C32482FE8EB865866ED5BE0144638AA318BF987CDB95` |

## 6. Git 与发布状态

- 当前 `HEAD`：`fc108fa`（`feat(release): freeze v1.4.0 knowledge pages and compact UI`）。
- 现有 Git tag：`v1.4.0`。
- `v1.4.1` 当前为工作区冻结快照，尚未创建 Git commit 或 tag。
- 本轮未执行小程序上传、提审、正式发布、云函数部署或教师网页发布。
- 后续如果用户明确要求提交和打 tag，应在独立发布批次中只纳入本记录列出的路径，并重新核对哈希。

## 7. 冻结约束与回退

1. 后续修改必须从该工作区快照建立可追溯差异，不得以“整理”为由改动已冻结行为。
2. 修改直角投影定理页时必须保持 C/D 单端拖动、另一端点固定、空间与投影同步、灰显/高亮因果关系和定理文案。
3. 修改后必须重跑专项检查、布局检查、需求覆盖检查和全量本地检查，并更新本记录哈希。
4. 回滚应恢复到 `v1.4.0 = fc108fa` 后重新应用经用户确认的补丁；不得使用重置或覆盖方式丢弃工作区其他改动。
5. 工作区中未被本记录列出的改动不属于 `v1.4.1`，不得随版本标签一并宣称发布。

核对命令：

```powershell
node scripts/right-angle-projection-check.cjs
node scripts/layout-check.cjs
node scripts/test-case-coverage-check.cjs
node scripts/run-all.js
Get-FileHash pages/right-angle-projection/right-angle-render.js -Algorithm SHA256
```
