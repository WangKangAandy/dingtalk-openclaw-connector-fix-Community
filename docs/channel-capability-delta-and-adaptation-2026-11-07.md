# DWS、官方 connector 与小摩 fork：Channel 能力差异及适配决策

日期：2026-11-07。阶段：**研究完成、分批适配中；生产运行态未变更**。本文接续 [接入架构核验](./dws-vs-connector-channel-research-2026-11-07.md)，不再把“DWS 能否直接取代 OpenClaw connector”与“有哪些能力值得吸收”混为一谈。

下面的矩阵和探针保留**实施前基线**。A/B/C/D 的落地记录见 [能力适配记录](channel-capability-adaptation.md)，验证结果见 [最终审查](channel-capability-validation.md)。待协议验证的长答案分批、进程所有权和限流等候选不被包装为已经具备或已经验收的能力；它们尚不能按员工 Adapter 的协议直接迁入 OpenClaw 机器人。

## 结论与实施顺序

**确实有值得适配的能力，且有具体缺口，不能只停在“DWS 不支持直接替代”这个结论。**

优先级按数据正确性、实际用户收益、宿主契约和改动风险排序：

1. **消息上下文正确性**：按作用域和精确消息 ID 恢复引用；保留合并转发记录的完整有界上下文；引用/转发不能成为新指令。fork 已复现同名标题跨会话恢复的问题，两版 connector 均未识别 `chatRecord` 内容。
2. **公开工具进度**：吸收 DWS 的固定工具分类、真实状态转换、终态保护；保留现有卡片的使用体验，但不把命令参数/工具结果/内部推理默认投影到群聊。fork 已有过程预览，不应重做成另一个 Agent 执行器。
3. **执行和投递结果分离**：把“Agent 完成”“正文发送被确认”“发送结果未知”“已读/业务完成”分别记录；完善去重、恢复和原消息状态投影，避免重启后重复执行或把未知结果显示为成功。
4. **宿主原生交互与控制**：参考官方 connector 的提问表单、Host 队列与取消、旧 WebSocket 回调隔离；审批单独通过 OpenClaw 的原生审批契约适配，不能把提问按钮或 DWS 的 Codex 审批搬成另一套执行授权。

身份、员工管理、Codex 桌面 IPC、Agent 进程启动及知识库执行器不进入 connector。本次也不以 DWS 的个人登录态补拉其它会话资料，避免绕过 fork 的 scoped memory / sender Profile 边界。

后续实施按上面顺序拆分独立、可验证的提交。研究产物不是适配完成证明；下面逐项记录已证实、待验证与不适合移植的边界。

## 1. 本次权威基线

| 对象 | 固定版本 | 用途 |
|---|---|---|
| 官方 DWS stable | v1.0.67 / `63a7c4906c7dee10750011ea309b9eb78abb7eb0` | 已发布能力 |
| 官方 DWS main | `c631e4fbf701dcac0b397e674068c3b65a8d2bd2` | 研究时最新代码；前轮关键 7 文件与 stable 相同 |
| 官方 connector | v0.8.27 / `88df00ee594072e9941ef3f71da90a37f3291ad3` | 官方宿主集成实现 |
| 用户 GitHub fork main | `caef3c2e600deedc1a8daf9025328562ed5ad99f` | **适配的主基线**，含 PR #18 scoped learning |
| 部署仓本地 connector 分支 | `7e2f0be8ccbc426f145174c349607baf79af4329` | 另含 DWS 身份改动，不能冒充 GitHub main |
| 本地可读 OpenClaw SDK | 2026.11.1（connector-scoped-learning 的 node_modules） | 可行性检查，不能自动证明最低宿主 2026.10.9 已支持全部 API |

fork 实际仓库是 [WangKangAandy/dingtalk-openclaw-connector-fix-Community](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community)，不是同名无后缀仓库。研究开始时仍有 PR #19（WSL runtime / Workshop）、#20（DWS sender Profile）、#21/#22（相关文档）等未合入；新适配不能把其中功能当作 main 已有，也不替用户合并它们。

