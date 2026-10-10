import type { CardFeedbackAction, ResolvedCardFeedbackConfig } from "./types.ts";

/** JSON 都解不开时才用；避免钉钉因空回包反复重试。 */
export const CARD_CALLBACK_PARSE_FAILURE = { success: false } as const;

/** 未知按钮（例如复制）仍回同构空更新，与社区 PR #550 finally 回包一致。 */
export function buildEmptyCardAck() {
  return {
    cardUpdateOptions: {
      updateCardDataByKey: true,
      updatePrivateDataByKey: true,
    },
    cardData: { cardParamMap: {} as Record<string, number | string> },
    userPrivateData: { cardParamMap: {} as Record<string, number | string> },
  };
}

export function buildCardFeedbackAck(action: CardFeedbackAction, config: ResolvedCardFeedbackConfig) {
  const ack = buildEmptyCardAck();
  const status = action.kind === "like" ? 1 : -1;
  ack.cardData.cardParamMap[config.statusKey] = status;
  ack.userPrivateData.cardParamMap[config.statusKey] = status;
  if (action.kind === "dislike") {
    ack.cardData.cardParamMap.submitted = "true";
  }
  return ack;
}
