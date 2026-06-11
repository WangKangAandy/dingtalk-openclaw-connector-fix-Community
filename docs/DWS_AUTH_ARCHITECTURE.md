# DWS Auth 架构（当前态）

> **日期：** 2026-06-11  
> **状态：** Phase R 回退后生效  
> **取代：** `DWS_AUTH_OPTIMIZATION_PLAN.md`、`DWS_AUTH_PHASE1_5_REFACTOR.md` 中的 connector 编排设计

## 定位

```
钉钉 IM ↔ connector（消息通道 + DWS_AUTH_IDENTITY）↔ OpenClaw Agent
                                              ↓ exec
                                            dws CLI
```

| 层 | 职责 |
|----|------|
| **connector** | Stream 消息、AI Card、注入 `DWS_AUTH_IDENTITY`、memory-scope |
| **dws** | login、status、token 落盘、Step4 CLI 校验、`DWS_AUTH_DENIAL` |
| **Agent + Skill** | 唯一 auth 工作流：status → login → 业务 |

connector **不包含** `dws-auth/`、`dws-auth-guard`、`ensureDwsAuth`、DenialCache、Gate、proactive blocked 文案。

## connector 保留的 auth 相关代码

- `channel.ts` → `getDwsSpawnEnv()`：设置 `DWS_AUTH_IDENTITY`、`DINGTALK_AGENT`
- `message-handler.ts`：dispatch 时 `process.env.DWS_AUTH_IDENTITY = senderId`；prompt 注入 `[DingTalk DWS Context]`

## Agent 文档

**auth 唯一编排源在 dws 仓库 skill**（connector 只引用，不复制）：

- **dws skill** `references/dws-auth-workflow.md` — 命令规范 + 工作流
- **dws skill** `references/dws-auth-contract.md` — exit code / `DWS_AUTH_DENIAL`

**connector 仓库 skill**（通道与路由，不含 auth 正文）：

- `skills/dingtalk-channel-rules/SKILL.md`
- `skills/dingtalk-troubleshoot/SKILL.md`（指向 dws skill）

## 标准 auth 命令

```bash
dws auth status --sender-id <DWS_AUTH_IDENTITY> --format json
dws auth login --sender-id <DWS_AUTH_IDENTITY> --device
```

`~/.dws/`（default）仅用于运维一次性初始化 dingmbw；聊天用户 token 只在 `~/.dws/users/<senderId>/`。

## 历史说明

Phase 1 曾在 connector 内实现 Gate / DenialCache / spawn login，用于规避 Agent 误杀 login 子进程等问题。现已回退：**机制约束改为 Skill 工作流**（禁止 kill、禁止并行 login），connector 恢复「桥」定位。
