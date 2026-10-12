import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CardSessionBinding } from "./types.ts";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

export type CardSessionStore = {
  register: (cardInstanceId: string, binding: Omit<CardSessionBinding, "createdAt">) => void;
  lookup: (cardInstanceId: string) => CardSessionBinding | undefined;
  size: () => number;
  clear: () => void;
};

function defaultPersistFile(): string {
  return path.join(os.tmpdir(), "dingtalk-connector", "card-session-map.json");
}

function prune(map: Map<string, CardSessionBinding>, now = Date.now()): void {
  for (const [id, binding] of map) {
    if (now - binding.createdAt > TTL_MS) map.delete(id);
  }
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function persist(file: string, map: Map<string, CardSessionBinding>): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(map)));
    fs.renameSync(tmp, file);
  } catch {
    // Persistence is best-effort; in-memory map still works for this process.
  }
}

function load(file: string, map: Map<string, CardSessionBinding>): void {
  try {
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, CardSessionBinding>;
    const now = Date.now();
    for (const [id, binding] of Object.entries(raw ?? {})) {
      if (!binding?.sessionKey || now - Number(binding.createdAt || 0) > TTL_MS) continue;
      map.set(id, binding);
    }
  } catch {
    // Ignore a corrupt cache; next register will rewrite it.
  }
}

export function createCardSessionStore(opts?: { persistFile?: string }): CardSessionStore {
  const persistFile = opts?.persistFile ?? defaultPersistFile();
  const map = new Map<string, CardSessionBinding>();
  let loaded = false;

  const ensureLoaded = () => {
    if (loaded) return;
    loaded = true;
    load(persistFile, map);
    prune(map);
  };

  return {
    register(cardInstanceId, binding) {
      const id = cardInstanceId.trim();
      if (!id || !binding.sessionKey.trim()) return;
      ensureLoaded();
      prune(map);
      map.set(id, { ...binding, createdAt: Date.now() });
      persist(persistFile, map);
    },
    lookup(cardInstanceId) {
      const id = cardInstanceId.trim();
      if (!id) return undefined;
      ensureLoaded();
      prune(map);
      return map.get(id);
    },
    size() {
      ensureLoaded();
      return map.size;
    },
    clear() {
      map.clear();
      loaded = true;
    },
  };
}

const defaultStore = createCardSessionStore();

export function registerCardSession(
  cardInstanceId: string,
  binding: Omit<CardSessionBinding, "createdAt">,
  store: CardSessionStore = defaultStore,
): void {
  store.register(cardInstanceId, binding);
}

export function lookupCardSession(
  cardInstanceId: string,
  store: CardSessionStore = defaultStore,
): CardSessionBinding | undefined {
  return store.lookup(cardInstanceId);
}
