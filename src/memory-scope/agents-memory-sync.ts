import fs from "node:fs"
import path from "node:path"

import {
  AGENTS_FILENAME,
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER,
  AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER,
  AGENTS_MEMORY_BEGIN_MARKER,
  AGENTS_SESSION_STARTUP_BEGIN_MARKER,
} from "./constants.ts"
import {
  AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_MARKDOWN,
  AGENTS_HEARTBEAT_PROACTIVE_MARKDOWN,
  AGENTS_MARKED_SECTIONS,
  AGENTS_MEMORY_SECTION_MARKDOWN,
  AGENTS_SESSION_STARTUP_MEMORY_MARKDOWN,
  LEGACY_SESSION_STARTUP_MEMORY_BULLETS,
} from "./agents-memory-rules.ts"
import { replaceMarkedSection } from "./marked-section-sync.ts"

export type AgentsMemorySyncResult = {
  /** Wrote workspace/AGENTS.md */
  applied: boolean
  skipped: boolean
  reason?: "agents-missing" | "memory-section-missing"
}

/** True when AGENTS.md already has memory-scope markers (skips first-install migration only; marked sections still refresh). */
export function agentsMemoryMarkersPresent(content: string): boolean {
  return content.includes(AGENTS_MEMORY_BEGIN_MARKER)
}

function findH2Section(content: string, title: string): { start: number; end: number } | null {
  const re = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, "m")
  const match = re.exec(content)
  if (!match) return null

  const start = match.index
  const afterHeading = start + match[0].length
  const rest = content.slice(afterHeading)
  const nextH2 = rest.search(/^## /m)
  const end = nextH2 === -1 ? content.length : afterHeading + nextH2
  return { start, end }
}

function findH3Section(content: string, title: string): { start: number; end: number } | null {
  const re = new RegExp(`^### ${escapeRegExp(title)}\\s*$`, "m")
  const match = re.exec(content)
  if (!match) return null

  const start = match.index
  const afterHeading = start + match[0].length
  const rest = content.slice(afterHeading)
  const nextSection = rest.search(/^#{2,3} /m)
  const end = nextSection === -1 ? content.length : afterHeading + nextSection
  return { start, end }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function migrateSessionStartupMemory(content: string): string {
  if (content.includes(AGENTS_SESSION_STARTUP_BEGIN_MARKER)) {
    return content
  }

  if (content.includes(LEGACY_SESSION_STARTUP_MEMORY_BULLETS)) {
    return content.replace(
      LEGACY_SESSION_STARTUP_MEMORY_BULLETS,
      `${AGENTS_SESSION_STARTUP_MEMORY_MARKDOWN}\n`,
    )
  }

  const identityBullet = "- `IDENTITY.md`, `AGENTS.md`, `SOUL.md`, and `USER.md`"
  const idx = content.indexOf(identityBullet)
  if (idx === -1) return content

  const insertAt = idx + identityBullet.length
  return (
    content.slice(0, insertAt)
    + "\n"
    + AGENTS_SESSION_STARTUP_MEMORY_MARKDOWN
    + "\n"
    + content.slice(insertAt)
  )
}

function migrateAgentsMemorySection(content: string): string | null {
  const section = findH2Section(content, "Memory")
  if (!section) return null

  const replacement = `## Memory\n\n${AGENTS_MEMORY_SECTION_MARKDOWN}\n\n`
  return content.slice(0, section.start) + replacement + content.slice(section.end)
}

function migrateHeartbeatProactiveWork(content: string): string {
  const heading = "**Proactive work you can do without asking:**"
  const idx = content.indexOf(heading)
  if (idx === -1) return content

  const afterHeading = idx + heading.length
  const bulletMatch = /\n(- .+(?:\n- .+)*)\n/.exec(content.slice(afterHeading))
  if (!bulletMatch || bulletMatch.index === undefined) return content

  const listStart = afterHeading + bulletMatch.index + 1
  const listEnd = listStart + bulletMatch[1]!.length

  if (bulletMatch[1]!.includes(AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER)) {
    return content
  }

  return (
    content.slice(0, listStart)
    + AGENTS_HEARTBEAT_PROACTIVE_MARKDOWN
    + "\n"
    + content.slice(listEnd)
  )
}

function migrateHeartbeatMemoryMaintenance(content: string): string {
  const section = findH3Section(content, "🔄 Memory Maintenance (During Heartbeats)")
  if (!section) return content

  if (content.slice(section.start, section.end).includes(AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER)) {
    return content
  }

  const replacement =
    `### 🔄 Memory Maintenance (During Heartbeats)\n\n${AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_MARKDOWN}\n\n`
  return content.slice(0, section.start) + replacement + content.slice(section.end)
}

function refreshAgentsMarkedSections(content: string): string {
  let next = content
  for (const section of AGENTS_MARKED_SECTIONS) {
    if (next.includes(section.begin)) {
      next = replaceMarkedSection(next, section.begin, section.end, section.wrapped)
    }
  }
  return next
}

/**
 * Sync memory-related AGENTS.md sections.
 * First install migrates legacy OpenClaw text into marked blocks; every gateway start refreshes marked blocks.
 */
export function ensureAgentsMemoryScopeSections(workspaceDir: string): AgentsMemorySyncResult {
  const absPath = path.resolve(workspaceDir, AGENTS_FILENAME)
  if (!fs.existsSync(absPath)) {
    return { applied: false, skipped: true, reason: "agents-missing" }
  }

  const existing = fs.readFileSync(absPath, "utf8")
  let next = existing

  if (!agentsMemoryMarkersPresent(existing)) {
    next = migrateSessionStartupMemory(existing)
    const memoryMigrated = migrateAgentsMemorySection(next)
    if (!memoryMigrated) {
      // TODO: support partial migration with atomic write (session startup / heartbeat without ## Memory).
      return { applied: false, skipped: true, reason: "memory-section-missing" }
    }
    next = memoryMigrated
    next = migrateHeartbeatProactiveWork(next)
    next = migrateHeartbeatMemoryMaintenance(next)
  }

  next = refreshAgentsMarkedSections(next)

  if (next !== existing) {
    fs.writeFileSync(absPath, next.endsWith("\n") ? next : `${next}\n`, "utf8")
  }

  return { applied: next !== existing, skipped: false }
}
