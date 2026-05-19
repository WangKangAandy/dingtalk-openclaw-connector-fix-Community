# 钉钉机器人：多用户 dws 身份 — Roadmap（极简版）

> **版本：** v4.6（文档与实现对齐：状态/附录 A/§5 勾选；与 connector、dws skill 一致）  
> **阅读顺序：** §0 结论 → §1 流程概览 → §2.1（dws P1）→ §2.3.2–2.3.3（connector P2 细节）  
> **状态：** **已实现（MVP）** — dws P1（per-sender token + fail-closed + `IDENTITY_MISMATCH`）与 connector P2（spawn 凭证、`DWS_AUTH_IDENTITY`、`onCommandOutput` 补链）已在对应仓库落地；端到端验收依赖网关部署 **P1 版 `dws` 二进制** 与 connector 构建/加载路径。  
> **范围：** OpenClaw + dingtalk-connector + dws CLI  
> **原则：** 不新增架构层，只把「一个人 login 一次」扩展成「每个 senderId login 一次」。

---

## 0. 核心结论（读这一节即可）

### 0.1 今天怎么做（单用户，已实现）

| 步骤 | 行为 |
|------|------|
| 1 | 某人在机器上执行一次 `dws auth login` |
| 2 | token 写入 dws 本地存储（当前为 `~/.dws/data`） |
| 3 | 所有人跟机器人聊天，Agent 执行 `dws calendar` 等命令 |
| 4 | **全部使用同一份 token**（部署者/唯一登录者） |
| 5 | 未登录或过期时：**dws 命令失败** → 提示重新 `dws auth login` |
| 6 | connector **不会**在每条消息前检查是否已登录 |

### 0.2 改完之后怎么做（多用户，目标）

| 步骤 | 行为 |
|------|------|
| 1 | 每个钉钉用户 `senderId` 各执行一次 `dws auth login --senderId <senderId>` |
| 2 | 该用户的 token 写入 dws（按 `senderId` 分目录存储） |
| 3 | 用户跟机器人聊天，Agent 执行 dws 时 **必须** 带上 `DWS_AUTH_IDENTITY=<该用户 senderId>` |
| 4 | **只使用对应 senderId 的 token** |
| 5 | 该 senderId 未登录或过期时：**dws 命令失败** → connector **自动**拉起 login 并在**当前会话**（私聊或群聊）推送授权链接 |
| 6 | connector **仍然不会**在每条消息前检查是否已登录 |

### 0.3 今天的问题：认证失败只报文字，不断链（v4 要改）

用户说「帮我看日程 / 云文档」等需要本人身份的操作时，**当前**不会自动 `dws auth login`，也不会推链接：

```text
用户（私聊或群聊）: "帮我看看我的日程"
  → Agent: dws calendar event list ...
  → dws: 未登录 / token 过期 → 非 0 退出
  → dws-cli skill: 提示「请执行 dws auth login」
  → connector onCommandOutput: 仅养成系统统计产品名，不处理认证错误
  → 结束。用户无法在手机上完成授权。
```

| 层面 | 当前行为 | 会自动 login / 推链？ |
|------|----------|------------------------|
| dws CLI | 报错 + 非 0 退出 | ❌ |
| dws-cli skill | 文字提示 `dws auth login` | ❌ |
| connector | `onCommandOutput` 不监听认证类错误 | ❌ |

**v4 目标：** 认证失败后由 connector **自动补链**（细节 **§2.3.2**、子进程 **§2.3.3**）。skill 只配合文案，不代为执行 login。

### 0.4 对照表（消除歧义）

| 问题 | 今天（单用户） | 改后（多用户） |
|------|----------------|----------------|
| 谁 login？ | 一个人 | **每个**使用机器人的钉钉用户各 login 一次 |
| token 存在哪？ | dws 一份 | dws 按 **senderId** 各一份 |
| 进 Agent 前要检查吗？ | **不要** | **不要**（与今天相同） |
| 怎么知道没登录？ | dws 报错 | dws 报错（相同机制） |
| connector 存 token 吗？ | **不** | **不**（只问 dws） |
| connector 处理 OAuth 回调吗？ | **不**（dws 处理） | **不**（dws 处理） |

### 0.5 术语（全文统一）

