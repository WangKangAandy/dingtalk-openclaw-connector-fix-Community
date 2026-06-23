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

Bootstrap injects two \`MEMORY.md\` files (OpenClaw distinguishes by full path):

1. **This file (workspace root)** — architecture and discipline rules in the marked section only; not a place to stack agent-written notes
2. **Scope MEMORY** — session-specific preferences; path in system prompt "${SESSION_MEMORY_PATHS_HEADING}"

### Agent write ban

${ROOT_MEMORY_WRITE_BAN}

### Topic issue files (\`memory/*-issue.md\`)

Handbooks live under \`memory/\` as \`{topic}-issue.md\` (MUSA stack uses \`musa-stack-issue.md\`).

${buildTopicIssueTableMarkdown(true)}

${TOPIC_ISSUE_FORMAT_LINE}

### Scope read/write

- "Remember this" and session preferences → scope daily or scope \`MEMORY.md\`
- Do not write root \`MEMORY.md\`, other users' or groups' scopes, or global \`memory/YYYY-MM-DD.md\` (daily notes are scope-local only)
- Valid rule sources: **this marked section** + **bootstrap scope MEMORY** + **topic issue files** + **files under the current scope directory**

### Retrieval discipline (memory_search)

${MEMORY_SEARCH_DISCIPLINE}`
