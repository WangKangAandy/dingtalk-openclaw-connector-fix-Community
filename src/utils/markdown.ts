/**
 * DingTalk outbound markdown last-mile.
 *
 * Call from send sites only. Idempotent. Do not teach the model blank lines.
 *
 * DingTalk CommonMark treats a single `\n` as a soft break (renders as space).
 * OpenClaw already wrote the newline it wanted; we turn that into a hard break
 * (two trailing spaces) so the line stays a line, without inserting a new paragraph.
 * GFM tables still need a blank line before the header — that is a table rule, not
 * a line-break rule.
 */

const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const TABLE_ROW_RE = /^\s*\|?.*\|.*\|?\s*$/;
const HARD_BREAK = "  ";

function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function isTableLine(line: string): boolean {
  if (TABLE_DIVIDER_RE.test(line)) return true;
  return /^\s*\|/.test(line) && line.includes("|", line.indexOf("|") + 1);
}

function isTableDivider(line: string): boolean {
  return Boolean(line) && line.includes("|") && TABLE_DIVIDER_RE.test(line);
}

/** Block starters that already stack as separate lines in CommonMark. */
function isStructuralLine(line: string): boolean {
  if (isTableLine(line)) return true;
  if (/^\s*```/.test(line)) return true;
  if (/^\s{0,3}#{1,6}\s/.test(line)) return true;
  if (/^\s{0,3}([-*+]|\d+[.)])\s/.test(line)) return true;
  if (/^\s{0,3}>/.test(line)) return true;
  if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
  return false;
}

function isProseLine(line: string): boolean {
  return line !== "" && !isStructuralLine(line);
}

function hardenOutsideFences(chunk: string): string {
  const lines = chunk.split("\n").map(stripCr);
  return lines
    .map((line, i) => {
      const next = lines[i + 1];
      if (next === undefined) return line;
      if (!isProseLine(line) || !isProseLine(next)) return line;
      if (line.endsWith(HARD_BREAK)) return line;
      return line.replace(/[ \t]+$/, "") + HARD_BREAK;
    })
    .join("\n");
}

/**
 * Soft break → CommonMark hard break. Does not insert blank lines.
 * Fenced code and structural rows (tables, lists, headings) are left as-is.
 */
export function hardenMarkdownLineBreaks(markdown: string): string {
  return String(markdown || "")
    .split(/(```[\s\S]*?```)/g)
    .map((chunk) => (chunk.startsWith("```") ? chunk : hardenOutsideFences(chunk)))
    .join("");
}

/**
 * GFM tables need a blank line before the header or DingTalk renders them as text.
 * Only inserts that missing separator; never rewrites table rows.
 */
export function ensureTableBlankLines(text: string): string {
  const lines = String(text || "").split("\n").map(stripCr);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1] ?? "";

    if (
      TABLE_ROW_RE.test(currentLine) &&
      isTableDivider(nextLine) &&
      i > 0 &&
      lines[i - 1].trim() !== "" &&
      !TABLE_ROW_RE.test(lines[i - 1])
    ) {
      result.push("");
    }

    result.push(currentLine);
  }
  return result.join("\n");
}

/** Last-mile pipeline for every DingTalk markdown send. */
export function prepareDingTalkMarkdown(markdown: string): string {
  return ensureTableBlankLines(hardenMarkdownLineBreaks(markdown));
}