| 术语 | 含义 |
|------|------|
| **senderId** | 钉钉消息发送者的用户 ID（`finalizeInboundContext` 里的 `SenderId`） |
| **identity** | 与 **senderId 一一对应**；环境变量 `DWS_AUTH_IDENTITY=<senderId>` |
| **dingmbw 应用** | dws 用户 OAuth 与业务 API（示例 clientId：`dingmbw5n9ktkkbbjv3g`） |
| **ding6ui 应用** | 机器人收消息、发回复（示例 clientId：`ding6uiarytybo7whgfl`） |

两个应用 **不合并**：发消息用 ding6ui；执行业务 dws（calendar/doc/contact 等）用 **dingmbw** 的用户 token。

**凭证分工（全文统一，见 §2.3.1）：** connector 的 `clientId`/`clientSecret` 是 **ding6ui**（机器人通道）；**不要**在 spawn dws 时把这套凭证注入为 `DWS_CLIENT_*`，否则会盖掉 dingmbw 的 OAuth。

---

## 1. 端到端流程（私聊与群聊同一套）

**不刻意区分**「只有私聊能授权」。只要某 `senderId` 触发了需要本人 token 的 dws 命令且失败，就在**该条消息所在会话**里推链（私聊直发；群聊 @该用户 或回复其消息）。安全靠 §2.1.1 落盘前校验，不靠「必须私聊」。

```text
用户发消息（私聊或群聊均可）
  → connector 取出 senderId
  → 直接进入 Agent（不调用 dws auth status，不拦截）
  → Agent 执行: DWS_AUTH_IDENTITY=<senderId> dws <子命令> ...
       │
       ├─ 该 senderId 已在 dws 中 login 过
       │     → 命令成功
       │
       └─ 认证类失败 → connector 补链（§2.3.2–2.3.3）→ 用户扫码 → 重试
```

| 场景 | 行为 |
|------|------|
| 私聊 / 群聊触发 dws 且需本人 token | 在当前会话推授权链，**不**强制转私聊 |
| 群聊未跑 dws | 无授权链 |
| connector HTTP OAuth 回调 | **不做**（发链接 ≠ 回调） |

---

## 2. 只做两件事

### 2.1 dws 改造（上游 [dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)）

**目标：** 支持「每个 senderId 一份 token」，行为与今天单用户一致。

| 必须做 | 说明 |
|--------|------|
| 按 senderId 存 token | 例如 `~/.dws/users/<senderId>/`（具体路径由 dws 定） |
| `dws auth login --senderId <id> [--device]` | 该用户授权；`--device` 供服务器上机器人场景（用户手机扫码） |
| `dws auth logout --senderId <id>` | 解绑 |
| `dws auth status --senderId <id>` | 仅人工/脚本排查用；**connector 热路径不调用** |
| 业务命令带 identity | `DWS_AUTH_IDENTITY=<senderId> dws ...` 或等价 `--senderId` 参数 |
| **Fail-closed** | 已设置 `DWS_AUTH_IDENTITY` 但该 senderId 无 token 时，**禁止**使用 default/部署者 token |
| **授权后身份校验** | 见 §2.1.1（`--senderId` 路径 **必须**，防错绑 token） |
| **可识别的未登录错误** | 见 §2.2 |

#### 2.1.1 授权安全：`--senderId` 不能限制「谁来扫码」

OAuth device 流（与今天 `dws auth login --device` 相同）的语义是：**谁完成扫码/确认，token 就是谁的**。协议层**无法**把某次 device 授权绑定到「只允许 senderId=B」。

| 命令 | 谁扫码 | token 归属 | `--senderId` 的作用（P1 设计） |
|------|--------|------------|-------------------------------|
| `dws auth login` / `dws auth login --device` | 任意钉钉用户 | **扫码者本人** | 无；写入 default 身份 |
| `dws auth login --senderId <id> --device` | 仍是**任意**能拿到链接的人 | **仍是扫码者本人** | 仅决定**打算**存到 `users/<id>/`；**不能**阻止他人扫码 |

**错绑风险（必须防）：**

```text
connector 私聊给 B 发授权链（--senderId B）
  → A 拿到链接（转发/窥屏）
  → A 扫码
  → 若直接落盘：A 的 token 写入 users/B/
  → 之后 B 用机器人：以 A 的身份调 API（越权/隐私事故）
```

