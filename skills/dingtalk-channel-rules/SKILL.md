---
name: dingtalk-channel-rules
description: |
  钉钉会话规则：钉钉业务（文档/知识库/日程/待办/表格等）一律用 dws CLI，禁止 web 搜 open.dingtalk.com。
  搜钉钉文档/知识库内容 → dws doc search；开放平台 API 文档 → dws devdoc。产品命令详见 dws skill。
  出站图片写入回复正文：默认 `![图片说明](路径)` 进入 AI Card；独立图片消息使用 `MEDIA:<路径>`。
alwaysActive: true
---

# 钉钉会话输出规则

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
- **机器人身份**：`dws chat message send-by-bot` 用本条 `[DingTalk Bot Context]` 的 clientId 作为 `--client-id`
- **请求者身份**：这次发送者见 `[DingTalk DWS Context]`

| 场景 | 写法 |
|------|------|
| 默认：图文同一张 AI Card，图片出现在对应位置 | `![图片说明](直链或本地绝对路径)` |
| 需要单独一条图片消息，不进入 AI Card | 独立一行 `MEDIA:<本地绝对路径>` |

- 方括号内为图片说明，可为空，例如 `![](/tmp/qr.png)`。
- 直链与本地文件均可；本地路径含空格时先重命名再引用。
- 无前缀裸路径（如 `/home/a.png`）按普通文本处理。
- 禁止用「见附件」等措辞代替出图语法。

### DWS 登录

connector 给这次业务 exec 加上 `--profile <corpId>:<senderStaffId>`。官方对还不存在的精确 profile 会 `profile not found`，所以 **`auth login` 不要加 `--profile`**。

1. `dws auth status --format json`（已带本次 `--profile`）
2. 未登录 / `profile not found` → `dws auth login --device`（不加 `--profile`），把链接交给当前发送者扫码（勿 `timeout: 30`）
3. 登录 JSON / `auth status` 的 `userId` 必须等于这次发送者，再跑业务 `dws`。对不上就是这次 exec 没焊到发送者：停止业务，只说「本机没有你的授权」。本机没有默认办公身份，禁止把全局当前账号或无 `--profile` 的登录态当成这次发送者。不要读 `profiles.json`，不要列出本机其他授权，不要切到其他人的 profile 继续办事。
4. 无 `senderStaffId` 或无可信 `corpId` → 同样停止

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

产品命令细节以官方 dws skill / 本机 help 为准。

## 记忆范围

文件写入纪律见工作区根 `MEMORY.md`。

若本会话提供 `scoped_memory` / `scoped_skill_workshop`，用那些工具保存偏好与可复用流程。范围由入站身份固定，不要指定别人的 scope，也不要保存凭据。
