---
name: dingtalk-channel-rules
description: |
  钉钉会话规则：钉钉业务（文档/知识库/日程/待办/表格等）一律用 dws CLI，禁止 web 搜 open.dingtalk.com。
  搜钉钉文档/知识库内容 → dws doc search；开放平台 API 文档 → dws devdoc。产品命令详见 dws skill。
  出站图片写入回复正文：默认 `![图片说明](路径)` 进入 AI Card；独立图片消息使用 `MEDIA:<路径>`。
alwaysActive: true
---

# 钉钉会话输出规则

## 写作风格

- 简洁、对话式、低仪式感 — 像同事聊天，不像操作手册
- 简短回答优先用完整句子，不要每次都用列表
- 直奔主题，说完就停 — 不需要每次都加总结段落

## 消息格式

- 钉钉支持 Markdown 消息格式（标题、加粗、链接、代码块等）
- 单条消息长度限制 2000 字符，超长内容会自动分块发送
- 群聊中需要 @机器人 才会触发响应（除非配置了 `requireMention: false`）

## AI Card 使用约定

- 流式响应通过 AI Card 实现，支持打字机效果
- 长内容优先使用 AI Card 展示，提供更好的阅读体验
- Card 内支持 Markdown 渲染

## 目标格式

- 回复当前会话：省略 `target` 参数（自动推断）
- 指定用户：`user:userId`
- 指定群聊：`group:conversationId`

## 能力路由：Connector vs DWS

> **核心原则：Connector 只负责"消息通道"，所有钉钉业务操作一律通过 `dws` CLI 实现。**
> 当用户提到任何钉钉业务功能时，不要思考"connector 是否有这个能力"，直接走 dws。

### Connector 负责的通道能力

下列由 connector 完成，不要为此调用 dws 或其它工具：

- **消息收发**：当前会话的接收与回复投递（含 AI Card 流式）
- **入站媒体**：用户发来的图片/语音/视频/文件
- **出站图片**：投递由 connector 完成；须按下列语法写入回复正文，不会把裸路径自动转成图
- **会话管理**：多轮上下文与会话隔离
- **机器人身份**：`dws chat message send-by-bot` 必须带当前 `[DingTalk Bot Context]` 的 `--client-id`
- **请求者绑定**：业务 `dws` 必须带入站 `chatbotCorpId` + `senderStaffId` 组成的官方 `--profile corpId:userId`；企业身份或用户身份缺失就停止，禁止从登录列表猜测，禁止用默认/部署者账号

| 场景 | 写法 |
|------|------|
| 默认：图文同一张 AI Card，图片出现在对应位置 | `![图片说明](直链或本地绝对路径)` |
| 需要单独一条图片消息，不进入 AI Card | 独立一行 `MEDIA:<本地绝对路径>` |

- 方括号内为图片说明，可为空，例如 `![](/tmp/qr.png)`。
- 直链与本地文件均可；本地路径含空格时先重命名再引用。
- 无前缀裸路径（如 `/home/a.png`）按普通文本处理。
- 禁止用「见附件」等措辞代替出图语法。

### DWS 登录与请求者绑定（官方 CLI）

官方 dws（≥1.0.66）身份是本机 `profile=corpId:userId`，没有 `--sender-id`。社区 `DWS_AUTH_IDENTITY` 已废弃。

可信绑定：入站 `chatbotCorpId`（或账号已绑定的 `chatbotCorpId`）+ `senderStaffId` 必须等于 profile 的 `corpId:userId`。缺企业身份时停止，不要从 `profile list` 里挑。

1. `dws profile list --format json`
2. 只接受稳定 `profile` 正好是 `<chatbotCorpId>:<senderStaffId>` 且已认证的项；业务命令一律 `dws --profile <该 profile> ...`
3. 没有这一项 → **停止业务操作**，让请求者本人在该企业 `dws auth login --device` 扫码。禁止用默认/部署者账号，禁止选同 userId 的其他企业
4. 无 `senderStaffId` 或无可信 `corpId`（机器人未上线 / 未绑定企业）→ 同样停止，不要猜加密 `senderId`

不要把 IM sender 整段塞进 `--profile`；不要 `profile switch` 改机器默认账号，除非用户明确要求。

### 通过 dws 实现的钉钉业务功能