**P1 必须：授权后身份校验（不能只做目录分桶）**

`dws auth login --senderId <expected> [--device]` 在 device/OAuth 拿到 token 后、**写入该 identity 目录之前**：

1. 用该 token 调 `contact user get-self`（或等价接口）取**真实**用户 ID  
2. 与 `<expected>` 按约定规则比对（见下）  
3. **一致** → 写入 `users/<expected>/`  
4. **不一致** → **拒绝落盘**，非 0 退出，结构化错误 `IDENTITY_MISMATCH`（含 `expected` / `actual`）  
5. connector 匹配后提示：**「请本人使用钉钉扫码授权，勿转发链接」**

| 不做（不能指望） | 说明 |
|------------------|------|
| 认为 `--senderId` 能限制扫码人 | 需靠**落盘前校验**，不是靠参数名 |
| 仅 fail-closed 读 token | 只解决「没 token 用别人 default」；不解决「B 槽里放了 A 的 token」 |

**ID 对齐（开工前与 connector 约定，写进 ADR）：**

- connector 的 `senderId` = `senderStaffId || senderId`（Stream 入站）  
- dws 校验字段须与 OAuth/`get-self` 返回的 **同一套 ID**（如 `staffId`）；`TokenData.UserID` 与 `get-self` 不一致时，以校验用字段为准并文档化  
- 若需 `corpId:senderId` 等形式，login 与校验使用**同一规范化函数**

**与今天单用户 login 的关系：**

- 无 `--senderId` 的 `dws auth login`：**不**做上述校验（谁扫码谁拥有，与现网一致）  
- 仅 **机器人代用户绑定** 路径（`--senderId` + device）强制校验

| 不做（MVP） | 说明 |
|-------------|------|
| connector 换 authorization code | code→token 始终在 dws 内部 |
| connector 依赖 `dws auth login --token` | `--token` 可保留给脚本，connector 不用 |

**验收（dws 侧）：**

```bash
# 用户 A、B 分别 login 后
dws auth status --senderId A    # authenticated: true
dws auth status --senderId B    # authenticated: true

DWS_AUTH_IDENTITY=A dws contact user get-self --format json   # 返回 A 的信息
DWS_AUTH_IDENTITY=B dws contact user get-self --format json   # 返回 B 的信息

# Fail-closed：仅部署者 login、B 未 login 时
DWS_AUTH_IDENTITY=B dws contact user get-self --format json   # 必须失败，且不得返回 A 的数据

# 身份校验：B 的链被 A 扫码
dws auth login --senderId B --device   # A 扫码 → 必须失败，IDENTITY_MISMATCH，users/B/ 无 token
dws auth login --senderId B --device   # B 本人扫码 → 成功，users/B/ 有 token
```

**「改造前」基线（dws v1.0.29 发布版，历史对照）：**

| 能力 | 改造前实际行为 |
|------|----------------|
| **Token 存储** | 单一 `~/.dws`（`LoadTokenData(configDir)` → keychain / legacy `.data`），**与 senderId 无关** |
| **`DWS_AUTH_IDENTITY`** | **已实现**，但仅用于 **MCP/cache 分区**（`internal/discovery/service.go`：`partition = tenant/authIdentity`，默认 `default/default`）；**不**参与 `OAuthProvider.GetAccessToken` |
| **`--sender-id`** | **未实现** |
| **设 identity 后读 token** | **无效** — 仍读唯一 token；本机实测 `DWS_AUTH_IDENTITY=任意值` 时 `get-self` 仍返回部署者 |

> **说明：** 上表仅用于理解 **合并进本分支之前** 的上游 release；**当前 MVP** 已在 dws（P1）与 connector（P2）中覆盖上述缺口；运行时请以 **附录 A** 与 **P1 版 `dws` 二进制** 为准。

> **P1 本质：** 不是「给已有 identity 机制补 CLI 参数」，而是 **auth 层按 identity 分目录存/取 token**（`SaveTokenData` / `LoadTokenData` / `login` / `status` / 业务命令全链路）+ Fail-closed。P2 connector 注入 `DWS_AUTH_IDENTITY` **依赖** 该层完成后在运行时生效。

