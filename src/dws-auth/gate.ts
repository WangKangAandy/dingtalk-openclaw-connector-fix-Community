import {
  clearDenialCache,
  isDenialClearPhrase,
  readDenialCache,
} from "./denial-cache.ts";
import {
  LOGIN_REUSE_MS,
  sessionKey,
} from "./constants.ts";
import { pushAuthLinkMessage, pushBlockedMessage } from "./messages.ts";
import { ensureDwsLoginAndNotify, getLoginSession, getMismatchCooldownUntil } from "./session.ts";
import { queryDwsAuthStatus } from "./status-cache.ts";
import type { EnsureDwsAuthParams, EnsureDwsAuthResult } from "./types.ts";

/**
 * Pre-flight Gate (B 主路径): status → DenialCache → in-flight / mismatch → spawn login.
 */
export async function ensureDwsAuth(params: EnsureDwsAuthParams): Promise<EnsureDwsAuthResult> {
  const { senderId, accountId, userMessage, log } = params;
  const key = sessionKey(senderId, accountId);

  if (isDenialClearPhrase(userMessage)) {
    const cleared = await clearDenialCache(senderId);
    log?.info?.(
      `[DingTalk][dws-oauth] denial-clear senderId=${senderId} cleared=${cleared}`,
    );
  }

  const status = await queryDwsAuthStatus(senderId, accountId);
  if (status.authenticated) {
    return { enterAgent: true, status: "ready" };
  }

  const denial = await readDenialCache(senderId);
  if (denial) {
    await pushBlockedMessage(params, denial);
    return { enterAgent: false, status: "cliDenied" };
  }

  const mismatchUntil = getMismatchCooldownUntil(key);
  if (mismatchUntil && Date.now() < mismatchUntil) {
    log?.info?.(`[DingTalk][dws-oauth] gate wait (mismatch cooldown) senderId=${senderId}`);
    return { enterAgent: false, status: "pending" };
  }

  const existing = getLoginSession(key);
  if (existing) {
    log?.info?.(`[DingTalk][dws-oauth] gate wait (in-flight login) senderId=${senderId}`);
    if (existing.verificationUrl && Date.now() - existing.startedAt < LOGIN_REUSE_MS) {
      await pushAuthLinkMessage({
        config: params.config,
        isDirect: params.isDirect,
        conversationId: params.conversationId,
        senderId,
        verificationUrl: existing.verificationUrl,
        userCode: existing.userCode,
        log,
      });
    }
    return { enterAgent: false, status: "pending" };
  }

  await ensureDwsLoginAndNotify(params);
  return { enterAgent: false, status: "pending" };
}
