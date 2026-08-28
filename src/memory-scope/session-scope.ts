import {
  DINGTALK_CHANNEL_ID,
  GROUPS_MEMORY_PREFIX,
  ROOT_MEMORY_FILENAME,
  USERS_MEMORY_PREFIX,
} from "./constants.ts"
import type {
  DingtalkChatType,
  DingtalkMemoryScope,
  DingtalkSessionClassification,
  DingtalkSessionScopeOptions,
} from "./types.ts"

const CHANNEL = DINGTALK_CHANNEL_ID

function encodePathSegment(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("\0")) return null
  if (/^[A-Za-z0-9._=-]+$/.test(trimmed) && !trimmed.startsWith("~")) return trimmed
  return `~${Buffer.from(trimmed, "utf8").toString("base64url")}`
}

function buildScopeDir(
  chatType: DingtalkChatType,
  peerId: string,
  groupSessionScope: "group" | "group_sender",
): string | null {
  if (chatType === "direct") {
    const userId = encodePathSegment(peerId)
    return userId ? `${USERS_MEMORY_PREFIX}/${userId}` : null
  }

  if (groupSessionScope === "group_sender") {
    const lastColon = peerId.lastIndexOf(":")
    if (lastColon <= 0 || lastColon === peerId.length - 1) return null
    const conversationId = peerId.slice(0, lastColon)
    const senderId = peerId.slice(lastColon + 1)
    const encodedConversationId = encodePathSegment(conversationId)
    const encodedSenderId = encodePathSegment(senderId)
    if (!encodedConversationId || !encodedSenderId) return null
    return `${GROUPS_MEMORY_PREFIX}/${encodedConversationId}/users/${encodedSenderId}`
  }

  const groupId = encodePathSegment(peerId)
  return groupId ? `${GROUPS_MEMORY_PREFIX}/${groupId}` : null
}

function malformed(reason: string): DingtalkSessionClassification {
  return { kind: "malformed_dingtalk", reason }
}

function normalizeSessionAccountId(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === "__default__") return "default"
  return trimmed
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "default"
}

export function classifyDingtalkSession(
  sessionKey: string | undefined | null,
  options: DingtalkSessionScopeOptions = {},
): DingtalkSessionClassification {
  const raw = sessionKey?.trim()
  if (!raw) return { kind: "non_dingtalk" }

  const parts = raw.split(":")
  if (parts[0]?.toLowerCase() !== "agent") return { kind: "non_dingtalk" }
  if (parts[2]?.toLowerCase() !== CHANNEL) return { kind: "non_dingtalk" }
  if (parts.some((part) => !part)) return malformed("session key contains an empty segment")
  if (parts.length < 5) return malformed("session key is incomplete")
  if (options.configurationError) return malformed(options.configurationError)

  let idx = 3
  let chatTypeToken = parts[idx]?.toLowerCase()
  let hasAccountSegment = false
  if (chatTypeToken !== "direct" && chatTypeToken !== "group") {
    const accountId = parts[idx]
    const configured = options.accountIds?.map(normalizeSessionAccountId)
    if (!accountId || (configured && !configured.includes(normalizeSessionAccountId(accountId)))) {
      return malformed("session account is not present in the effective connector config")
    }
    hasAccountSegment = true
    idx += 1
    chatTypeToken = parts[idx]?.toLowerCase()
  }

  if (chatTypeToken !== "direct" && chatTypeToken !== "group") {
    return malformed("session chat type is invalid")
  }
  const chatType = chatTypeToken as DingtalkChatType
  if (chatType === "direct" && options.requireAccountForDirect && !hasAccountSegment) {
    return malformed("direct session is missing the trusted account segment")
  }
  if (chatType === "group" && options.groupConfigurationError) {
    return malformed(options.groupConfigurationError)
  }
  const peerId = parts.slice(idx + 1).join(":")
  if (!peerId) return malformed("session peer id is missing")

  const groupSessionScope = options.groupSessionScope ?? "group"
  const scopeDir = buildScopeDir(chatType, peerId, groupSessionScope)
  if (!scopeDir) return malformed("session peer id cannot be mapped to a collision-safe path")
  const scope: DingtalkMemoryScope = {
    channel: CHANNEL,
    chatType,
    peerId,
    scopeDir,
    memoryFile: `${scopeDir}/${ROOT_MEMORY_FILENAME}`,
    sessionKey: raw,
  }
  return { kind: "valid", scope }
}

/**
 * Parse a DingTalk OpenClaw session key into a memory scope.
 * Returns null for non-DingTalk sessions.
 */
export function parseDingtalkMemoryScope(
  sessionKey: string | undefined | null,
  options?: DingtalkSessionScopeOptions,
): DingtalkMemoryScope | null {
  const classified = classifyDingtalkSession(sessionKey, options)
  return classified.kind === "valid" ? classified.scope : null
}

export function isDingtalkSessionKey(sessionKey: string | undefined | null): boolean {
  return classifyDingtalkSession(sessionKey).kind === "valid"
}