---

### 2.2 dws 错误约定（connector 依赖，写死避免歧义）

当 **`DWS_AUTH_IDENTITY` 已设置为某个 senderId**，且该 senderId **没有有效 token** 时：

1. 命令 **必须失败**（非 0 退出码）。
2. **不得**使用其他 senderId 或 default 的 token。
3. stderr 含可机器解析字段，至少包含：
   - `code`: `IDENTITY_NOT_AUTHENTICATED`（建议值，以实现为准）
   - `identity` 或 `senderId`: 当前请求的 senderId

当 **token 过期** 时：沿用现有逻辑（如 `AUTH_TOKEN_EXPIRED`）；重新登录须使用 **同一 senderId**：

`dws auth login --senderId <senderId> --device`

当 **`login --senderId` 非本人扫码** 时：`IDENTITY_MISMATCH`（§2.1.1）；**不**写入 token；connector 提示本人扫码，**不**当作「未登录」重复无脑发链（可限流后重试）。

> connector：「未登录 / 过期」→ 发授权链；「错人扫码」→ 身份不符话术。

---

### 2.3 connector 改造（本仓库）

**目标：** 与今天相同——不预检登录；只在 dws 失败时引导该用户授权。

| 必须做 | 说明 |
|--------|------|
| Spawn 注入 identity | 每次为 Agent 执行 dws 子进程设置 `DWS_AUTH_IDENTITY=<当前消息 senderId>` |
| **修正 `getDwsSpawnEnv()`** | **不得**再注入机器人应用的 `DWS_CLIENT_ID`/`DWS_CLIENT_SECRET`（见 §2.3.1） |
| **扩展 `onCommandOutput`** | 识别 §2.2 认证类错误后自动补链（§2.3.2）；今天仅用于养成系统 |
| 发授权链 | 后台 login + 在**当前会话**（私聊/群聊）推送 URL/user_code |
| 处理 `IDENTITY_MISMATCH` | 非本人扫码时提示勿转发；可重新发起 login |
| login 子进程管理 | 见 **§2.3.3**（去重 + 生命周期，**非** authCache） |
| 保持 ding6ui 发消息 | `account.clientId`/`clientSecret` 仍给 Stream、`token.ts` 等通道逻辑 |

| 明确不做 | 说明 |
|----------|------|
| 每条消息 `dws auth status` | 无主动门禁 |
| authCache / TTL | 无 |
| connector 自建 token 目录 | token 只在 dws |
| connector HTTP OAuth 回调 | OAuth 回调由 dws 处理 |
| connector 用 code 换 token | 不接触 code |
| 未授权就不进 Agent | 与今天不一致；今天未登录也会先进 Agent 再报错 |
| spawn 时注入 ding6ui 作 `DWS_CLIENT_*` | 会导致用户 OAuth 绑错应用，与方案 A 冲突 |

**开发仓库：** [WangKangAandy/dingtalk-openclaw-connector-fix-Community](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community)

#### 2.3.2 认证失败自动补链（P2 核心体验）

**触发条件（仅认证类，避免误触发）：**

| 应触发 login + 推链 | 不应触发（只提示业务原因） |
|---------------------|----------------------------|
| `IDENTITY_NOT_AUTHENTICATED` | HTTP 403 / scope 不足（已登录但无该产品权限） |
| `AUTH_TOKEN_EXPIRED`、未登录类 stderr | 参数错误、资源不存在等 |
| dws 文档约定的未登录文案（过渡期） | PAT / exit=4 等（另案处理） |

**实现要点：**

1. `onCommandOutput` 匹配上表 → 取 `senderId`、会话 ID。  
2. 调用 **§2.3.3** 的 `ensureLoginSession(senderId)` 取得 URL（新建或复用）。  
3. 在当前会话推送 URL/user_code +「请本人扫码」；群聊 @发送者。  
4. 登录成功后**不**自动重跑上一轮命令（MVP）。  
5. **仍是 dws 先失败再补链**，不是每条消息 `auth status`。

---

#### 2.3.3 login 子进程：非阻塞、去重、谁写 token

**原则：** connector **只负责** spawn、解析 URL、推消息、超时 kill、内存登记；**token 落盘只在 dws 子进程内完成**（含 §2.1.1 校验），connector **不**读 code、**不**写 `~/.dws/`。

