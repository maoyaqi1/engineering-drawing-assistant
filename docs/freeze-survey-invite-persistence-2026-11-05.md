# 问卷邀请持久化专项冻结记录（2026-11-05）

> 冻结标识：`survey-invite-persistence-2026-11-05`
> 冻结日期：2026-11-05
> Git 基准：`12d5f4c`（`v1.6.0`）
> 冻结性质：当前工作区专项快照；不是 Git commit、tag、部署或线上发布

## 1. 冻结范围

本专项只冻结以下三个文件：

| 文件 | SHA-256 |
| --- | --- |
| `utils/survey-invite.js` | `EFAC54212DCAC316059D245DAED5ECB1707A5D7435D8C62D67B1CDA7B9D8B8B2` |
| `pages/survey/survey.js` | `5D1A2E042FF0AD37C2604E0F1576D4C8FDFCCE95A81BFB4DBB55BF38B5905F58` |
| `scripts/survey-invite-check.cjs` | `1CA3A07002F2C95C48D06D0BE8916668A983A282D9CE523BFD1D941BB255B2E2` |

冻结后不得以“整理、统一、优化”为由修改上述实现。只有用户明确要求或存在可复现真实缺陷时才允许变更，并须更新本记录与哈希。

## 2. 修改背景与解决的问题

服务端调用 `statistics(true)` 并返回 `can_invite=true` 时，已经新增或更新了 `survey_invites` 记录。旧客户端只使用内存变量 `pendingInvite` 保存待展示状态，如果小程序进程在弹窗显示前被彻底结束，下次启动无法恢复该邀请，而服务端也不会再次返回同一条邀请。

本专项增加微信同步本地存储，用于保存“服务端已经确认、但客户端尚未处理”的邀请，并在首页或旧 `pages/index` 再次可见时恢复。

## 3. 本地存储结构

存储键：

```text
hfjh_survey_invite_v1
```

记录结构：

```json
{
  "version": 1,
  "status": "pending",
  "surveyId": "geometry_learning_2026",
  "surveyVersion": "v1",
  "inviteKey": "客户端唯一标识",
  "createdAt": 1790000000000
}
```

状态值：

- `pending`：服务端已确认邀请，尚未完成用户选择。
- `consumed`：用户已经确认或取消，不再作为待展示邀请。

`inviteKey` 只用于客户端关联弹窗、问卷页和本地记录，不是服务端资格凭证。

## 4. 服务端与客户端职责

服务端继续负责：

- 有效会话数、名册/测试账号资格和问卷完成状态判断。
- 5 次有效会话阈值及后续邀请间隔。
- 写入或更新 `survey_invites`。
- 通过 `can_invite=true` 告知本次调用实际产生邀请。

客户端只负责：

- 在 `result.ok=true`、`result.can_invite=true` 且问卷未完成时保存 pending。
- 恢复、展示、消费和清理已经由服务端确认的邀请。
- 不自行计算邀请资格，不依赖 `valid_session_count` 重复判断。

## 5. 状态转换

```text
服务端返回 ok=true 且 can_invite=true
→ 写入 pending
→ 当前首页或旧 index 可见时显示

用户确认
→ 写入 consumed
→ 携带 inviteKey 进入问卷页
→ 问卷提交成功后按 inviteKey 清理

用户取消
→ 写入 consumed
→ 删除本地记录

弹窗展示期间进程结束
→ 本地保持 pending
→ 下次启动允许再次显示

无待显示邀请
→ 不展示
→ 只有存在新会话事件时才检查统计
```

## 6. inviteKey 传递与精确清理

用户确认进入问卷页的路由：

```text
/pages/survey/survey?invite_key=<encoded-inviteKey>
```

问卷页在 `onLoad(options)` 中保存 `this._expectedInviteKey`。提交成功后调用：

```text
surveyInvite.clearAfterSubmit(this._expectedInviteKey)
```

清理函数只在本地记录的 `inviteKey` 与期望值一致时执行消费和删除。key 不匹配、缺失或读取失败时不修改任何本地邀请。通过其他入口打开问卷页仍可正常提交，但不会无条件清理其他邀请。

## 7. 异常处理

- 本地读取失败：暂停邀请恢复和新的统计请求，不消费会话事件版本；后续页面可见时重试。
- pending 写入失败：当前进程可展示本次服务端已确认邀请，但不具备跨进程恢复能力。
- consumed 写入失败：不删除原 pending；同一进程依靠内存消费集合防重，进程重启后允许再次恢复。
- consumed 删除失败：保留 consumed，后续读取不会将其作为待显示邀请。
- 数据损坏或版本不匹配：忽略并尝试清理，不生成邀请。
- 已存在 pending：不被新的页面初始化覆盖。

## 8. 验证记录

本轮实际执行：

| 检查 | 结果 |
| --- | --- |
| `node scripts/survey-invite-check.cjs` | 69/69 通过 |
| `node scripts/run-all.js` | 46/46 项通过 |
| 修改文件 `node --check` | 全部通过 |
| `git diff --check` | 通过 |
| 敏感信息扫描 | 未命中原生密钥或 Token 字面量 |
| 微信开发者工具 CLI preview | 编译成功，约 389.3 KB |

专项测试覆盖持久化恢复、进程重启、pending/consumed/删除失败、读取失败阻断统计、重复统计防护、无 `valid_session_count` 时创建邀请、无邀请、inviteKey 匹配/不匹配/为空、无 key 入口、问卷提交后清理，以及首页和旧 index 共用逻辑。

## 9. 未完成验证

- 微信开发者工具模拟器中的弹窗点击、取消、确认和提交。
- 清理开发者工具本地缓存后的实际进程重启恢复。
- 手机真机中的本地存储、弹窗和页面切换。
- PAD 真机中的页面切换、后台恢复和问卷流程。
- 真实云数据库中的 `survey_invites` 与 `survey_responses` 写入核对。

CLI 编译成功不等同于模拟器交互、真机验收、云函数部署或线上发布通过。

## 10. 已知限制

1. 服务端已经写入邀请，但客户端在收到 `can_invite=true` 响应前进程结束，客户端没有可保存的确认结果；本地持久化无法恢复。
2. 用户在另一台设备提交问卷时，当前设备的本地 pending 无法仅凭本地状态感知服务端已完成。

解决上述两点需要修改云函数返回结构或增加服务端只读查询，不属于本专项冻结范围。

## 11. 阶段 5 边界

本冻结不代表“首页及课程导航体系重构”整体完成。阶段 5 仍需独立执行：

- 全量功能回归。
- 微信开发者工具模拟器交互。
- 手机和 PAD 真机验收。
- 登录、首页、学习页导航、AI 准入和问卷流程完整验证。
- 软件说明书、统一需求、测试用例和交付文档闭环。

## 12. 核对命令

```powershell
Get-FileHash utils/survey-invite.js,pages/survey/survey.js,scripts/survey-invite-check.cjs -Algorithm SHA256
node scripts/survey-invite-check.cjs
node scripts/run-all.js
git diff --check
```
