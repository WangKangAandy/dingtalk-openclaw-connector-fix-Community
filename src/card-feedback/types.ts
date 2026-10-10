/** Stream topic for AI Card button callbacks. */
export const CARD_CALLBACK_TOPIC = "/v1.0/card/instances/callback";

export const DEFAULT_LIKE_ACTION_ID = "ai_res_like";
export const DEFAULT_DISLIKE_ACTION_ID = "ai_res_dislike";
export const DEFAULT_FEEDBACK_STATUS_KEY = "like";

export type CardFeedbackKind = "like" | "dislike";

export type CardFeedbackConfig = {
  cardLikeActionId?: string;
  cardDislikeActionId?: string;
  /** Card variable that holds the current like/dislike state. */
  cardFeedbackStatusKey?: string;
};

export type ResolvedCardFeedbackConfig = {
  likeActionId: string;
  dislikeActionId: string;
  statusKey: string;
};

export type CardCallbackFrame = {
  messageId?: string;
  outTrackId?: string;
  userId?: string;
  actionIds: string[];
  params: Record<string, unknown>;
};

export type CardFeedbackAction = {
  kind: CardFeedbackKind;
  outTrackId: string;
  userId?: string;
  dislikeReasons?: string[];
  customDislikeReason?: string;
};

export type CardSessionBinding = {
  sessionKey: string;
  agentId?: string;
  targetHint?: string;
  createdAt: number;
};

export type CardFeedbackLog = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type CardFeedbackClient = {
  registerCallbackListener: (topic: string, listener: CardCallbackListener) => unknown;
  deregisterCallbackListener?: (topic: string, listener: CardCallbackListener) => unknown;
  socketCallBackResponse: (messageId: string, body: unknown) => unknown;
};

export type CardCallbackListener = (res: {
  headers?: { messageId?: string };
  data?: unknown;
}) => unknown;

export function resolveCardFeedbackConfig(
  config?: CardFeedbackConfig,
): ResolvedCardFeedbackConfig {
  return {
    likeActionId: config?.cardLikeActionId?.trim() || DEFAULT_LIKE_ACTION_ID,
    dislikeActionId: config?.cardDislikeActionId?.trim() || DEFAULT_DISLIKE_ACTION_ID,
    statusKey: config?.cardFeedbackStatusKey?.trim() || DEFAULT_FEEDBACK_STATUS_KEY,
  };
}
