# DWS Auth Phase 1.5 重构清单

> ⚠️ **已废止（2026-06-11 Phase R）** — `src/dws-auth/*` 等已删除。见 [DWS_AUTH_ARCHITECTURE.md](./DWS_AUTH_ARCHITECTURE.md)。  
> 下文仅作历史记录保留。

> **版本：** v0.2  
> **日期：** 2026-06-11  
> **前提：** Phase 1（`feat/dws-auth-phase1` / `feat/auth-exit-code`）已止血上线  
> **原则：** 只收紧 **dws ↔ connector 契约** 与 **代码结构**；**不改变** Gate 语义与用户可见行为

---

## 1. 为什么要做 1.5

Phase 1 让 connector 承担了过多 **auth 编排**（spawn login、解析 stderr、DenialCache、Gate），在 IM 场景下可接受，但存在：

| 风险 | 现状 |
|------|------|
| 契约脆弱 | `parseLoginDenial` 靠中文字符串 |
| 单体难维护 | `dws-oauth.ts` ~600 行 |
| 双份 ready 真相 | `gateReadySenders` 内存 Set vs `auth status` 磁盘 |
| 路径语义混 | DenialCache 在 `~/.dws/cache/`，由 connector 读写 |

Phase 1.5 **不新增状态**、不建 AuthOrchestrator，只做「边界清晰 + 可测试契约」。

---

## 2. 职责边界（目标态）

```text
dws（身份与 token 唯一真相）
  ├─ login / status / logout
  ├─ exit code：0 / 2 / 5（超时）/ 4（PAT，不改）
  └─ 失败时输出机器可读 denial（见 §3.1）

connector（IM 编排，不猜业务含义）
  ├─ ensureDwsAuth：读 status + denial 契约 → 决定进不进 Agent
  ├─ proactive 文案（blocked / pending / expired）
  ├─ DenialCache：仅「防自动连推码」；读写路径归 connector 自有目录（见 §3.4）
  └─ before_tool_call 兜底：拦 login / kill / 未 ready 业务 dws
```

---

## 3. 实施项（按优先级）

### P0 — dws 结构化 denial 一行（PR-1.5-dws）

**目标：** connector 不再 `includes("您不在该组织的 CLI…")`。

device login Step4 拒绝时，stderr **追加一行**（保留现有中文 UX 不变）：

```text
DWS_AUTH_DENIAL reason=user_not_allowed
```

| `reason` | 何时 |
|----------|------|
| `user_not_allowed` | CLI 个人名单 |
| `cli_not_enabled` | 组织未开 CLI |
| `user_forbidden` | 组织全员禁用 |
| `auth_denied` | 其它 exit 2 兜底 |

**connector 解析：** 正则 `DWS_AUTH_DENIAL reason=(\w+)`；无匹配时 fallback 现有 substring（过渡期 1 个版本后删 fallback）。

**验收：**

- [x] dws：`auth_denial_line.go` + `device_flow.go` Step4 输出契约行
- [x] connector：`denial-parser.ts` 优先解析契约行，保留中文 fallback
- [ ] 联调：新 dws 二进制 + connector 部署后 V2/V7
- [x] 单元测试：`auth_denial_line_test.go`、`denial-parser.test.ts`

---

### P0 — 拆分 `dws-oauth.ts`（PR-1.5-connector-split）

**目标：** 行为不变，文件 ≤200 行/模块。

| 新文件 | 职责 |
|--------|------|
| `src/dws-auth/session.ts` | `loginSessions`、spawn、watchdog、in-flight 复用、mismatch 冷却 |
| `src/dws-auth/gate.ts` | `ensureDwsAuth`、`queryDwsAuthStatus`、Gate 判定表 1→4 |
| `src/dws-auth/messages.ts` | blocked / pending / expired / success 文案 + `sendProactive` |
| `src/dws-auth/denial-parser.ts` | `parseLoginDenial`（契约行 + 过渡期 fallback） |
| `src/dws-auth/denial-cache.ts` | 已有，可能迁路径（§3.4） |
| `src/dws-oauth.ts` | 薄 re-export + `handleDwsAuthCommandOutput` 兜底 |

**验收：**

