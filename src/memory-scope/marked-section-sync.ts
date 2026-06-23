/** Shared helpers for marker-gated markdown sync (MEMORY.md, AGENTS.md). */

export function wrapMarkedSection(beginMarker: string, endMarker: string, body: string): string {
  return `${beginMarker}\n${body.trim()}\n${endMarker}`
}

/**
 * Replace content between begin/end markers. Preserves text before/after with blank-line spacing.
 * Returns content unchanged when markers are missing or malformed.
 */
export function replaceMarkedSection(
  content: string,
  beginMarker: string,
  endMarker: string,
  wrappedSection: string,
): string {
  const begin = content.indexOf(beginMarker)
  const end = content.indexOf(endMarker)
  if (begin === -1 || end === -1 || end < begin) {
    return content
  }

  const afterEnd = end + endMarker.length
  const before = content.slice(0, begin).replace(/\n+$/, "")
  const tail = content.slice(afterEnd).replace(/^\n+/, "")
  const head = before ? `${before}\n\n` : ""
  const middle = `${wrappedSection.trimEnd()}\n`
  return tail ? `${head}${middle}\n${tail}` : `${head}${middle}`
}
