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

export function resolveCardFeedbackAction(
  frame: CardCallbackFrame,
  config: ResolvedCardFeedbackConfig,
): CardFeedbackAction | null {
  if (!frame.outTrackId || frame.actionIds.length === 0) return null;

  let kind: CardFeedbackAction["kind"] | undefined;
  if (frame.actionIds.includes(config.likeActionId)) kind = "like";
  if (frame.actionIds.includes(config.dislikeActionId)) kind = "dislike";
  if (!kind) return null;

  const dislikeReasons = asStringList(
    frame.params.dislike_reason ?? frame.params.dislikeReasons ?? frame.params.dislike_reasons,
  );
  const customDislikeReason = asString(
    frame.params.custom_dislike_reason ?? frame.params.customDislikeReason,
  );

  return {
    kind,
    outTrackId: frame.outTrackId,
    userId: frame.userId,
    dislikeReasons: dislikeReasons.length > 0 ? dislikeReasons : undefined,
    customDislikeReason,
  };
}
