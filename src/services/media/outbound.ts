/**
 * OpenClaw 附件通道：payload.mediaUrl 走 sendMedia，不折进正文。
 * deliver 时只记住附件；等卡片/正文发出后再 flush，避免图比正文先到。
 */

import { sendMediaToDingTalk } from "../messaging.ts";
import type { DingtalkConfig } from "../../types/index.ts";
import { toLocalPath } from "./common.ts";

type Logger = {
  info?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
};

function resolveTarget(params: {
  isDirect: boolean;
  senderId: string;
  conversationId: string;
}): string {
  if (params.isDirect) return params.senderId;
  if (
    params.conversationId.startsWith("cid") ||
    params.conversationId.startsWith("group:")
  ) {
    return params.conversationId;
  }
  return `group:${params.conversationId}`;
}

function listPayloadMediaUrls(payload: {
  mediaUrl?: unknown;
  mediaUrls?: unknown;
} | null | undefined): string[] {
  if (!payload) return [];
  const raw: unknown[] = [];
  if (typeof payload.mediaUrl === "string") raw.push(payload.mediaUrl);
  if (Array.isArray(payload.mediaUrls)) raw.push(...payload.mediaUrls);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function textAlreadyHasMedia(text: string, mediaUrl: string): boolean {
  const local = toLocalPath(mediaUrl);
  if (!local) return false;
  return (
    text.includes(`](${local})`) ||
    text.includes(`](MEDIA:${local})`) ||
    text.includes(`](file://${local})`) ||
    text.includes(`MEDIA:${local}`)
  );
}

export function createOutboundMediaChannel(params: {
  config: DingtalkConfig;
  isDirect: boolean;
  senderId: string;
  conversationId: string;
  log?: Logger;
}) {
  const target = resolveTarget(params);
  const pending: string[] = [];
  const seen = new Set<string>();

  return {
    // 测试/显式丢弃用。dispatcher 一条入站消息一个实例，onReplyStart 不要调这个。
    reset() {
      pending.length = 0;
      seen.clear();
    },
    remember(
      payload: { mediaUrl?: unknown; mediaUrls?: unknown } | null | undefined,
      bodyText: string,
    ): number {
      let added = 0;
      for (const mediaUrl of listPayloadMediaUrls(payload)) {
        const key = toLocalPath(mediaUrl) || mediaUrl;
        if (seen.has(key)) continue;
        seen.add(key);
        if (textAlreadyHasMedia(bodyText, mediaUrl)) {
          params.log?.info?.(`[DingTalk][Media] 正文已含 ${key}，跳过 sendMedia`);
          continue;
        }
        pending.push(mediaUrl);
        added += 1;
      }
      return added;
    },
    async flush() {
      const urls = pending.splice(0, pending.length);
      for (const mediaUrl of urls) {
        try {
          params.log?.info?.(`[DingTalk][Media] payload.mediaUrl → sendMedia: ${mediaUrl}`);
          await sendMediaToDingTalk({
            config: params.config,
            target,
            mediaUrl,
          });
        } catch (err: any) {
          params.log?.error?.(`[DingTalk][Media] sendMedia 失败：${err?.message ?? err}`);
        }
      }
    },
  };
}
