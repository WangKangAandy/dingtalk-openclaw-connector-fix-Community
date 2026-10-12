import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CardFeedbackAction, CardFeedbackLog } from "./types.ts";
import { lookupCardSession, type CardSessionStore } from "./session-map.ts";
import { lookupQuoteBody } from "../utils/quote-body-store.ts";

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

type SessionRow = {
  type?: string;
  message?: { role?: string; content?: unknown };
  feedback?: { like?: number; updatedAt?: string };
  [key: string]: unknown;
};

function assistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && typeof part === "object" && (part as { type?: string }).type === "text")
    .map((part) => String((part as { text?: string }).text || ""))
    .join("\n")
    .trim();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Prefer the assistant turn whose body matches the card; else the latest text assistant turn. */
function findAssistantLineIndex(lines: string[], cardText: string | null): number {
  const needle = cardText ? normalizeText(cardText) : "";
  let lastTextAssistant = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim();
    if (!raw) continue;
    let row: SessionRow;
    try {
      row = JSON.parse(raw) as SessionRow;
    } catch {
      continue;
    }
    if (row.type !== "message" || row.message?.role !== "assistant") continue;
    const text = assistantText(row.message.content);
    if (!text) continue;
    lastTextAssistant = i;
    if (needle && normalizeText(text) === needle) return i;
  }
  return lastTextAssistant;
}

/**
 * Write like/dislike onto the existing assistant message in the session jsonl.
 * No parallel custom user-feedback rows — content/user already live in that transcript.
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

  const feedback = {
    like: action.kind === "like" ? 1 : -1,
    updatedAt: new Date().toISOString(),
  };

  try {
    const raw = await fs.promises.readFile(sessionFile, "utf8");
    const endsWithNewline = raw.endsWith("\n");
    const lines = raw.split("\n");
    // split keeps a trailing empty slot when file ends with \n
    if (endsWithNewline && lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    const cardText = lookupQuoteBody({ cardInstanceId: action.outTrackId });
    const target = findAssistantLineIndex(lines, cardText);
    if (target < 0) {
      opts?.log?.warn?.(
        `[card-feedback] no assistant message to attach feedback for ${action.outTrackId}`,
      );
      return false;
    }

    const row = JSON.parse(lines[target]!) as SessionRow;
    row.feedback = feedback;
    lines[target] = JSON.stringify(row);

    const next = `${lines.join("\n")}\n`;
    const tmp = `${sessionFile}.feedback.tmp`;
    await fs.promises.writeFile(tmp, next, "utf8");
    await fs.promises.rename(tmp, sessionFile);
    return true;
  } catch (err) {
    opts?.log?.warn?.(
      `[card-feedback] failed to attach session feedback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