**取到 URL 后子进程怎么办？**

| 做法 | 结论 |
|------|------|
| 取到 URL 立刻 kill | ❌ 用户尚未扫码，无人轮询完成 device flow，**永远不会落盘** |
| 取到 URL 后继续跑完 `dws auth login --device` | ✅ **采用** — 轮询由 **dws 内置逻辑**完成；成功后 dws 自己 `SaveTokenData` |

connector 主线程 **不等待** login 结束；子进程在后台跑。消息线程只等「解析出 URL」即可发链（通常数秒内）。

**超时（与 dws 对齐，非 2 小时）：** v1.0.29 上游 `device_flow.go` 的 `maxPollTotalWait = 10 分钟`；`auth login --device` 外层还有约 **16 分钟** command 超时。connector **监督上限建议 10 分钟**（与 dws 轮询上限一致），到点 **kill** 子进程并清登记表；用户可再次触发补链。若用户在 kill **前**完成扫码，dws 已落盘，后续业务命令直接成功。

**内存登记（单进程内 Map，非 authCache）：**

```typescript
// 键: senderId
type LoginSession = {
  pid: number;
  startedAt: number;       // ms
  verificationUrl: string;
  userCode?: string;
};
```

| 规则 | 行为 |
|------|------|
| **5 分钟内** 已有进行中 session | **复用** 已有 `verificationUrl`，**不**新 spawn |
| 已有 session 但 **>10 分钟** 未完成 | **kill** 旧 `pid`，清条目，允许新 spawn |
| login 子进程 **exit 0** | 清条目（成功，token 已在 dws） |
| login 子进程 **IDENTITY_MISMATCH** | 清条目，向用户发「请本人扫码」，**不**按未登录无限重 spawn（可冷却） |
| 子进程 stderr 已输出 URL 但尚未 exit | 视为进行中，走复用规则 |

**可选增强（非 MVP）：** `dws auth login --print-url` 或解析 `--format json` 尽快拿到 URL，缩短「发链前」等待。

---

#### 2.3.1 凭证分工（双应用 — 消除盲区）

方案 A 下 **必然** 有两类凭证用途，但 **不必** 在 `openclaw.json` 里存两份 secret（见路径 1）。

| 用途 | 应用 | 配置位置 | 用于 |
|------|------|----------|------|
| **机器人通道** | ding6ui | `channels.dingtalk-connector` 的 `clientId` / `clientSecret` | Stream 收消息、connector 内发卡片/回复（`token.ts` 等） |
| **用户 OAuth + 业务 dws** | dingmbw | 见下方路径 1 或 2 | `dws auth login`、`calendar`/`doc`/`contact` 等 |

**当前代码问题（P2 必须修）：** `getDwsSpawnEnv()` 把 **ding6ui** 写进 `DWS_CLIENT_ID`/`DWS_CLIENT_SECRET`，优先级高于 `~/.dws/`（见 dws 文档：`env` > 加密存储）。而部署者 `dws auth login` 与 `~/.dws/app.json` 绑定的是 **dingmbw** — 二者混用会导致 token 与 client 不一致。

**`getDwsSpawnEnv()` 目标形态（仅注入与身份相关的变量）：**

```typescript
// 目标：不再注入 DWS_CLIENT_ID / DWS_CLIENT_SECRET
return {
  DINGTALK_AGENT: "DING_DWS_CLAW",
  DWS_AUTH_IDENTITY: senderId,  // P2 新增
  // 可选：DWS_CHANNEL=openclaw
};
```

**dingmbw 凭证从哪来 — 二选一：**

| | **路径 1（默认，推荐）** | **路径 2（可选）** |
|---|--------------------------|---------------------|
| **做法** | spawn / device login **不**设置 `DWS_CLIENT_*`；dws 读本机 `~/.dws/` | `openclaw.json` 增加 `dwsApp`，spawn 时注入 dingmbw 的 id/secret |
| **前提** | 该机已用 dingmbw 配好 dws（`app.json` + `.data` 加密 secret；`app.json` 里 secret 可为空） | 无预置 `~/.dws`，或多租户每台机器不同 dingmbw |
| **connector 是否持 dingmbw secret** | **否** | **是**（仅 spawn 子进程 env，不存用户 token） |
| **配置示例** | 部署时执行一次 `dws auth login`（绑定 dingmbw）即可 | 见下 |

