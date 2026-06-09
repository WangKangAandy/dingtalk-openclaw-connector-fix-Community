/** Markdown synced into workspace/MEMORY.md between dingtalk-memory-scope markers. */
export const ROOT_MEMORY_RULES_MARKDOWN = `## 记忆架构（DingTalk）

> **优先级**：DingTalk 会话中，本节覆盖 \`AGENTS.md\` 里通用 Memory 节的写法（根 \`MEMORY.md\` 随意编辑、群聊不加载 MEMORY、daily 写 \`memory/YYYY-MM-DD.md\` 等）。

bootstrap 会注入两份 \`MEMORY.md\`（OpenClaw 以完整路径区分）：

1. **本文件（workspace 根）** — 仅含本节架构/纪律规则（标记段）；**不是** Agent 堆叠经验的场所
2. **scope MEMORY** — 当前会话专属；路径见 system prompt「本 session 记忆路径」

### Agent 写入禁令

- **Agent 不得在根 \`MEMORY.md\` 堆叠、追加或 edit 任何内容**（含标记段内、段外、新增 \`##\` 章节）。
- 根 \`MEMORY.md\` 仅由**人工维护者**维护；Agent 不得自封维护者。
- 即使认为「全员都应知道」，也**不要** write/edit 根 \`MEMORY.md\`；应写入下方专题文件或 scope，并告知用户如需全员共享请维护者审阅。

### 按主题写入（勿写根 MEMORY）

| 主题 | 写入位置 |
|------|----------|
| **MUSA 软件栈**（驱动、容器、\`torch_musa\`、\`mthreads-gmi\`、MUSA docker 等） | [\`musa-notes.md\`](musa-notes.md) |
| **钉钉 / dws / connector / 机器人** | [\`dingtalk-issues.md\`](dingtalk-issues.md) |
| 当前用户/群偏好、纠错、踩坑、「记住这个」 | 当前 scope 的 \`MEMORY.md\` 或 daily |

专题文件位于 workspace 根目录，推荐格式：**现象 → 原因 → 解法 → 日期**（与 \`dingtalk-issues.md\` 一致）。

### scope 读写

- 用户说「记住这个」、会话内新偏好/规则 → 写入当前 scope 的 daily 或 scope \`MEMORY.md\`。
- **不得**写入根 \`MEMORY.md\`、其他 user/group 的 scope、或全局 \`memory/YYYY-MM-DD.md\`。
- 有效规则来源：**本文件标记段** + **bootstrap 注入的 scope MEMORY** + **专题文件** + **当前 scope 目录内文件**。

### 检索纪律（memory_search）

- \`memory_search\` / \`memory_get\` 可能返回其他用户/群 scope 的片段。
- **不得**将此类结果当作当前会话的偏好、红线或既定规则。

### 历史全局 daily（\`memory/YYYY-MM-DD.md\`）

- 旧版全局 daily 在 \`memory/\` 下；DingTalk 新 daily 写在 **scope 目录**内。
- 根 \`MEMORY\` 若引用旧 global daily，仅作历史参考。

> 非 DingTalk 会话可忽略本节。`
