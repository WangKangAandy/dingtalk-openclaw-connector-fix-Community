/**
 * Official dws ≥1.0.66 identity is a machine profile (`corpId:userId`).
 * Bind business commands to inbound `chatbotCorpId` + `senderStaffId`.
 * Never invent `--sender-id` / `DWS_AUTH_IDENTITY`, and never guess from the login list.
 */

export type OfficialDwsContextHintInput = {
  senderStaffId?: string | null
  corpId?: string | null
}

/** Prefer the inbound bot corp; fall back to the account binding. Empty if neither is usable. */
export function resolveOfficialDwsCorpId(
  inboundCorpId?: string | null,
  accountCorpId?: string | null,
): string | undefined {
  const inbound = inboundCorpId?.trim()
  if (inbound) {
    return inbound
  }
  const bound = accountCorpId?.trim()
  return bound || undefined
}

export function buildOfficialDwsContextHint(input: OfficialDwsContextHintInput = {}): string {
  const userId = input.senderStaffId?.trim()
  if (!userId) {
    return [
      "[DingTalk DWS Context] No senderStaffId on this inbound message.",
      "Do not run business dws commands.",
      "Do not use the machine default profile.",
    ].join(" ")
  }

  const corpId = input.corpId?.trim()
  if (!corpId) {
    return [
      "[DingTalk DWS Context] No trusted corpId for this inbound message.",
      "Do not run business dws commands.",
      "Do not pick a profile from `dws profile list`.",
      "Do not use the machine default profile.",
    ].join(" ")
  }

  const profile = `${corpId}:${userId}`
  return [
    `[DingTalk DWS Context] Requester profile=${profile}.`,
    "Before any business dws command: `dws profile list --format json` and use only the authenticated item whose stable `profile` equals this exact corpId:userId.",
    `Then run \`dws --profile ${profile} <command>\`.`,
    `If that exact profile is missing or unauthenticated, STOP. Ask the requester to \`dws auth login --device\` and scan as themselves in this organization.`,
    "Never use the default/deployer profile, never guess among same-userId profiles, and never pass --sender-id or DWS_AUTH_IDENTITY.",
  ].join(" ")
}
