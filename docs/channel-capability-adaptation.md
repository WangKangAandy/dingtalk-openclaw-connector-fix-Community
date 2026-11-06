# Channel 能力适配进度

依据 2026-11-07 的三方研究：官方 DWS v1.0.67 (`63a7c490`)、官方 connector v0.8.27 (`88df00ee`)、本 fork main (`caef3c2e`)。DWS 不提供原生 OpenClaw 数字员工 Adapter；本系列吸收可用于 OpenClaw 的消息、交互与可靠性设计，不替换宿主或引入第二套 Agent 执行器。

## 第一批：引用和合并转发上下文

旧实现会通过全局 title 索引恢复同名消息，可能把另一个会话的缓存正文带进当前引用。新缓存按 **accountId + 机器人 clientId + 已解析的 Host SessionKey + 实际发送目标类型/ID** 隔离，只有可信准入和路由完成后才读取。即使 Host 配置合并会话，物理群/私聊目标仍独立。

- 仅以原消息 ID、processQueryKey 或 cardInstanceId 查找；多个引用 ID 命中不同记录时拒绝恢复。不按标题或时间猜测。
- 入站只缓存当前正文；不把合成引用上下文递归保存。出站只有具备匹配的可信 route、且有实际确认的正文/receipt 才保存。卡片未确认的最终稿不进入缓存。
- 新路径为 `$OPENCLAW_STATE_DIR/dingtalk-connector/quote-context-v1.json`，state dir 缺省 `~/.openclaw`。**不读取、不迁移**旧 `dingtalk-quote-bodies.json`：旧记录不能证明所属会话。旧文件不会自动删除。
- TTL 24 小时、最多 1000 条、每作用域最多 200 条、文件最多 4 MiB、单条最多 6000 字符。截断标记 incomplete；临时文件原子替换，权限 0600，拒绝缓存文件符号链接。缓存故障不重放已发送消息。这仍是单进程插件缓存，不是多进程共享数据库。
- 收不到原始 ID 的 title-only 引用保持平台提供的标题，无法凭标题补出全文。这是有意移除的不可靠行为。

`chatRecord` 的原始 JSON 字符串或数组现在被规范化为有序记录，保留发送者、时间、消息 ID、正文和附件对应序号；转发正文作为不可信历史传给 Agent。读取最多 100 条、嵌套 3 层、文本合计 32 KiB、单条 6000 字符、附件 8 个。原始 JSON 字符串上限 256 KiB。缺失/无效/超限均标 incomplete，不用占位消息冒充完整历史。

附件只使用机器人回调实际提供的 downloadCode，经过现有下载和媒体策略。未知类型有明确文件名/下载码时也可沿该通路；不按媒体 URL 抓取，不用部署者 DWS currentProfile 补拉其他会话。无 locator 的 unknownMsgType、只含 mediaId 的项目明确标缺失；下载失败的图片明确告知模型不可推断。图片下载本身和普通文件解析仍沿用既有实现，本批不宣称新增了总下载字节限制或完整音视频理解。

Host 的 `RawBody` / `CommandBody` 只接收当前用户文本与其命令归一化结果；引用或转发里的 `/new`、`/stop`、`/learn` 不能成为控制命令。原 scoped `/learn` 改写继续生效，hard-scope SessionKey、准入绑定和媒体限制保持原有权威。

## 第二批：公开工具进度

把 DWS 的“固定公开类型 + 工具 ID + 真实状态”设计适配到 OpenClaw 公开回调，不运行 DWS Agent Adapter、不解析模型内部日志。

- 使用最低 Host 2026.10.9 已有的 `onToolStart`、`onItemEvent`、`onCommandOutput`、`onPlanUpdate`、`onApprovalEvent`。不订阅 `onReasoningStream`，不把工具结果正文当作公开进度。
- toolCallId/itemId 关联同一工具，避免开始/命令/工作项显示三份。无 ID 的事件只有类别级运行提示，不能把无 ID 的成功事件归到此前某个工具。
- 只显示固定类别；未知名称显示“工具调用”。明确结果或命令结束码才能确认完成。只有 end、未提供结果，或回合结束时仍在运行的项，显示“已结束，结果未确认”。终态不被迟到 running 覆盖；在回合尚未收口时，后续明确结果可以补充未知 end。
- 取消、失败分别显示；审批只显示等待/响应状态，不声称工具已经执行。此处不提供任何批准动作，也不是原生审批适配器。
- 保留 `cardProcessVar`、`cardToolVar`、`cardReasoningVar` 这些模板字段名。process 优先，tool 仅作公开状态显示；reasoning 改作公开状态计数。**移除原始命令、工具输出和内部推理投影，不提供旧输出模式回退。** 同时修订中英文配置说明。
- 1500ms 合并刷新具有尾部定时刷新；卡片创建完成后即刷新缓冲进度，不必等模型答案。最终进度先排入同一 per-card 写链并等待完成，再收尾正文，定时器在关闭时取消；迟到事件不再写入。
- 单轮最多保留 128 项、展示最近 8 项并提示省略。只记录类别和状态，不保存命令参数/结果。Host 隐藏/抑制事件可撤下对应进度；无法关联的隐藏事件关闭本轮进度显示。
- 过程与汇总变量不得与正文、反馈或保留键冲突；冲突明确报配置错误。投影失败不重跑模型、不重发业务正文，也不伪造客户端已显示的证明。

