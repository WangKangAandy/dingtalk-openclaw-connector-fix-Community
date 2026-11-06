---
name: dingtalk-troubleshoot
description: |
  钉钉连接器问题排查。连接故障、Gateway、配置类问题诊断。
  涉及 dws 授权/登录或业务重试时，先读取 dingtalk-channel-rules 并完成当前请求者身份校验。
---

# 钉钉连接器问题排查

## 常见问题

### dws 命令返回 "command not found"

dws 未安装或未在 PATH。按官方方式安装：`npm install -g dingtalk-workspace-cli`，或 `curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh`；验证 `dws --version`。

### permission denied / HTTP 403

API scope 或组织开关不足，联系管理员开权限，勿反复 auth login。

### 连接器扫码后机器人未上线

检查 clientId/clientSecret、开放平台机器人能力、网络与 openclaw 日志。

## 错误处理

### Recovery

stderr 含 `RECOVERY_EVENT_ID=<id>` 时：`dws recovery execute --event-id <id> --format json` → 执行计划 → `dws recovery finalize`。详见 dws skill `references/recovery-guide.md`。

### 通用重试

仅在按 dingtalk-channel-rules 确认本轮请求者授权后，可加 `--verbose` 重试一次。不要把含凭据或其他用户信息的详细日志回传给用户。未知错误如实报告，勿猜测。

### 错误码速查

见 dws skill `references/error-codes.md`。
