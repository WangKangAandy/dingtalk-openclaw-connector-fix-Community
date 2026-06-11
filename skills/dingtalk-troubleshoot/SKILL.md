---
name: dingtalk-troubleshoot
description: |
  钉钉连接器问题排查。连接故障、Gateway、配置类问题诊断。
  dws 授权/登录问题见 dws skill（references/dws-auth-workflow.md）。
---

# 钉钉连接器问题排查

## DWS 授权 / 登录

**分工：** connector 只做消息通道并注入 `DWS_AUTH_IDENTITY`；**auth 工作流与命令规范均在 dws 仓库 skill**，本仓库不维护副本。

| 主题 | 文档（dws skill） |
|------|-------------------|
| 工作流 + 命令规范 | `references/dws-auth-workflow.md` |
| exit code / `DWS_AUTH_DENIAL` | `references/dws-auth-contract.md` |

**标准命令（摘要）：** `dws auth status --sender-id <DWS_AUTH_IDENTITY> --format json` → `dws auth login --sender-id <DWS_AUTH_IDENTITY> --device`（裸 `dws auth login` 已废弃，细则见 dws skill）。

## 常见问题

### dws 命令返回 "command not found"

dws 未安装或未在 PATH。在 connector 目录 `npm install`，或 `node scripts/install-community-dws.js`；验证 `dws --version`。

### dws 未授权 / token 失效

**现象：** `not_authenticated`、`IDENTITY_NOT_AUTHENTICATED`、`AUTH_TOKEN_EXPIRED`

**处理：** 严格按 **dws skill** `references/dws-auth-workflow.md`（勿使用本仓库已移除的 auth 文档副本）。

### permission denied / HTTP 403

API scope 或组织开关不足，联系管理员开权限，勿反复 auth login。

### 连接器扫码后机器人未上线

检查 clientId/clientSecret、开放平台机器人能力、网络与 openclaw 日志。

## 错误处理

### Recovery

stderr 含 `RECOVERY_EVENT_ID=<id>` 时：`dws recovery execute --event-id <id> --format json` → 执行计划 → `dws recovery finalize`。详见 dws skill `references/recovery-guide.md`。

### 通用重试

1. 先走 dws skill auth 工作流确认 token 已落盘
2. 其他错误可加 `--verbose` 重试一次
3. 未知错误如实报告，勿猜测

### 错误码速查

见 dws skill `references/error-codes.md`。
