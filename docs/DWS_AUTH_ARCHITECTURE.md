# DWS Auth 架构（当前态）

> **日期：** 2026-10-30  
> **原则：** 身份跟**这次入站消息**走，焊在**这次 exec 子进程**上；**不**改 gateway `process.env`。谁 exec auth 仍是 Agent。

## 定位

```
钉钉 IM ↔ connector（SenderId + ChannelContext）↔ OpenClaw（这次 run 的 before_tool_call / resolve_exec_env）↔ 这次 dws 子进程（--profile corpId:senderStaffId）
```

| 层 | 职责 |
|----|------|
| **connector** | 入站写入 `SenderId` / `ChannelContext`；注册 hook 给这次 `dws` 加上 `--profile`；**不** spawn login，**不**改父进程环境 |
| **dws CLI** | 官方 `1.0.64+` 认 `--profile corpId:userId`；未带 flag 时用 `currentProfile`（必须避免） |
| **Agent** | exec `auth status` / `auth login --device` / 业务 `dws`；交付授权链接给**当前发送者** |

## 与官方 connector 的差异

| 项 | 官方 connector | 本部署 |
|----|----------------|--------|
| 发送者 → dws | 未焊，全机一个登录态 | 这次 exec 注入 `--profile <corpId>:<senderStaffId>` |
| 并发 | 共享 `currentProfile` | 每次 hook ctx 独立，不改 `process.env` |
| 谁 exec auth | Agent | Agent（相同） |

## connector 代码

- `src/dws-exec-identity.ts` — `before_tool_call` 改这次 command；`resolve_exec_env` 写这次子进程 env
- `src/core/message-handler.ts` — `SenderId` + `ChannelContext`；prompt 仅作说明
- `src/channel.ts` — `getDwsSpawnEnv()` 仍可供测试/导出；运行时 exec 不走它
- `src/reply-dispatcher.ts` — `onCommandOutput` 仅养成系统等产品检测；**不**触发 login spawn

**已退役：** `src/dws-oauth.ts` 的 `spawnLoginProcess` / `handleDwsAuthCommandOutput` 推链路径（fix23 起不再从 `reply-dispatcher` 调用）。保留文件仅供参考或后续清理。

## Agent 文档

- **dws skill** `references/dws-auth-workflow.md` — 唯一编排源
- **dws skill** `references/dws-auth-contract.md` — exit code / stderr

## 标准流程

1. Agent `dws auth status --format json`（这次 exec 已带 `--profile`）
2. `authenticated: false` → Agent `dws auth login --device`（勿 `timeout: 30`）
3. Agent 将授权 URL 交付用户本人扫码
4. 再 `auth status` 确认 → 业务 `dws`

## 历史说明

- **P2 spawn 推链**：已退役（相对官方过度；login 改回 Agent exec）
- **Phase 1 Gate/Guard**：已移除
- **Phase R Agent exec + 30s**：已废止；标准化后 Agent exec login 但禁止过短超时
