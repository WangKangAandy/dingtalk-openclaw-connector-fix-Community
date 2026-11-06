import type { DingtalkConfig } from "../types/index.ts";
import { getAccessToken, DINGTALK_API } from "../utils/token.ts";
import { dingtalkHttp } from "../utils/http-client.ts";
import { createTurnFeedback } from "./feedback.ts";

/** Robot reaction protocol, not the digital-employee OAuth emotion API. */
export function robotTurnFeedback(config: DingtalkConfig, data: { conversationId: string; msgId: string }) {
  if (config.messageStatusFeedback !== true) return undefined;
  const robotCode = String(config.clientId ?? "");
  const { conversationId, msgId } = data;
  if (![robotCode, conversationId, msgId].every(value => typeof value === "string" && value.trim() && !value.includes("\0"))) return undefined;
  const account = { ...config };
  return createTurnFeedback(async (operation, label, signal) => {
    const token = await getAccessToken(account);
    signal.throwIfAborted();
    let response;
    try { response = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/robot/emotion/${operation === "add" ? "reply" : "recall"}`, {
      robotCode, openMsgId: msgId, openConversationId: conversationId,
      emotionType: 2, emotionName: label,
      textEmotion: { emotionId: "2659900", emotionName: label, text: label, backgroundId: "im_bg_1" },
    }, { headers: { "x-acs-dingtalk-access-token": token, "Content-Type": "application/json" }, timeout: 5000, signal }); }
    catch (error: any) {
      if ([400, 401, 403, 404, 405, 413, 422, 429].includes(error?.response?.status)) {
        throw Object.assign(new Error("DingTalk reaction rejected"), { feedbackRejected: true });
      }
      throw new Error("DingTalk reaction result unknown");
    }
    const code = response.data?.errcode ?? response.data?.code;
    if (response.data?.success === false || code !== undefined && ![0, "0", "OK"].includes(code)) {
      throw Object.assign(new Error("DingTalk reaction rejected"), { feedbackRejected: true });
    }
    if (!(response.status >= 200 && response.status < 300)) throw new Error("DingTalk reaction result unknown");
  });
}
