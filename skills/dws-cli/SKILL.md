---
name: dws-cli
description: |
  在钉钉会话中通过 dws CLI 管理钉钉产品能力（AI表格/日历/通讯录/群聊与机器人/待办/审批/考勤/日志/DING消息/工作台等）。
  当用户需要操作表格数据、管理日程会议、查询通讯录、管理群聊、机器人发消息、创建待办、提交审批、查看考勤、提交日报周报时使用。
cli_version: ">=1.0.6"
---

# 钉钉全产品 Skill（via dws CLI）

通过 `dws` 命令管理钉钉产品能力。所有命令由 openclaw 在终端中执行，agent 负责生成正确的 CLI 命令。

## 前置条件

1. **安装检查**：执行 `dws --version`。多用户 OAuth（per-sender）需使用带 P1 改动的 **dingtalk-workspace-cli** 构建（见上游 `docs/PER_SENDER_ID_OAUTH.md` 与 `docs/ROADMAP-per-senderId-oauth.md`）；仅 npm 上的旧版 v1.0.29 **不会**按 `senderId` 分目录存 token。
2. **授权（多用户）**：每个钉钉用户首次使用业务能力前，需完成 **`dws auth login --sender-id <senderId> --device`**（本人手机扫码）。在 **OpenClaw dingtalk-connector** 场景下，若命令失败且 stderr 含 `IDENTITY_NOT_AUTHENTICATED` / `AUTH_TOKEN_EXPIRED` 等，**connector 会在当前会话（私聊或群聊）推送授权链接**；请提示用户 **本人扫码**，完成后**重试**，**不要**要求用户 SSH 到网关机器执行 `dws auth login`。
3. **环境变量（由 connector / 网关注入，skill 中勿手写机器人密钥）**：
   - `DINGTALK_AGENT=DING_DWS_CLAW` — 调用来源标识。
   - `DWS_AUTH_IDENTITY=<当前消息 senderId>` — 业务类 `dws` 子命令按该身份使用 `~/.dws/users/<senderId>/` 下 token（与全局 `--sender-id` 等价）；**fail-closed**，不会回落到部署者 default token。
   - **`DWS_CLIENT_ID` / `DWS_CLIENT_SECRET`**：**默认不设置**（路径 1：dingmbw 凭证来自本机 `~/.dws/`）。若 `openclaw.json` 配置了 `channels.dingtalk-connector.dwsApp`，connector 仅向子进程注入 **dingmbw** 的 id/secret（路径 2）。**不会**把机器人应用（ding6ui）的 `clientId`/`clientSecret` 注入为 `DWS_CLIENT_*`，以免 OAuth 与 token 错绑应用。
4. **机器人发消息**：执行 `dws chat message send-by-bot` 时，必须按用户消息里的 **`[DingTalk Bot Context]`** 传入 **`--client-id <ding6ui AppKey>`**，与上一条用户业务 OAuth（dingmbw）**分离**。

## 严格禁止 (NEVER DO)
- 不要使用 dws 命令以外的方式操作（禁止 curl、HTTP API、浏览器）
- 不要编造 UUID、ID 等标识符，必须从命令返回中提取
- 不要猜测字段名/参数值，操作前必须先查询确认

## 严格要求 (MUST DO)
- 所有命令必须加 `--format json` 以获取可解析输出
- 危险操作必须先向用户确认，用户同意后才加 `--yes` 执行
- 单次批量操作不超过 30 条记录
- 所有命令必须**严格遵循**对应产品参考文档里面规定的参数格式（如：如果有参数值，则参数和参数值之间至少用一个空格隔开）

## 产品总览

| 产品                | 用途                                                   | 参考文件                                                           |
|-------------------|------------------------------------------------------|----------------------------------------------------------------|
| `aitable`         | AI表格：表格/数据表/字段/记录增删改查/模板搜索                           | [aitable.md](./references/products/aitable.md)                 |
| `approval`        | 审批：审批表单/发起实例/审批/撤销                                   | [simple.md](./references/products/simple.md)                   |
| `attendance`      | 考勤：打卡记录/排班查询                                         | [attendance.md](./references/products/attendance.md)           |
| `calendar`        | 日历：日程/参与者/会议室/闲忙查询                                   | [calendar.md](./references/products/calendar.md)               |
| `chat`            | 群聊与机器人：搜索群/建群/群成员管理/改群名/机器人群发/单聊/撤回/Webhook/机器人搜索     | [chat.md](./references/products/chat.md)                       |
| `contact`         | 通讯录：用户查询(当前用户/搜索/详情)/部门查询(搜索/子部门/成员列表)               | [contact.md](./references/products/contact.md)                 |
| `devdoc`          | 开放平台文档：搜索开发文档                                        | [simple.md](./references/products/simple.md)                   |
| `ding`            | DING消息：发送/撤回（应用内/短信/电话）                              | [ding.md](./references/products/ding.md)                       |
| `report`          | 日志：按模版创建/收件箱/已发送/模版查看/详情/已读统计                         | [report.md](./references/products/report.md)                   |
| `todo`            | 待办：创建(含优先级/截止时间)/查询/修改/标记完成/删除                       | [todo.md](./references/products/todo.md)                       |
| `workbench`       | 工作台：应用管理                                             | [workbench.md](./references/products/workbench.md)             |

## 意图判断决策树

