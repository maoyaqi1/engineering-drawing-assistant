# AI 拍照配额原子预占方案（已确认实施）

> 状态：**已确认并实施（源码）；云函数尚未部署**
> 对应需求：`AI-23`–`AI-26`、`DATA-16`–`DATA-20`
> 修复前问题：`ai.ask` 先调用 `countPhotoAsksToday()`，再调用 AI，最后写 `learning_records.ai_photo_ask`。三个并发请求可同时读到剩余额度并全部进入图片处理链路。

## 1. 结论

推荐新增独立集合 `ai_photo_quota_daily`，以“用户 + 北京时间日期”为一份每日配额文档，在云数据库事务内完成预占、确认和释放。

用户已确认四项设计。本轮已新增源码模块 `cloudfunctions/api/ai/photo-quota.js`，并把 `ai_photo_quota_daily` 加入 `api` 云函数的集合初始化；尚未在真实云环境创建/部署。

不采用以下两种方案：

- **进程内变量 / 函数实例锁**：云函数可能多实例并发，无法提供全局原子性。
- **在 `learning_records` 内增加锁记录**：会混入教师端学习事件流，增加统计过滤和历史数据解释成本，耦合高于收益。

## 2. 数据模型

### `ai_photo_quota_daily`

```text
_id: SHA-256(normalized_openid + "|" + date_key)
subject_hash: SHA-256(normalized_openid)
date_key: YYYY-MM-DD（北京时间）
confirmed_count: 0..2
leases: {
  <request_key_hash>: {
    status: pending | confirmed | released
    slot: 1 | 2
    created_at: ISO
    expires_at_ms: number
    conversation_id?: string
    assistant_message_id?: string
    audit_event_id?: string
    audit_pending?: boolean
  }
}
updated_at: ISO
```

`request_key` 优先取客户端为本次发送生成并在重试时复用的 `request_id`；旧客户端未提供时，服务端使用图片 Base64 的 SHA-256 作为回退键。只保存哈希，不保存图片正文。

单份文档最多容纳 2 个有效租约，不需要为 `leases` 再建索引。

## 3. 原子流程

### 3.1 预占

在一个云数据库事务内：

1. 读取当日配额文档；
2. 将已过期且仍为 `pending` 的租约标记为 `released`，并清除已释放或已确认且不影响重试的旧租约，只保留最近少量诊断记录；
3. 若同一 `request_key` 已是 `pending`，直接复用该租约；
4. 若同一 `request_key` 已 `confirmed`，返回已完成状态和已保存的对话/消息 ID，不再次调用模型；
5. 计算占用数 = `confirmed_count + pending 租约数`；
6. 达到 2 时返回 `IMAGE_QUOTA_EXCEEDED`；
7. 未达到时写入 `pending` 租约并提交事务。

只有事务提交成功后才允许调用视觉模型。

### 3.2 成功确认

图片链路返回并写入既有 `ai_messages` 后，在事务中：

1. 校验 `request_key` 对应的租约仍为 `pending`；
2. 标记为 `confirmed`；
3. `confirmed_count` 加 1；
4. 保存 `conversation_id` 与 `assistant_message_id`，供响应丢失后的重试返回稳定结果。

随后写入既有 `learning_records.ai_photo_ask` 审计事件，并把事件 ID 回写到租约。

### 3.3 失败与释放

- AI 调用失败或消息写入失败：事务把租约标记为 `released`，不增加 `confirmed_count`，不写 `ai_photo_ask`。
- `ai_photo_ask` 审计写入失败：AI 结果仍返回给用户，但配额已确认；租约标记 `audit_pending=true`，响应 `photo_quota.audit_pending=true`，供人工运维补记。
- 函数异常退出：`pending` 租约保留 10 分钟后过期；下一次事务请求清理过期租约。10 分钟是待确认参数，应大于视觉模型与落库的正常超时时间，同时避免一次异常永久占用当日额度。

## 4. 上线当天与已有消费