部署仓当前依赖目录里另有 OpenClaw 2026.5.7，比 fork 声明的最低 2026.10.9 更旧；不能直接用那套依赖跑绿就宣布适配完成。

## 2. 三方能力矩阵

标记：“有”是代码实现，不自动代表本次做过真实钉钉验收；“部分”必须看对应限制。“适配”表示拟实现，不表示已经完成。

| 能力 | DWS Channel | 官方 connector 0.8.27 | fork main | 对 OpenClaw 的处置 |
|---|---|---|---|---|
| 文字、群/单聊、Stream | dev 机器人原生；员工 Event Consumer | 有 | 有 | 已有，不重复造通道 |
| 精确引用与来源标注 | 员工 quoted_message + 不可信 JSON 上下文 | 按账号/会话/消息 ID 缓存，冲突拒绝 | 有引用提取，但缓存全局且有 title fallback | **优先适配官方作用域方案** |
| 合并转发完整记录 | 员工 forward_messages；机器人 chatRecord | 未识别 chatRecord | 未识别 chatRecord | **适配，优先只处理入站已提供内容** |
| 转发图片/文件定位恢复 | 有；机器人部分路径还额外查询 user-state MCP | 普通附件与引用媒体，有界文本抽取 | 普通附件、引用图片、硬作用域媒体策略 | **有条件适配**；不得继承默认登录态补拉 |
| 卡片正文流式 | 有，因 Adapter 不同而异 | 有 | 有 | 不把“有流式”列为 fork 缺失 |
| 公开工具类型与真实状态 | 固定分类、按工具 ID 更新、结果缺失标 ended | v2 工具 ID/phase、状态和元数据 | 可选过程区，以开始行/命令文本/推理为主 | **适配安全的状态投影** |
| 可折叠过程区、正文独立 | 员工 A2UI 有 | v2 block 有相近分区，非同一协议 | 自定义模板变量，部分 | 可用现有模板实现；不强制换成员工 A2UI API |
| 长答案有界分批提交 | 员工卡片按实际编码载荷预算分批，同卡发布完整 revision | 未见等价分批事务层 | 卡片流/重试已有，无等价完整 revision | **待协议验证后适配**，不能照搬 64 KiB 数值 |
| 原消息排队/思考/完成/失败反馈 | 员工独立状态投影、有限重试、持久恢复 | 主要思考表情及卡片终态 | 思考表情、排队卡片/ACK，结束撤回 | **适配更多事实状态**，不以 return 当“完成” |
| 空正文成功与未知结果区分 | completed_without_reply、not_required、needs_review | 有空回复兜底文案，非同一事实模型 | 部分卡片反馈记录；另有“任务完成”文案 | **适配统一分类**，不从空正文推断成功 |
| 持久入站幂等/中断恢复 | 员工按 Profile/会话/消息 ID 账本、异常待核查 | 主要进程内去重 | 进程内协议/业务 ID 去重；org-events 另有幂等 | **适配聊天专用最小账本**，不复用组织事件语义 |
| 投递回执与 execution/delivery 双状态 | 员工 wait-delivery/unknown；具体 API 有回执查询 | 有发送/卡片生命周期，但无同等任务账本 | 已有不确定卡片禁止立即文字兜底、反馈文本保存 | 在已有保护上补齐，**不能声称从零缺失** |
| 同会话排队与连续追问合并 | dev pending batch；员工有队列容量 | 交 Host 队列/interrupt | 仍有插件 FIFO/TTL；hard scope 也参与隔离 | **优先对齐 Host**，不移植 DWS convQueue |
| 原生问题/选择/表单 | A2UI 能力；与宿主工具机制不同 | dingtalk_ask_user_question | 未见对应注册工具 | **回移官方实现并对齐 scoped 身份** |
| 操作审批卡 | Codex Adapter 的真实 approval 请求；另有 dev 业务审批 | 原生问题工具不等于 exec 审批 | 点赞/点踩也不等于 exec 审批 | **待最低 Host API 核验后适配 native approvals** |
| 实时停止、旁路问答 | Adapter 自己处理取消/控制 | `/stop`、`/btw` 与 Host 联动 | 部分生命周期控制，FIFO 入口仍可能阻塞后续消息 | **适配官方 Host 语义**，不重新实现模型取消 |
| 重连与连接健康 | worker/transport/executor 分开；dev heartbeat 有限制 | runtime 状态；0.8.27 忽略旧 socket 延迟关闭 | 有 connected/lastInbound，但无旧 socket 身份校验 | **回移官方迟到事件修复**；补诊断，不宣称业务在线 |
| 单机器人多进程防抢连接 | dev 本机 PID 文件锁 | 防重复加载主要同进程 | 未见机器人 clientId 跨进程锁 | **待 Host 所有权核验**，不照搬有竞态的 PID 文件接管 |
| 每发送者限流 | dev connectGate 有滑动窗口 | 未见消息级等价闸；卡片 QPS 是另一层 | 无等价入站限流 | 可配合 Host 容量策略适配；停止/审批不能被普通消息限流吞掉 |
| 用户/群准入 | dev 本地 allowlist；员工可走平台策略 | DM/群策略，有 pairing 限制 | 另有 scoped admission | 保留 fork 更严格边界；平台员工授权不能用于应用机器人 |
| 多身份业务调用 | 员工固定员工 Profile；DWS 多 Profile | 应用账号注入不等于 sender Profile | main 有 scoped 边界；另有待合入 sender 注入 PR | 不倒退到 owner/currentProfile，不重复实现另一套身份选择 |
| 设备绑定、员工发布/可见性 | DEAP 数字员工专用 | 无 | 无 | **不移植**：换平台主体，不是消息插件增强 |
| Agent 安装/启动/桌面 IPC/模型设置 | 各 Adapter 实现 | Host 负责 | Host 负责 | **不移植**：不能在 connector 内再开第二个 Agent |
| 本地知识检索、角色人设、远端审计表格 | dev 部分路径有 | 可通过 OpenClaw/DWS 实现 | workspace/scoped memory/组织定制已有 | 不整套移植，使用现有 Host/业务工具边界 |
| 自学习、组织入职事件、卡片反馈学习 | 非 DWS 普通 channel 的同等实现 | 不等同 | fork 专有且仍演进 | **必须保留**，不是 DWS “更全”就可覆盖 |

