---
name: dingtalk-troubleshoot
description: |
  钉钉连接器问题排查。包含 dws CLI 常见错误处理、标准化登录验证流程（Gate/Ready）、授权问题排查和连接故障诊断。
  当 dws 命令执行失败、授权异常、未登录/token 失效、连接中断时自动激活。
---

# 钉钉连接器问题排查

## 🔐 DWS 登录验证（Phase 1 标准流程）

**Ready 唯一标准：** `dws auth status` 显示 token **已落盘**（`authenticated: true`）。

**Agent 必须遵守：**

1. **禁止** 执行 `dws auth login` 或 kill login 进程（connector 统一管理）。
2. **禁止** 未 Ready 时执行业务 `dws`（`doc` / `calendar` / `aitable` 等），含 `--verbose` 试探。
3. 未登录：告知用户等待 connector 推送的授权链接，**不要**说「我试一下」。
4. 扫码授权成功后：用户须 **再发一条消息**，Gate 通过后才执行业务（不自动续跑原意图）。
5. `user_not_allowed`：引导联系管理员加 CLI 名单；用户回复「已加名单请重试」后可由 connector 重新 login。
6. `IDENTITY_MISMATCH`：等待 connector 冷却结束后重新推链，勿手动 login。

**详细状态图、Gate 判定表、exit code：** 读 [dws-auth-standard-flow.md](./references/dws-auth-standard-flow.md)。

## ❓ 常见问题（FAQ）

### dws 命令返回 "command not found"

**现象**：执行 dws 命令时提示 `command not found: dws`

**原因**：dws CLI 未安装或未加入 PATH。

**解决步骤**：
1. 在 connector 目录执行 `npm install`（会自动安装社区版 dws）
2. 或手动：`node scripts/install-community-dws.js`
3. 验证：`dws --version`，并确认 `~/.openclaw/skills/dws/SKILL.md` 存在

### dws 未授权 / token 失效

**现象**：`not_authenticated`、`IDENTITY_NOT_AUTHENTICATED`、`AUTH_TOKEN_EXPIRED`、或未登录类报错。

**处理**（按 [标准流程](./references/dws-auth-standard-flow.md)）：

1. **不要** 执行 `dws auth login`；connector 会推授权链接。
2. **不要** 执行业务 `dws` 试探；告知用户完成扫码后 **再发一条消息**。
3. OAuth 页「授权成功」但机器人仍说未登录 → 可能是 Step4 CLI 名单拒绝（token 未落盘），按 blocked 文案引导加名单。
4. 错人扫码 → `IDENTITY_MISMATCH`：等待 connector 重新推链。

**注意**：HTTP 403 / scope 权限不足不是登录问题，联系管理员开权限，不要反复 auth login。

### dws 命令返回 "token expired" / AUTH_TOKEN_EXPIRED

token 过期：connector 会重新推授权链接；**勿**手动 `dws auth login`。

### dws 命令返回 "permission denied" 或 HTTP 403

**现象**：命令执行失败，提示权限不足。

**原因**：当前用户或应用缺少对应 API 的权限（scope / 组织开关），**不是**登录态问题。

**解决步骤**：
1. 确认操作所需的权限范围
2. 联系组织管理员开通对应权限
3. 权限开通后重试原命令
4. **不要**一律引导 `dws auth login`

### 连接器扫码后机器人未上线

**现象**：完成 device-auth 扫码后，钉钉中机器人未显示在线。

**可能原因**：
- clientId/clientSecret 配置错误
- 钉钉应用未启用机器人能力
- 网络连接问题

**排查步骤**：
1. 检查 openclaw 日志中是否有连接错误
2. 确认钉钉开放平台中应用已启用「机器人」能力
3. 确认 clientId 和 clientSecret 与开放平台一致
4. 尝试重启 openclaw

## 🔧 错误处理流程

### Recovery 闭环

当 dws 命令的 stderr 中出现 `RECOVERY_EVENT_ID=<event_id>` 时，说明 CLI 检测到可恢复的错误。

**处理流程**：
1. 提取 `RECOVERY_EVENT_ID` 的值
2. 执行 `dws recovery execute --event-id <event_id> --format json` 获取恢复计划
3. 按恢复计划逐步执行
4. 执行 `dws recovery finalize --event-id <event_id>` 完成闭环

详细规范见 **dws** skill 的 `references/recovery-guide.md`（先用 read 加载 dws skill，再读该文件）。

### 通用错误重试

1. 首次失败：检查是否为 **未登录**（见上文标准流程）— 未登录时 **禁止** 用业务 `dws` 或 `--verbose` 重试
2. 非登录类失败：可加 `--verbose` 重试，获取详细错误信息
3. 检查 stderr 是否匹配已知错误模式（未安装/未登录/过期/权限不足/Recovery）
4. 匹配到已知模式：按对应 FAQ 处理
5. 未匹配：将完整错误信息报告给用户，禁止自行猜测替代方案

### 错误码速查

各产品高频错误码及排查流程见 **dws** skill 的 `references/error-codes.md`（先用 read 加载 dws skill，再读该文件）。