- [x] 现有 `tests/dws-oauth/*` 全绿，无行为 diff
- [x] 无循环依赖（gate → session → messages，denial-parser 无 IO）

---

### P1 — 去掉 `gateReadySenders`（PR-1.5-guard）

**问题：** 内存 ready 与 token 落盘可能漂移。

**改法：**

- `before_tool_call` 兜底改为：`queryDwsAuthStatus` + **30s 进程内 LRU 缓存**（key = `accountId:senderId`）
- 或：仅拦 `auth login` / kill；业务 dws 拦截**完全依赖** Gate（更简，需接受极小漏网窗口）

**推荐：** 30s 缓存 + 去掉 `gateReadySenders`；login exit 0 时 **invalidate 缓存**。

**验收：**

- [x] token 人工删除后 30s 内 guard 可能误放，30s 后拦截（文档注明）
- [x] Gate 与 Guard 共享 `status-cache.ts` 30s 缓存；login exit 0 时 invalidate

---

### P1 — DenialCache 路径归 connector（PR-1.5-cache-path）

**现状：** `~/.dws/cache/denial/` — 像 dws 数据，实为 connector 写。

**改法（二选一，推荐 A）：**

| 方案 | 路径 | 迁移 |
|------|------|------|
| **A（推荐）** | `~/.openclaw/connector/denial/<senderId>.json` | 启动时读旧路径，有则搬迁 |
| B | 保持路径，dws 文档标注「connector 托管，非 token 数据」 | 无搬迁 |

**验收：**

- [x] `denial-clear` / 「已加名单请重试」仍立即生效
- [x] 旧路径迁移一次性（`readDenialCache` 时搬迁）；`denial-cache-migration.test.ts` 覆盖

---

### P2 — Gate 范围收窄（可选）

**现状：** 每条用户消息都 `dws auth status`。

**可选：** 仅当 `cfg` / binding 表明 agent 启用 dws skill，或用户消息含 dws 意图关键词时 Gate。

**风险：** 漏 Gate → 回退 Seal 式试错；**默认不做**，除非有明确 latency 诉求。

---

## 4. PR 拆分建议

| PR | 仓库 | 内容 | 依赖 |
|----|------|------|------|
| PR-1.5a | dws | `DWS_AUTH_DENIAL` stderr 行 + 测试 | — |
| PR-1.5b | connector | `denial-parser` 用契约行；保留 fallback | PR-1.5a 可并行 |
| PR-1.5c | connector | 拆文件，无行为变更 | — |
| PR-1.5d | connector | 去 `gateReadySenders` + status 缓存 | PR-1.5c |
| PR-1.5e | connector | DenialCache 迁路径 + 迁移逻辑 | PR-1.5c |

---

## 5. 明确不做（1.5 范围外）

- login 全 phase `--format json` 事件流
- 独立 `AuthOrchestrator` 模块名 / 新服务
- exit 0 后自动续跑 Agent 原意图
- OrgPolicyCache / `auth check-cli`
- 第二张状态机运行时

---

## 6. 与 Plan v1.6 关系

| Plan 章节 | Phase 1.5 动作 |
|-----------|----------------|
| §3.1 exit code | 保持；补 `DWS_AUTH_DENIAL` 与 exit 2 对齐 |
| §3.2 exit 2 文案分支 | `denialReason` 来自契约行，非 substring |
| §3.4 DenialCache | 路径迁移 §3.4 本清单 |
| §2.3 Gate | 语义不变；实现迁入 `gate.ts` |

---

## 7. 完成定义（Definition of Done）

1. connector **零处**（或仅 fallback 一处）中文字符串判 CLI 拒绝  
2. `dws-oauth.ts` 主体 <150 行，逻辑分布在 `src/dws-auth/*`  
3. `gateReadySenders` 已删除，guard 行为有测试  
4. DenialCache 路径在文档与代码一致，旧数据可迁移  
5. `DWS_AUTH_OPTIMIZATION_PLAN.md` 修订记录 +1 行指向本清单  

---

**总结：** Phase 1 解决「能不能用」；Phase 1.5 解决「能不能长期维护、边界清不清」。核心投入是 **dws 一行契约** + **connector 拆文件**，其余按需。
