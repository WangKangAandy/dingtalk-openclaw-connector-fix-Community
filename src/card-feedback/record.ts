import type { CardFeedbackAction, CardFeedbackLog } from "./types.ts";
import { getQuoteBodyStore } from "../utils/quote-body-store.ts";

/**
 * Merge like/dislike onto the existing card body (keyed by cardInstanceId).
 * finishAICard already remembered that text via rememberQuoteBody — no second transcript write.
 */
export async function recordFeedbackToSession(
  action: CardFeedbackAction,
  opts?: { log?: CardFeedbackLog },
): Promise<boolean> {
  const ok = getQuoteBodyStore().attachFeedback(action.outTrackId, {
    like: action.kind === "like" ? 1 : -1,
    updatedAt: new Date().toISOString(),
  });
  if (!ok) {
    opts?.log?.warn?.(`[card-feedback] no card body for ${action.outTrackId}`);
  }
  return ok;
}
