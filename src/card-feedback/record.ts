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

/**
 * Merge like/dislike onto the latest assistant turn in the existing session jsonl.
 * No parallel user-feedback rows — content/user already live in that transcript.
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
    const raw = await fs.promises.readFile(sessionFile, "utf8");
    const lines = raw.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    let target = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      try {
        if (isTextAssistant(JSON.parse(line))) {
          target = i;
          break;
        }
      } catch {
        continue;
      }
    }
    if (target < 0) {
      opts?.log?.warn?.(
        `[card-feedback] no assistant message to attach feedback for ${action.outTrackId}`,
      );
      return false;
    }

    const row = JSON.parse(lines[target]!) as Record<string, unknown>;
    row.feedback = {
      like: action.kind === "like" ? 1 : -1,
      updatedAt: new Date().toISOString(),
    };
    lines[target] = JSON.stringify(row);

    const tmp = `${sessionFile}.feedback.tmp`;
    await fs.promises.writeFile(tmp, `${lines.join("\n")}\n`, "utf8");
    await fs.promises.rename(tmp, sessionFile);
    return true;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] failed to attach session feedback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
