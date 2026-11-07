---
name: dingtalk-troubleshoot
description: 钉钉连接、Gateway、DWS 授权和工具投递问题排查。
---

# 钉钉连接器问题排查

## DWS 业务不可用

1. 确认当前会话可调用 `dingtalk_dws`；该工具需要 Connector 的 `runtimeTools.enabled`、OpenClaw 工具允许策略、DWS 镜像和真实发言人的独立登录态。`exec` 中找不到 `dws` 不代表受控业务工具不可用。
2. 用 `dingtalk_dws({"args":["auth","status"]})` 检查当前发言人的授权，核对工具返回的 `exitCode` 和状态。未授权或过期时请本人完成独立设备授权；机器人不读取、切换或猜测宿主默认 profile。
3. `permission_denied`／HTTP 403 通常需要相应业务 scope 或组织开关，由管理员处理。业务写入或投递结果不明时先核对平台状态，不自动重试。
4. 工具被策略拒绝时如实说明，不改用 shell `dws`、其他人的登录态或宿主路径绕过。

## Gateway 与附件

- 机器人未上线：检查应用凭证、开放平台机器人能力、Stream 连接及 Gateway 日志；不要输出密钥。
- 附件发送失败：确认 `dingtalk_send_file` 已允许、文件在当前会话工作区内、参数是相对路径；以工具和平台回执判断，不把回复中的路径当作已投递。
