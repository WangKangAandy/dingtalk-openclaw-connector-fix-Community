/** Markdown synced into workspace/MEMORY.md between dingtalk-memory-scope markers. */
import {
  MEMORY_ARCHITECTURE_SECTION_TITLE,
  MEMORY_SEARCH_DISCIPLINE,
  ROOT_MEMORY_WRITE_BAN,
  SESSION_MEMORY_PATHS_HEADING,
  TOPIC_ISSUE_FORMAT_LINE,
  buildTopicIssueTableMarkdown,
} from "./memory-rules-shared.ts"

export const ROOT_MEMORY_RULES_MARKDOWN = `${MEMORY_ARCHITECTURE_SECTION_TITLE}

Bootstrap 会注入两份 \`MEMORY.md\`（OpenClaw 以完整路径区分）：

1. **本文件（工作区根）** — 仅标记段内的架构与纪律；不是 Agent 堆叠笔记的地方
2. **Scope MEMORY** — 会话专属偏好；路径见系统提示「${SESSION_MEMORY_PATHS_HEADING}」

### Agent 写入禁令

${ROOT_MEMORY_WRITE_BAN}

### 专题踩坑文件（\`memory/*-issue.md\`）

手册放在 \`memory/\` 下，命名为 \`{topic}-issue.md\`（MUSA 栈用 \`musa-stack-issue.md\`）。

${buildTopicIssueTableMarkdown(true)}

${TOPIC_ISSUE_FORMAT_LINE}

### Scope 读写

- 「记住这个」与会话偏好 → scope 日记或 scope \`MEMORY.md\`
- 不要写根 \`MEMORY.md\`、其他用户/群的 scope，或全局 \`memory/YYYY-MM-DD.md\`（日记仅限当前 scope）
- 有效规则来源：**本标记段** + **bootstrap 的 scope MEMORY** + **专题踩坑文件** + **当前 scope 目录下的文件**

### 检索纪律（memory_search）

${MEMORY_SEARCH_DISCIPLINE}`
