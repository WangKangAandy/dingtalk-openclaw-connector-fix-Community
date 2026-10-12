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

function isTextAssistant(row: {
  type?: string;
  message?: { role?: string; content?: unknown };
}): boolean {
  if (row.type !== "message" || row.message?.role !== "assistant") return false;
  const content = row.message.content;
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

function rewriteSessionLine(
  sessionFile: string,
  match: (row: Record<string, unknown>) => boolean,
  update: (row: Record<string, unknown>) => void,
): boolean {
  const raw = fs.readFileSync(sessionFile, "utf8");
  const lines = raw.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  let target = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (match(row)) {
        target = i;
        break;
      }
    } catch {
      continue;
    }
  }
  if (target < 0) return false;

  const row = JSON.parse(lines[target]!) as Record<string, unknown>;
  update(row);
  lines[target] = JSON.stringify(row);
  const tmp = `${sessionFile}.feedback.tmp`;
  fs.writeFileSync(tmp, `${lines.join("\n")}\n`, "utf8");
  fs.renameSync(tmp, sessionFile);
  return true;
}

/**
 * After a card finishes, stamp cardInstanceId onto the assistant turn just written
 * for this reply. Feedback later updates that same row by cardInstanceId — no guessing.
 */
export function bindCardToAssistantMessage(
  cardInstanceId: string,
  binding: { sessionKey: string; agentId?: string },
  opts?: { log?: CardFeedbackLog },
): boolean {
  const id = cardInstanceId.trim();
  if (!id || !binding.sessionKey.trim()) return false;
  const sessionFile = resolveSessionFile(binding.sessionKey, binding.agentId);
  if (!sessionFile) {
    opts?.log?.warn?.(`[card-feedback] session file missing for bind ${binding.sessionKey}`);
    return false;
  }
  try {
    // Only at finish time: the newest text assistant turn is this card's reply.
    const ok = rewriteSessionLine(
      sessionFile,
      (row) => isTextAssistant(row as { type?: string; message?: { role?: string; content?: unknown } }),
      (row) => {
        row.cardInstanceId = id;
      },
    );
    if (!ok) {
      opts?.log?.warn?.(`[card-feedback] no assistant message to bind card ${id}`);
    }
    return ok;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] failed to bind card ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Merge like/dislike onto the assistant message that already carries this cardInstanceId.
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
    const ok = rewriteSessionLine(
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
      opts?.log?.warn?.(
        `[card-feedback] no message bound to card ${action.outTrackId}`,
      );
    }
    return ok;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] failed to attach session feedback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
