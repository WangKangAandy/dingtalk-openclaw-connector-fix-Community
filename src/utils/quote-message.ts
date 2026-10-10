/**
 * Unified quoted-message body resolution for DingTalk inbound replies.
 *
 * Pipeline (outbound form agnostic):
 * 1) Structural extract from repliedMsg (text / markdown / richText / cardContent / …)
 * 2) If thin/placeholder, hydrate from QuoteBodyStore via originalProcessQueryKey / msgId / cardId
 * 3) Always return a single `[引用] …` string for Agent consumption
 */
import { lookupQuoteBody } from "./quote-body-store.ts";

function parseContentObject(raw: unknown): any | null {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore
    }
  }
  return null;
}

/** Flatten interactiveCard cardContent TEXT/LINK trees into readable text. */
export function flattenInteractiveCardContent(contentObj: any): string {
  const parts: string[] = [];

  const walk = (node: any): void => {
    if (node == null) return;
    if (typeof node === "string") {
      const parsed = parseContentObject(node);
      if (parsed) walk(parsed);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;

    if (Array.isArray(node.cardContent)) walk(node.cardContent);
    if (Array.isArray(node.children)) walk(node.children);

    const elementType = String(node.elementType || node.type || "").toUpperCase();
    if (elementType === "TEXT" || elementType === "LINK") {
      const value = String(node.value ?? node.text ?? "").trim();
      if (value) parts.push(value);
    }
  };

  walk(contentObj?.cardContent ?? contentObj);
  return parts.join("\n").trim();
}

function stripQuotePrefix(text: string): string {
  return text.replace(/^\[引用\]\s*/, "").trim();
}

function isPlaceholderBody(body: string): boolean {
  if (!body) return true;
  if (body === "[interactiveCard消息]" || body === "[markdown消息]" || body === "[引用消息]") {
    return true;
  }
  return /^\[[\w.-]+消息\]$/.test(body);
}

/** Structural body from a single repliedMsg (no `[引用]` prefix). */
export function extractQuotedBodyFromRepliedMsg(repliedMsg: any): string {
  if (!repliedMsg) return "";
  const msgType = repliedMsg.msgType || repliedMsg.msgtype || "text";
  const contentObj = parseContentObject(repliedMsg.content);

  switch (msgType) {
    case "text": {
      let body = contentObj?.text?.trim() || repliedMsg.text?.trim() || "";
      if (contentObj?.isReplyMsg) {
        const nested = extractQuotedMsgText(contentObj, 2);
        if (nested) {
          const nestedBody = stripQuotePrefix(nested);
          body = body ? `${body}\n${nestedBody}` : nestedBody;
        }
      }
      return body;
    }
    case "richText": {
      const richList: any[] = contentObj?.richText || [];
      return richList
        .filter((item: any) => item.text && item.msgType !== "skill" && !item.skillData)
        .map((item: any) => item.text as string)
        .join("");
    }
    case "picture":
      return "[图片]";
    case "video":
      return "[视频]";
    case "audio":
      return contentObj?.recognition || "[语音消息]";
    case "file": {
      const fileName = contentObj?.fileName || "unknown";
      return `[文件: ${fileName}]`;
    }
    case "markdown":
      return contentObj?.text?.trim() || contentObj?.markdown?.trim() || "[markdown消息]";
    case "interactiveCard": {
      const flattened = flattenInteractiveCardContent(contentObj);
      if (flattened) return flattened;
      // Some templates put markdown in cardParamMap
      const paramMap = contentObj?.cardData?.cardParamMap || contentObj?.cardParamMap;
      if (paramMap && typeof paramMap === "object") {
        for (const key of ["msgContent", "content", "text", "markdown"]) {
          const value = String(paramMap[key] ?? "").trim();
          if (value) return value;
        }
      }
      const cardUrl = contentObj?.biz_custom_action_url || repliedMsg.biz_custom_action_url || "";
      return cardUrl ? `收到交互式卡片链接：${cardUrl}` : "[interactiveCard消息]";
    }
    case "actionCard": {
      const title = contentObj?.title?.trim() || "";
      const body = contentObj?.text?.trim() || "";
      return [title, body].filter(Boolean).join("\n\n") || "[actionCard消息]";
    }
    default:
      return contentObj?.text?.trim() || `[${msgType}消息]`;
  }
}

function hydrationKeys(repliedMsg: any, inboundRoot?: any): {
  processQueryKey?: string;
  msgId?: string;
  cardInstanceId?: string;
} {
  const contentObj = parseContentObject(repliedMsg?.content);
  return {
    processQueryKey: inboundRoot?.originalProcessQueryKey || inboundRoot?.processQueryKey,
    msgId: repliedMsg?.msgId || repliedMsg?.messageId,
    cardInstanceId:
      contentObj?.outTrackId ||
      contentObj?.cardInstanceId ||
      repliedMsg?.outTrackId ||
      repliedMsg?.cardInstanceId,
  };
}

/**
 * Prefer cached full body when structural extract is missing, placeholder,
 * or thinner than the remembered outbound text (title-only / truncated quotes).
 *
 * Cache is keyed by the outbound message identity (processQueryKey / msgId /
 * cardInstanceId), so a longer cache is authoritative for that message.
 * Keep structural when it is richer (e.g. cardContent present, stale cache).
 */
export function preferHydratedQuoteBody(structuralBody: string, cached: string | null): string {
  const structural = structuralBody.trim();
  const full = String(cached ?? "").trim();
  if (!full) return structural;
  if (!structural || isPlaceholderBody(structural)) return full;
  if (structural === full) return structural;
  if (full.length > structural.length) return full;
  return structural;
}

/**
 * From message content container (data.text / data.content), extract quoted text.
 * `inboundRoot` is the full callback data (for originalProcessQueryKey).
 */
export function extractQuotedMsgText(
  container: any,
  maxDepth: number,
  inboundRoot?: any,
): string | null {
  if (maxDepth <= 0 || !container) return null;
  if (!container.isReplyMsg) return null;

  const repliedMsg = container.repliedMsg;
  if (!repliedMsg) return null;

  const structural = extractQuotedBodyFromRepliedMsg(repliedMsg);
  const cached = lookupQuoteBody(hydrationKeys(repliedMsg, inboundRoot));
  const bodyText = preferHydratedQuoteBody(structural, cached);

  if (!bodyText) return null;
  return `[引用] ${bodyText}`;
}
