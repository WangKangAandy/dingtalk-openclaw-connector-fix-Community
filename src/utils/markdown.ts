/**
 * Shared DingTalk markdown helpers.
 * Call sites stay narrow (currently org-events deliver only) to avoid changing Agent replies.
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
