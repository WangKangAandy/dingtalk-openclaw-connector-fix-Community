import type { CardCallbackFrame, CardFeedbackAction, ResolvedCardFeedbackConfig } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function parseCardCallbackFrame(res: {
  headers?: { messageId?: string };
  data?: unknown;
}): CardCallbackFrame | null {
  const raw = parseJsonValue(res.data);
  const body = asRecord(raw);
  if (!body) return null;

  const content = asRecord(parseJsonValue(body.content)) ?? {};
  const privateData =
    asRecord(parseJsonValue(content.cardPrivateData)) ??
    asRecord(parseJsonValue(body.cardPrivateData)) ??
    {};
  const params = asRecord(parseJsonValue(privateData.params)) ?? {};
  const actionIds = asStringList(privateData.actionIds ?? content.actionIds ?? body.actionIds);

  return {
    messageId: asString(res.headers?.messageId) ?? asString(body.messageId),
    outTrackId:
      asString(body.outTrackId) ??
      asString(content.outTrackId) ??
      asString(params.outTrackId) ??
      asString(params.cardInstanceId),
    userId: asString(body.userId) ?? asString(content.userId) ?? asString(params.userId),
    actionIds,
    params,
  };
}

const LIKE_PARAM_TOKENS = new Set([
  "good",
  "like",
  "up",
  "thumbs_up",
  "positive",
  "1",
  "true",
  "yes",
]);
const DISLIKE_PARAM_TOKENS = new Set([
  "bad",
  "dislike",
  "down",
  "thumbs_down",
  "negative",
  "-1",
  "false",
  "no",
]);

/**
 * Official card callback envelope:
 * https://open.dingtalk.com/document/development/event-callback-card.md
 * `actionIds` = clicked control; `params` = extra context (configured or platform-injected).
 *
 * Official AI-card 操作区 shares one ActionID for like / dislike / tag submit.
 * Published AI-card collectors read `params.feedback` as good|bad (and `comment`).
 */
export function kindFromOfficialFeedbackParams(
  params: Record<string, unknown>,
): CardFeedbackAction["kind"] | undefined {
  const candidates = [
    params.feedback,
    params.like,
    params.likeType,
    params.action,
    params.type,
    params.status,
    params.value,
  ];
  for (const candidate of candidates) {
    const token = normalizeFeedbackToken(candidate);
    if (token === "like" || token === "dislike") return token;
  }
  if (hasDislikePayload(params)) return "dislike";
  return undefined;
}

function normalizeFeedbackToken(value: unknown): CardFeedbackAction["kind"] | undefined {
  if (value === true || value === 1) return "like";
  if (value === false || value === -1) return "dislike";
  if (typeof value === "number") {
    if (value > 0) return "like";
    if (value < 0) return "dislike";
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  if (LIKE_PARAM_TOKENS.has(token)) return "like";
  if (DISLIKE_PARAM_TOKENS.has(token)) return "dislike";
  return undefined;
}

function hasDislikePayload(params: Record<string, unknown>): boolean {
  return Boolean(
    asString(params.comment) ||
      asString(params.custom_dislike_reason) ||
      asString(params.customDislikeReason) ||
      asStringList(params.dislike_reason).length > 0 ||
      asStringList(params.dislikeReasons).length > 0 ||
      asStringList(params.dislike_reasons).length > 0 ||
      asStringList(params.tags).length > 0 ||
      asStringList(params.labels).length > 0,
  );
}

export function resolveCardFeedbackAction(
  frame: CardCallbackFrame,
  config: ResolvedCardFeedbackConfig,
): CardFeedbackAction | null {
  if (!frame.outTrackId || frame.actionIds.length === 0) return null;

  const hasOfficialId = frame.actionIds.includes(config.officialFeedbackActionId);
  const hasCustomLike = frame.actionIds.includes(config.likeActionId);
  const hasCustomDislike = frame.actionIds.includes(config.dislikeActionId);
  const officialSharesCustomId =
    config.officialFeedbackActionId === config.likeActionId ||
    config.officialFeedbackActionId === config.dislikeActionId;

  let kind: CardFeedbackAction["kind"] | undefined;
  if (hasOfficialId) {
    kind = kindFromOfficialFeedbackParams(frame.params);
    if (!kind && !hasCustomLike && !hasCustomDislike) return null;
  }
  if (!kind && hasCustomDislike && !officialSharesCustomId) kind = "dislike";
  if (!kind && hasCustomLike && !officialSharesCustomId) kind = "like";
  if (!kind && hasCustomDislike) kind = "dislike";
  if (!kind && hasCustomLike) kind = "like";
  if (!kind) return null;

  const dislikeReasons = asStringList(
    frame.params.dislike_reason ??
      frame.params.dislikeReasons ??
      frame.params.dislike_reasons ??
      frame.params.tags ??
      frame.params.labels,
  );
  const customDislikeReason = asString(
    frame.params.custom_dislike_reason ??
      frame.params.customDislikeReason ??
      frame.params.comment,
  );

  return {
    kind,
    outTrackId: frame.outTrackId,
    userId: frame.userId,
    dislikeReasons: dislikeReasons.length > 0 ? dislikeReasons : undefined,
    customDislikeReason,
  };
}