首次读取某用户当天配额且文档不存在时：

1. 查询既有 `learning_records` 中该用户当天的 `ai_photo_ask` 数量；
2. 用该数量初始化 `confirmed_count`，最大截到 2；
3. 使用确定性 `_id` 创建配额文档；并发创建冲突时重新读取已创建文档。

因此上线前已经消费 1 次的学生当天只剩 1 次，已经消费 2 次的学生立即被拒绝。`learning_records.ai_photo_ask` 继续作为教师端审计和兼容统计来源，原子集合只承担实时放行。

## 5. 请求与返回契约

新增可选输入：

```text
request_id: 客户端一次发送生成，网络重试时复用
```

每次新发送生成新的 `request_id`；用户主动再次提问不得复用旧 ID。旧客户端未传时，服务端使用图片哈希回退。

`photo_quota` 保持既有字段：

```text
{ limit, used, remaining, unlimited }
```

可附加兼容字段：

```text
request_id
retryable
audit_pending
```

文字提问、内部账号和测试账号继续不进入该集合，也不受图片配额限制。

## 6. 必要回归

1. 同一用户并发 3 次，模型调用不超过 2 次，至少 1 次返回 `IMAGE_QUOTA_EXCEEDED`；
2. 同一 `request_id` 重试不重复消费、不重复调用模型；
3. 不同用户配额互不影响；
4. 视觉调用失败后租约释放，下一次可继续使用；
5. 审计事件写入失败时 AI 回答仍返回，但明确 `audit_pending`；
6. 模拟进程中断后，过期租约可清理；
7. 北京时间 23:59 与次日 00:00 分属不同配额文档；
8. 上线当天旧 `ai_photo_ask` 事件被正确折算；
9. 测试账号无限次、文字提问不受影响；
10. `photo_quota` 既有字段不变。

离线桩已增加串行事务、快照回滚和单次写入故障，但它仍不是云数据库真实冲突引擎；部署后必须重做并发与超时验证，不能只凭离线桩宣告线上通过。

## 7. 迁移、部署与回滚

实施步骤：

1. 用户确认新增集合与 10 分钟租约期限；
2. `ensureCollections()` 增加集合创建；
3. 增加配额领域模块与单元行为测试；
4. 扩展离线桩事务语义；
5. 接入 `ai.ask`，替换“先查计数、后记账”；
6. 部署 `api` 云函数后，用两个普通账号、一个测试账号并发验证；
7. 观察一天，确认旧事件折算、审计写入与跨日。

回滚：

- 先恢复旧版 `api` 云函数；旧版继续读取 `learning_records.ai_photo_ask`，不受新集合残留影响；
- 保留 `ai_photo_quota_daily` 数据用于审计，不在故障时立即删除；
- 当日配额可能因预占而偏保守，次日自然失效；
- 不迁移或改写既有 `ai_photo_ask` 事件。

## 8. 已确认的实施参数

1. 新增 `ai_photo_quota_daily` 集合：已接受；
2. 10 分钟 `pending` 租约期限：已接受；
3. 审计失败返回成功并标记 `audit_pending`：已接受；
4. 客户端新增 `request_id`，旧客户端由图片哈希回退：已接受。

## 9. 实施与验证记录

- 领域模块：`cloudfunctions/api/ai/photo-quota.js`；
- 接入点：`cloudfunctions/api/index.js` 的 `ai.ask`；
- 客户端：`utils/api.js` 传递 `request_id`，`pages/ai/ai-conversation.js` 为图片发送生成请求键；
- 离线桩：增加串行事务、提交失败回滚和单次审计写入故障；
- 回归：`run-photo-quota.cjs` 12/12，`run-photo-quota-concurrency.cjs` 15/15；
- 验证覆盖：并发上限、同请求处理中/已完成、不同用户、AI 失败返还、审计失败、跨日、租约过期、旧事件折算和内部账号豁免。

真实云数据库事务冲突、函数超时和部署后跨日行为仍未验证。
