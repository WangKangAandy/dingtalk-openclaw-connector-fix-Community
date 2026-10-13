/**
 * Group-chat @ of the human who mentioned the bot.
 *
 * Use senderStaffId only. DingTalk's encrypted senderId is not a userid
 * and will not produce a blue @ or notification.
 */
export function resolveGroupMention(params: {
  isDirect: boolean;
  senderStaffId?: string | null;
  senderNick?: string | null;
}): { atUserId: string; atUserIds: Record<string, string> } | undefined {
  if (params.isDirect) return undefined;
  const atUserId =
    typeof params.senderStaffId === "string" ? params.senderStaffId.trim() : "";
  if (!atUserId) return undefined;
  const nick =
    typeof params.senderNick === "string" ? params.senderNick.trim() : "";
  return {
    atUserId,
    atUserIds: { [atUserId]: nick || atUserId },
  };
}
