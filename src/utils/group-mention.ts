/**
 * Group-chat @ of the human who mentioned the bot.
 *
 * senderStaffId only — DingTalk's encrypted senderId is not a userid.
 * Call sites pass the resolved mention through; this file owns @userid vs @nick.
 */

export type GroupMention = {
  atUserId: string;
  atName: string;
  atUserIds: Record<string, string>;
};

export function resolveGroupMention(params: {
  isDirect: boolean;
  senderStaffId?: string | null;
  senderNick?: string | null;
}): GroupMention | undefined {
  if (params.isDirect) return undefined;
  const atUserId =
    typeof params.senderStaffId === "string" ? params.senderStaffId.trim() : "";
  if (!atUserId) return undefined;
  const nick =
    typeof params.senderNick === "string" ? params.senderNick.trim() : "";
  const atName = nick || atUserId;
  return {
    atUserId,
    atName,
    atUserIds: { [atUserId]: atName },
  };
}

/** AI Card markdown highlights `@昵称`. */
export function appendCardMention(text: string, mention?: GroupMention): string {
  if (!mention) return text;
  const tag = `@${mention.atName}`;
  if (text.includes(tag)) return text;
  return `${text} ${tag}`;
}

/** sessionWebhook send* option. */
export function webhookAt(mention?: GroupMention): { atUserId?: string } {
  return mention ? { atUserId: mention.atUserId } : {};
}

/** Hand-rolled robot webhook text body. */
export function applyWebhookTextAt(
  body: { text: { content: string }; at?: { atUserIds: string[]; isAtAll: boolean } },
  mention?: GroupMention,
): void {
  if (!mention) return;
  const tag = `@${mention.atUserId}`;
  if (!body.text.content.includes(tag)) body.text.content += ` ${tag}`;
  body.at = { atUserIds: [mention.atUserId], isAtAll: false };
}
