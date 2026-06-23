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
  MEMORY_CANONICAL_POINTER,
  REMEMBER_THIS_ROUTING,
  SESSION_MEMORY_PATHS_HEADING,
} from "./memory-rules-shared.ts"
import { wrapMarkedSection } from "./marked-section-sync.ts"

export const AGENTS_SESSION_STARTUP_MEMORY_MARKDOWN = wrapMarkedSection(
  AGENTS_SESSION_STARTUP_BEGIN_MARKER,
  AGENTS_SESSION_STARTUP_END_MARKER,
  `- Root \`MEMORY.md\` (architecture/discipline, marked section) and the current scope \`MEMORY.md\` (both injected at bootstrap; distinguished by full path)
- Daily notes live under the **current scope directory**: \`{scopeDir}/YYYY-MM-DD.md\` (see system prompt "${SESSION_MEMORY_PATHS_HEADING}")`,
)

export const AGENTS_MEMORY_SECTION_MARKDOWN = wrapMarkedSection(
  AGENTS_MEMORY_BEGIN_MARKER,
  AGENTS_MEMORY_END_MARKER,
  `You wake up fresh each session. These files are your continuity:

- **Daily notes:** \`YYYY-MM-DD.md\` under the current scope (see system prompt "${SESSION_MEMORY_PATHS_HEADING}")
- **Long-term:** root \`MEMORY.md\` (rules/discipline) + scope \`MEMORY.md\` (user/group preferences)

Capture what matters. Decisions, context, things to remember. Skip the secrets unless asked to keep them.

**DingTalk memory rules:** ${MEMORY_CANONICAL_POINTER} Agents must not write/edit root \`MEMORY.md\`.

### 📝 Write It Down - No "Mental Notes"!

- **Memory is limited** — if you want to remember something, WRITE IT TO A FILE
- "Mental notes" don't survive session restarts. Files do.
- ${REMEMBER_THIS_ROUTING}
- ${LESSON_ROUTING}
- When you make a mistake → document it so future-you does not repeat it
- **Text > Brain** 📝`,
)

export const AGENTS_HEARTBEAT_PROACTIVE_MARKDOWN = wrapMarkedSection(
  AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_PROACTIVE_END_MARKER,
  `- Read and organize memory files (under the current scope directory)
- Check on projects (git status, etc.)
- Update documentation
- Commit and push your own changes
- Maintain scope daily / scope \`MEMORY.md\` (do not edit root \`MEMORY.md\`)`,
)

export const AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_MARKDOWN = wrapMarkedSection(
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_END_MARKER,
  `Periodically (every few days), use a heartbeat to:

1. Read through recent daily files in the **current scope** directory
2. Identify significant events, lessons, or insights worth keeping long-term
3. Update the **scope** \`MEMORY.md\` with distilled learnings
4. Remove outdated info from scope \`MEMORY.md\` that is no longer relevant
5. Append pitfall notes to \`memory/*-issue.md\` topic files when appropriate

Daily files are raw notes; scope \`MEMORY.md\` is curated wisdom for that user/group.`,
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
