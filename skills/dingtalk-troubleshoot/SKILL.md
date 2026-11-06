---
name: dingtalk-troubleshoot
description: |
  钉钉连接器问题排查。连接故障、Gateway、配置类问题诊断。
  dws 授权/登录用官方 CLI：auth status / auth login [--device]。
---

# 钉钉连接器问题排查

## DWS 授权 / 登录

默认使用官方 [dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)（≥1.0.66）。官方 CLI **没有** `--sender-id`，社区变量 `DWS_AUTH_IDENTITY` 已废弃。业务账号必须绑请求者：只用入站 `chatbotCorpId` + `senderStaffId` 精确对应的 `profile=corpId:userId`。

**标准命令（官方）：**

1. 入站必须同时有可信 `chatbotCorpId` 和 `senderStaffId`；缺任一就停止
2. `dws auth status --format json`（这次 exec 已带 `--profile`）；`userId` 必须等于这次发送者
3. 未登录 / `profile not found` → 请请求者本人 `dws auth login --device`（不加 `--profile`，勿 `timeout: 30`）
4. `userId` 对不上 → 停止业务，只说「本机没有你的授权」。严禁把部署者身份或全局当前账号当 fallback。不要读 `profiles.json`，不要列出本机其他授权

无 `senderStaffId` 时不要用加密 `senderId` 去碰 `--profile`。

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
