import fs from "node:fs";
import path from "node:path";
import type { CardFeedbackAction, CardFeedbackLog } from "./types.ts";
import { resolveCardFeedbackLogPath } from "./paths.ts";
import { lookupCardSession, type CardSessionStore } from "./session-map.ts";

export type CardAnswerStatus = "completed" | "failed" | "interrupted";

/** Written when a card turn finishes (or fails) with the content actually shown. */
export type CardAnswerRecord = {
  type: "answer";
  ts: string;
  cardId: string;
  status: CardAnswerStatus;
  sessionKey?: string;
  agentId?: string;
  accountId?: string;
  corpId?: string;
  conversationId?: string;
  chatType?: "direct" | "group";
  requesterUserId?: string;
  /** User-visible inbound text for this turn only — never system/prompt wrappers. */
  userPrompt?: string;
  /** Text actually delivered on the card (or last shown on failure). */
  assistantText?: string;
  error?: string;
};

/** Written on each like/dislike callback. Append-only; analysis dedupes by eventId. */
export type CardFeedbackRecord = {
  type: "feedback";
  ts: string;
  cardId: string;
  kind: "like" | "dislike";
  /** DingTalk callback messageId — identifies the same delivery / retry. */
  eventId?: string;
  userId?: string;
  dislikeReasons?: string[];
  comment?: string;
  sessionKey?: string;
  agentId?: string;
  accountId?: string;
  corpId?: string;
  conversationId?: string;
  chatType?: "direct" | "group";
};

export type CardFeedbackLogRecord = CardAnswerRecord | CardFeedbackRecord;

export type RecordCardAnswerInput = {
  cardId: string;
  status: CardAnswerStatus;
  sessionKey?: string;
  agentId?: string;
  accountId?: string;
  corpId?: string;
  conversationId?: string;
  chatType?: "direct" | "group";
  requesterUserId?: string;
  userPrompt?: string;
  assistantText?: string;
  error?: string;
};

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as T;
}

/**
 * Append one JSONL line. Throws on I/O failure so callers can log clearly.
 * Does not write acked/persisted flags — those are runtime concerns, not feedback data.
 */
export function appendCardFeedbackLog(
  record: CardFeedbackLogRecord,
  opts?: { logPath?: string },
): void {
  const file = opts?.logPath ?? resolveCardFeedbackLogPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

/** Persist the answer association for a finished / failed card turn. */
export function recordCardAnswer(
  input: RecordCardAnswerInput,
  opts?: { log?: CardFeedbackLog; logPath?: string },
): boolean {
  const cardId = input.cardId.trim();
  if (!cardId) return false;
  const record = compactRecord({
    type: "answer" as const,
    ts: new Date().toISOString(),
    cardId,
    status: input.status,
    sessionKey: trimOptional(input.sessionKey),
    agentId: trimOptional(input.agentId),
    accountId: trimOptional(input.accountId),
    corpId: trimOptional(input.corpId),
    conversationId: trimOptional(input.conversationId),
    chatType: input.chatType,
    requesterUserId: trimOptional(input.requesterUserId),
    userPrompt: trimOptional(input.userPrompt),
    assistantText: trimOptional(input.assistantText),
    error: trimOptional(input.error),
  });
  try {
    appendCardFeedbackLog(record, { logPath: opts?.logPath });
    opts?.log?.info?.(
      `[card-feedback] recorded answer card=${cardId} status=${input.status}`,
    );
    return true;
  } catch (err) {
    opts?.log?.error?.(
      `[card-feedback] failed to record answer for ${cardId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

/**
 * Persist a like/dislike callback.
 * Always writes even when the in-memory card→session map has expired.
 */
export function recordCardFeedback(
  action: CardFeedbackAction,
  opts?: {
    store?: CardSessionStore;
    log?: CardFeedbackLog;
    logPath?: string;
    eventId?: string;
  },
): boolean {
  const cardId = action.outTrackId.trim();
  if (!cardId) return false;

  const binding = lookupCardSession(cardId, opts?.store);
  const record = compactRecord({
    type: "feedback" as const,
    ts: new Date().toISOString(),
    cardId,
    kind: action.kind,
    eventId: trimOptional(opts?.eventId ?? action.eventId),
    userId: trimOptional(action.userId),
    dislikeReasons: action.dislikeReasons,
    comment: trimOptional(action.customDislikeReason),
    sessionKey: trimOptional(binding?.sessionKey),
    agentId: trimOptional(binding?.agentId),
    accountId: trimOptional(binding?.accountId),
    corpId: trimOptional(binding?.corpId),
    conversationId: trimOptional(binding?.conversationId),
    chatType: binding?.chatType,
  });

  try {
    appendCardFeedbackLog(record, { logPath: opts?.logPath });
    opts?.log?.info?.(
      `[card-feedback] recorded ${action.kind} card=${cardId}` +
        (binding ? "" : " (no answer binding; feedback kept)"),
    );
    return true;
  } catch (err) {
    opts?.log?.error?.(
      `[card-feedback] failed to record ${action.kind} for ${cardId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}
