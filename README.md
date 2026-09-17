<div align="center">
  <img alt="DingTalk" src="https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-openclaw-connector/main/docs/images/dingtalk.svg" width="72" height="72" />
  <h1>dingtalk-openclaw-connector（社区维护版）</h1>
  <p>基于官方 <strong>v0.8.20</strong> 的社区维护版本，由社区持续跟进修复官方无暇处理的 Bug。<br/>
  功能与官方完全一致，拥有最快的修复速度，及时合并官方pr和个人发现的bug和社区急需的 Bug。</p>

  <p>
    <a href="https://www.npmjs.com/package/@dingtalk-real-ai/dingtalk-connector"><img src="https://img.shields.io/npm/v/@dingtalk-real-ai/dingtalk-connector.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/@dingtalk-real-ai/dingtalk-connector"><img src="https://img.shields.io/npm/dm/@dingtalk-real-ai/dingtalk-connector.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="npm downloads" /></a>
    <a href="https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jeikl/dingtalk-openclaw-connector-fix-Community.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="license" /></a>
  </p>

  <p>
    <a href="README.en.md">🇺🇸 English</a> •
    <a href="CHANGELOG.md">更新日志</a> •
    <a href="https://openclaw.ai/">OpenClaw 官网</a>
  </p>
</div>

---

## 🔧 最近更新