```json
{
  "channels": {
    "dingtalk-connector": {
      "clientId": "ding6uiarytybo7whgfl",
      "clientSecret": "<机器人应用 Secret>",
      "dwsApp": {
        "clientId": "dingmbw5n9ktkkbbjv3g",
        "clientSecret": "<dws OAuth 应用 Secret>"
      }
    }
  }
}
```

路径 2 时：`getDwsSpawnEnv()` 从 `dwsApp` 注入 `DWS_CLIENT_ID`/`DWS_CLIENT_SECRET`，**仍不得**使用机器人 `clientId`/`clientSecret`。

**`dws chat message send-by-bot`（与业务命令分离）：**

- 机器人发消息需要 **ding6ui** → Agent 执行时 **显式** `--client-id ding6ui...`（prompt / skill 已约定）。
- **不要**依赖 spawn 里的 `DWS_CLIENT_ID=ding6ui` 来「顺便」发消息；业务 dws 与发消息是两条线。

**能否继续用现有 `getDwsSpawnEnv()`（只注入 ding6ui）？**

| 若坚持方案 A | **不行** — 用户 token 必须绑 dingmbw；注入 ding6ui 会让 `login --senderId --device` 与业务 API 走错应用。 |
| 若改为单应用（仅 ding6ui + 配齐用户 OAuth scope） | 可以不改 spawn，但 **不是** 本文档方案 A，且需开放平台单独验证 scope。 |

---

**验收（端到端）：**

1. 同事 B 私聊「查我日程」→ 若 B 未 login → 收到授权链 → 授权后 → 返回 **B 的** 日程。  
2. 部署者 A 已在机器上 `dws auth login` → **不会**让 B 自动看到 A 的日程。  
3. 全程 connector **没有**在消息入口调用 `dws auth status`。  
4. `getDwsSpawnEnv()` 子进程环境中 **没有** `DWS_CLIENT_ID=ding6ui`（路径 1）或 **仅有** `dwsApp` 的 dingmbw（路径 2）。

---

### 2.4 Skill 文案（次要，connector 负责发链）

- connector 已推链时：告知「请本人扫码，完成后重试」，**不要**要求用户 SSH 执行 `dws auth login`。  
- 仍写清 `DWS_AUTH_IDENTITY`、dingmbw/ding6ui 分工、`send-by-bot` 的 `--client-id`。  
- 403/权限类：联系管理员开 scope，**不要**误导去 login。

---

## 3. 开工前仅确认 3 项（非架构）

| # | 确认项 |
|---|--------|
| 1 | `dingmbw` 应用支持 `dws auth login --device`（用户在手机完成，服务端 dws 轮询拿 token） |
| 2 | 群聊推链展示（@发送者 / 卡片） |
| 3 | `senderId` ↔ staffId 对齐（§2.1.1 ADR） |

---

## 4. 环境与仓库

| 变量 / 配置 | 取值 | 谁设置 |
|-------------|------|--------|
| `DWS_AUTH_IDENTITY` | 当前消息的 senderId | connector `getDwsSpawnEnv()` |
| `DWS_CLIENT_ID` / `DWS_CLIENT_SECRET` | **dingmbw**（路径 2）或 **不设置**（路径 1，由 `~/.dws/` 提供） | 路径 2：`dwsApp`；路径 1：dws 本地 |
| 机器人 `clientId` / `clientSecret` | ding6ui | `openclaw.json` → 仅通道，**不**进 spawn 的 `DWS_CLIENT_*` |
| `DINGTALK_AGENT` | `DING_DWS_CLAW` | connector spawn |

| 组件 | 地址 |
|------|------|
| dws | https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli |
| connector（本 fork） | https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community |

---

## 5. 验收清单

