---
name: dingtalk-troubleshoot
description: |
  钉钉连接器问题排查。dws 错误处理、DWS 登录验证（Gate/Ready）、连接故障诊断。
  当 dws 执行失败、授权异常、未登录/token 失效时激活。
---

# 钉钉连接器问题排查

## DWS 登录验证

**分工：** connector 后台跑 `dws auth login --sender-id <id> --device` 并推授权链；Agent **不得** exec 该命令或 kill login 进程。

**Ready 后**（`auth status` token 已落盘）才可执行业务 `dws`。未 Ready 时 Gate 通常已拦截，勿用业务命令试探。

细则见 [dws-auth-standard-flow.md](./references/dws-auth-standard-flow.md)。

## 常见问题

### dws 命令返回 "command not found"

dws 未安装或未在 PATH。在 connector 目录 `npm install`，或 `node scripts/install-community-dws.js`；验证 `dws --version`。

### dws 未授权 / token 失效

**现象：** `not_authenticated`、`IDENTITY_NOT_AUTHENTICATED`、`AUTH_TOKEN_EXPIRED`

**处理：**

1. 告知用户等待 connector 授权链接；授权后请**再发一条消息**
2. `IDENTITY_NOT_AUTHENTICATED` = token 未落盘，勿猜测 CLI 名单（名单结论见 connector blocked 文案或 gateway 日志）
3. token 落盘后仍失败：以当次 stderr 为准
4. `IDENTITY_MISMATCH`：等 connector 重新推链

HTTP 403 / scope 不足是权限问题，不是登录问题，勿反复 auth login。

### token expired / AUTH_TOKEN_EXPIRED

connector 会重新推链，Agent 勿 exec login。

### permission denied / HTTP 403

API scope 或组织开关不足，联系管理员开权限，勿引导 auth login。

### 连接器扫码后机器人未上线

检查 clientId/clientSecret、开放平台机器人能力、网络与 openclaw 日志。

## 错误处理

### Recovery

stderr 含 `RECOVERY_EVENT_ID=<id>` 时：`dws recovery execute --event-id <id> --format json` → 执行计划 → `dws recovery finalize`。详见 dws skill `references/recovery-guide.md`。

### 通用重试

1. 先判断是否未登录（见上）— 未登录禁止业务 `dws` 重试
2. 其他错误可加 `--verbose` 重试
3. 未知错误如实报告，勿猜测

### 错误码速查

见 dws skill `references/error-codes.md`。
