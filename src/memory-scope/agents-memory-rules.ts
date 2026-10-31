/** Markdown blocks synced into workspace/AGENTS.md (marker-gated, refreshed on gateway restart). */
import {
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_END_MARKER,
  AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_PROACTIVE_END_MARKER,
  AGENTS_MEMORY_BEGIN_MARKER,
  AGENTS_MEMORY_END_MARKER,
  AGENTS_SESSION_STARTUP_BEGIN_MARKER,
  AGENTS_SESSION_STARTUP_END_MARKER,
} from "./constants.ts"
import {
  LESSON_ROUTING,
  REMEMBER_THIS_ROUTING,
  SESSION_MEMORY_PATHS_HEADING,
} from "./memory-rules-shared.ts"
import { wrapMarkedSection } from "./marked-section-sync.ts"

export const AGENTS_SESSION_STARTUP_MEMORY_MARKDOWN = wrapMarkedSection(
  AGENTS_SESSION_STARTUP_BEGIN_MARKER,
  AGENTS_SESSION_STARTUP_END_MARKER,
  `- 根目录 \`MEMORY.md\`（架构/纪律，标记段）与当前 scope 的 \`MEMORY.md\`（均在 bootstrap 注入；以完整路径区分）
- 日记在**当前 scope 目录**下：\`{scopeDir}/YYYY-MM-DD.md\`（见系统提示「${SESSION_MEMORY_PATHS_HEADING}」）`,
)

export const AGENTS_MEMORY_SECTION_MARKDOWN = wrapMarkedSection(
  AGENTS_MEMORY_BEGIN_MARKER,
  AGENTS_MEMORY_END_MARKER,
  `- **日记：** 当前 scope 下的 \`YYYY-MM-DD.md\`（见系统提示「${SESSION_MEMORY_PATHS_HEADING}」）
- **长期：** 根 \`MEMORY.md\`（规则/纪律）+ scope \`MEMORY.md\`（用户/群偏好）

#### 写下来 —— 不要只靠「心里记着」

- **记忆有限** — 要记住的事，写进文件
- 「心里记着」撑不过会话重启；文件可以
- ${REMEMBER_THIS_ROUTING}
- ${LESSON_ROUTING}
- 犯了错 → 记下来，避免以后再犯`,
)

export const AGENTS_HEARTBEAT_PROACTIVE_MARKDOWN = wrapMarkedSection(
  AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_PROACTIVE_END_MARKER,
  `- 整理当前 scope 下的记忆文件
- 查看项目状态（如 git status）
- 更新文档
- 提交并推送自己的改动
- 维护 scope 日记 / scope \`MEMORY.md\`（不要改根 \`MEMORY.md\`）`,
)

export const AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_MARKDOWN = wrapMarkedSection(
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_END_MARKER,
  `每隔几天，可借心跳做一次：

1. 通读**当前 scope** 目录下近期日记
2. 提炼值得长期保留的事件、教训或洞察
3. 把精华写入 **scope** \`MEMORY.md\`
4. 用编辑更新 scope \`MEMORY.md\`，去掉已过时表述（禁止删除文件）
5. 合适时把踩坑记追加到 \`memory/*-issue.md\`

日记是原始笔记；scope \`MEMORY.md\` 是该用户/群的精选要点。`,
)

/** OpenClaw default bullets replaced during first-time AGENTS sync. */
export const LEGACY_SESSION_STARTUP_MEMORY_BULLETS =
  "- recent daily memory such as `memory/YYYY-MM-DD.md`\n- `MEMORY.md` when this is the main session"

/** All marker-wrapped AGENTS blocks refreshed on gateway restart (after first install). */
export const AGENTS_MARKED_SECTIONS = [
  {
    begin: AGENTS_SESSION_STARTUP_BEGIN_MARKER,
    end: AGENTS_SESSION_STARTUP_END_MARKER,
    wrapped: AGENTS_SESSION_STARTUP_MEMORY_MARKDOWN,
  },
  {
    begin: AGENTS_MEMORY_BEGIN_MARKER,
    end: AGENTS_MEMORY_END_MARKER,
    wrapped: AGENTS_MEMORY_SECTION_MARKDOWN,
  },
  {
    begin: AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER,
    end: AGENTS_HEARTBEAT_PROACTIVE_END_MARKER,
    wrapped: AGENTS_HEARTBEAT_PROACTIVE_MARKDOWN,
  },
  {
    begin: AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER,
    end: AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_END_MARKER,
    wrapped: AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_MARKDOWN,
  },
] as const
