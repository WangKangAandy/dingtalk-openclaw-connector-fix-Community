import {
  DINGTALK_CHANNEL_ID,
  GROUPS_MEMORY_PREFIX,
  ROOT_MEMORY_FILENAME,
  USERS_MEMORY_PREFIX,
} from "./constants.ts"
import type { DingtalkChatType, DingtalkMemoryScope } from "./types.ts"

const CHANNEL = DINGTALK_CHANNEL_ID

function sanitizePathSegment(value: string): string {
  return value.replace(/[/\\:]/g, "_").trim() || "unknown"
}

function buildScopeDir(chatType: DingtalkChatType, peerId: string): string {
  if (chatType === "direct") {
    return `${USERS_MEMORY_PREFIX}/${sanitizePathSegment(peerId)}`
  }

  const lastColon = peerId.lastIndexOf(":")
  if (lastColon > 0) {
    const conversationId = peerId.slice(0, lastColon)
    const senderId = peerId.slice(lastColon + 1)
    if (conversationId && senderId) {
      return `${GROUPS_MEMORY_PREFIX}/${sanitizePathSegment(conversationId)}/users/${sanitizePathSegment(senderId)}`
    }
  }

  return `${GROUPS_MEMORY_PREFIX}/${sanitizePathSegment(peerId)}`
}

/**
 * Parse a DingTalk OpenClaw session key into a memory scope.
 * Returns null for non-DingTalk sessions.
 */
export function parseDingtalkMemoryScope(sessionKey: string | undefined | null): DingtalkMemoryScope | null {
  const raw = sessionKey?.trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  if (!lower.startsWith("agent:")) return null

  const parts = lower.split(":").filter(Boolean)
  if (parts.length < 5 || parts[0] !== "agent") return null

  let idx = 2
  if (parts[idx] !== CHANNEL) return null
  idx += 1

  // per-account-channel-peer: agent:main:dingtalk-connector:account:direct:peer
  if (parts[idx] !== "direct" && parts[idx] !== "group") {
    idx += 1
  }

  const chatType = parts[idx] as DingtalkChatType | undefined
  if (chatType !== "direct" && chatType !== "group") return null

  const peerId = parts.slice(idx + 1).join(":")
  if (!peerId) return null

  const scopeDir = buildScopeDir(chatType, peerId)
  return {
    channel: CHANNEL,
    chatType,
    peerId,
    scopeDir,
    memoryFile: `${scopeDir}/${ROOT_MEMORY_FILENAME}`,
    sessionKey: raw,
  }
}

export function isDingtalkSessionKey(sessionKey: string | undefined | null): boolean {
  return parseDingtalkMemoryScope(sessionKey) !== null
}
