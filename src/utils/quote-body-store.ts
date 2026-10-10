/**
 * Outbound message body cache for quote hydration.
 *
 * DingTalk quote payloads are incomplete for robot "card-like" messages:
 * - AI Card → interactiveCard (may include cardContent)
 * - sampleMarkdown → often only the title as text
 *
 * We remember full outbound text keyed by processQueryKey / msgId / cardInstanceId
 * so inbound quotes can be normalized to a single readable `[引用] …` form.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type QuoteBodyKeys = {
  processQueryKey?: string;
  msgId?: string;
  cardInstanceId?: string;
};

type QuoteBodyRecord = {
  text: string;
  title?: string;
  source?: string;
  savedAt: number;
};

type StoreFile = {
  byKey: Record<string, QuoteBodyRecord>;
};

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

function defaultStorePath(): string {
  return path.join(os.homedir(), ".openclaw", "dingtalk-quote-bodies.json");
}

function normalizeKey(raw: string | undefined | null): string | null {
  const key = String(raw ?? "").trim();
  return key ? key : null;
}

function collectKeys(keys: QuoteBodyKeys): string[] {
  const out: string[] = [];
  for (const value of [keys.processQueryKey, keys.msgId, keys.cardInstanceId]) {
    const key = normalizeKey(value);
    if (key) out.push(key);
  }
  return out;
}

export class QuoteBodyStore {
  private readonly filePath: string;

  constructor(filePath = defaultStorePath()) {
    this.filePath = filePath;
  }

  remember(keys: QuoteBodyKeys, text: string, meta?: { title?: string; source?: string }): void {
    const body = String(text ?? "").trim();
    if (!body) return;
    const keyList = collectKeys(keys);
    if (keyList.length === 0) return;

    const data = this.read();
    const record: QuoteBodyRecord = {
      text: body,
      title: meta?.title?.trim() || undefined,
      source: meta?.source,
      savedAt: Date.now(),
    };
    for (const key of keyList) {
      data.byKey[key] = record;
    }
    this.prune(data);
    this.write(data);
  }

  lookup(keys: QuoteBodyKeys): string | null {
    const data = this.read();
    const now = Date.now();
    for (const key of collectKeys(keys)) {
      const record = data.byKey[key];
      if (!record?.text) continue;
      if (now - record.savedAt > TTL_MS) {
        delete data.byKey[key];
        continue;
      }
      return record.text;
    }
    return null;
  }

  /** Test helper */
  clear(): void {
    this.write({ byKey: {} });
  }

  private prune(data: StoreFile): void {
    const now = Date.now();
    for (const [key, record] of Object.entries(data.byKey)) {
      if (!record?.text || now - record.savedAt > TTL_MS) {
        delete data.byKey[key];
      }
    }
    const entries = Object.entries(data.byKey).sort((a, b) => a[1].savedAt - b[1].savedAt);
    if (entries.length <= MAX_ENTRIES) return;
    for (const [key] of entries.slice(0, entries.length - MAX_ENTRIES)) {
      delete data.byKey[key];
    }
  }

  private read(): StoreFile {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      if (!parsed?.byKey || typeof parsed.byKey !== "object") return { byKey: {} };
      return parsed;
    } catch {
      return { byKey: {} };
    }
  }

  private write(data: StoreFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(data)}\n`, "utf8");
  }
}

let defaultStore: QuoteBodyStore | null = null;

export function getQuoteBodyStore(): QuoteBodyStore {
  if (!defaultStore) defaultStore = new QuoteBodyStore();
  return defaultStore;
}

/** Test-only override */
export function setQuoteBodyStoreForTest(store: QuoteBodyStore | null): void {
  defaultStore = store;
}

export function rememberQuoteBody(
  keys: QuoteBodyKeys,
  text: string,
  meta?: { title?: string; source?: string },
): void {
  getQuoteBodyStore().remember(keys, text, meta);
}

export function lookupQuoteBody(keys: QuoteBodyKeys): string | null {
  return getQuoteBodyStore().lookup(keys);
}
