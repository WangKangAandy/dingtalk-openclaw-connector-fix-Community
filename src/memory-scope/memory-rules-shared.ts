/** Shared memory-scope rule fragments (single source for MEMORY.md + AGENTS.md templates). */
import { TOPIC_ISSUE_FILES, TOPIC_ISSUE_FORMAT_HINT } from "./topic-issue-files.ts"

export const MEMORY_ARCHITECTURE_SECTION_TITLE = "## 记忆架构（钉钉）"

export const MEMORY_CANONICAL_POINTER =
  "完整规则见根 `MEMORY.md` 标记段「记忆架构（钉钉）」。"

export const SESSION_MEMORY_PATHS_HEADING = "会话记忆路径"

export const REMEMBER_THIS_ROUTING =
  "有人说「记住这个」→ 写入 scope 日记或 scope `MEMORY.md`"

export const LESSON_ROUTING =
  "学到教训或踩坑 → 追加到对应的 `memory/*-issue.md` 或 scope `MEMORY.md`"
export function buildTopicIssueTableMarkdown(includeAgentWriteColumn: boolean): string {
  const header = includeAgentWriteColumn
    ? "| 主题 | 路径 | Agent 可写 |\n|------|------|------------|"
    : "| 主题 | 路径 |\n|------|------|"

  const dingtalkRow = includeAgentWriteColumn
    ? `| 钉钉 / dws / connector / bot | [\`${TOPIC_ISSUE_FILES.dingtalk}\`](${TOPIC_ISSUE_FILES.dingtalk}) | 是 |`
    : `| 钉钉 / dws / connector / bot | [\`${TOPIC_ISSUE_FILES.dingtalk}\`](${TOPIC_ISSUE_FILES.dingtalk}) |`

  const musaRow = includeAgentWriteColumn
    ? `| MUSA 栈（驱动、容器、torch_musa、mthreads-gmi 等） | [\`${TOPIC_ISSUE_FILES.musaStack}\`](${TOPIC_ISSUE_FILES.musaStack}) | 是 |`
    : `| MUSA 栈 | [\`${TOPIC_ISSUE_FILES.musaStack}\`](${TOPIC_ISSUE_FILES.musaStack}) |`

  const openclawRow = includeAgentWriteColumn
    ? `| OpenClaw / gateway / plugins / agent runtime | [\`${TOPIC_ISSUE_FILES.openclaw}\`](${TOPIC_ISSUE_FILES.openclaw}) | 是 |`
    : `| OpenClaw / gateway / plugins | [\`${TOPIC_ISSUE_FILES.openclaw}\`](${TOPIC_ISSUE_FILES.openclaw}) |`

  const scopeRow = includeAgentWriteColumn
    ? "| 用户/群偏好、「记住这个」、会话纠错 | 当前 scope `MEMORY.md` 或日记 | 是 |"
    : ""

  const rows = [dingtalkRow, musaRow, openclawRow, scopeRow].filter(Boolean).join("\n")
  return `${header}\n${rows}`
}

export const TOPIC_ISSUE_FORMAT_LINE = `推荐条目格式：**${TOPIC_ISSUE_FORMAT_HINT}**。`

export const MEMORY_SEARCH_DISCIPLINE = `- \`memory_search\` / \`memory_get\` 可能返回其他用户或群的片段。
- 不得把那些结果当作当前会话的偏好、红线或规则。`

export const ROOT_MEMORY_WRITE_BAN = `- Agent 不得以任何方式追加、编辑或写入根 \`MEMORY.md\`（标记段内外均禁止，包括新建 \`##\` 小节）。
- 根 \`MEMORY.md\` 仅由人工维护；Agent 不得自封维护者。
- 即便是「大家都该知道」的内容，也不要写根 \`MEMORY.md\`；写入专题踩坑文件或 scope 记忆，并请用户让维护者审核是否适合全工作区共享。`
