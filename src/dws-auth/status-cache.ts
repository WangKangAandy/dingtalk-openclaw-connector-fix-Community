import { execFile } from "node:child_process";
import { getDwsSpawnEnv } from "../channel.ts";
import { AUTH_STATUS_CACHE_TTL_MS, AUTH_STATUS_TIMEOUT_MS, sessionKey } from "./constants.ts";

type CacheEntry = {
  authenticated: boolean;
  expiresAt: number;
};

const authStatusCache = new Map<string, CacheEntry>();

export function invalidateAuthStatusCache(senderId: string, accountId?: string): void {
  authStatusCache.delete(sessionKey(senderId, accountId));
}

export function resetAuthStatusCacheForTests(): void {
  authStatusCache.clear();
}

async function queryDwsAuthStatusUncached(
  senderId: string,
  accountId?: string,
): Promise<{ authenticated: boolean }> {
  const env = getDwsSpawnEnv(accountId, senderId);
  return new Promise((resolve) => {
    execFile(
      "dws",
      ["auth", "status", "--sender-id", senderId, "--format", "json"],
      { env, timeout: AUTH_STATUS_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({ authenticated: false });
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout)) as { authenticated?: boolean };
          resolve({ authenticated: parsed.authenticated === true });
        } catch {
          resolve({ authenticated: false });
        }
      },
    );
  });
}

export async function queryDwsAuthStatus(
  senderId: string,
  accountId?: string,
): Promise<{ authenticated: boolean }> {
  const key = sessionKey(senderId, accountId);
  const cached = authStatusCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { authenticated: cached.authenticated };
  }

  const result = await queryDwsAuthStatusUncached(senderId, accountId);
  authStatusCache.set(key, {
    authenticated: result.authenticated,
    expiresAt: Date.now() + AUTH_STATUS_CACHE_TTL_MS,
  });
  return result;
}

export async function isSenderAuthenticated(
  senderId: string,
  accountId?: string,
): Promise<boolean> {
  const { authenticated } = await queryDwsAuthStatus(senderId, accountId);
  return authenticated;
}