| 日期 | 标识 | 更新内容 |
|------|------|---------|
| 2026-06-09 | 📁 | **专题 issue 统一至 `memory/*-issue.md`**：`dingtalk-issue` / `musa-stack-issue` / `openclaw-issue`；Agent 禁止堆叠根 MEMORY |
| 2026-06-09 | 🧠 | **memory-scope 架构优化（fix13–15）**：双层 MEMORY 注入、规则 sync、prompt 仅路径、移除 tool-guard；详见 [memory-scope](#-按用户群聊隔离长期记忆memory-scope) |
| 2026-06-08 | 🛡️ | **OpenClaw edit 参数校验 workaround（`edit-empty-oldtext`）**：dist patch 修复空 `oldText` 误报；见 `openclaw-patch/2026.5.7/edit-empty-oldtext/` |
| 2026-06-03 | 🔒 | **按用户/群聊隔离长期记忆（memory-scope）Phase 1**：钉钉多人共用一个 bot 时的 scope 目录与 session 解析；详见下方 [memory-scope](#-按用户群聊隔离长期记忆memory-scope) |
| 2026-05-14 | ✨ | Markdown 图片发送支持直链和本地路径，无需下载到本地，请参考下列提示词|
| 2026-05-11 | 🔧 | Agent 多轮循环完成后，中间过程消息重复发送到钉钉对话，造成刷屏和 AI Card 倒放重渲染 |
| 2026-05-11 | 🐛 | OpenClaw 4.29+ 版本导致钉钉插件失效，群聊 @Agent 回复显示"✅ 任务执行完成（无文本输出）" |
| 2026-05-08 | 🌐 | 未注册的 Pong 监听器导致的 WebSocket 幻影重连，来源于 [PR #566](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/pull/566)（[Majorshi](https://github.com/Majorshi) 提交） |

完整更新日志：[FIXES.md](FIXES.md)（[🇺🇸 English](FIXES.en.md)）

---

## ✨ 增强功能

- 🔧 Markdown 图片发送支持直链和本地路径，无需下载到本地：
  - Markdown 语法 `![图片注释](直链URL)` 或 `![图片注释](本地路径)` 直接发送图片
  - 兼容 mediaId 格式
  - ⚠️ 本插件支持图文发送，但钉钉侧不会主动触发此功能，需使用以下提示词引导 Agent：

    ```
    请你把以下发送图片的方式写成你的钉钉图片发送skill，当涉及到图片发送，则调用该技能：用markdown语法发送图片，支持添加图片注释实现图文并茂；直链图片或本地路径文件均可直接嵌入markdown发送，如本地路径含空格请先重命名去除空格再发送。
    ```

- 🎨 支持自定义 AI Card 模板，可使用本人预制的卡片（含内容复制按钮），不填则使用官方默认卡片。

**单机器人：**

```json
"channels": {
  "dingtalk-connector": {
    "enabled": true,
    "clientId": "你的clientId",
    "clientSecret": "你的clientSecret",
    "cardTemplateId": "你的卡片模板ID.schema",
    "cardContentVar": "content"
  }
}
```

**多机器人（多 Agent）：** 每个账号可绑定不同机器人

```json
"channels": {
  "dingtalk-connector": {
    "enabled": true,
    "accounts": {
      "main-bot": {
        "enabled": true,
        "name": "工作流机器人",
        "clientId": "你的clientId",
        "clientSecret": "你的clientSecret",
        "cardTemplateId": "f9b75aac-713c-40e8-a17f-e236d7b5422b.schema",
        "cardContentVar": "content"
      },
      "another-bot": {
        "enabled": true,
        "name": "另一个机器人",
        "clientId": "另一个clientId",
        "clientSecret": "另一个clientSecret",
        "cardTemplateId": "f9b75aac-713c-40e8-a17f-e236d7b5422b.schema",
        "cardContentVar": "content"
      }
    }
  }
}
```

| 参数 | 说明 |
|------|------|
| `clientId` / `clientSecret` | 单机器人模式直接填在顶层 |
| `accounts` | 多机器人模式，key 为账号标识名（可任意命名） |
| `accounts.*.enabled` | 是否启用该账号 |
| `accounts.*.name` | 账号显示名称（仅用于标识） |
| `accounts.*.clientId` | 钉钉应用 ClientId |
| `accounts.*.clientSecret` | 钉钉应用 ClientSecret |
| `cardTemplateId` | AI Card 模板 ID，不填则使用官方默认模板 |
| `cardContentVar` | 最终回复内容变量名，不填默认 `msgContent` |
| `cardProcessVar` | 中间过程（block 状态）变量名，不填默认使用 `cardContentVar` |
| `cardToolVar` | 工具调用输出变量名，不填则不写入卡片 |
| `feedbackEnabled` | 是否在回答完成后发送独立评价卡片，默认 `false` |
| `feedbackCardTemplateId` | 评价互动卡片模板 ID；未配置时暂用公开审批模板测试发送/回调链路 |
| `feedbackStoragePath` | 评价 JSONL 路径，默认 `~/.openclaw/data/dingtalk-feedback.jsonl` |

> 卡片模板需在[钉钉开放平台](https://open.dingtalk.com/)创建，并添加对应的变量字段。

### 回答评价卡片（临时测试模式）

开启：

```json
{
  "feedbackEnabled": true,
  "feedbackCardTemplateId": "你的评价模板ID.schema"
}
```

当前没有自定义评价模板时，可以只设置 `feedbackEnabled: true`，connector 会暂时使用钉钉公开审批示例模板
`dac1dbec-55af-40c3-be91-6d6882ef3b66.schema`，并将“同意/拒绝”映射为“有帮助/不够好”。该模板只用于验证卡片投放和 Stream 回调，不作为正式评价 UI；拿到自定义模板后配置 `feedbackCardTemplateId` 即可替换。

评价卡片与回答 AI Card 分开投放。回调通过 `/v1.0/card/instances/callback` 接收，成功落盘后才发送 Stream ACK，评价事件默认追加到 `~/.openclaw/data/dingtalk-feedback.jsonl`。

**效果预览：**

![自定义卡片效果](assets/image.png)

### 🔒 按用户/群聊隔离长期记忆（memory-scope）

多人共用一个钉钉机器人时，OpenClaw 默认会把 workspace 根目录 `MEMORY.md` 注入每一个 session，且用户专属规则容易写进公共层，导致跨用户泄漏或指令冲突。

社区版内置 **`memory-scope` 模块**（`src/memory-scope/`，与 message-handler 解耦），在钉钉 session 上实现**双层记忆 + 规则 sync**（2026-06 优化）。DWS 认证与[官方 connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector) 一致由 **Agent exec** `auth status` / `auth login`；本部署差异仅为 per-sender（`--sender-id` + `~/.dws/users/<id>/`）。connector 只注入 `DWS_AUTH_IDENTITY`，见 **dws skill** `references/dws-auth-workflow.md`（auth 文档归 dws 仓库，本仓库仅引用）。

#### 双层记忆模型

| 层级 | 路径 | 内容 |
|------|------|------|
| **公共层** | `workspace/MEMORY.md` | 仅含 memory-scope 架构/纪律规则（标记段）；**Agent 不得堆叠内容** |
| **Scope 层** | `memory/users/{id}/MEMORY.md` 或 `memory/groups/{cid}/MEMORY.md` | 当前私聊/群聊专属偏好与规则 |
| **专题 issue** | `memory/dingtalk-issue.md` 等 | 钉钉 / MUSA / OpenClaw 踩坑（Agent 写入，见下方命名） |

OpenClaw bootstrap 以**完整文件路径**区分两份 `MEMORY.md`，不会混淆。

#### 工作机制

| 机制 | 作用 |
|------|------|
| `agent:bootstrap` | **同时**注入根 `MEMORY.md` 与当前 scope 的 `MEMORY.md`；scope 文件缺失时自动创建 |
| 插件 `register` 时 sync | 每次 gateway 启动 replace `MEMORY.md` / `AGENTS.md` 标记段（段外保留）；`AGENTS.md` 首次无标记时先 migrate 旧 OpenClaw 冲突段 |
| `before_prompt_build` | 注入当前 **Session memory paths** 和 DingTalk Memory 边界提醒；不重复注入完整规则 |

**约束方式：** `memory_search` 结果在交给模型前按可信 session scope 过滤；`memory_get` / `memory_read` 和 Memory 树内的 `read` 由 `before_tool_call` 做只读路径硬拦截。写入行为仍由现有规则约束，本阶段不改写 `write` / `edit`。

#### 从保存到读取的完整链路

Memory 隔离不是只靠目录名称，而是由“可信会话 → scope 路径 → 启动注入 → 工具边界”串起来：

```text
DingTalk sender/conversation
  -> OpenClaw sessionKey（可信上下文）
  -> scope classifier
  -> memory/users/<senderId>/ 或 memory/groups/<conversationId>/
  -> bootstrap 注入根 MEMORY + 当前 scope MEMORY
  -> memory_search 结果过滤 / memory_get-read 前置拦截
  -> 模型只看到允许范围
```

##### 1. 保存位置与 scope 创建

- 私聊以可信的 `senderStaffId`（缺失时使用受信 sender ID）映射到 `memory/users/{id}/`；
- 群聊以可信的 `conversationId` 映射到 `memory/groups/{conversationId}/`；
- `groupSessionScope: group_sender` 时，群内私有记忆位于 `memory/groups/{conversationId}/users/{senderId}/`；
- scope 文件缺失时，在当前 workspace 内自动创建 `MEMORY.md`，只写入最小模板和规则指针；
- 不同原始 ID 使用安全的路径编码，避免 `/`、`:`、特殊字符或大小写归一化造成目录碰撞；
- 根 `workspace/MEMORY.md` 是公共规则层，不承载用户专属笔记；专题问题写入 `memory/*-issue.md`，个人偏好写入当前 scope。

##### 2. 写入边界

- Agent 被规则明确禁止写入、追加或编辑根 `MEMORY.md`；
- 正常“记住这个”应写入当前用户/群组 scope；每日记忆文件也应位于当前 scope；
- 专题 issue 文件属于公共知识层，按主题写入 `memory/dingtalk-issue.md` 等文件；
- 当前阶段不对 `write`、`edit`、`apply_patch` 做完整的运行时权限重写，写入正确性依赖 scope 规则、路径约定和 Agent 行为；
- 因此本节描述的是 Memory 读取隔离，不应将写入规则误认为宿主文件系统级 ACL。

##### 3. Gateway 启动与会话 bootstrap

- 插件启动时同步根 `MEMORY.md` 和 `AGENTS.md` 中受管的规则标记段，保留标记段外的人工作文；
- 每个 DingTalk session 触发 `agent:bootstrap` 时，保留公共根 `MEMORY.md`，并追加当前 scope 的 `MEMORY.md`；
- scope 文件不存在时先创建，再注入；
- `before_prompt_build` 在每轮模型思考前动态补充当前 scope 路径，并提醒不要通过 `exec`、`bash`、`glob` 或其他 shell 命令访问、枚举或披露其他用户/群组私有文件；不把用户专属内容写进公共 prompt；
- scope 由可信 `ctx.sessionKey` 解析，不能从模型参数、搜索词或路径参数推断用户身份。

##### 4. `memory_search`：全局检索，返回前过滤

- 保持 OpenClaw 原有的全局 corpus、排序、retry 和检索行为，不把搜索范围改成“只查当前目录”；
- 搜索完成后，connector 的 `AgentToolResultMiddleware` 根据 `ctx.sessionKey` 解析 scope；
- 仅保留根 `MEMORY.md`、公共 `memory/` 文件和当前用户/群组允许的私有路径；
- `memory/users/**`、`memory/groups/**` 中其他私有 scope 的 hit 删除；群共享模式还会拒绝群下 `users/**` 子树；
- `result.details` 与 `result.content[0].text` 同步重建，避免模型从另一份未过滤 JSON 看到原始结果；
- middleware 缺失、注册失败、sessionKey 缺失/异常、结果结构不可信时返回 fail-closed 的空结果/安全错误，不放行原始结果。

##### 5. `memory_get` / `memory_read`：工具入口拦截

- 在 `before_tool_call` 中检查可信 DingTalk session；
- 只允许缺省 corpus 或 `corpus=memory`，拒绝其他 corpus 的直接 Memory 读取；
- 路径先规范化为 workspace-relative POSIX 路径，拒绝绝对路径逃逸、`..`、NUL、反斜杠、百分号编码和空段；
- 词法判断通过后执行 `realpath`，确认目标仍在 workspace 内，并对真实 workspace-relative 路径再次执行 scope allow/deny；
- 当前 scope 和公共文件允许，其他用户/群组私有 scope、群内其他 sender scope、workspace 外路径和 symlink 逃逸均拒绝；
- 普通 workspace 非 Memory 文件在确认真实路径仍属于当前 workspace 后可以保持原有读取行为。

##### 6. 失败关闭与非 DingTalk 行为

- malformed DingTalk session、配置不安全、workspace 上下文缺失或 middleware 不可用时，涉及 Memory 的操作 fail-closed；
- 非 DingTalk session 不套用 DingTalk scope 规则，保持 OpenClaw 原有行为；
- `memory_search` 的“全局 Top-N 后过滤”可能导致当前 scope 的合法 hit 被其他 scope 占满候选而漏召回，但过滤后的模型可见结果不包含被拒绝 scope；
- 本机制不覆盖 `exec`、`bash`、`glob`、MCP、自定义插件或宿主 shell 的任意文件访问。

#### 目录约定

| 场景 | 路径 |
|------|------|
| 私聊 | `memory/users/{senderId}/MEMORY.md`、`memory/users/{senderId}/YYYY-MM-DD.md` |
| 群聊 | `memory/groups/{conversationId}/MEMORY.md`、… |
| 群内按人隔离（`groupSessionScope: group_sender`） | `memory/groups/{conversationId}/users/{senderId}/...` |

#### 配置（显式开启）

```json
"session": {
  "dmScope": "per-account-channel-peer"
},
"channels": {
  "dingtalk-connector": {
    "memoryScope": {
      "enabled": true,
      "syncRootMemoryRules": true,
      "syncAgentsMemoryRules": true
    }
  }
}
```

| 选项 | 说明 |
|------|------|
| `enabled: true` | 显式开启 memory-scope；缺省或 `false` 时保持 OpenClaw 原行为 |
| `syncRootMemoryRules: false` | 不自动写入/更新 `MEMORY.md` 标记段，规则完全手动维护 |
| `syncAgentsMemoryRules: false` | 不自动 sync `AGENTS.md` memory 标记段 |

启用时还要求 `separateSessionByConversation=true`、`sharedMemoryAcrossConversations=false`。当前版本只支持一个 DingTalk account 共用该 workspace；多账号配置会 fail-closed，避免不同机器人下的相同用户 ID 共用私有目录。

启用方式：在实际运行的 `~/.openclaw/openclaw.json` 中，将上述配置写入
`channels.dingtalk-connector.memoryScope`，然后重启 Gateway。例如：

```bash
openclaw config set channels.dingtalk-connector.memoryScope.enabled true --strict-json
openclaw gateway restart
```

启用是显式 opt-in；仅启用 connector 插件或 DingTalk channel 不会自动开启 Memory
隔离。重启后应在 Gateway 日志看到 `registered (enabled=true, ...)`。

#### 规则维护

- 共享片段：`src/memory-scope/memory-rules-shared.ts`；模板：`root-memory-rules.ts`（纪律真源）、`agents-memory-rules.ts`（工作流 + 指向 MEMORY）
- `MEMORY.md` / `AGENTS.md` 标记段：**每次 gateway 启动** replace 标记段内内容（段外用户内容保留）；`AGENTS.md` 首次无标记时先 migrate 旧 OpenClaw 冲突段
- **Agent 禁止** write/edit 根 `MEMORY.md`；按主题写入 `memory/` 下专题 issue 文件：
  - 钉钉/dws/connector → `memory/dingtalk-issue.md`
  - MUSA 软件栈 → `memory/musa-stack-issue.md`
  - OpenClaw/gateway/插件 → `memory/openclaw-issue.md`
  - 用户偏好/「记住这个」→ 当前 scope

#### 运行时硬隔离

- `memory_search` 可以检索整个 workspace，但返回结果只保留公共 Memory 与当前私有 scope；其他用户/群私有结果在模型可见前移除。
- `memory_get` / `memory_read` 仅允许默认或 `memory` corpus，并与普通 `read` 复用同一 scope 路径策略。
- result middleware 缺失、注册失败、session/config 不可信时 fail-closed；不会回退为未过滤搜索。

#### Gateway 启动日志确认

```
[dingtalk-connector][memory-scope] synced root MEMORY.md rules section
[dingtalk-connector][memory-scope] synced AGENTS.md memory marked sections
[dingtalk-connector][memory-scope] registered (enabled=true, syncRootMemoryRules=true, syncAgentsMemoryRules=true)
```

实现细节与 Agent 话术见 bundled skill：`skills/dingtalk-channel-rules/SKILL.md`。

---

## 为什么 Fork？

由于钉钉官方连接器那拉稀的仓库更新与 Bug 修复速度，所以 fork 了此仓库。

本版本在官方代码基础上由社区进行 Bug 修复和维护。**BUG 采用 Claude Code 官方模型修复，保证最大修复效果。**

欢迎民间大神提 PR，共建钉钉连接器生态！

---

## 与官方版本的差异

| 项目 | 说明 |
|------|------|
| 基础版本 | 官方 v0.8.20，功能完全一致 |
| 修复内容 | 官方一直不修的 Bug（见上方最近修复） |
| 社区增强 | memory-scope 双层记忆 + `MEMORY.md` 规则 sync（`memoryScope`）、OpenClaw dist patch（`openclaw-patch/`）、社区 dws OAuth 补链等 |
| 维护方式 | 社区维护，持续跟进官方更新 |

---

## 安装与要求

开始之前，请确保：

- **OpenClaw**：已安装并正常运行。详情请访问 [OpenClaw 官网](https://openclaw.ai/)
- **版本要求**：OpenClaw ≥ **2026.4.9**，通过 `openclaw -v` 查看
- **dws CLI 与 dws skill**（钉钉业务能力必装）：connector **不再内置** `dws-cli` skill；**社区版配套** [WangKangAandy/dingtalk-workspace-cli](https://github.com/WangKangAandy/dingtalk-workspace-cli)（含 per-sender OAuth）。在 connector 目录执行 `npm install` 时会 **自动 clone/更新 dws fork、安装 skill 到 `~/.openclaw/skills/dws`、编译 CLI 到 `~/.local/bin/dws`**（需 git；编译 CLI 需 Go）

> 如低于此版本，执行 `npm install -g openclaw` 升级。

### dws 自动安装（推荐）

```bash
# 安装 connector 后在其目录执行（openclaw plugins install -l 也会触发 postinstall）
cd ~/.openclaw/extensions/dingtalk-connector   # 或你的 clone 路径
npm install
dws --version   # 确认 CLI 在 PATH（~/.local/bin）
```

环境变量（可选）：

| 变量 | 说明 |
|------|------|
| `DWS_SKIP_AUTO_INSTALL=1` | 跳过自动安装 |
| `DWS_COMMUNITY_REF=main` | 指定 git 分支/tag（默认 `main`） |

### 手动安装（网络受限或跳过 postinstall 时）

```bash
git clone https://github.com/WangKangAandy/dingtalk-workspace-cli.git ~/.openclaw/vendor/dingtalk-workspace-cli
cd ~/.openclaw/vendor/dingtalk-workspace-cli
go build -o ~/.local/bin/dws ./cmd
node /path/to/dingtalk-connector/scripts/install-community-dws.js
```

**勿用** `npm i -g dingtalk-workspace-cli`（官方 open-dingtalk 包，与社区 connector 不匹配）。

---

## 卸载官方插件（避免冲突）

安装本版本前，先移除官方已安装的插件：

```bash


# 卸载官方版本
openclaw plugins uninstall dingtalk-connector

```

---

## 手动构建与部署、或者直接下载release构建产物直接进行安装

本版本需要手动编译安装（社区修复版，不在 npm 发布）：

```bash
# 1. 克隆仓库
git clone https://ghfast.top/https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community.git
cd dingtalk-openclaw-connector-fix-Community

# 2. 安装依赖 & 构建 & 打包

# npm
npm install
npm run build
npm pack

# 或者 pnpm
pnpm install
pnpm run build
pnpm pack

# 3. 安装到 OpenClaw 并重启（release或当前目录构建产物）
openclaw plugins install ./dingtalk-real-ai-dingtalk-connector-0.8.20-fix6.tgz
openclaw gateway restart
```

---

## 使用指南

[OpenClaw 钉钉官方插件使用指南](https://alidocs.dingtalk.com/i/nodes/2Amq4vjg89GEno0zfPqoPGqdV3kdP0wQ?utm_scene=team_space)

---

## 进阶文档

- [手动配置指南](docs/DINGTALK_MANUAL_SETUP.md) — 手动填写凭证配置
- [钉钉 DEAP Agent 集成](docs/DEAP_AGENT_GUIDE.md) — 本地设备操作能力
- [多 Agent 路由配置](docs/MULTI_AGENT_SETUP.md) — 多机器人绑定不同 Agent
- [常见问题](docs/TROUBLESHOOTING.md) — 安装与使用问题排查
- [官方 README（中文）](README_DINGTALK_OFFICIAL.md)
- [Official README（English）](README_DINGTALK_OFFICIAL_en.md)

---

## 贡献

欢迎社区贡献！Bug 修复或功能建议，请提交 [Issue](https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community/issues) 或 Pull Request。

---

## 许可证

本项目基于 [MIT](LICENSE) 许可证。

---

## 支持

- **问题反馈**：[GitHub Issues](https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community/issues)
- **更新日志**：[CHANGELOG.md](CHANGELOG.md)
