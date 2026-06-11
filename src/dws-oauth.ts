/**
 * Per-senderId dws OAuth: thin facade over src/dws-auth/* (Phase 1.5).
 */

import { parseDwsAuthError, parseDeviceLoginOutput } from "./dws-auth/auth-error.ts";
import { ensureDwsAuth } from "./dws-auth/gate.ts";
import { readDenialCache } from "./dws-auth/denial-cache.ts";
import { parseLoginDenial } from "./dws-auth/denial-parser.ts";
import { pushBlockedMessage, pushMismatchMessage } from "./dws-auth/messages.ts";
import {
  clearLoginSession,
  ensureDwsLoginAndNotify,
  resetSessionStateForTests,
  setMismatchCooldown,
} from "./dws-auth/session.ts";
import {
  isSenderAuthenticated,
  queryDwsAuthStatus,
  resetAuthStatusCacheForTests,
} from "./dws-auth/status-cache.ts";
import { MISMATCH_COOLDOWN_MS, sessionKey } from "./dws-auth/constants.ts";
import type {
  DwsAuthErrorKind,
  EnsureDwsAuthParams,
  EnsureDwsAuthResult,
} from "./dws-auth/types.ts";
import type { DingtalkConfig } from "./types/index.ts";

export type { DwsAuthErrorKind, EnsureDwsAuthParams, EnsureDwsAuthResult };

export { parseDwsAuthError, parseDeviceLoginOutput, parseLoginDenial };
export { ensureDwsAuth, ensureDwsLoginAndNotify, queryDwsAuthStatus, isSenderAuthenticated };

export async function handleDwsAuthCommandOutput(params: {
  output?: string;
  exitCode?: number | null;
  phase?: string;
  senderId: string;
  accountId?: string;
  config: DingtalkConfig;
  isDirect: boolean;
  conversationId: string;
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}): Promise<void> {
  if (params.phase !== "end") {
    return;
  }
  const kind = parseDwsAuthError(params.output, params.exitCode ?? null);
  if (!kind) {
    return;
  }
  params.log?.info?.(
    `[DingTalk][dws-oauth] auth error detected kind=${kind} exitCode=${params.exitCode ?? "null"} senderId=${params.senderId}`,
  );

  const ctx = {
    senderId: params.senderId,
    accountId: params.accountId,
    config: params.config,
    isDirect: params.isDirect,
    conversationId: params.conversationId,
    log: params.log,
  };

  if (kind === "identity_mismatch") {
    const key = sessionKey(params.senderId, params.accountId);
    clearLoginSession(key);
    setMismatchCooldown(key, Date.now() + MISMATCH_COOLDOWN_MS);
    await pushMismatchMessage(ctx);
    return;
  }

  if (kind === "token_expired") {
    await ensureDwsLoginAndNotify(ctx);
    return;
  }

  const denial = await readDenialCache(params.senderId);
  if (denial) {
    await pushBlockedMessage(ctx, denial);
    return;
  }
  await ensureDwsLoginAndNotify(ctx);
}

/** @internal test helper */
export function _resetDwsOAuthStateForTests(): void {
  resetSessionStateForTests();
  resetAuthStatusCacheForTests();
}
