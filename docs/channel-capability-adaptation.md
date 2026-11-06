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

## 验证范围

在 Windows 使用 Node 24.22.1、已安装的 OpenClaw 2026.11.1 测试依赖：默认 `npm test` 包含 Vitest、引导与 scope-setup；新增覆盖交叉作用域、无 ID、冲突 ID、嵌套引用、缓存持久化、转发结构/预算/附件、真实 handler 的命令边界和发送确认。真实网络由 mock 替代，不能据此宣称钉钉客户端端到端验收。

核心新增/修改纯模块做严格 TypeScript 检查。全项目类型检查仍有基线既有诊断，必须与同依赖的基线对比，不以构建成功冒充全部类型检查通过。

## 后续工作（未完成）

1. 回合 execution/delivery 分离、持久幂等及中断待核查，原消息反馈由这些事实驱动。
2. Host 队列/停止、原生问题表单与审批能力；保留 scoped admission，不照搬 DWS 的队列或 Codex 审批器。上述 socket 生命周期修复已实现，完整运行治理仍需继续验证。
3. 最低 Host 契约、完整回归、构建注册、独立评审和 PR。A/B 的本地测试不代表整个目标或真实钉钉验收完成。

已从 npm 2026.10.9 包声明确认 `onItemEvent` / `onToolStart` / `onApprovalEvent` / `onCommandOutput` 存在；较新的 `nativeRuntimeAsync` / `createChannelApprovalNativeRuntimeAdapterAsync` 不在该包声明中。审批实现需要进一步核对最低 Host 可用的公开接口，不能无声调用 2026.11.1 才有的 API。

## 参考与来源

- [DWS 消息上下文](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_turn.go)
- [DWS 机器人转发记录](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_chatrecord.go)
- [官方 connector 作用域引用](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/88df00ee594072e9941ef3f71da90a37f3291ad3/src/messages/context-store.ts)

本批 TypeScript 模块按公开协议和研究得出的边界重新实现，没有将 DWS Go 实现逐行移植。后续如果复制第三方源码，将保留相应许可证、版权和来源说明。
