/**
 * Shared DingTalk markdown helpers.
 * Last-mile for AI Card body and markdown send: CommonMark soft breaks → paragraphs.
 */

const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

function isTableLine(line: string): boolean {
  if (TABLE_DIVIDER_RE.test(line)) return true;
  return /^\s*\|/.test(line) && line.includes("|", line.indexOf("|") + 1);
}

function hardenOutsideFences(chunk: string): string {
  const lines = chunk.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (i === lines.length - 1) break;
    const cur = lines[i];
    const next = lines[i + 1];
    if (cur === "" || next === "") continue;
    if (isTableLine(cur) && isTableLine(next)) continue;
    out.push("");
  }
  let result = out.join("\n");
  if (result.endsWith("\n") && !result.endsWith("\n\n") && result.trim() !== "") {
    result += "\n";
  }
  return result;
}

/**
 * DingTalk collapses CommonMark soft breaks (single `\n`) into a space.
 * Turn those into paragraph breaks so multi-line Markdown matches editor UX.
 * Fenced code blocks and GFM table rows are left untouched.
 */
export function hardenMarkdownLineBreaks(markdown: string): string {
  return String(markdown || "")
    .split(/(```[\s\S]*?```)/g)
    .map((chunk) => (chunk.startsWith("```") ? chunk : hardenOutsideFences(chunk)))
    .join("");
}