当用户的请求涉及以下钉钉业务功能时，**立即使用 `dws` 命令**，不要犹豫：

| 用户意图关键词 | dws 产品 | 典型操作 |
|--------------|---------|---------|
| 文档、钉钉文档、在线文档 | `dws doc` | 创建、追加、搜索、列举钉钉文档 |
| 日程、日历、会议、会议室、忙闲 | `dws calendar` | 创建/查询日程、自动带钉钉会议链接、DING 提醒、忙闲查询 |
| 表格、多维表、AI表格、记录、数据表 | `dws aitable` | 创建表格、读写行数据、条件查询 |
| 待办、TODO、任务 | `dws todo` | 创建个人/群待办、查状态、设截止时间 |
| 日志、日报、周报 | `dws report` | 提交日报/周报、查历史日志 |
| 文件、云盘、上传、下载 | `dws drive` | 上传/下载文件到钉钉云盘 |
| DING、紧急消息、强提醒 | `dws ding` | 向用户/群发送强提醒 DING |

### 🔑 多机器人场景：bot 凭证隔离（重要）

当配置了多个钉钉机器人时，必须确保 dws 命令使用**当前对话机器人**的凭据，避免"串台"（用错误的机器人身份操作）。

**当前 bot 的 clientId 获取方式：**

每条用户消息的上下文中会自动包含 `[DingTalk Bot Context]` 标记，其中含有当前对话 bot 的 `clientId`。在执行 `dws chat message send-by-bot` 命令时，**必须从该上下文中提取 clientId 并传给 `--client-id` 参数**。

**示例：**
```
用户消息上下文中包含:
[DingTalk Bot Context] Current bot clientId: dingXXXXXXXX. ...

执行命令时注入:
dws chat message send-by-bot --client-id dingXXXXXXXX --robot-code <code> --users "userId" \
  --title "通知" --text "消息内容" --format json
```

> ⚠️ **如果不传 `--client-id`，dws 会使用默认登录的机器人凭据，可能导致消息从错误的机器人发出。** 每次执行 `dws chat` 相关命令时都必须从上下文中获取并传入 `--client-id`。

## 记忆范围（memory-scope）

钉钉多人场景下，长期记忆按 **用户 / 群聊** 隔离，由 connector 的 `memory-scope` 模块自动生效。

| 场景 | 记忆目录 |
|------|----------|
| 私聊 | `memory/users/{senderId}/` |
| 群聊 | `memory/groups/{conversationId}/` |
| 群内按人隔离 | `memory/groups/{conversationId}/users/{senderId}/` |

**写入纪律（与 workspace 标记段一致）：**

- 完整纪律见根 `MEMORY.md` 标记段 **记忆架构（钉钉）**；工作流见 `AGENTS.md` 对应标记段
- **禁止** write/edit 根 `MEMORY.md`；**禁止**写入其他 user/group 的 scope 或全局 `memory/YYYY-MM-DD.md`
- 用户说「记住这个」→ 当前 scope 的 `MEMORY.md` 或 `{scopeDir}/YYYY-MM-DD.md`（路径见系统提示 **会话记忆路径**）
- 踩坑 / 解法 → `memory/dingtalk-issue.md`、`memory/musa-stack-issue.md`、`memory/openclaw-issue.md`（格式：现象 → 原因 → 修复 → 日期）
- `memory_search` 可能返回其他 scope 片段，**不得**当作当前会话规则

可在 `openclaw.json` 关闭：`channels.dingtalk-connector.memoryScope.enabled: false`

### 易混淆场景速查

| 场景 | 正确选择 | 错误选择 |
|------|---------|---------|
| 用户说"帮我创建个文档" | `dws doc` | ~~connector 没有这个能力~~ |
| 用户说"查一下明天的日程" | `dws calendar` | ~~connector 没有这个能力~~ |
| 用户说"帮我创建个待办" | `dws todo` | ~~connector 没有这个能力~~ |
| 用户说"写个日报" | `dws report` | ~~connector 没有这个能力~~ |
| 用户说"帮我操作表格数据" | `dws aitable` | ~~connector 没有这个能力~~ |
| 用户说"DING 一下某某" | `dws ding` | ~~connector 没有这个能力~~ |
| 用户只是在聊天/问问题 | 直接回复（connector 自动处理） | ~~不需要调 dws~~ |
