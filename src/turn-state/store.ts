import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// Resolve the Node builtin at runtime (older Vite builtin lists omit sqlite).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type TurnIdentity = { accountId: string; botId: string; conversationId: string; messageId: string; senderId: string };
export type ExecutionState = "not_started" | "running" | "settled" | "failed" | "cancelled" | "unknown";
export type AttemptState = "pending" | "accepted" | "failed" | "unknown";
export type TurnRecord = {
  key: string; owner: string; execution: ExecutionState; closed: number; received_at: number; updated_at: number;
  disposition: "received" | "handled" | "needs_review";
};
const CAPACITY = 10000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
function keyOf(identity: TurnIdentity): string {
  const fields = [identity.accountId, identity.botId, identity.conversationId, identity.messageId, identity.senderId];
  if (!fields.every(s => typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= 1024 && !s.includes("\0"))) {
    throw new Error("Missing trusted identity for DingTalk turn tracking");
  }
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

/** Local receipt ledger. It stores identity hashes and states, never message content or credentials. */
export class TurnStore {
  readonly owner = randomUUID();
  private db: SqliteDatabase;
  private closed = false;
  constructor(file: string, private readonly now: () => number = Date.now) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Turn ledger cannot be a symbolic link");
    } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    this.db = new DatabaseSync(file);
    try {
      fs.chmodSync(file, 0o600);
      this.db.exec("PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      const version = (this.db.prepare("PRAGMA user_version").get() as any).user_version;
      if (version !== 0 && version !== 1) throw new Error("Unsupported DingTalk turn ledger schema");
      this.db.exec(`CREATE TABLE IF NOT EXISTS turns (
        key TEXT PRIMARY KEY, owner TEXT NOT NULL, execution TEXT NOT NULL,
        disposition TEXT NOT NULL, closed INTEGER NOT NULL, received_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        turn_key TEXT NOT NULL, sequence INTEGER NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
        PRIMARY KEY(turn_key,sequence), FOREIGN KEY(turn_key) REFERENCES turns(key)
      );
      CREATE INDEX IF NOT EXISTS turns_retention ON turns(closed,disposition,updated_at);
      PRAGMA user_version=1;`);
    } catch (error) { this.db.close(); throw error; }
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
  claim(identity: TurnIdentity): { key: string; claimed: boolean; record: TurnRecord } {
    const key = keyOf(identity);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.get(key);
      if (previous) { this.db.exec("COMMIT"); return { key, claimed: false, record: previous }; }
      const cutoff = this.now() - RETENTION_MS;
      // Uncertain or unclosed work is never removed to make a replay look new.
      this.db.prepare(`DELETE FROM deliveries WHERE turn_key IN
        (SELECT key FROM turns WHERE closed=1 AND disposition='handled' AND updated_at<?)`).run(cutoff);
      this.db.prepare("DELETE FROM turns WHERE closed=1 AND disposition='handled' AND updated_at<?").run(cutoff);
      if ((this.db.prepare("SELECT COUNT(*) AS n FROM turns").get() as any).n >= CAPACITY) throw new Error("DingTalk turn ledger capacity reached; operator review required");
      const now = this.now();
      this.db.prepare("INSERT INTO turns VALUES(?,?,'not_started','received',0,?,?)").run(key, this.owner, now, now);
      const record = this.get(key)!;
      this.db.exec("COMMIT"); return { key, claimed: true, record };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  get(key: string): TurnRecord | undefined { return this.db.prepare("SELECT * FROM turns WHERE key=?").get(key) as TurnRecord | undefined; }
  execution(key: string, state: ExecutionState): void {
    const before = this.owned(key);
    // Do not erase a failed/unknown result when a later callback returns normally.
    if (["failed", "cancelled", "unknown"].includes(before.execution) && state === "settled") return;
    this.db.prepare("UPDATE turns SET execution=?,updated_at=? WHERE key=?").run(state, this.now(), key);
  }
  beginDelivery(key: string, kind: "text" | "card" | "placeholder" | "media" | "error_notice"): number {
    this.owned(key);
    const row = this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM deliveries WHERE turn_key=?").get(key) as any;
    if (row.n > 256) throw new Error("DingTalk turn delivery budget exceeded");
    this.db.prepare("INSERT INTO deliveries VALUES(?,?,?,'pending')").run(key, row.n, kind);
    return row.n;
  }
  delivery(key: string, sequence: number, state: Exclude<AttemptState,"pending">): void {
    this.owned(key);
    const changed = this.db.prepare("UPDATE deliveries SET state=? WHERE turn_key=? AND sequence=? AND state='pending'").run(state, key, sequence);
    if (!changed.changes) throw new Error("DingTalk delivery attempt is not pending");
  }
  finish(key: string, uncertain = false): void {
    const before = this.owned(key);
    const open = (this.db.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE turn_key=? AND state IN ('pending','unknown')").get(key) as any).n > 0;
    const needsReview = uncertain || open || ["running", "unknown"].includes(before.execution);
    this.db.prepare("UPDATE turns SET execution=?,disposition=?,closed=1,updated_at=? WHERE key=?").run(
      before.execution === "running" ? "unknown" : before.execution,
      needsReview ? "needs_review" : "handled", this.now(), key);
  }
  snapshot(key: string) {
    const turn = this.get(key);
    if (!turn) return undefined;
    const attempts = this.db.prepare("SELECT sequence,kind,state FROM deliveries WHERE turn_key=? ORDER BY sequence").all(key) as Array<{sequence:number;kind:string;state:AttemptState}>;
    const answers = attempts.filter(a => a.kind !== "placeholder" && a.kind !== "error_notice");
    const uncertain = attempts.some(a => a.state === "pending" || a.state === "unknown");
    const accepted = answers.some(a => a.state === "accepted"), failed = answers.some(a => a.state === "failed");
    const delivery = uncertain ? "unknown" : failed ? accepted ? "partial" : "failed" : accepted ? "accepted" : "not_observed";
    return { ...turn, delivery, reviewRequired: turn.closed === 0 || turn.disposition === "needs_review", attempts };
  }
  private owned(key: string): TurnRecord {
    const row = this.get(key);
    if (!row || row.owner !== this.owner || row.closed) throw new Error("DingTalk turn no longer owned by this handler");
    return row;
  }
}
