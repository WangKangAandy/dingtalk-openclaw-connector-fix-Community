/**
 * Official dws ≥1.0.66 identity is a machine profile (`corpId:userId`),
 * not community `--sender-id` / `DWS_AUTH_IDENTITY`.
 * Bind business commands to the inbound requester's `senderStaffId`.
 */
export function buildOfficialDwsContextHint(senderStaffId?: string | null): string {
  const userId = senderStaffId?.trim()
  if (!userId) {
    return [
      "[DingTalk DWS Context] No senderStaffId on this inbound message.",
      "Do not run business dws commands.",
      "Do not use the machine default profile.",
    ].join(" ")
  }

  return [
    `[DingTalk DWS Context] Requester DingTalk userId=${userId}.`,
    "Before any business dws command: `dws profile list --format json` and select a profile whose stable `profile` is `corpId:userId` with this userId.",
    `Then run \`dws --profile <corpId:${userId}> <command>\`.`,
    `If no authenticated profile has userId=${userId}, STOP. Ask the requester to \`dws auth login --device\` and scan as themselves.`,
    "Never use the default/deployer profile, and never pass --sender-id or DWS_AUTH_IDENTITY.",
  ].join(" ")
}