## 3. 已执行的缺口验证

证据：[probe.mjs](./evidence/channel-capability-delta-2026-11-07/probe.mjs)、[probe-results.json](./evidence/channel-capability-delta-2026-11-07/probe-results.json)。Node v24.18.0，纯本地合成数据，无真实凭证、网络消息或模型调用。

### 3.1 引用恢复会跨会话取错内容

1. 通过 fork 原始 `QuoteBodyStore` 保存来自会话 A 的合成消息，标题为 `Shared title`。
2. 会话 B 的引用只提供相同标题，无原始消息 ID。
3. 调用 fork 原始 `extractQuotedMsgText()`，得到 A 的缓存完整正文。
4. 官方 `MessageContextStore` 对 B 请求 A 的明确消息 ID 返回 missing。

这证明 fork 的 **全局标题索引 + 无作用域查询** 可以取到不属于当前会话的缓存文本。它不等于已经发现真实生产数据泄漏，但已足够成为需要修复的可复现隔离缺陷。

作用域应至少包括账号、会话；hard-scope 模式还应与其授权边界一致。不能仅增加同名配置后继续全局查找，也不能把 title 当作回退权威。没有 ID、多个 ID 冲突、缓存过期时保持缺失事实，不猜测。

来源：[fork 缓存](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/blob/caef3c2e600deedc1a8daf9025328562ed5ad99f/src/utils/quote-body-store.ts)、[fork 恢复](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/blob/caef3c2e600deedc1a8daf9025328562ed5ad99f/src/utils/quote-message.ts)、[官方作用域缓存](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/88df00ee594072e9941ef3f71da90a37f3291ad3/src/messages/context-store.ts)。

