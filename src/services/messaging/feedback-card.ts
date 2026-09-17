import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { DingtalkConfig } from "../../types/index.ts";

/**
 * 回答评价（点赞 / 点踩）。
 *
 * 评价按钮内嵌在回答 AI Card 的完成态（flowStatus=3）「操作区」中，由卡片模板的
 * Feedback 组件渲染；模板侧打开 `enableLikeDislike` 即可，connector 不再为每条
 * 回答单独投放一张评价卡片。
 *
 * 因此本模块只负责两件事：
 * 1. 承接 `/v1.0/card/instances/callback` 回调，把按钮点击解析成评价事件；
 * 2. 将评价事件幂等地追加到 JSONL。
 */

/** 归一化后的评价动作。 */
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

// ============ 回答卡片上下文注册表 ============

/**
 * 卡片实例 → 会话上下文。
 *
 * 点赞/点踩回调里只有 `outTrackId`（即卡片实例 ID）和点击者的 userId，不含会话
 * 信息。创建卡片时在此登记，回调到达时即可还原本次评价属于哪个会话，无需再调用
 * 钉钉接口反查。
 *
 * gateway 是长驻进程，这里用「容量上限 + 插入序淘汰」做有界缓存：卡片实例没有
 * 显式的销毁时机，若只写不删，内存会随对话量无界增长。
 */
export type AnswerCardContext = {
  /** 群聊 openConversationId；单聊时为空 */
  conversationId?: string;
  /** 单聊用户 ID；群聊时为空 */
  userId?: string;
};

const ANSWER_CARD_CONTEXT_LIMIT = 2000;
const answerCardContexts = new Map<string, AnswerCardContext>();

export function registerAnswerCardContext(
  cardInstanceId: string,
  context: AnswerCardContext,
): void {
  if (!cardInstanceId) return;
  // 先删后插，使最近写入的条目落在 Map 的插入序末尾
  answerCardContexts.delete(cardInstanceId);
  answerCardContexts.set(cardInstanceId, context);
  while (answerCardContexts.size > ANSWER_CARD_CONTEXT_LIMIT) {
    const oldest = answerCardContexts.keys().next();
    if (oldest.done) break;
    answerCardContexts.delete(oldest.value);
  }
}

export function resolveAnswerCardContext(
  cardInstanceId: string | undefined,
): AnswerCardContext | undefined {
  if (!cardInstanceId) return undefined;
  return answerCardContexts.get(cardInstanceId);
}

export function unregisterAnswerCardContext(cardInstanceId: string): void {
  answerCardContexts.delete(cardInstanceId);
}

/** 仅供测试使用：清空注册表，避免用例之间相互影响。 */
export function resetAnswerCardContexts(): void {
  answerCardContexts.clear();
}

// ============ 回调解析 ============

function parseJson(value: unknown): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * 从回调里取出 `cardPrivateData`。
 *
 * 钉钉的 CardRequest 把 `value` 序列化成字符串，按钮的「回传参数」位于
 * `value.cardPrivateData.params`，按钮标识位于 `value.cardPrivateData.actionIds`。
 * 不同客户端/SDK 版本的嵌套层级略有差异，这里按从深到浅依次探测；都没有时回落到
 * 早期的扁平 `params` 结构（审批示例模板用的就是那种）。
 */
function readCardPrivateData(
  payload: Record<string, any>,
  value: Record<string, any>,
): { params: Record<string, unknown>; actionIds: string[] } {
  const candidates = [
    payload.cardActionData?.cardPrivateData,
    value.cardActionData?.cardPrivateData,
    value.cardPrivateData,
    payload.cardPrivateData,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const params =
      candidate.params && typeof candidate.params === "object"
        ? (candidate.params as Record<string, unknown>)
        : {};
    const actionIds = Array.isArray(candidate.actionIds)
      ? candidate.actionIds.map(String)
      : [];
    if (Object.keys(params).length > 0 || actionIds.length > 0) {
      return { params, actionIds };
    }
  }

  const flat = parseJson(value.params) ?? value.params ?? payload.params ?? {};
  return {
    params: flat && typeof flat === "object" ? (flat as Record<string, unknown>) : {},
    actionIds: [],
  };
}

/**
 * 归一化按钮标识：小写、去空白，并把空格/连字符折叠成下划线
 * （`Not Helpful` 与 `not_helpful` 视为同一个值）。
 */
function normalizeToken(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const HELPFUL_TOKENS = new Set([
  "good",
  "like",
  "liked",
  "up",
  "upvote",
  "thumbup",
  "helpful",
  "accept",
  "agree",
  "yes",
]);

const NOT_HELPFUL_TOKENS = new Set([
  "bad",
  "dislike",
  "disliked",
  "down",
  "downvote",
  "thumbdown",
  "not_helpful",
  "unhelpful",
  "reject",
  "refuse",
  "disagree",
  "no",
]);

function toFeedbackAction(value: unknown): FeedbackAction | null {
  const token = normalizeToken(value);
  if (HELPFUL_TOKENS.has(token)) return "helpful";
  if (NOT_HELPFUL_TOKENS.has(token)) return "not_helpful";
  return null;
}

/**
 * 解析卡片回调。
 *
 * 取值优先级：显式回传参数 → 按钮标识 → 早期审批模板的 `action` 字段。
 * 显式参数是推荐做法 —— 在卡片模板的「操作区」里分别给点赞/点踩按钮配置
 * `{"feedback":"good"}` / `{"feedback":"bad"}`，语义最明确，也不依赖客户端
 * 自动生成的 actionIds 取值。
 */
export function parseFeedbackCallback(raw: unknown): ParsedFeedback | null {
  const data = parseJson(raw) ?? raw;
  if (!data || typeof data !== "object") return null;

  const payload = data as Record<string, any>;
  const parsedValue = parseJson(payload.value);
  const value: Record<string, any> =
    parsedValue && typeof parsedValue === "object" ? parsedValue : {};

  const { params, actionIds } = readCardPrivateData(payload, value);

  const action =
    toFeedbackAction(params.feedback)
    ?? toFeedbackAction(params.action)
    ?? actionIds.map(toFeedbackAction).find((candidate) => candidate !== null)
    ?? null;
  if (!action) return null;

  const cardId =
    String(
      payload.outTrackId
        || payload.cardInstanceId
        || value.outTrackId
        || payload.cardActionData?.outTrackId
        || "",
    ) || undefined;
  const answerId = String(params.answerId || payload.answerId || cardId || "");
  if (!answerId) return null;

  return {
    answerId,
    feedbackCardId: cardId,
    action,
    userId: String(payload.userId || payload.senderStaffId || value.userId || "") || undefined,
    conversationId:
      String(params.conversationId || payload.conversationId || value.conversationId || "")
      || undefined,
  };
}

// ============ 持久化 ============

const loadedStorageKeys = new Map<string, Set<string>>();

/**
 * 去重键：同一用户对同一条回答的同一个动作只记一次。
 *
 * 之所以把 action 也纳入键，是因为钉钉的点赞/点踩是一个可切换的控件 ——
 * 用户先点赞再改点踩时，这是两次语义不同的事件，都应保留（读侧按最后一条为准）；
 * 而 Stream 重投递同一个点击时，三者全等，仍会被正确幂等掉。
 */
function feedbackKey(event: Pick<FeedbackEvent, "answerId" | "userId" | "action">): string {
  return `${event.answerId}\u0000${event.userId || "unknown"}\u0000${event.action}`;
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
