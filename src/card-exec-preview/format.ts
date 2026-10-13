/** Format OpenClaw progress into card markdown: prose for status, fences for commands. */

const MAX_PROSE = 80;
const MAX_CODE = 400;
const MAX_PROCESS_ENTRIES = 6;

const INTERNAL_TOOLS = new Set([
  "exec",
  "bash",
  "shell",
  "command",
  "process",
  "terminal",
]);

export function clipLine(text: string, max = MAX_PROSE): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (!one) return "";
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

export function formatToolStartLine(payload: {
  name?: string;
  phase?: string;
}): string | null {
  const name = clipLine(payload.name || "", 40);
  if (!name) return null;
  if (INTERNAL_TOOLS.has(name.toLowerCase())) return null;
  const phase = (payload.phase || "").trim();
  if (phase && phase !== "start") return null;
  return `🔧 ${name}…`;
}

export function formatPlanUpdateLine(payload: {
  title?: string;
  explanation?: string;
  phase?: string;
  steps?: string[];
}): string | null {
  const title = clipLine(payload.title || "", 40);
  const explanation = clipLine(payload.explanation || "", 60);
  if (title && explanation) return `📋 ${title} — ${explanation}`;
  if (title) return `📋 ${title}`;
  if (explanation) return `📋 ${explanation}`;
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((s) => clipLine(String(s), 40)).filter(Boolean).slice(0, 3)
    : [];
  if (steps.length) return `📋 ${steps.join(" · ")}`;
  return null;
}

export function formatCommandOutputLine(payload: {
  title?: string;
  name?: string;
  phase?: string;
}): string | null {
  const phase = (payload.phase || "start").trim();
  if (phase && phase !== "start") return null;
  const raw = (payload.title || payload.name || "").trim();
  if (!raw) return null;
  if (looksLikeShellCommand(raw)) {
    return `\`\`\`\n${clipCode(raw)}\n\`\`\``;
  }
  return `⚙ ${clipLine(raw, 40)}…`;
}

export function formatReasoningText(text: string): string {
  return clipLine(text.replace(/\s+/g, " ").trim(), 2000);
}

/** Append a markdown entry (prose or fenced command). Entries separated by a blank line. */
export function appendProcessLine(current: string, entry: string): string {
  const next = entry.trim();
  if (!next) return current;
  const entries = current
    ? current.split(/\n\n+/).map((e) => e.trim()).filter(Boolean)
    : [];
  if (entries[entries.length - 1] === next) return current;
  entries.push(next);
  while (entries.length > MAX_PROCESS_ENTRIES) entries.shift();
  return entries.join("\n\n");
}

function looksLikeShellCommand(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length > 60) return true;
  return (
    t.includes("->") ||
    t.includes("|") ||
    /\$home|\$\{/.test(t) ||
    /\b(sed|echo|grep|awk|find|head|tail|cat|xargs)\b/.test(t) ||
    /\/dev\/|\/tmp\/|\.openclaw\/|\/home\//.test(t) ||
    /\(\+\d+\s*steps?\)/.test(t)
  );
}

function clipCode(text: string, max = MAX_CODE): string {
  const stepped = text
    .replace(/\s+/g, " ")
    .replace(/\s*->\s*/g, "\n  -> ")
    .trim();
  return stepped.length <= max ? stepped : `${stepped.slice(0, max)}…`;
}
