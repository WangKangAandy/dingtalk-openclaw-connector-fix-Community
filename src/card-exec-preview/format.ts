/** Format OpenClaw progress events into short, user-safe card text. */

const MAX_LINE = 240;
const MAX_PROCESS_LINES = 12;

export function clipLine(text: string, max = MAX_LINE): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (!one) return "";
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

export function formatToolStartLine(payload: {
  name?: string;
  phase?: string;
}): string | null {
  const name = clipLine(payload.name || "", 80);
  if (!name) return null;
  const phase = (payload.phase || "").trim();
  if (phase && phase !== "start") {
    return clipLine(`🔧 ${name} · ${phase}`);
  }
  return clipLine(`🔧 ${name}…`);
}

export function formatItemEventLine(payload: {
  title?: string;
  name?: string;
  phase?: string;
  status?: string;
  summary?: string;
  progressText?: string;
}): string | null {
  const title = clipLine(payload.title || payload.name || "", 100);
  const detail = clipLine(
    payload.progressText || payload.summary || payload.status || payload.phase || "",
    140,
  );
  if (!title && !detail) return null;
  if (title && detail) return clipLine(`• ${title}: ${detail}`);
  return clipLine(`• ${title || detail}`);
}

export function formatPlanUpdateLine(payload: {
  title?: string;
  explanation?: string;
  phase?: string;
  steps?: string[];
}): string | null {
  const title = clipLine(payload.title || "", 100);
  const explanation = clipLine(payload.explanation || "", 160);
  if (title && explanation) return clipLine(`📋 ${title} — ${explanation}`);
  if (title) return clipLine(`📋 ${title}`);
  if (explanation) return clipLine(`📋 ${explanation}`);
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((s) => clipLine(String(s), 60)).filter(Boolean).slice(0, 4)
    : [];
  if (steps.length) return clipLine(`📋 ${steps.join(" · ")}`);
  return null;
}

export function formatReasoningText(text: string): string {
  return clipLine(text.replace(/\s+/g, " ").trim(), 2000);
}

/** Append a line into a rolling process markdown (newest at bottom). */
export function appendProcessLine(current: string, line: string): string {
  const next = clipLine(line, MAX_LINE);
  if (!next) return current;
  const lines = current
    ? current.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];
  if (lines[lines.length - 1] === next) return current;
  lines.push(next);
  while (lines.length > MAX_PROCESS_LINES) lines.shift();
  return lines.join("\n");
}