### 3.2 合并转发记录被丢为类型占位

按 DWS 测试中观察到的形态，使用 `msgtype=chatRecord`、`content.chatRecord` 为 JSON 数组字符串，含两条合成转发消息。执行两个 connector 源码中未改写的消息提取函数，均只得到 `[chatRecord消息]`。

为避免导入整个宿主/网络模块，此项探针用 TypeScript AST 提取原函数及辅助函数再执行。它是**真实原函数的离线输入测试，不是全 handler 集成测试或真实 Stream 回放**。

DWS 有两种不同入站协议，不能混用字段：

- 机器人 Stream 的 `chatRecord`：有嵌套正文/附件及 `unknownMsgType` 恢复路径。
- 数字员工 Event 的 `forward_messages`：保留记录顺序、正文、来源和图片授权上下文。

适配 connector 应先支持机器人实际回调中已提供的记录；记录不完整、条数/字节/深度超限应明确标注。附件下载必须使用当前机器人/当前外层消息的权限；绝不能因为 DWS 能补拉，就用部署者 currentProfile 查询其他会话。

来源：[DWS chatRecord](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_chatrecord.go)、[机器人媒体解析](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_media.go)、[数字员工不可信转发上下文](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_turn.go)。

### 3.3 过程预览有开始行，不是完整、安全的工具生命周期

fork 的原始 `formatCommandOutputLine()` 会原样显示命令参数。使用 `Authorization: Bearer SYNTHETIC-NOT-A-SECRET` 的测试字符串，卡片格式化结果仍包含该字符串。`formatToolStartLine({phase:"end"})` 返回 null。

这不是“默认会泄露真实密钥”：该能力需要配置过程预览变量，而且本次使用纯合成数据。它证明的是当前预览的**字段契约允许任意命令内容进入群卡片，且结束事件并未由开始行 formatter 表达**。

DWS 使用固定公开类型（命令执行、文件读取、文件修改、网页检索、MCP 等），按工具 ID 更新，不展示参数/结果/内部推理；工具输入块结束不等于工具完成，回合结束且无结果时仅标 ended。这种**事实投影**适合 OpenClaw，DWS 的 Agent 协议解析器本身不适合搬进插件。

来源：[DWS 公开工具状态](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_agent_progress.go)、[fork formatter](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/blob/caef3c2e600deedc1a8daf9025328562ed5ad99f/src/card-exec-preview/format.ts)。

## 4. 应移植的设计，不应照抄的机制

### 4.1 账本：保留未知，不自动重跑

DWS 员工运行器在入队前检查容量，按员工 Profile/会话/消息 ID 保存记录，分开 execution 与 delivery。执行途中崩溃或投递未知转 needs_review；不能通过再跑一次模型“修复”。去重和原消息反馈也以相同账本事实为基础。

fork 已有卡片最终发送不确定时禁止立即文字兜底、保存最后确认展示正文等保护。这些应保留；差距在于**整个入站回合跨重启的账本和所有发送路径的一致分类**，不是卡片层完全没有可靠性设计。

拟定最小状态：

```text
admitted → executing → execution_succeeded | execution_failed | interrupted_unknown
                     → delivery_not_required | delivery_pending
                                            → delivery_accepted | delivery_failed | delivery_unknown
```

只有明确返回的发送证据才能进入 accepted；accepted 不等于用户已读或业务目标完成。模型宣称“完成”不构成账本证据。持久记录只存必要标识和结果，不新增完整 prompt/工具输出日志。

