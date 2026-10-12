import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

  const entry = {
    type: "custom",
    customType: "user-feedback",
    data: {
      like: action.kind === "like" ? 1 : -1,
      userId: action.userId,
      cardInstanceId: action.outTrackId,
      source: "dingtalk-card",
      ...(action.dislikeReasons ? { dislikeReasons: action.dislikeReasons } : {}),
      ...(action.customDislikeReason ? { customDislikeReason: action.customDislikeReason } : {}),
    },
    id: randomUUID(),
    parentId: null,
    timestamp: new Date().toISOString(),
  };

  try {
    await fs.promises.appendFile(sessionFile, `${JSON.stringify(entry)}\n`);
    return true;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] failed to append session feedback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
