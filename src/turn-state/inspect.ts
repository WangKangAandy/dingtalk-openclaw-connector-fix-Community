import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTurnSnapshot } from "./store.ts";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export function turnLedgerPath() {
  return path.join(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw"), "dingtalk-connector", "turns-v1.sqlite");
}
export type TurnInspectQuery = { key?: string; limit?: number; before?: string; reviewOnly?: boolean };
export function inspectTurns(query: TurnInspectQuery = {}, file = turnLedgerPath()) {
  if (!query || typeof query !== "object" || Array.isArray(query)
    || Object.keys(query).some(k => !["key", "limit", "before", "reviewOnly"].includes(k))) throw new Error("Invalid turn inspection query");
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Turn limit must be between 1 and 100");
  if (query.key !== undefined && !/^[a-f0-9]{64}$/.test(query.key)) throw new Error("Invalid turn receipt key");
  if (query.reviewOnly !== undefined && typeof query.reviewOnly !== "boolean") throw new Error("Invalid reviewOnly filter");
  const cursor = query.before === undefined ? undefined : /^(\d{1,16}):([a-f0-9]{64})$/.exec(query.before);
  if (query.before !== undefined && (!cursor || !Number.isSafeInteger(Number(cursor[1])))) throw new Error("Invalid turn cursor");
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Turn ledger cannot be a symbolic link"); }
  catch (error: any) { if (error.code === "ENOENT") return { available: false, records: [], nextCursor: null }; throw error; }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN");
    if ((db.prepare("PRAGMA user_version").get() as any).user_version !== 1) throw new Error("Unsupported DingTalk turn ledger schema");
    const conditions: string[] = [], values: (string | number)[] = [];
    if (query.key) { conditions.push("key=?"); values.push(query.key); }
    if (query.reviewOnly) conditions.push("(closed=0 OR disposition='needs_review')");
    if (cursor) { conditions.push("(received_at<? OR (received_at=? AND key<?))"); values.push(Number(cursor[1]), Number(cursor[1]), cursor[2]); }
    const rows = db.prepare(`SELECT key,received_at FROM turns ${conditions.length ? "WHERE "+conditions.join(" AND ") : ""}
      ORDER BY received_at DESC,key DESC LIMIT ?`).all(...values, limit + 1) as Array<{key:string;received_at:number}>;
    const selected = rows.slice(0, limit);
    const records = selected.map(row => {
      const snapshot = readTurnSnapshot(db, row.key)!;
      const { owner, ...publicFields } = snapshot;
      return { ...publicFields,
        lifecycle: snapshot.closed ? "closed" : "open_or_interrupted",
        explanation: snapshot.closed ? "接口确认不等于已读或业务验收" : "无法仅凭账本判定是否仍在执行；核对 Host 运行态，禁止自动重跑",
      };
    });
    const last = selected.at(-1);
    return { available: true, records, nextCursor: rows.length > limit && last ? `${last.received_at}:${last.key}` : null };
  } finally { db.close(); }
}
