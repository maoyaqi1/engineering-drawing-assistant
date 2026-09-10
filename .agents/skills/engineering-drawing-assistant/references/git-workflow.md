# Git 工作规则

## 当前状态

| 项 | 值 |
|---|---|
| 分支 | `master` |
| 远程 | `origin` → `https://github.com/maoyaqi1/engineering-drawing-assistant.git`（私有） |
| 基准提交 | `aaf75d0` — `chore: establish engineering drawing assistant v0.6.2 baseline` |
| 远端跟踪 | `master` 已跟踪 `origin/master` |
| 提交身份 | 本地 `user.name = maoyaqi1`，`user.email` 见 `.git/config`（本地作用域，未设全局） |
| 自动化测试 / CI | **无** |

## 铁律

- **Codex 不得自行 `commit` 或 `push`**，除非用户在该次任务中明确要求。
- 不得自行 `git add`、`git pull`、`git fetch`、修改 remote、改写历史（`rebase` / `reset` / `--amend`）。
- 不得把密钥、密码、Token 提交进仓库。

## 开始较大改动前

1. `git status` —— 确认工作区是否干净、有无他人未提交改动。
2. `git log -1 --oneline` —— 确认当前基准版本。
3. 若工作区有未预期改动，**先停下并向用户确认**，不要覆盖。

## 开发过程中

- 小步修改，避免一次性大规模重构。
- 不与功能改动混入无关格式化。
- 冻结模块（见 references/frozen-modules.md）改动前须获用户确认。

## 完成后（提交前）

1. 按 references/testing.md 做回归，并说明实际验证方式。
2. `git diff` —— 逐项确认改动内容与预期一致。
3. `git status` —— 确认没有多余文件被纳入。
4. **敏感信息检查**（每次提交前都要做）：
   - 扫描明文口令、`sk-` 前缀、API Key / Secret / Token 字面量；
   - 确认 `TEACHER_PASSWORD`、`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY` 等**只以环境变量引用形式**出现，无真实值；
   - 确认 `.env` 未入库。
5. 向用户汇报改动清单与验证结果，**等待确认**。
6. 用户确认后再 `commit`；`push` 同样需要用户明确要求。

## 已排除在版本控制外的文件（勿误提交）

按项目约定，下列文件**当前未纳入 Git**，保留在本地：

- `docs/ai_teacher_reflections.txt`（教师个人教学感悟）
- `docs/qrcode.png`
- `docs/产品海报.html`
- `images/ai-avatar.png`
- `web-release/`（发布快照）

若用户要求纳入或排除，需明确确认后再处理。

## `.gitignore` 已忽略

`screen/`、`geogebra-offline/`、`project.private.config.json`、`.env`、`.env.*`、`*.log`。

其中 `geogebra-offline/` 是本机 GeoGebra 离线部署（约 147MB 第三方资源），**不属于本项目代码**，不得提交。

## 网络注意

访问 GitHub 的 git 传输在本机网络下**不稳定**（曾多次出现 `Recv failure: Connection was reset`）。推送失败时不要反复重试；应先向用户说明，再按其选择处理（重试 / 代理 / SSH / GitHub Desktop）。

首次推送需要 GitHub 认证（Git Credential Manager 的浏览器授权 + 可能的邮箱设备验证），**必须由用户本人完成**，Codex 不得代输密码、代读验证码或自建 Token。