```text
[x] dws 支持 login/logout/status（全局 `--sender-id <id>`，与 `DWS_AUTH_IDENTITY` 对齐）
[x] DWS_AUTH_IDENTITY=<senderId> 使用该 senderId 的 token（P1 dws + connector 注入）
[x] 该 senderId 无 token 时失败，且不用部署者 token（fail-closed）
[x] connector 每条消息不调用 auth status
[x] connector spawn dws 时设置 DWS_AUTH_IDENTITY（含 dispatch 期间 `process.env`）
[x] getDwsSpawnEnv 不再注入 ding6ui 的 DWS_CLIENT_*（路径 1 或 dwsApp 路径 2）
[x] device login 子进程同样不携带 ding6ui 的 DWS_CLIENT_*
[x] dws 认证失败时 connector 自动 login 并在当前会话（私聊/群聊）推链
[x] 403/无 scope 时不误触发 login（启发式过滤；极端 stderr 仍可能误判）
[x] send-by-bot 用 --client-id ding6ui，与业务 dws 分离（会话 Bot Context + skill 约定）
[x] 用户 B 私聊只能操作 B 的数据，不能操作 A 的数据（依赖 P1 `dws` 部署与 per-sender login）
[x] login `--sender-id` B 时 A 扫码 → IDENTITY_MISMATCH，users/B/ 无 token
[x] login `--sender-id` B 时 B 本人扫码 → 成功
[x] 5 分钟内重复认证失败 → 复用同一 URL，不堆多个 login 进程
[x] login 子进程 >10 分钟 → kill；取 URL 后子进程继续跑至完成或超时（不取 URL 即 kill）
```

---

## 附录 A：实现快照（与代码一致，2026-05-19）

| 项 | 状态 |
|----|------|
| dws P1（`feature/per-sender-id-oauth`） | 已实现：`~/.dws/users/<senderId>/`、fail-closed、`LoginPersistToken` 前 `VerifyLoginIdentity`、`IDENTITY_*` JSON、全局 `--sender-id` |
| 网关 PATH 上的 `dws` | **须**为 P1 构建产物；若仍为 npm **v1.0.29**，则 per-sender 与 JSON 错误码**不会在运行时生效** |
| connector P2 | 已实现：`getDwsSpawnEnv` 不注入 ding6ui；可选 `dwsApp`；`DWS_AUTH_IDENTITY`；`onCommandOutput` → 补链与 login 子进程管理 |
| connector 传递 SenderId | 已有（`senderStaffId` 优先，否则 `senderId`） |
| `getDwsSpawnEnv` 注入 `DWS_CLIENT_*` | **已修正**：默认不注入；仅 `dwsApp` 注入 dingmbw |
| `~/.dws/app.json` | 业务侧仍为 dingmbw；与机器人 ding6ui 凭证分离 |
| 双应用 dingmbw + ding6ui | 通道 ding6ui（Stream/发消息）；业务 dws 用户 OAuth 与 API 为 dingmbw（路径 1/2 见 §2.3.1） |

---

## 附录 B：明确不在 MVP 范围

- 每条消息主动 `dws auth status`；持久化 authCache（§2.3.3 仅进程内 Map）  
- connector 存 token / 换 code / HTTP OAuth 回调  
- 强制「群聊必须私聊才能授权」  
- PAT / `DINGTALK_DWS_AGENTCODE`（与「未 login」无关，后续可选）  
- 合并 ding6ui 与 dingmbw 为一个应用  

---

## 附录 C：修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-05-19 | v1–v3 | 迭代：方案 A、device 流、去掉主动门禁 |
| 2026-05-19 | v4 | 文档瘦身：单用户→多用户对照表；正文仅 dws + connector 两块 |
| 2026-05-19 | v4.1 | §2.3.1 凭证分工：路径 1 / 路径 2（`dwsApp`） |
| 2026-05-19 | v4.2 | §2.1 基线表：`DWS_AUTH_IDENTITY` 仅 cache 分区，P1 = token 存储层重构 |
| 2026-05-19 | v4.3 | §2.1.1 授权安全 + `IDENTITY_MISMATCH` |
| 2026-05-19 | v4.4 | 断链说明；私聊/群聊统一推链 |
| 2026-05-19 | **v4.5** | §2.3.3 login 子进程：取 URL 后继续轮询、10min kill、5min 复用；压缩 §0/§1 重复 |
| 2026-05-19 | **v4.6** | 状态改为「已实现（MVP）」；§5 清单勾选；附录 A 改为实现快照；connector / dws skill 与 spawn 凭证说明对齐 |
