/**
 * DingTalk markdown / AI Card helpers shared by proactive send, streaming cards, and org-events.
 */

/**
 * DingTalk collapses CommonMark soft breaks (single `\n`) into a space.
 * Turn those into paragraph breaks so multi-line Markdown matches editor UX.
 * Fenced code blocks are left untouched.
 */
export function hardenMarkdownLineBreaks(markdown: string): string {
  return String(markdown || "")
    .split(/(```[\s\S]*?```)/g)
    .map((chunk) => (chunk.startsWith("```") ? chunk : chunk.replace(/([^\n])\n(?!\n)/g, "$1\n\n")))
    .join("");
}
