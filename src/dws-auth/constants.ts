export const LOGIN_REUSE_MS = 5 * 60 * 1000;
export const LOGIN_MAX_MS = 10 * 60 * 1000;
export const MISMATCH_COOLDOWN_MS = 2 * 60 * 1000;
export const AUTH_STATUS_TIMEOUT_MS = 15_000;
export const AUTH_STATUS_CACHE_TTL_MS = 30_000;

export const URL_PATTERN = /https?:\/\/[^\s)\]"'<>]+/gi;
export const USER_CODE_PATTERN = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/;

export function sessionKey(senderId: string, accountId?: string): string {
  return `${accountId ?? "default"}:${senderId}`;
}
