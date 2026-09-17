import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { DingtalkConfig } from "../../types/index.ts";
import { DINGTALK_API, getAccessToken } from "../../utils/token.ts";
import { dingtalkHttp } from "../../utils/http-client.ts";
import { buildDeliverBody, type AICardTarget } from "./card.ts";

/** Public approval template from DingTalk's Stream card callback tutorial. */
export const PUBLIC_TEST_TEMPLATE_ID =
  "dac1dbec-55af-40c3-be91-6d6882ef3b66.schema";

export type FeedbackAction = "helpful" | "not_helpful";

export type FeedbackEvent = {
  answerId: string;
  feedbackCardId?: string;
  action: FeedbackAction;
  userId?: string;
  conversationId?: string;
  accountId?: string;
  createdAt: string;
};

export type ParsedFeedback = Omit<FeedbackEvent, "createdAt" | "accountId">;

function resolveStoragePath(config: DingtalkConfig): string {
  const configured = config.feedbackStoragePath || "~/.openclaw/data/dingtalk-feedback.jsonl";
  return configured.startsWith("~/")
    ? path.join(os.homedir(), configured.slice(2))
    : configured;
}

export function resolveFeedbackTemplateId(config: DingtalkConfig): string {
  return config.feedbackCardTemplateId?.trim() || PUBLIC_TEST_TEMPLATE_ID;
}

export function isPublicTestTemplate(templateId: string): boolean {
  return templateId === PUBLIC_TEST_TEMPLATE_ID;
}

/**
 * Build the initial data for either the temporary public template or the
 * future custom feedback template. The public template deliberately keeps
 * its approval fields isolated here so it can be removed without touching
 * the delivery/callback flow.
 */
export function buildFeedbackCardParamMap(
  templateId: string,
  answerId: string,
): Record<string, string> {
  if (isPublicTestTemplate(templateId)) {
    return {
      title: "机器人回答评价测试",
      type: "回答评价",
      amount: "0",
      reason: "点击同意表示有帮助，点击拒绝表示不够好",
      status: "待处理",
    };
  }

  return {
    feedbackText: "这个回答对你有帮助吗？",
    answerId,
    status: "pending",
  };
}

/** Send a separate interactive card after the answer card/message is complete. */
export async function sendFeedbackCard(
  config: DingtalkConfig,
  target: AICardTarget,
  answerId: string,
  log?: any,
): Promise<string | null> {
  if (!config.feedbackEnabled) return null;

  const templateId = resolveFeedbackTemplateId(config);
  const feedbackCardId = `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const token = await getAccessToken(config);
    const cardData = {
      cardParamMap: buildFeedbackCardParamMap(templateId, answerId),
    };

    const createBody = {
      cardTemplateId: templateId,
      outTrackId: feedbackCardId,
      callbackType: "STREAM",
      cardData,
      // Required by DingTalk's card instance API even when delivery is sent
      // through the separate /deliver endpoint.
      imGroupOpenSpaceModel: { supportForward: true },
      imRobotOpenSpaceModel: { supportForward: true },
    };

    const createResponse = await dingtalkHttp.post(
      `${DINGTALK_API}/v1.0/card/instances`,
      createBody,
      {
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
      },
    );

    const deliverBody = buildDeliverBody(
      feedbackCardId,
      target,
      String(config.clientId ?? ""),
    );
    const deliverResponse = await dingtalkHttp.post(
      `${DINGTALK_API}/v1.0/card/instances/deliver`,
      deliverBody,
      {
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
      },
    );

    log?.info?.(
      `[DingTalk][Feedback] card delivered: card=${feedbackCardId}, answer=${answerId}, `
        + `template=${templateId}, mode=${isPublicTestTemplate(templateId) ? "public-test" : "custom"}, `
        + `createStatus=${createResponse?.status ?? "unknown"}, deliverStatus=${deliverResponse?.status ?? "unknown"}`,
    );
    return feedbackCardId;
  } catch (error: any) {
    log?.warn?.(
      `[DingTalk][Feedback] card delivery failed: template=${templateId}, `
        + `answer=${answerId}, error=${error?.message || String(error)}`,
    );
    return null;
  }
}

function parseJson(value: unknown): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function callbackParams(data: any): Record<string, unknown> {
  const parsed = parseJson(data) ?? {};
  const value = parseJson(parsed.value) ?? parsed.value ?? {};
  return (
    parsed.cardActionData?.cardPrivateData?.params
    || value.cardActionData?.cardPrivateData?.params
    || value.cardPrivateData?.params
    || value.params
    || parsed.params
    || {}
  );
}

/** Parse the official CardRequest nesting, with compatibility fallbacks. */
export function parseFeedbackCallback(raw: unknown): ParsedFeedback | null {
  const data = parseJson(raw) ?? raw;
  if (!data || typeof data !== "object") return null;

  const payload = data as Record<string, any>;
  const params = callbackParams(payload);
  const rawAction = String(params.action ?? "");
  const action: FeedbackAction | null =
    rawAction === "helpful" || rawAction === "accept"
      ? "helpful"
      : rawAction === "not_helpful" || rawAction === "reject"
        ? "not_helpful"
        : null;
  if (!action) return null;

  const feedbackCardId = String(
    payload.outTrackId
      || payload.cardInstanceId
      || payload.cardActionData?.outTrackId
      || "",
  ) || undefined;
  const answerId = String(
    params.answerId
      || payload.answerId
      || feedbackCardId
      || "",
  );
  if (!answerId) return null;

  return {
    answerId,
    feedbackCardId,
    action,
    userId: String(payload.userId || payload.senderStaffId || "") || undefined,
    conversationId: String(payload.conversationId || "") || undefined,
  };
}

const loadedStorageKeys = new Map<string, Set<string>>();

function feedbackKey(event: Pick<FeedbackEvent, "answerId" | "userId">): string {
  return `${event.answerId}\u0000${event.userId || "unknown"}`;
}

async function loadFeedbackKeys(filePath: string): Promise<Set<string>> {
  const cached = loadedStorageKeys.get(filePath);
  if (cached) return cached;
  const keys = new Set<string>();
  try {
    const content = await fs.readFile(filePath, "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as FeedbackEvent;
        if (event.answerId && event.action) keys.add(feedbackKey(event));
      } catch {
        // Ignore malformed historical lines; new events remain append-only.
      }
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  loadedStorageKeys.set(filePath, keys);
  return keys;
}

/** Persist before the Stream ACK is sent. Returns false for an idempotent duplicate. */
export async function recordFeedback(
  event: FeedbackEvent,
  config: DingtalkConfig,
  log?: any,
): Promise<boolean> {
  const filePath = resolveStoragePath(config);
  const keys = await loadFeedbackKeys(filePath);
  const key = feedbackKey(event);
  if (keys.has(key)) {
    log?.info?.(`[DingTalk][Feedback] duplicate ignored: answer=${event.answerId}, action=${event.action}`);
    return false;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  keys.add(key);
  log?.info?.(`[DingTalk][Feedback] recorded: answer=${event.answerId}, action=${event.action}`);
  return true;
}
