import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type DenialCacheEntry = {
  senderId: string;
  denialReason: string;
  message: string;
  recordedAt: string;
};

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const LEGACY_DENIAL_DIR = path.join(os.homedir(), ".dws", "cache", "denial");
const DENIAL_DIR = path.join(os.homedir(), ".openclaw", "connector", "denial");

export function denialCachePath(senderId: string): string {
  return path.join(DENIAL_DIR, `${senderId}.json`);
}

export function legacyDenialCachePath(senderId: string): string {
  return path.join(LEGACY_DENIAL_DIR, `${senderId}.json`);
}

async function migrateLegacyDenialIfPresent(senderId: string): Promise<void> {
  const current = denialCachePath(senderId);
  const legacy = legacyDenialCachePath(senderId);
  try {
    await fs.access(current);
    return;
  } catch {
    // not at new path
  }
  try {
    const raw = await fs.readFile(legacy, "utf8");
    await fs.mkdir(path.dirname(current), { recursive: true });
    await fs.writeFile(current, raw, "utf8");
    await fs.unlink(legacy);
  } catch {
    // no legacy file
  }
}

export async function readDenialCache(senderId: string): Promise<DenialCacheEntry | null> {
  await migrateLegacyDenialIfPresent(senderId);
  const filePath = denialCachePath(senderId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as DenialCacheEntry;
    if (!parsed?.senderId || !parsed.denialReason) {
      return null;
    }
    if (parsed.recordedAt) {
      const age = Date.now() - new Date(parsed.recordedAt).getTime();
      if (Number.isFinite(age) && age > DEFAULT_TTL_MS) {
        await clearDenialCache(senderId);
        return null;
      }
    }
    return parsed;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

export async function writeDenialCache(entry: DenialCacheEntry): Promise<void> {
  const filePath = denialCachePath(entry.senderId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: DenialCacheEntry = {
    ...entry,
    recordedAt: entry.recordedAt || new Date().toISOString(),
  };
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function clearDenialCache(senderId: string): Promise<boolean> {
  let cleared = false;
  for (const filePath of [denialCachePath(senderId), legacyDenialCachePath(senderId)]) {
    try {
      await fs.unlink(filePath);
      cleared = true;
    } catch (err: unknown) {
      if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
        throw err;
      }
    }
  }
  return cleared;
}

export function isDenialClearPhrase(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.trim();
  return /已加名单请重试/i.test(normalized) || /denial-clear/i.test(normalized);
}
