# Bug 修复日志

本文件记录社区维护版相对于官方版本的所有修复内容。

---

## v0.8.20-fix1（2026-05-11）

基于官方 `v0.8.20` 拉取。

### 修复：群聊 @Agent 回复显示"✅ 任务执行完成（无文本输出）"

**问题描述**

在钉钉群聊中 @Agent 发送消息后，网关面板显示 AI 已正常生成回复，但群聊内 AI Card 最终展示的是"✅ 任务执行完成（无文本输出）"，而非实际回复内容。私聊场景不受影响。

**根因**

OpenClaw 对群聊默认使用 `sourceReplyDeliveryMode = "message_tool_only"` 交付模式（见 OpenClaw 源码 `source-reply-delivery-mode.ts`）。在该模式下：

- `suppressAutomaticSourceDelivery = true`
- `onPartialReply` 回调被 `wrapProgressCallback` 静默拦截，不再传递给钉钉连接器
- AI Card 流式更新收不到任何文本，`accumulatedText` 始终为空
- `onIdle` 触发 → `closeStreaming()` → 兜底文案"任务执行完成（无文本输出）"

同时，AI 实际回复通过 `message` 工具走 `outbound.sendText` 另行发出，与 AI Card 流式通道完全脱节。

**修复方案**

在 `src/core/message-handler.ts` 的 `dispatchReplyFromConfig` 调用中，通过 `replyOptions` 强制指定 `sourceReplyDeliveryMode: "automatic"`，使群聊与私聊保持一致的直接流式交付行为，绕过 OpenClaw 对群聊的 `message_tool_only` 默认值。

**修复文件**

- `src/core/message-handler.ts`（`dispatchReplyFromConfig` 调用处）

---

## v0.8.20-fix2（2026-05-11）

基于 `v0.8.20-fix1`。

### 修复：群聊 AI Card 在 final 流式阶段被旧 block 消息覆盖（"假流式刷屏"）

**问题描述**

在群聊中 @Agent 后，AI Card 会先展示 agent 执行过程中的中间状态消息（block），随后开始流式展示最终回复。但在最终回复的流式传输进行中，AI Card 内容会反复回退到旧的状态消息（如"开始搜索...""搜到资源，继续..."），并逐条按照"假流式"顺序刷屏展示，直到最终答复才停止。

**根因**

OpenClaw 的 `createReplyDispatcher` 在连续 block 消息之间插入 `humanDelay`（默认 800~2500ms），用于模拟人类自然输入节奏。

由于 AI 生成速度远快于交付速度，所有 block 和 final 回复会在很短时间内全部入队。AI 生成 final 文本时，`onPartialReply` 已开始向 AI Card 流式写入最终回复（`accumulatedText` 已有内容）；此时 sendChain 中的旧 block 仍在按 humanDelay 逐条等待交付。当 humanDelay 到期后，`deliver(kind="block")` 被调用，`streamAICard()` 用 block 的旧文本**整体替换** AI Card 当前内容，覆盖了正在流式中的最终回复。如此循环，形成视觉上"把所有中间消息重新假流式刷一遍"的效果。

**修复方案**

在 `src/reply-dispatcher.ts` 的 `deliver(kind="block")` 路径中，在执行 `streamAICard()` 前检查 `accumulatedText` 是否已有内容。若有，说明 `onPartialReply` 已开始流式传输最终回复，直接跳过该 block 的 AI Card 更新，避免用旧状态消息覆盖正在流式中的最终回复。

**修复文件**

- `src/reply-dispatcher.ts`（`deliver(kind="block")` 路径，`streamAICard` 调用前新增 `accumulatedText` 守卫）

---

## v0.8.20-fix3（2026-05-11）

基于 `v0.8.20-fix2`。

### 修复：群聊中 AI 的 message 工具调用绕过 AI Card，导致中间状态消息发送为独立气泡

**问题描述**

