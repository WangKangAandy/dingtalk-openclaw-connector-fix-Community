/** Confirmed outbound quote bodies. Never infer identity from titles or message text. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type QuoteScope = Readonly<{
  accountId: string;
  botId: string;
  sessionKey: string;
  targetKind: "user" | "group";
  targetId: string;
}>;
export type QuoteBodyKeys = { processQueryKey?: string; msgId?: string; cardInstanceId?: string; referenceIds?: string[] };
type QuoteBodyRecord = { scope: QuoteScope; ids: string[]; text: string; title?: string; truncated?: boolean; savedAt: number };
type StoreFile = { version: 1; records: QuoteBodyRecord[] };
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;
const MAX_PER_SCOPE = 200;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 6000;
const empty = (): StoreFile => ({ version: 1, records: [] });

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && value === value.trim() && !value.includes("\0");
}
export function quoteScopeKey(scope?: QuoteScope): string | undefined {
  if (!scope || ![scope.accountId, scope.botId, scope.sessionKey, scope.targetId].every(identifier)
    || !["user", "group"].includes(scope.targetKind)) return undefined;
  return JSON.stringify([scope.accountId, scope.botId, scope.sessionKey, scope.targetKind, scope.targetId]);
}
export function quoteScopeMatchesTarget(scope: QuoteScope | undefined, botId: unknown,
  target: { type: "user"; userId: string } | { type: "group"; openConversationId: string }): boolean {
  return Boolean(quoteScopeKey(scope) && scope!.botId === String(botId ?? "") && scope!.targetKind === target.type
    && scope!.targetId === (target.type === "user" ? target.userId : target.openConversationId));
}
function ids(keys: QuoteBodyKeys): string[] {
  const values = [...new Set([keys.processQueryKey, keys.msgId, keys.cardInstanceId, ...(keys.referenceIds ?? [])].filter(identifier))];
  return values.length <= 16 ? values : [];
}
function bounded(text: string, max: number): string {
  let end = max;
  if (text.length > end && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end);
}

export class QuoteBodyStore {
  constructor(private readonly filePath = path.join(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw"),
    "dingtalk-connector", "quote-context-v1.json")) {}

  remember(scope: QuoteScope, keys: QuoteBodyKeys, text: string, meta?: { title?: string; source?: string }): void {
    const key = quoteScopeKey(scope);
    const aliases = ids(keys);
    if (!key || !aliases.length || typeof text !== "string" || !text.trim()) return;
    const data = this.read();
    const now = Date.now();
    data.records = data.records.filter(r => now - r.savedAt <= TTL_MS);
    // The first supplied identifier names this record; other IDs are aliases.
    // Alias collisions remain distinct records and make lookup fail closed.
    data.records = data.records.filter(r => !(quoteScopeKey(r.scope) === key && r.ids[0] === aliases[0]));
    data.records.push({ scope: { ...scope }, ids: aliases, text: bounded(text.trim(), MAX_TEXT), truncated: text.trim().length > MAX_TEXT,
      title: typeof meta?.title === "string" ? bounded(meta.title, 200) : undefined, savedAt: now });
    const counts = new Map<string, number>();
    data.records = data.records.reverse().filter(r => {
      const s = quoteScopeKey(r.scope)!;
      const n = (counts.get(s) ?? 0) + 1;
      counts.set(s, n);
      return n <= MAX_PER_SCOPE;
    }).slice(0, MAX_ENTRIES).reverse();
    let serialized = JSON.stringify(data);
    while (Buffer.byteLength(serialized) > MAX_BYTES && data.records.length) {
      data.records.shift(); serialized = JSON.stringify(data);
    }
    try { this.write(serialized); } catch { /* A cache failure must not replay a completed send. */ }
  }

  lookupRecord(scope: QuoteScope, keys: QuoteBodyKeys): QuoteBodyRecord | null {
    const key = quoteScopeKey(scope);
    const aliases = ids(keys);
    if (!key || !aliases.length) return null;
    const matches = this.read().records.filter(r => quoteScopeKey(r.scope) === key && Date.now() - r.savedAt <= TTL_MS
      && r.ids.some(id => aliases.includes(id)));
    return matches.length === 1 ? matches[0] : null;
  }
  lookup(scope: QuoteScope, keys: QuoteBodyKeys): string | null { return this.lookupRecord(scope, keys)?.text ?? null; }
  clear(): void { this.write(JSON.stringify(empty())); }

  private read(): StoreFile {
    let fd: number | undefined;
    try {
      if (fs.lstatSync(this.filePath).isSymbolicLink()) return empty();
      fd = fs.openSync(this.filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_BYTES) return empty();
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const n = fs.readSync(fd, bytes, length, bytes.length - length, null);
        if (!n) break;
        length += n;
      }
      if (length > MAX_BYTES) return empty();
      const data = JSON.parse(bytes.subarray(0, length).toString("utf8"));
      // No migration of the old unscoped/title-indexed cache.
      if (data?.version !== 1 || !Array.isArray(data.records) || data.records.length > MAX_ENTRIES) return empty();
      const records = data.records.filter((r: QuoteBodyRecord) => quoteScopeKey(r?.scope) && Array.isArray(r.ids)
        && r.ids.length > 0 && r.ids.length <= 16 && r.ids.every(identifier)
        && typeof r.text === "string" && r.text.length <= MAX_TEXT
        && (r.title === undefined || typeof r.title === "string" && r.title.length <= 200)
        && Number.isFinite(r.savedAt) && r.savedAt <= Date.now());
      return { version: 1, records };
    } catch { return empty(); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  private write(serialized: string): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    try { if (fs.lstatSync(this.filePath).isSymbolicLink()) return; }
    catch (err: any) { if (err.code !== "ENOENT") throw err; }
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, this.filePath);
    } finally { try { fs.unlinkSync(temporary); } catch { /* Already renamed or never created. */ } }
  }
}

let defaultStore: QuoteBodyStore | null = null;
export function getQuoteBodyStore(): QuoteBodyStore { return defaultStore ??= new QuoteBodyStore(); }
export function setQuoteBodyStoreForTest(store: QuoteBodyStore | null): void { defaultStore = store; }
export function rememberQuoteBody(scope: QuoteScope, keys: QuoteBodyKeys, text: string, meta?: { title?: string; source?: string }): void {
  getQuoteBodyStore().remember(scope, keys, text, meta);
}
export function lookupQuoteBody(scope: QuoteScope, keys: QuoteBodyKeys): string | null { return getQuoteBodyStore().lookup(scope, keys); }
export function lookupQuoteRecord(scope: QuoteScope, keys: QuoteBodyKeys): { text: string; title?: string; truncated?: boolean } | null {
  return getQuoteBodyStore().lookupRecord(scope, keys);
}