消息 ACK、队列接受、落盘、模型执行和下行发送之间仍存在跨系统窗口。最小账本能抑制本地重复，但不能承诺 exactly-once。宿主若已提供任务/投递事实，应引用其权威结果，不再平行管理模型任务。

来源：[DWS runtime](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_runtime.go)、[DWS 原消息反馈](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_feedback.go)、[fork 回复生命周期](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/blob/caef3c2e600deedc1a8daf9025328562ed5ad99f/src/reply-dispatcher.ts)。

### 4.2 队列和中断：使用 Host，保留 fork 的 hard-scope 权威

DWS 的 dev convQueue 把连续追问合并成 pending batch，适合其自有转发器；这不代表 connector 应新增同样队列。

官方 connector 已把队列/interrupt 交给 Host。fork main 仍保留会话 FIFO 和 TTL，但另有 hard-scope 的 `isolatedSessionKey`、`runWithWorkAdmission`、session lease 与权限检查。适配必须把**同一个最终 SessionKey**贯穿准入、队列、派发、停止和后台 scope work，不能用官方普通群 key 覆盖 fork 隔离，也不能同时存在两套决定排队/中断的权威。

来源：[DWS convQueue](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_queue.go)、[官方派发与控制](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/88df00ee594072e9941ef3f71da90a37f3291ad3/src/core/message-handler.ts)、[fork 宿主会话权威](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/blob/caef3c2e600deedc1a8daf9025328562ed5ad99f/src/memory-scope/host-session.ts)。

### 4.3 问题表单与执行审批是两种协议

官方 `dingtalk_ask_user_question` 是“发卡结束本轮 → 用户提交后在原会话新回合继续”。这很适合补参数、选择方案，不等于暂停一个待批准的 exec。

DWS 员工审批当前绑定 Codex 原生 approval 请求，由固定主管作决定；dev 的业务 action 审批又是另一条实现。OpenClaw 必须用 Host 审批事件与决策接口，绑定 account/session/request/reviewer/expiry，校验可信回调操作人。不能通过模型生成一段“同意”文本、把卡片内容当命令执行，或用点赞/点踩充当授权。

本次本地 OpenClaw 2026.11.1 SDK 确认存在 `ChannelApprovalAdapter`、`nativeRuntimeAsync`、`createChannelApprovalNativeRuntimeAdapterAsync`，以及 `onItemEvent` / `onApprovalEvent` 等公开事件。**尚未证明 fork 最低版本 2026.10.9 的接口等价**；实施前需核验最低版本，若必须提高最低宿主则明确修改契约，不写隐式旧版本兼容。

来源：[DWS Codex 审批](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_approval.go)、[官方提问工具](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/88df00ee594072e9941ef3f71da90a37f3291ad3/src/questions/index.ts)。

### 4.4 卡片协议、长答案与权限边界

DWS 员工 A2UI 是组件/surface/data-model；connector 当前机器人 AI Card 是模板变量/block/streaming API。相同“卡片”字样不代表相同身份或协议。

应吸收可折叠过程区、固定公开类型、真实终态、按最终编码字节限制分批、全部分批成功后发布完整答案等设计。模板权限、API 限额和幂等行为必须对机器人 API 单独验证；不能拿 DWS 的 64 KiB 限额或员工 Profile API 直接套用。

DWS 自身长答案分段代码仍有 Markdown block-aware TODO：UTF-8 不截断并不保证代码围栏、表格、列表渲染正确。适配验收必须覆盖这些结构，不能只测试字符串拼接还原。

来源：[DWS 卡片分批](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/deap_agent_card_payload.go)、[官方 connector 结构化卡片](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/88df00ee594072e9941ef3f71da90a37f3291ad3/src/cards/structured-card.ts)。

### 4.5 运行治理：采纳目的，不照抄锁和健康判定

