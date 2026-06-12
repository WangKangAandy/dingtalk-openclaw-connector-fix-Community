# DWS Auth 架构（当前态）

> **日期：** 2026-06-12  
> **原则：** per-sender token（`~/.dws/users/<senderId>/`）为产品亮点；**谁 exec auth 与[官方 connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector) 一致 → Agent**。

## 定位

```
钉钉 IM ↔ connector（注入 DWS_AUTH_IDENTITY）↔ OpenClaw Agent（exec auth + 业务 dws）↔ dws CLI
```

| 层 | 职责 |
|----|------|
| **connector** | `DWS_AUTH_IDENTITY` 注入、会话 prompt；**不** spawn / exec `dws auth login` |
| **dws CLI** | per-sender token 落盘、`auth status`、`auth login --device`、业务 API |
| **Agent** | exec `auth status`、`auth login --sender-id <id> --device`、业务 `dws`；交付授权链接与结果 |

## 与官方的差异（仅 per-sender）

| 项 | 官方 `skills/dws-cli` | 本部署 |
|----|----------------------|--------|
| token 目录 | `~/.dws/`（单用户） | `~/.dws/users/<senderId>/` |
| auth 命令 | `dws auth status` / `dws auth login` | 须加 `--sender-id <DWS_AUTH_IDENTITY>` |
| 谁 exec auth | Agent | Agent（相同） |

## connector 代码

- `src/core/message-handler.ts` — 注入 `DWS_AUTH_IDENTITY` + prompt context
- `src/channel.ts` — `getDwsSpawnEnv()` 供 Agent exec 子进程使用
- `src/reply-dispatcher.ts` — `onCommandOutput` 仅养成系统等产品检测；**不**触发 login spawn

**已退役：** `src/dws-oauth.ts` 的 `spawnLoginProcess` / `handleDwsAuthCommandOutput` 推链路径（fix23 起不再从 `reply-dispatcher` 调用）。保留文件仅供参考或后续清理。

## Agent 文档

- **dws skill** `references/dws-auth-workflow.md` — 唯一编排源
- **dws skill** `references/dws-auth-contract.md` — exit code / stderr

## 标准流程

1. Agent `dws auth status --sender-id <id> --format json`
2. `authenticated: false` → Agent `dws auth login --sender-id <id> --device`（勿 `timeout: 30`）
3. Agent 将授权 URL 交付用户本人扫码
4. 再 `auth status` 确认 → 业务 `dws`

## 历史说明

- **P2 spawn 推链**：已退役（相对官方过度；login 改回 Agent exec）
- **Phase 1 Gate/Guard**：已移除
- **Phase R Agent exec + 30s**：已废止；标准化后 Agent exec login 但禁止过短超时
