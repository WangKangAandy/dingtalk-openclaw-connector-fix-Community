---
name: dingtalk-troubleshoot
description: |
  钉钉连接器问题排查。连接故障、Gateway、配置类问题诊断。
  dws 授权/登录用官方 CLI：auth status / auth login [--device]。
---

# 钉钉连接器问题排查

## DWS 授权 / 登录

默认使用官方 [dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)（≥1.0.66）。官方 CLI **没有** `--sender-id`，社区变量 `DWS_AUTH_IDENTITY` 已废弃、connector 不再注入。`--profile` 选的是本机组织/账号（`corpId:userId`），**不要**把 IM `senderId` 填进去。

**标准命令（官方）：**

1. `dws auth status --format json`
2. 未登录 → 本机 `dws auth login`；SSH / 无头环境 `dws auth login --device`，把授权链接交给用户扫码（勿 `timeout: 30`）
3. 再 `dws auth status --format json` 确认后执行业务 `dws`

多组织时用官方 `dws profile list` 查看，再用 `dws auth status --profile <corpId:userId>`。这与钉钉会话 sender 不是同一套身份。

## 常见问题

### dws 命令返回 "command not found"

dws 未安装或未在 PATH。按官方方式安装：`npm install -g dingtalk-workspace-cli`，或 `curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh`；验证 `dws --version`。

### dws 未授权 / token 失效

**现象：** `not_authenticated`、`IDENTITY_NOT_AUTHENTICATED`、`AUTH_TOKEN_EXPIRED`

**处理：** 按上方官方 `dws auth status` / `dws auth login [--device]` 重登，不要加 `--sender-id`。

### permission denied / HTTP 403

API scope 或组织开关不足，联系管理员开权限，勿反复 auth login。

### 连接器扫码后机器人未上线

检查 clientId/clientSecret、开放平台机器人能力、网络与 openclaw 日志。

## 错误处理

### Recovery

stderr 含 `RECOVERY_EVENT_ID=<id>` 时：`dws recovery execute --event-id <id> --format json` → 执行计划 → `dws recovery finalize`。详见 dws skill `references/recovery-guide.md`。

### 通用重试

1. 先走上方官方 `dws auth status` 确认 token 已落盘
2. 其他错误可加 `--verbose` 重试一次
3. 未知错误如实报告，勿猜测

### 错误码速查

见 dws skill `references/error-codes.md`。
