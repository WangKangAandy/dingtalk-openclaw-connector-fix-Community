# DWS 标准化登录验证流程（Agent 参考）

> 工程完整版见 `docs/DWS_AUTH_OPTIMIZATION_PLAN.md`（v1.6）。本文供 Agent 理解 **为何不能手动 login / 不能未授权跑业务**。

## 唯一 Ready 标准

**token 已落盘**（`dws auth status` → `authenticated: true`）才可执行业务 `dws`。

| 阶段 | `auth status` | Agent 能否跑业务 |
|------|---------------|------------------|
| 未扫码 / 超时 | `false` | 否 |
| OAuth 页「授权成功」（Step4 未完成） | `false` | 否 |
| Step4 `user_not_allowed`（token 未落盘） | `false` | 否 |
| Step4 通过，token 落盘 | `true` | 是 |

**易混点：** OAuth 页成功 ≠ dws Ready。Step4 CLI 名单拒绝时 token **从未落盘**；此时执行业务只会得到 `IDENTITY_NOT_AUTHENTICATED`，**不能**据此判断「业务无权限」。

## 状态图（connector 编排）

```mermaid
stateDiagram-v2
    [*] --> Gate: 每条需 dws 身份的消息

    Gate --> Ready: token 已落盘
    Gate --> CliDenied: DenialCache 命中
    Gate --> Pending: 判定表步骤 3–4

    state Pending {
        [*] --> WaitingScan
        WaitingScan --> Step4: 扫码，Step3 换票
        Step4 --> Ready: Step4 通过，login exit 0
        Step4 --> CliDenied: exit 2，写 DenialCache
        WaitingScan --> WaitingScan: exit 5 / watchdog 超时
    }

    CliDenied --> Pending: denial-clear / 已加名单请重试
    Ready --> Gate: 下一条消息
```

## Gate 判定（每条用户消息，Agent 不实现，但须遵守结果）

| 顺序 | 条件 | 结果 | Agent 行为 |
|------|------|------|------------|
| 1 | token 落盘 | **Ready** | 可执行业务 `dws` |
| 2 | DenialCache 命中 | **CliDenied** | 不进 Agent；勿 spawn login |
| 3b | IDENTITY_MISMATCH 冷却（2min） | **Pending** | 等待 connector，勿重试业务 |
| 3 | login 进行中（5min 内） | **Pending** | 等待扫码；用户说「已授权好了」也勿手动 login |
| 4 | 以上皆否 | **Pending** | connector 推新授权链；勿手动 login |

**产品预期：** 扫码当轮消息不进 Agent；login 成功后用户须 **再发一条消息**，系统不会自动续跑原意图。

## Agent 职责（MUST / NEVER）

**MUST**

- token 落盘（Ready）后再执行业务 `dws`
- 未授权时告知用户等待 connector 推送的授权链接
- CLI 名单拒绝：引导联系管理员加名单；用户可说「已加名单请重试」
- 将 HTTP 403 / scope 权限问题与登录问题区分处理

**NEVER**

- `dws auth login`（由 connector 唯一 spawn）
- `kill` / `pkill` login 相关进程
- 未 Ready 时用业务 `dws`「试一下」或 `--verbose` 探测
- 把 OAuth 页「授权成功」等同于可执行业务

## login exit code 速查

| exit | 含义 | DenialCache | Agent |
|------|------|-------------|-------|
| 0 | Step4 通过，token 落盘 | 不写 | 请用户再发消息后继续 |
| 2 | Step4 拒绝（含 `user_not_allowed`） | 写入 | 勿再 login；按 blocked 文案引导 |
| 5 | login 超时 | 不写 | 请用户重新发消息获取新链 |
| 4 | PAT 相关 | — | 非 device login 流程 |

stderr 契约行（供 connector 解析）：`DWS_AUTH_DENIAL reason=user_not_allowed|cli_not_enabled|user_forbidden|auth_denied`

## 竞态：用户说「已授权好了」

```text
T0  connector spawn login，推链
T1  用户扫码，Step4 进行中，status 仍 false
T2  用户再发「已授权好了」→ in-flight 等待，禁止新 spawn
T3  login exit 0 → 下条消息 Ready
```

此时 Agent **不要**手动 login 或执行业务 `dws`。