DWS 单机器人进程锁的目标是防止同一 clientId 的 Stream 连接抢消息；它的 PID 文件读取、删除和接管不能直接照搬为可靠锁。必须先确认 OpenClaw 进程所有权机制及多账号启停生命周期，再考虑有限作用域的 OS 锁。

DWS dev heartbeat 也明确承认“曾连接 + 进程活着”无法证明没有静默失聪；lastPush 久远不应自动判 down，因为机器人可以正常空闲。fork 已有连接状态和 lastInbound，不能把这列说成完全缺失。可以补 reconnect、最后确认投递、失败分类和在途数量，不以日志“处理完成”计数冒充发送成功。

官方 connector 的旧 socket close 回调修复对 fork main 是直接可借鉴的缺口：fork 当前监听器没有捕获并核对 socket 身份，延迟 close 可把新连接标成断开并再重连。应优先回移这个已明确界定的生命周期修复。

来源：[DWS 锁](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_lock.go)、[DWS 健康边界](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/63a7c4906c7dee10750011ea309b9eb78abb7eb0/internal/helpers/connect_health.go)、[官方 PR #678](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/pull/678)。

## 5. 实现边界与验收清单

| 工作包 | 预期模块边界 | 必须证明的行为 |
|---|---|---|
| A：引用/转发上下文 | 新的纯入站解析模块 + 有作用域的引用存储；message-handler/发送确认处接线 | 跨账号/群/用户不串；缺 ID 不按标题猜；冲突拒绝；chatRecord 字符串/数组/嵌套/非法内容；条数/深度/字节限制；历史 `/stop` 不触发控制；当前指令仍生效；媒体不越权 |
| B：公开进度/卡片 | card-exec-preview 的事实模型 + Host 回调适配 + 现有 card 写链 | 工具 ID 去重；start/result/end区分；取消/错误/未知真实；不展示参数结果与内部推理；乱序不会覆盖终态；节流不丢最终状态；正文与过程不互相覆盖 |
| C：回合事实/反馈 | 插件状态目录中的最小账本 + 入站准入 + 回复投递结果 + 表情投影 | 重启不自动重跑未知任务；容量拒绝不先标接收；写盘失败明确；有真实回执才 accepted；空正文/失败不同；多账号消息 ID 不冲突；不新增正文审计；反馈失败不重发业务 |
| D：Host 控制/交互 | 保留 scoped admission 的路由派发；独立 questions/approvals 模块；连接生命周期 | 原 scope 不变；停止可越过长任务；表单仅原提问人有效；审批仅 reviewer 有效；超时/新回合/权限变化使旧卡失效；一次决策；重连迟到事件不能影响新连接 |

阶段间不做全量官方代码覆盖；每一包要在 fork main 的行为基础上验证，并检查与 PR #19–#22 的冲突。已有反馈学习、组织事件、scoped memory 和媒体限制必须保留。

验证层级：纯函数/状态机测试 → 模块接线测试 → 目标 OpenClaw 的真实插件注册与回调探针 → 测试机器人端到端。前三级通过不能声称第四级通过。真实消息发送或部署属于后续具体实施范围，不能沿用上一次 admin 部署授权去更换生产 connector。

## 6. 本轮完成与仍未完成

已完成：刷新三方 SHA、检查 fork 分支/未合入 PR、按实现拆分能力清单、分析宿主边界、三个离线缺口探针、给出分包适配与验收要求。

仍未完成：上述工作包的生产实现、目标最低 Host 的契约核验、集成测试、独立审查、PR 与真实机器人验收。不能把本报告或探针通过当成整个目标完成。下一步从 A 的作用域正确性开始，同时核验 D 的最低 Host 契约；不改现有运行态。

许可证：DWS 是 Apache-2.0，官方 connector/fork 是 MIT。移植具体代码或进行逐行改写时保留相应版权/许可证/NOTICE 要求和来源说明；不把 Go 代码换成 TypeScript 就视作无来源约束。优先沿公开协议与行为实现窄模块，避免引入整个 DWS 运行器。
