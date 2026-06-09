import fs from "node:fs"
import path from "node:path"

import {
  ROOT_MEMORY_RULES_BEGIN_MARKER,
  ROOT_MEMORY_RULES_END_MARKER,
  ROOT_MEMORY_FILENAME,
} from "./constants.ts"
import { ROOT_MEMORY_RULES_MARKDOWN } from "./root-memory-rules.ts"

function wrapRulesSection(body: string): string {
  return `${ROOT_MEMORY_RULES_BEGIN_MARKER}\n${body.trim()}\n${ROOT_MEMORY_RULES_END_MARKER}`
}

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

function replaceMarkedSection(content: string, wrapped: string): string {
  const begin = content.indexOf(ROOT_MEMORY_RULES_BEGIN_MARKER)
  const end = content.indexOf(ROOT_MEMORY_RULES_END_MARKER)
  if (begin === -1 || end === -1 || end < begin) {
    return insertRulesIntoExisting(content, wrapped)
  }

  const afterEnd = end + ROOT_MEMORY_RULES_END_MARKER.length
  const before = content.slice(0, begin).replace(/\n+$/, "")
  const tail = content.slice(afterEnd).replace(/^\n+/, "")
  const head = before ? `${before}\n\n` : ""
  return tail ? `${head}${wrapped}\n\n${tail}` : `${head}${wrapped}\n`
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
  const wrapped = wrapRulesSection(rulesMarkdown)

  const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf8") : ""
  const next = existing.trim()
    ? replaceMarkedSection(existing, wrapped)
    : `# MEMORY.md - 长期记忆\n\n${wrapped}\n`

  if (next !== existing) {
    fs.writeFileSync(absPath, next.endsWith("\n") ? next : `${next}\n`, "utf8")
  }
}
