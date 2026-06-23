import fs from "node:fs"
import path from "node:path"

import {
  ROOT_MEMORY_RULES_BEGIN_MARKER,
  ROOT_MEMORY_RULES_END_MARKER,
  ROOT_MEMORY_FILENAME,
} from "./constants.ts"
import { replaceMarkedSection, wrapMarkedSection } from "./marked-section-sync.ts"
import { ROOT_MEMORY_RULES_MARKDOWN } from "./root-memory-rules.ts"

function insertRulesIntoExisting(content: string, wrapped: string): string {
  const trimmed = content.trimStart()
  const titleMatch = /^# .+\n+/.exec(trimmed)
  if (titleMatch) {
    const title = titleMatch[0].trimEnd()
    const rest = trimmed.slice(titleMatch[0].length).replace(/^\n+/, "")
    return rest ? `${title}\n\n${wrapped}\n\n${rest}` : `${title}\n\n${wrapped}\n`
  }
  return `${wrapped}\n\n${trimmed}`
}

function applyRootMemoryRules(content: string, wrapped: string): string {
  if (content.includes(ROOT_MEMORY_RULES_BEGIN_MARKER)) {
    return replaceMarkedSection(content, ROOT_MEMORY_RULES_BEGIN_MARKER, ROOT_MEMORY_RULES_END_MARKER, wrapped)
  }
  return insertRulesIntoExisting(content, wrapped)
}

/**
 * Ensure workspace root MEMORY.md contains the memory-scope rules section.
 * Only the marked region is replaced on update; content outside markers is preserved.
 */
export function ensureRootMemoryScopeSection(
  workspaceDir: string,
  rulesMarkdown: string = ROOT_MEMORY_RULES_MARKDOWN,
): void {
  const absPath = path.resolve(workspaceDir, ROOT_MEMORY_FILENAME)
  const wrapped = wrapMarkedSection(ROOT_MEMORY_RULES_BEGIN_MARKER, ROOT_MEMORY_RULES_END_MARKER, rulesMarkdown)

  const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf8") : ""
  const next = existing.trim()
    ? applyRootMemoryRules(existing, wrapped)
    : `# MEMORY.md - Long-term memory\n\n${wrapped}\n`

  if (next !== existing) {
    fs.writeFileSync(absPath, next.endsWith("\n") ? next : `${next}\n`, "utf8")
  }
}
