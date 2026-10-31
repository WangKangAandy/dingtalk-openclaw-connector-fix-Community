/** Process area: prose for tools/plan, fenced code for the command itself. */

const MAX_PROSE = 80;
const MAX_PROCESS_ENTRIES = 6;

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
  // `exec` is the shell runner; the command fence from onCommandOutput is the row.
  if (name.toLowerCase() === "exec") return null;
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

/** Every command title goes in a fence. Short or long — no ⚙ prose split. */
export function formatCommandOutputLine(payload: {
  title?: string;
  name?: string;
  phase?: string;
}): string | null {
  const phase = (payload.phase || "start").trim();
  if (phase && phase !== "start") return null;
  const raw = (payload.title || payload.name || "").trim();
  if (!raw) return null;
  const body = raw.replace(/\s*->\s*/g, "\n  -> ").trim();
  return `\`\`\`\n${body}\n\`\`\``;
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