## 连接生命周期补充

参考官方 connector [PR #678](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/pull/678)（MIT），将旧 socket 的迟到 close 回调及已排队重连隔离：事件发生时与重连任务执行前均核对实际 socket 身份。进一步将同样的身份核验用于 SYSTEM disconnect 和 pong，避免旧连接干扰当前状态；同一 socket 的监听器只注册一次。

连接/重连在等待过程中被 abort 时，不再发布 connected=true，也不留下迟到建立的新连接。测试覆盖旧事件、close 已排队后替换、正常重连、abort、SDK 复用 socket；只验证本地运行器生命周期，不声称真实钉钉断线全场景验收。

## 第三批：回合回执与投递事实

已接入 Stream 入口的本地 SQLite 回执账本，位置为 `$OPENCLAW_STATE_DIR/dingtalk-connector/turns-v1.sqlite`（state dir 缺省 `~/.openclaw`）。此文件是 connector 自己的运行数据，不读写 OpenClaw 会话库。

- 回执键由可信账号、机器人、会话、业务消息 ID 和发送者组成并哈希保存；不保存消息正文、命令、URL、Token 或原始错误。新协议 messageId 不能让同一业务消息重新执行。
- `BEGIN IMMEDIATE` 原子认领先于消息 handler；重复回执不会再建排队卡片或调用模型。缺少可信 ID 时拒绝执行，不用正文生成身份。未收口或结果未知的记录不会被清掉来自动重跑，也不会接管另一个进程持有的记录。
- `execution=settled` **只表示 Host dispatch 返回**，不是业务成功或用户已收到。未收口的 running 保留未知；回调正常返回不能擦除投递未知。
- 消息入口 Promise 等实际处理结束才收口；Stream 仍立即 ACK。回归测试通过真实外层入口挂起 Host dispatch，核验执行中回执未关闭且重复消息不再次调用 handler。并发消息处理计数防止其中一条结束就提前停止整个连接的处理中保活。
- 通过现有 HTTP 客户端包装器观察明确的发送路由：webhook 正文、机器人主动消息、媒体消息、卡片创建/投放及最终正文/完成态。Token、上传、下载、进度和表情请求不冒充最终答案投递。创建卡片单列 placeholder，不算答案已交付。
- 调用前先落 `pending`，收到可识别的确认才写 `accepted`；明确业务拒绝写 failed，超时/断连/缺少回执写 unknown。HTTP 200 不能覆盖业务错误，HTTP 408 不作为“明确拒绝”证据。
- 一旦当前回合出现未确认投递，后续自动正文兜底/重发在发请求前停止；保留事实供核查。明确拒绝后的兜底可以发送，记录中同时保留 failed/accepted，汇总为 partial 而非抹掉第一次失败。
- 对模型调用、任意第三方工具、副作用和 DWS 子进程发送，没有平台级回执就不声称已观测。`delivery=not_observed` 不是“无需回复”或“已成功无正文”。
- 最多 10000 条回执、每回合 256 次被记录的发送；满额或写盘失败则停止新执行/发送。已收口且无需核查的回执保存至少 7 天，后续新认领时可清理；未收口/needs_review 不自动删除。跨进程使用 SQLite 唯一键与写事务，不靠 PID 文件判断任务是否可以重跑。

限制：Stream 的 ACK 仍沿用现有快速确认路径，ACK 到本地落盘间的崩溃窗口不能保证恢复；没有上游业务 replay/cursor，不能承诺 exactly-once 或断线不丢消息。接口 accepted 也不等于客户端已显示、已读或业务验收。

### 管理员核查入口

Gateway RPC `dingtalk-connector.turns.inspect` 显式注册 `scope: operator.admin`、`profileAccess: independent`，权限检查由 Host 执行；不注册普通 Agent tool。参数只有：

```json
{"limit": 50, "reviewOnly": true}
```

可用 `key` 查询某条回执，或将响应的 `nextCursor` 原样作为下一页 `before`；limit 为 1–100。消息入口日志的 `[turn-receipt] <hash>` 对应该 key。不接受数据库路径，不提供删除、放行或重跑操作。查询使用只读 SQLite 短事务读取 WAL；账本不存在返回 available=false，不创建文件。

`open_or_interrupted` 不等于进程已死：应结合 Host 的实际运行状态核对。`delivery` 分为 accepted / failed / partial / unknown / not_observed。核查时先确认模型或工具是否已产生副作用、消息是否已送达，再由管理员决定后续业务处理；**不要删回执来制造“新消息”并重试**。

### 原消息状态反馈

在账号配置或顶层 channel 配置设 `messageStatusFeedback: true` 可启用。默认不启用，沿用原有思考表情；启用后原有思考表情由本轮反馈控制器替代，避免两个写入方互相撤回。

| 事实 | 原消息标签 |
|---|---|
| 已准入并开始 Host dispatch | 处理中 |
| 回合收口且答案接口确认 accepted | 回复已提交 |
| 明确失败或存在部分投递失败 | 处理或投递失败 |
| 未收口或结果未知 | 结果待核查 |
| 已观察到取消状态 | 已取消 |
| dispatch 收口但没有答案投递证据 | 处理已结束 |

不为访问拒绝、解析失败或未进入 Host dispatch 的消息贴“处理中”。目前没有宣称可精确观测 Host 队列中的排队位置，也没有从模型文本推断成功。

使用现有应用机器人 emotion/reply、emotion/recall 协议；不调用数字员工 OAuth 或替消息发送者切换 Profile。标签固定，不含用户正文或命令。后台串行、合并待发送状态，只撤回本控制器确认贴过的标签；终态不能被迟到的处理中覆盖。

`turn_feedback` 保存 desired/applied/outcome 等状态，不保存 Token 或原始消息标识。只有接口成功才更新 applied；反应失败/未知独立记录，不影响答案状态或触发重发。单请求最多等待 5 秒，回合收尾最多额外等待 6 秒；超时 abort 后迟到结果不能标 accepted。

接口成功不等于客户端视觉已验证。未知贴标结果后停止继续变更；重启也不自动重放表情请求。由于账本只保留身份哈希，无法仅凭旧回执重新定位原消息，这一边界在核查响应中保留，而不是补造“恢复完成”。

## 验证范围

在 Windows 使用独立安装的 Node 24.22.1、最低支持的 OpenClaw 2026.10.9 依赖：默认测试集合 481 项 Vitest、38 项引导与 scope-setup 通过；1 项文件符号链接测试因 Windows 权限跳过。构建通过。新增覆盖交叉作用域、无 ID、冲突 ID、嵌套引用、缓存持久化、转发结构/预算/附件、真实 handler 的命令边界、回执生命周期和发送确认。真实网络由 mock 替代，不能据此宣称钉钉客户端端到端验收。

核心新增/修改纯模块做严格 TypeScript 检查。全项目类型检查仍有基线既有诊断：同一独立依赖下原始 fork 47 项、本分支 44 项，无新增诊断；不以构建成功冒充全部类型检查通过。

## 后续工作（未完成）

1. 完整发送路径与异常结果传播审计、跨平台账本及真实机器人验收；基础账本、管理员只读核查入口和可选原消息反馈已实现，验证范围仍需逐项确认。
2. Host 队列/停止、原生问题表单与审批能力；保留 scoped admission，不照搬 DWS 的队列或 Codex 审批器。上述 socket 生命周期修复已实现，完整运行治理仍需继续验证。
3. 最低 Host 契约、完整回归、构建注册、独立评审和 PR。A/B 的本地测试不代表整个目标或真实钉钉验收完成。

已从 npm 2026.10.9 包声明确认 `onItemEvent` / `onToolStart` / `onApprovalEvent` / `onCommandOutput` 存在；较新的 `nativeRuntimeAsync` / `createChannelApprovalNativeRuntimeAdapterAsync` 不在该包声明中。审批实现需要进一步核对最低 Host 可用的公开接口，不能无声调用 2026.11.1 才有的 API。

## 参考与来源

- [DWS 消息上下文](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_turn.go)
- [DWS 机器人转发记录](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_chatrecord.go)
- [官方 connector 作用域引用](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/88df00ee594072e9941ef3f71da90a37f3291ad3/src/messages/context-store.ts)

本批 TypeScript 模块按公开协议和研究得出的边界重新实现，没有将 DWS Go 实现逐行移植。后续如果复制第三方源码，将保留相应许可证、版权和来源说明。
