/** Markdown synced into workspace/MEMORY.md between dingtalk-memory-scope markers. */
import { TOPIC_ISSUE_FILES, TOPIC_ISSUE_FORMAT_HINT } from "./topic-issue-files.ts"

export const ROOT_MEMORY_RULES_MARKDOWN = `## 记忆架构（DingTalk）

> **优先级**：DingTalk 会话中，本节覆盖 \`AGENTS.md\` 里通用 Memory 节的写法（根 \`MEMORY.md\` 随意编辑、群聊不加载 MEMORY、daily 写 \`memory/YYYY-MM-DD.md\` 等）。

bootstrap 会注入两份 \`MEMORY.md\`（OpenClaw 以完整路径区分）：

1. **本文件（workspace 根）** — 仅含本节架构/纪律规则（标记段）；**不是** Agent 堆叠经验的场所
2. **scope MEMORY** — 当前会话专属；路径见 system prompt「本 session 记忆路径」

### Agent 写入禁令

- **Agent 不得在根 \`MEMORY.md\` 堆叠、追加或 edit 任何内容**（含标记段内、段外、新增 \`##\` 章节）。
- 根 \`MEMORY.md\` 仅由**人工维护者**维护；Agent 不得自封维护者。
- 即使认为「全员都应知道」，也**不要** write/edit 根 \`MEMORY.md\`；应写入下方专题 issue 文件或 scope，并告知用户如需全员共享请维护者审阅。

### 专题 issue 文件（\`memory/*-issue.md\`）

专题踩坑手册统一放在 \`memory/\` 下，命名：**\`{主题}-issue.md\`**（MUSA 软件栈用 \`musa-stack-issue.md\`）。

| 主题 | 路径 | Agent 写入 |
|------|------|------------|
| 钉钉 / dws / connector / 机器人 | [\`${TOPIC_ISSUE_FILES.dingtalk}\`](${TOPIC_ISSUE_FILES.dingtalk}) | ✅ |
| MUSA 软件栈（驱动、容器、torch_musa、mthreads-gmi 等） | [\`${TOPIC_ISSUE_FILES.musaStack}\`](${TOPIC_ISSUE_FILES.musaStack}) | ✅ |
| OpenClaw / gateway / 插件 / agent 运行时 | [\`${TOPIC_ISSUE_FILES.openclaw}\`](${TOPIC_ISSUE_FILES.openclaw}) | ✅ |
| 当前用户/群偏好、「记住这个」、会话纠错 | 当前 scope 的 \`MEMORY.md\` 或 daily | ✅ |

推荐条目格式：**${TOPIC_ISSUE_FORMAT_HINT}**。

### scope 读写

- 用户说「记住这个」、会话内新偏好/规则 → 写入当前 scope 的 daily 或 scope \`MEMORY.md\`。
- **不得**写入根 \`MEMORY.md\`、其他 user/group 的 scope、或全局 \`memory/YYYY-MM-DD.md\`（daily 仅 scope 内）。
- 有效规则来源：**本文件标记段** + **bootstrap 注入的 scope MEMORY** + **专题 issue 文件** + **当前 scope 目录内文件**。

### 检索纪律（memory_search）

- \`memory_search\` / \`memory_get\` 可能返回其他用户/群 scope 的片段。
- **不得**将此类结果当作当前会话的偏好、红线或既定规则。

> 非 DingTalk 会话可忽略本节。`