用户提到"表格/多维表/AI表格/记录/数据" → `aitable`
用户提到"审批/请假/报销/出差/加班" → `oa`
用户提到"考勤/打卡/排班" → `attendance`
用户提到"日程/日历/会议室/约会" → `calendar`
用户提到"群聊/建群/群成员/群管理/机器人发消息/Webhook/机器人群发/机器人单聊/通知" → `chat`
用户提到"通讯录/同事/部门/组织架构" → `contact`
用户提到"开发/API/调用错误 文档" → `devdoc`
用户提到"DING/紧急消息/电话提醒" → `ding`
用户提到"日志/日报/周报/日志统计/写日报/提交周报/发日志/填日志" → `report`
用户提到"待办/TODO/任务提醒" → `todo`
用户提到"工作台/应用管理" → `workbench`

关键区分: aitable(数据表格) vs todo(待办任务)
关键区分: report(钉钉日志/日报周报) vs todo(待办任务)
关键区分: chat send-by-bot(机器人身份发消息) vs send-by-webhook(自定义机器人Webhook告警)

> 更多易混淆场景见 [intent-guide.md](./references/intent-guide.md)

## 危险操作确认

以下操作为不可逆或高影响操作，执行前**必须先向用户展示操作摘要并获得明确同意**，同意后才加 `--yes` 执行。

| 产品 | 命令 | 说明 |
|------|------|------|
| `aitable` | `base delete` | 删除整个 AI 表格，含全部数据表和记录 |
| `aitable` | `record delete` | 删除记录（支持批量） |
| `calendar` | `event delete` | 删除日程，所有参与者同步取消 |
| `calendar` | `participant delete` | 移除日程参与者 |
| `calendar` | `room delete` | 取消会议室预定 |
| `chat` | `group members remove` | 移除群成员 |
| `todo` | `task delete` | 删除待办 |

### 确认流程
```
Step 1 → 展示操作摘要（操作类型 + 目标对象 + 影响范围）
Step 2 → 用户明确回复确认（如 "确认" / "好的"）
Step 3 → 加 --yes 执行命令
```

## 核心流程
作为一个智能助手，你的首要任务是**理解用户的真实、完整的意图**，而不是简单地执行命令。在选择 `dws` 的产品命令前，必须严格遵循以下四步流程：

1. 意图分类：首先，判断用户指令的核心 动词/动作 属于哪一类。这比关注名词更重要。
2. 歧义处理与信息追问：如果用户指令模糊或包含多个产品的关键字，严禁猜测。必须主动向用户追问以澄清意图。这是你作为智能助手而非命令执行器的核心价值。
3. 精准产品映射：在完成前两步，意图已经清晰后，参考产品总览和意图判断决策树 来选择产品。
4. 充分阅读产品参考文件，通过编写代码或直接调用指令实现用户意图。

## 错误处理

### CLI 错误信号识别与处理

| 错误信号 | 识别方式 | 处理策略 |
|---------|---------|---------|
| CLI 未安装 | stderr 包含 "command not found: dws" | 引导安装：`npm i -g dingtalk-workspace-cli` 或使用上游构建的 `dws`（per-sender 需 P1 版本） |
| 未登录 / per-sender 无 token | stderr 含 `IDENTITY_NOT_AUTHENTICATED`、或 JSON `code` 为该值、或 exit 5（P1） | **OpenClaw**：connector 会推 device 授权链；提示用户 **本人钉钉扫码** 后重试，**不要**要求 SSH 登录网关。本地排查：`dws auth login --sender-id <senderId> --device` |
| Token 过期 | stderr 含 `AUTH_TOKEN_EXPIRED` / `USER_TOKEN_ILLEGAL` / `token expired` | 同上：connector 补链或 `dws auth login --sender-id <senderId> --device` |
| 错人扫码 | stderr 含 `IDENTITY_MISMATCH` 或 JSON `code` 为该值 | 提示 **勿转发授权链接**，须 **本人** 重新扫码；connector 会冷却，避免无限重复 spawn |
| 权限 / scope 不足 | HTTP **403** 且文案为 forbidden、scope、权限等（非认证 JSON） | 引导联系**管理员**开通开放平台 scope / 产品权限，**不要**误导为「去 login」 |
| Recovery 事件 | stderr 包含 `RECOVERY_EVENT_ID=<event_id>` | 按 [recovery-guide.md](./references/recovery-guide.md) 执行 recovery 闭环 |
| 其他错误 | 非零退出码 + 无法识别的 stderr | 加 `--verbose` 重试一次 → 仍失败则报告完整错误信息给用户 |

### 通用错误处理流程
1. 遇到错误，加 `--verbose` 重试一次
2. 若 stderr 出现 `RECOVERY_EVENT_ID=<event_id>`，优先按 [recovery-guide.md](./references/recovery-guide.md) 执行 recovery 闭环
3. 仍然失败，报告完整错误信息给用户，禁止自行尝试替代方案
4. 认证失败时，参考 [global-reference.md](./references/global-reference.md) 中的认证章节处理
5. 各产品高频错误及排查流程见 [error-codes.md](./references/error-codes.md)

## 详细参考 (按需读取)

- [references/products/](./references/products/) — 各产品命令详细参考
- [references/intent-guide.md](./references/intent-guide.md) — 意图路由指南（易混淆场景对照）
- [references/global-reference.md](./references/global-reference.md) — 全局标志、认证、输出格式
- [references/field-rules.md](./references/field-rules.md) — AI表格字段类型规则
- [references/error-codes.md](./references/error-codes.md) — 错误码 + 调试流程
- [references/recovery-guide.md](./references/recovery-guide.md) — recovery 闭环、`RECOVERY_EVENT_ID`、`execute/finalize` 规范
