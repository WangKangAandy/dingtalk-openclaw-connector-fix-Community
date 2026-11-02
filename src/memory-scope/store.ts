import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import type { DatabaseSync as Database } from "node:sqlite"
import { assertScopeGrant, type ScopeGrant, type ScopeOperation } from "./authority.ts"
// Vite 5 strips the mandatory node: prefix from newer builtins; always load the real builtin.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite")

export type MemoryRecord = Readonly<{ key: string; value: string | null; revision: number;
  deleted: boolean; updatedAt: number; actorId: string }>
type Row = { key: string; value: string | null; revision: number; deleted: number; updated_at: number; actor_id: string }
const MAX_RECORD_BYTES = 64 * 1024
const MAX_RECORDS = 1000
const MAX_SCOPE_BYTES = 8 * 1024 * 1024

function key(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 256 || value !== value.trim()
    || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) throw new Error("Invalid memory key")
}

function record(row: Row | undefined): MemoryRecord | null {
  return row ? Object.freeze({ key: row.key, value: row.value, revision: Number(row.revision),
    deleted: row.deleted === 1, updatedAt: Number(row.updated_at), actorId: row.actor_id }) : null
}

/** Reject aliases rather than silently following a moved/symlinked private store. */
function checkPath(target: string, file = false): void {
  const parsed = path.parse(target)
  let current = parsed.root
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try {
      const stat = fs.lstatSync(current)
      const leafFile = current === target && file
      if (stat.isSymbolicLink() || (leafFile ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
        throw new Error("Linked or unexpected private memory path")
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
}

/**
 * One DB per granted namespace; no user-selected path/database and no shared search corpus.
 * root MUST be outside agent-visible filesystem/sandbox mounts. That is a runtime gate,
 * not something file permissions or this class can guarantee against unrestricted exec.
 */
export class ScopedMemoryStore {
  readonly root: string
  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error("Private memory root must be absolute")
    this.root = path.resolve(root)
    checkPath(this.root)
  }

  private access<T>(grant: ScopeGrant, operation: ScopeOperation, effect: (db: Database) => T): T {
    assertScopeGrant(grant, operation)
    checkPath(this.root)
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 })
    const file = path.join(this.root, `${grant.namespace}.sqlite`)
    for (const suffix of ["", "-journal", "-wal", "-shm"]) checkPath(file + suffix, true)
    // Exact file creation avoids SQLite's default umask-derived mode on the initial database.
    try { fs.closeSync(fs.openSync(file, "wx", 0o600)) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    checkPath(file, true)
    const db = new DatabaseSync(file)
    try {
      db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;")
      db.exec("BEGIN IMMEDIATE")
      try {
        const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)
        if (version !== 0 && version !== 1) throw new Error("Unsupported memory database version")
        const identity = JSON.stringify(grant.identity)
        if (version === 0) {
          if (db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
            throw new Error("Unrecognized memory database schema")
          }
          db.exec(`CREATE TABLE scope_identity (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL);
          CREATE TABLE memories (key TEXT PRIMARY KEY, value TEXT, revision INTEGER NOT NULL,
            deleted INTEGER NOT NULL CHECK(deleted IN (0,1)), updated_at INTEGER NOT NULL, actor_id TEXT NOT NULL);
          CREATE TABLE sequence (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
          INSERT INTO sequence VALUES(1,0); PRAGMA user_version=1;`)
          db.prepare("INSERT INTO scope_identity VALUES(1,?)").run(identity)
        }
        // An initialized store must never self-heal lost tables/metadata into an
        // empty memory or reset its CAS sequence. Fail before any read or write.
        const existing = db.prepare("SELECT identity FROM scope_identity WHERE id=1").get() as { identity: string } | undefined
        if (!existing || existing.identity !== identity) throw new Error("Stored scope identity mismatch")
        const sequence = db.prepare("SELECT value FROM sequence WHERE id=1").get() as { value: number } | undefined
        const maximum = db.prepare("SELECT coalesce(max(revision),0) AS value FROM memories").get() as { value: number }
        if (!sequence || !Number.isSafeInteger(sequence.value) || sequence.value < maximum.value || sequence.value < 0) {
          throw new Error("Invalid memory revision sequence")
        }
        const result = effect(db)
        // Check after any computation/IO, immediately before publishing the transaction/result.
        assertScopeGrant(grant, operation)
        db.exec("COMMIT")
        return result
      } catch (error) { db.exec("ROLLBACK"); throw error }
    } finally { db.close() }
  }

  get(grant: ScopeGrant, name: string): MemoryRecord | null {
    key(name)
    return this.access(grant, "memory.read", db => record(db.prepare("SELECT * FROM memories WHERE key=?").get(name) as Row | undefined))
  }

  list(grant: ScopeGrant, options: { after?: string; limit?: number; includeDeleted?: boolean } = {}): MemoryRecord[] {
    const limit = options.limit ?? 50
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid memory page limit")
    if (options.after !== undefined) key(options.after)
    return this.access(grant, "memory.list", db => (db.prepare(
      "SELECT * FROM memories WHERE key > ? AND (? = 1 OR deleted=0) ORDER BY key LIMIT ?"
    ).all(options.after ?? "", options.includeDeleted ? 1 : 0, limit) as Row[]).map(r => record(r)!))
  }

  search(grant: ScopeGrant, query: string, limit = 20): MemoryRecord[] {
    if (typeof query !== "string" || !query.trim() || query.length > 512) throw new Error("Invalid memory query")
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid memory result limit")
    // Literal lexical matching: no SQL/FTS query syntax, regex, or model-chosen global index.
    return this.access(grant, "memory.search", db => (db.prepare(
      "SELECT * FROM memories WHERE deleted=0 AND (instr(lower(key), lower(?))>0 OR instr(lower(value), lower(?))>0) ORDER BY updated_at DESC, key LIMIT ?"
    ).all(query, query, limit) as Row[]).map(r => record(r)!))
  }

  put(grant: ScopeGrant, name: string, value: string, expectedRevision: number | null): MemoryRecord {
    if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_RECORD_BYTES
      || /[\ud800-\udfff]/u.test(value)) throw new Error("Invalid or oversized memory value")
    return this.mutate(grant, name, value, expectedRevision)
  }

  delete(grant: ScopeGrant, name: string, expectedRevision: number): MemoryRecord {
    return this.mutate(grant, name, null, expectedRevision)
  }

  private mutate(grant: ScopeGrant, name: string, value: string | null, expectedRevision: number | null): MemoryRecord {
    key(name)
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) throw new Error("Expected revision is required")
    if (value === null && expectedRevision === null) throw new Error("Delete requires an existing revision")
    return this.access(grant, value === null ? "memory.delete" : "memory.write", db => {
      const previous = db.prepare("SELECT * FROM memories WHERE key=?").get(name) as Row | undefined
      if ((previous ? Number(previous.revision) : null) !== expectedRevision) throw new Error("Memory revision conflict")
      const totals = db.prepare("SELECT count(*) AS count, coalesce(sum(length(cast(value AS BLOB))),0) AS bytes FROM memories").get() as { count: number; bytes: number }
      if (!previous && Number(totals.count) >= MAX_RECORDS) throw new Error("Memory record limit exceeded")
      if (Number(totals.bytes) - Buffer.byteLength(previous?.value ?? "", "utf8") + Buffer.byteLength(value ?? "", "utf8") > MAX_SCOPE_BYTES) {
        throw new Error("Memory scope byte limit exceeded")
      }
      db.prepare("UPDATE sequence SET value=value+1 WHERE id=1").run()
      const revision = Number((db.prepare("SELECT value FROM sequence WHERE id=1").get() as { value: number }).value)
      if (!Number.isSafeInteger(revision)) throw new Error("Memory revision exhausted")
      db.prepare("INSERT INTO memories VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, revision=excluded.revision, deleted=excluded.deleted, updated_at=excluded.updated_at, actor_id=excluded.actor_id")
        .run(name, value, revision, value === null ? 1 : 0, Date.now(), grant.actorId)
      return record(db.prepare("SELECT * FROM memories WHERE key=?").get(name) as Row)!
    })
  }
}