在群聊中 @Agent 执行复杂任务时，AI 在 `message_tool_only` 模式的系统提示引导下，会主动调用 `message` 工具（`outbound.sendText`）来发送中间状态更新（如"好，立刻开始查！""搜索中...""找到资源了..."等）。fix1 切换到 `automatic` 模式后，最终回复正确地通过 AI Card 交付，但 AI 的 `message` 工具调用行为未变，这些中间消息仍通过 `outbound.sendText` 发送为独立的 DingTalk 消息气泡，与 AI Card 同时出现，造成刷屏。

**根因**

`outbound.sendText`（DingTalk channel 的外发接口）完全绕过了 AI Card 的流式机制，直接向 DingTalk 发送新消息。切换到 `automatic` 模式只改变了最终回复的交付路径，不影响 AI 通过 `message` 工具主动发送消息的行为。

**修复方案**

建立全局活跃 AI Card 注册表（`_activeCardRegistry`，key 为 `openConversationId`）。

- AI Card 创建成功后，在 `reply-dispatcher.ts` 的 `startStreaming()` 中调用 `registerActiveCard` 注册。
- AI Card 关闭时，在 `closeStreaming()` 中调用 `unregisterActiveCard` 注销。
- 在 `channel.ts` 的 `outbound.sendText` 中，检查目标群聊是否在注册表中有活跃 AI Card。若有，将此次文本消息路由为 `streamAICard()` 更新（显示在 AI Card 中），而非发送独立消息气泡。
- 若目标不是群聊，或没有活跃 AI Card，则正常发送。

**修复文件**

- `src/services/messaging/card.ts`（新增 `registerActiveCard` / `unregisterActiveCard` / `getActiveCardForConversation`）
- `src/reply-dispatcher.ts`（`startStreaming` 注册，`closeStreaming` 注销）
- `src/channel.ts`（`outbound.sendText` 检查注册表并路由）

---

## v0.8.20-fix4（2026-05-11）

基于 `v0.8.20-fix3`。

### 修复：群聊 AI 回复完成后仍有大量消息气泡涌出（刷屏）

**问题描述**

在 fix3 之后，网关完成最终回复（AI Card 已关闭）后，钉钉群聊中仍然会一次性涌出多条消息气泡。

**根因（三处）**

1. **`startStreaming` 在 `closeStreaming` 后重新建卡**：`deliver(kind="block")` 调用 `startStreaming()`。若某条 block 因 humanDelay 延迟在 `closeStreaming()` 之后才到达，`startStreaming()` 会因 `currentCardTarget === null` 重新创建一张新 AI Card，导致多余卡片出现。

2. **`preCreatedCard` 路径未注册全局注册表**：队列繁忙时使用预创建的 AI Card，该路径直接 `return` 而未调用 `registerActiveCard`，导致 `outbound.sendText` 拦截器无法感知此 Card。

3. **`outbound.sendText` 拦截器调用 `streamAICard` 产生推送通知刷屏**：fix3 将拦截到的消息路由到 `streamAICard` 更新 AI Card，每次更新可能触发 DingTalk 推送通知，这些通知在聊天中表现为独立消息气泡。

**修复方案**

1. 新增 `sessionClosed` 布尔标志：`closeStreaming()` 首次执行时置 `true`，`startStreaming()` 检测到此标志后直接跳过，不再重新建卡。

2. `preCreatedCard` 路径补全 `registerActiveCard` 调用。

3. `outbound.sendText` 拦截器改为静默丢弃（不调用 `streamAICard`），避免额外推送通知。AI Card 内容由 `onPartialReply` 和 `deliver(kind="block")` 负责。

**修复文件**

- `src/reply-dispatcher.ts`（新增 `sessionClosed` 标志；`closeStreaming` 置标志；`startStreaming` 增加守卫；`preCreatedCard` 路径补全 `registerActiveCard`）
- `src/channel.ts`（`outbound.sendText` 拦截器改为静默丢弃，移除 `streamAICard` 调用）

---
