/** Stream topic for AI Card button callbacks. */
export const CARD_CALLBACK_TOPIC = "/v1.0/card/instances/callback";

export const DEFAULT_LIKE_ACTION_ID = "ai_res_like";
export const DEFAULT_DISLIKE_ACTION_ID = "ai_res_dislike";
/** Official AI-card 操作区: like, dislike, and tag submit share this ActionID. */
export const DEFAULT_OFFICIAL_FEEDBACK_ACTION_ID = "sys_action_like_component";
export const DEFAULT_FEEDBACK_STATUS_KEY = "like";

export type CardFeedbackKind = "like" | "dislike";

export type CardFeedbackConfig = {
  cardLikeActionId?: string;
  cardDislikeActionId?: string;
  /** Official 操作区 shared ActionID; default sys_action_like_component. */
  cardOfficialFeedbackActionId?: string;
  /** Card variable that holds the current like/dislike state. */
  cardFeedbackStatusKey?: string;
};

export type ResolvedCardFeedbackConfig = {
  likeActionId: string;
  dislikeActionId: string;
  officialFeedbackActionId: string;
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
  /** DingTalk callback messageId when available. */
  eventId?: string;
};

/** Optional enrichment for feedback join — never a gate for persistence. */
export type CardSessionBinding = {
  sessionKey: string;
  agentId?: string;
  accountId?: string;
  corpId?: string;
  conversationId?: string;
  chatType?: "direct" | "group";
  requesterUserId?: string;
  userPrompt?: string;
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
    officialFeedbackActionId:
      config?.cardOfficialFeedbackActionId?.trim() || DEFAULT_OFFICIAL_FEEDBACK_ACTION_ID,
    statusKey: config?.cardFeedbackStatusKey?.trim() || DEFAULT_FEEDBACK_STATUS_KEY,
  };
}
