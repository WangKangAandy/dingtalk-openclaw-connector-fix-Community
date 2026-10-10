/**
 * Quoted-message body extraction (moved out of message-handler).
 *
 * Same switch as the original extractQuotedMsgText, plus two additions that
 * fix robot MD / AI Card quotes where DingTalk omits the body:
 * 1) flatten interactiveCard cardContent TEXT/LINK
 * 2) hydrate placeholder / title-only text from QuoteBodyStore
 * Quoted picture/richText attachments stay on extractRepliedMsgMediaAttachments.
 */
import { lookupQuoteRecord } from "./quote-body-store.ts";

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

function isPlaceholderBody(body: string): boolean {
  if (!body) return true;
  if (body === "[interactiveCard消息]" || body === "[markdown消息]" || body === "[引用消息]") {
    return true;
  }
  return /^\[[\w.-]+消息\]$/.test(body);
}

/** Structural body from a single repliedMsg (no `[引用]` prefix). */
export function extractQuotedBodyFromRepliedMsg(
  repliedMsg: any,
  maxDepth = 2,
  inboundRoot?: any,
): string {
  if (!repliedMsg) return "";
  const msgType = repliedMsg.msgType || "text";
  const contentObj = parseContentObject(repliedMsg.content);

  switch (msgType) {
    case "text": {
      let body = contentObj?.text?.trim() || repliedMsg.text?.trim() || "";
      if (contentObj?.isReplyMsg) {
        const nested = extractQuotedMsgText(contentObj, maxDepth - 1, inboundRoot);
        if (nested) body = body ? `${body}\n${nested}` : nested;
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
      return contentObj?.text?.trim() || "[markdown消息]";
    case "interactiveCard": {
      const flattened = flattenInteractiveCardContent(contentObj);
      if (flattened) return flattened;
      const cardUrl = contentObj?.biz_custom_action_url || repliedMsg.biz_custom_action_url || "";
      return cardUrl ? `收到交互式卡片链接：${cardUrl}` : "[interactiveCard消息]";
    }
    default:
      return `[${msgType}消息]`;
  }
}

function hydrationKeys(repliedMsg: any, inboundRoot?: any): {
  processQueryKey?: string;
  msgId?: string;
  cardInstanceId?: string;
} {
  const contentObj = parseContentObject(repliedMsg?.content);
  return {
    // Do not use inboundRoot.processQueryKey: that is the current reply, not the quoted message.
    processQueryKey:
      inboundRoot?.originalProcessQueryKey ||
      repliedMsg?.processQueryKey ||
      contentObj?.processQueryKey,
    msgId: repliedMsg?.msgId || repliedMsg?.messageId,
    cardInstanceId:
      contentObj?.outTrackId ||
      contentObj?.cardInstanceId ||
      repliedMsg?.outTrackId ||
      repliedMsg?.cardInstanceId,
  };
}

/**
 * Use cache only for placeholders or title-only quotes (first line / stored title).
 * Never replace a short structural body just because the cache is longer.
 */
export function preferHydratedQuoteBody(
  structuralBody: string,
  cached: string | null,
  cachedTitle?: string | null,
): string {
  const structural = structuralBody.trim();
  const full = String(cached ?? "").trim();
  if (!full) return structural;
  if (!structural || isPlaceholderBody(structural)) return full;
  if (structural === full) return structural;

  const title = String(cachedTitle ?? "").trim();
  if (title && structural === title && full.length > structural.length) return full;

  const firstLine = full.split("\n")[0]?.replace(/^[#*\s\->]+/, "").trim() || "";
  if (structural === firstLine && full.length > structural.length) return full;
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

  const structural = extractQuotedBodyFromRepliedMsg(repliedMsg, maxDepth, inboundRoot);
  const identity = hydrationKeys(repliedMsg, inboundRoot);
  let record = lookupQuoteRecord(identity);
  if (!record && structural && !isPlaceholderBody(structural) && !structural.includes("\n")) {
    record = lookupQuoteRecord({ title: structural });
  }
  const bodyText = preferHydratedQuoteBody(structural, record?.text ?? null, record?.title);

  if (!bodyText) return null;
  return `[引用] ${bodyText}`;
}
