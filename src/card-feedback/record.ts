import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CardFeedbackAction, CardFeedbackLog } from "./types.ts";
import { lookupCardSession, type CardSessionStore } from "./session-map.ts";

function openclawHome(): string {
  return process.env.OPENCLAW_HOME?.trim() || path.join(os.homedir(), ".openclaw");
}

function resolveSessionFile(sessionKey: string, agentId?: string): string | undefined {
  const agentsRoot = path.join(openclawHome(), "agents");
  const candidates = agentId
    ? [path.join(agentsRoot, agentId, "sessions", "sessions.json")]
    : [];
  if (!agentId) {
    try {
      for (const name of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
        if (name.isDirectory()) {
          candidates.push(path.join(agentsRoot, name.name, "sessions", "sessions.json"));
        }
      }
    } catch {
      return undefined;
    }
  }

  for (const indexPath of candidates) {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, { sessionFile?: string }>;
      const entry = index[sessionKey];
      if (!entry?.sessionFile) continue;
      return path.isAbsolute(entry.sessionFile)
        ? entry.sessionFile
        : path.join(path.dirname(indexPath), entry.sessionFile);
    } catch {
      continue;
    }
  }
  return undefined;
}

function patchSessionJsonl(
  sessionFile: string,
  match: (row: Record<string, unknown>) => boolean,
  patch: (row: Record<string, unknown>) => void,
): boolean {
  const raw = fs.readFileSync(sessionFile, "utf8");
  const lines = raw.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      if (match(JSON.parse(line) as Record<string, unknown>)) {
        idx = i;
        break;
      }
    } catch {
      continue;
    }
  }
  if (idx < 0) return false;

  const row = JSON.parse(lines[idx]!) as Record<string, unknown>;
  patch(row);
  lines[idx] = JSON.stringify(row);
  const tmp = `${sessionFile}.tmp`;
  fs.writeFileSync(tmp, `${lines.join("\n")}\n`, "utf8");
  fs.renameSync(tmp, sessionFile);
  return true;
}

function isTextAssistant(row: Record<string, unknown>): boolean {
  if (row.type !== "message") return false;
  const message = row.message as { role?: string; content?: unknown } | undefined;
  if (message?.role !== "assistant") return false;
  const content = message.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) =>
      part &&
      typeof part === "object" &&
      (part as { type?: string }).type === "text" &&
      String((part as { text?: string }).text || "").trim(),
  );
}

/**
 * At card finish: stamp cardInstanceId onto the assistant turn just written for this reply.
 */
export function attachCardInstanceId(
  cardInstanceId: string,
  binding: { sessionKey: string; agentId?: string },
  opts?: { log?: CardFeedbackLog },
): boolean {
  const id = cardInstanceId.trim();
  if (!id || !binding.sessionKey.trim()) return false;
  const sessionFile = resolveSessionFile(binding.sessionKey, binding.agentId);
  if (!sessionFile) {
    opts?.log?.warn?.(`[card-feedback] session file missing for ${binding.sessionKey}`);
    return false;
  }
  try {
    const ok = patchSessionJsonl(sessionFile, isTextAssistant, (row) => {
      row.cardInstanceId = id;
    });
    if (!ok) opts?.log?.warn?.(`[card-feedback] no assistant message to attach ${id}`);
    return ok;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] attach cardInstanceId failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * On like/dislike: update feedback on the assistant row that already has this cardInstanceId.
 */
export async function recordFeedbackToSession(
  action: CardFeedbackAction,
  opts?: { store?: CardSessionStore; log?: CardFeedbackLog },
): Promise<boolean> {
  const binding = lookupCardSession(action.outTrackId, opts?.store);
  if (!binding) {
    opts?.log?.warn?.(`[card-feedback] no session for card ${action.outTrackId}`);
    return false;
  }
  const sessionFile = resolveSessionFile(binding.sessionKey, binding.agentId);
  if (!sessionFile) {
    opts?.log?.warn?.(`[card-feedback] session file missing for ${binding.sessionKey}`);
    return false;
  }
  try {
    const ok = patchSessionJsonl(
      sessionFile,
      (row) => row.cardInstanceId === action.outTrackId,
      (row) => {
        row.feedback = {
          like: action.kind === "like" ? 1 : -1,
          updatedAt: new Date().toISOString(),
        };
      },
    );
    if (!ok) {
      opts?.log?.warn?.(`[card-feedback] no assistant row for card ${action.outTrackId}`);
    }
    return ok;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] failed to write feedback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
