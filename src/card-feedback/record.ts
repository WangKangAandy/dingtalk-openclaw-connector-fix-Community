import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { CardFeedbackAction, CardFeedbackLog } from "./types.ts";
import { lookupCardSession, type CardSessionStore } from "./session-map.ts";

const require_ = createRequire(import.meta.url);

/** Durable sidecar for like/dislike alongside OpenClaw agent SQLite transcripts. */
export const CARD_FEEDBACK_SIDECAR = "dingtalk-card-feedback.jsonl";

const SQLITE_SCAN_LIMIT = 120;

type TranscriptMatch = (row: Record<string, unknown>) => boolean;
type TranscriptPatch = (row: Record<string, unknown>) => void;

type PersistResult = {
  sqlite: boolean;
  sidecar: boolean;
};

function openclawHome(): string {
  return process.env.OPENCLAW_HOME?.trim() || path.join(os.homedir(), ".openclaw");
}

export function resolveCardFeedbackSidecarPath(home = openclawHome()): string {
  return path.join(home, CARD_FEEDBACK_SIDECAR);
}

function resolveAgentIds(agentId?: string): string[] {
  if (agentId?.trim()) return [agentId.trim()];
  const agentsRoot = path.join(openclawHome(), "agents");
  try {
    return fs
      .readdirSync(agentsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return ["main"];
  }
}

function resolveAgentSqlitePath(agentId?: string): string | undefined {
  for (const id of resolveAgentIds(agentId)) {
    const dbPath = path.join(openclawHome(), "agents", id, "agent", "openclaw-agent.sqlite");
    if (fs.existsSync(dbPath)) return dbPath;
  }
  return undefined;
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

type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
  exec: (sql: string) => void;
  close: () => void;
};

function openAgentSqlite(dbPath: string): SqliteDatabase | undefined {
  try {
    const mod = require_("node:sqlite") as {
      DatabaseSync: new (
        path: string,
        options?: { timeout?: number },
      ) => SqliteDatabase;
    };
    const db = new mod.DatabaseSync(dbPath, { timeout: 2500 });
    try {
      db.exec("PRAGMA busy_timeout = 2500;");
    } catch {
      // best-effort
    }
    return db;
  } catch {
    return undefined;
  }
}

function patchAgentSqlite(
  sessionKey: string,
  agentId: string | undefined,
  match: TranscriptMatch,
  patch: TranscriptPatch,
): boolean {
  const dbPath = resolveAgentSqlitePath(agentId);
  if (!dbPath) return false;
  const db = openAgentSqlite(dbPath);
  if (!db) return false;
  try {
    const node = db
      .prepare("SELECT current_session_id AS session_id FROM session_nodes WHERE session_key = ?")
      .get(sessionKey) as { session_id?: string } | undefined;
    const sessionId = node?.session_id?.trim();
    if (!sessionId) return false;

    const rows = db
      .prepare(
        `SELECT seq, event_json, event_utf8_bytes
         FROM transcript_events
         WHERE session_id = ?
           AND event_json IS NOT NULL
           AND length(event_json) > 0
         ORDER BY seq DESC
         LIMIT ?`,
      )
      .all(sessionId, SQLITE_SCAN_LIMIT) as Array<{
        seq: number;
        event_json: string;
        event_utf8_bytes: number | null;
      }>;

    for (const row of rows) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(row.event_json) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (!match(event)) continue;
      patch(event);
      const nextJson = JSON.stringify(event);
      // Rewrite event_json only. Keep event_zstd / navigation_json untouched.
      // If OpenClaw already tracked utf8 size, refresh it to the new length;
      // never clear it to NULL.
      if (row.event_utf8_bytes == null) {
        db.prepare(
          `UPDATE transcript_events
           SET event_json = ?
           WHERE session_id = ? AND seq = ?`,
        ).run(nextJson, sessionId, row.seq);
      } else {
        db.prepare(
          `UPDATE transcript_events
           SET event_json = ?, event_utf8_bytes = ?
           WHERE session_id = ? AND seq = ?`,
        ).run(nextJson, Buffer.byteLength(nextJson, "utf8"), sessionId, row.seq);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

function appendSidecar(record: Record<string, unknown>): boolean {
  try {
    const file = resolveCardFeedbackSidecarPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function summarizePersist(result: PersistResult): string {
  return `sqlite=${result.sqlite} sidecar=${result.sidecar}`;
}

/**
 * At card finish: stamp cardInstanceId onto the assistant turn in OpenClaw agent SQLite.
 */
export function attachCardInstanceId(
  cardInstanceId: string,
  binding: { sessionKey: string; agentId?: string },
  opts?: { log?: CardFeedbackLog },
): boolean {
  const id = cardInstanceId.trim();
  if (!id || !binding.sessionKey.trim()) return false;

  let sqlite = false;
  try {
    sqlite = patchAgentSqlite(binding.sessionKey, binding.agentId, isTextAssistant, (row) => {
      row.cardInstanceId = id;
    });
  } catch {
    sqlite = false;
  }

  const sidecar = appendSidecar({
    ts: new Date().toISOString(),
    op: "attach",
    cardInstanceId: id,
    sessionKey: binding.sessionKey,
    agentId: binding.agentId ?? null,
    persisted: { sqlite },
  });

  const ok = sqlite || sidecar;
  if (!sqlite) {
    opts?.log?.warn?.(
      `[card-feedback] attach ${id}: no transcript row patched (${summarizePersist({ sqlite, sidecar })})`,
    );
  } else {
    opts?.log?.info?.(
      `[card-feedback] attached ${id} (${summarizePersist({ sqlite, sidecar })})`,
    );
  }
  return ok;
}

/**
 * On like/dislike: update feedback on the assistant row stamped with this cardInstanceId.
 * Always appends `dingtalk-card-feedback.jsonl` for durable sidecar consumers.
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

  const feedback = {
    like: action.kind === "like" ? 1 : -1,
    updatedAt: new Date().toISOString(),
  };

  let sqlite = false;
  try {
    sqlite = patchAgentSqlite(
      binding.sessionKey,
      binding.agentId,
      (row) => row.cardInstanceId === action.outTrackId,
      (row) => {
        row.feedback = feedback;
      },
    );
  } catch {
    sqlite = false;
  }

  const sidecar = appendSidecar({
    ts: feedback.updatedAt,
    op: "feedback",
    kind: action.kind,
    outTrackId: action.outTrackId,
    sessionKey: binding.sessionKey,
    agentId: binding.agentId ?? null,
    feedback,
    persisted: { sqlite },
  });

  const result: PersistResult = { sqlite, sidecar };
  if (!sqlite && !sidecar) {
    opts?.log?.warn?.(
      `[card-feedback] failed to persist ${action.kind} for ${action.outTrackId} (${summarizePersist(result)})`,
    );
    return false;
  }
  if (!sqlite) {
    opts?.log?.warn?.(
      `[card-feedback] transcript miss for ${action.outTrackId}; wrote sidecar (${summarizePersist(result)})`,
    );
  } else {
    opts?.log?.info?.(
      `[card-feedback] recorded ${action.kind} for ${action.outTrackId} (${summarizePersist(result)})`,
    );
  }
  return true;
}
