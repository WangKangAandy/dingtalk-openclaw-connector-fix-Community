/**
 * OpenClaw 附件通道：payload.mediaUrl 走 sendMedia，不折进正文。
 * deliver 时只记住附件；等卡片/正文发出后再 flush，避免图比正文先到。
 *
 * OpenClaw persist 失败时会丢掉 mediaUrl 并在正文追加 `⚠️ Media failed.`。
 * connector 从流式缓冲里把独立 MEDIA: 捞回来，并去掉这条运行时横幅。
 */

import { existsSync } from "node:fs";
import { sendMediaToDingTalk } from "../messaging.ts";
import type { DingtalkConfig } from "../../types/index.ts";
import { toLocalPath } from "./common.ts";

/** OpenClaw `appendReplyMediaFailureWarning` 写入的运行时横幅，不是模型正文。 */
export const REPLY_MEDIA_FAILURE_WARNING = "⚠️ Media failed.";

const STANDALONE_MEDIA_TOKEN_RE =
  /(?:MEDIA:|file:\/\/\/?|attachment:\/\/)[^\s)`]+?\.(?:png|jpg|jpeg|gif|bmp|webp)/gi;

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

export function stripReplyMediaFailureWarning(text: string): string {
  if (!text || !text.includes(REPLY_MEDIA_FAILURE_WARNING)) return text;
  return text
    .split("\n")
    .filter((line) => line.trim() !== REPLY_MEDIA_FAILURE_WARNING)
    .join("\n")
    .replaceAll(REPLY_MEDIA_FAILURE_WARNING, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function harvestStandaloneMediaTokens(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(STANDALONE_MEDIA_TOKEN_RE)) {
    const token = match[0];
    const key = toLocalPath(token) || token;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
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

  const remember = (
    payload: { mediaUrl?: unknown; mediaUrls?: unknown } | null | undefined,
    bodyText: string,
  ): number => {
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
  };

  return {
    reset() {
      pending.length = 0;
      seen.clear();
    },
    remember,
    /**
     * OpenClaw persist 丢掉 mediaUrl 之后，从流式缓冲 / 原文捞独立 MEDIA:。
     * 本地文件不存在则只打日志，避免 sendMedia 再给用户一条「上传失败」。
     */
    rememberRecovered(sourceText: string, bodyText: string): number {
      const tokens = harvestStandaloneMediaTokens(sourceText);
      if (tokens.length === 0) return 0;
      const existing: string[] = [];
      const missing: string[] = [];
      for (const token of tokens) {
        const local = toLocalPath(token);
        if (local && !existsSync(local)) {
          missing.push(local);
          continue;
        }
        existing.push(token);
      }
      if (missing.length > 0) {
        params.log?.info?.(
          `[DingTalk][Media] 恢复路径不存在，跳过 sendMedia: ${missing.join(", ")}`,
        );
      }
      if (existing.length === 0) return 0;
      params.log?.info?.(
        `[DingTalk][Media] OpenClaw 丢弃 mediaUrl，从流式缓冲恢复 ${existing.length} 个附件`,
      );
      return remember({ mediaUrls: existing }, bodyText);
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
