import { inboundIdentity, isolatedSessionKey, SCOPE_BINDING, type InboundScope } from "./admission.ts"
import type { ScopeServices } from "./services.ts"

export type ScopeInboundEvent = {
  conversationType?: unknown; conversationId?: unknown; senderStaffId?: unknown;
  chatbotCorpId?: unknown; senderCorpId?: unknown; robotCode?: unknown;
}
export type ScopeAccountPolicy = {
  enabled?: boolean; clientId?: string | number; chatbotCorpId?: string;
  dmPolicy?: string; allowFrom?: (string | number)[];
  groupPolicy?: string; groupAllowFrom?: (string | number)[];
  groups?: Record<string, { enabled?: boolean; allowFrom?: (string | number)[] } | undefined>;
  sharedMemoryAcrossConversations?: boolean; groupSessionScope?: string;
}

/** Input is from the authenticated Stream callback, never the user message body. */
export function resolveInboundScope(event: ScopeInboundEvent, accountId: string, agentId: string,
  policy: ScopeAccountPolicy): InboundScope {
  const required = (value: unknown, field: string): string => {
    if (typeof value !== "string" || !value || value !== value.trim()) throw new Error(`Missing trusted DingTalk ${field}`)
    return value
  }
  if (event.conversationType !== "1" && event.conversationType !== "2") throw new Error("Unknown DingTalk conversation type")
  const tenantId = required(event.chatbotCorpId, "chatbotCorpId")
  const senderId = required(event.senderStaffId, "senderStaffId")
  const conversationId = required(event.conversationId, "conversationId")
  if (policy.chatbotCorpId && policy.chatbotCorpId !== tenantId) throw new Error("DingTalk tenant does not match account")
  if (event.senderCorpId !== undefined && event.senderCorpId !== tenantId) throw new Error("Cross-tenant sender requires explicit identity support")
  if (event.robotCode !== undefined && event.robotCode !== String(policy.clientId)) throw new Error("DingTalk robot does not match account")
  const input: InboundScope = { tenantId, accountId, agentId, senderId, conversationId,
    chatType: event.conversationType === "1" ? "direct" : "group" }
  inboundIdentity(input)
  return Object.freeze(input)
}

/** Re-run against current effective account policy before granting or using authority. */
export function assertInboundAccess(input: InboundScope, policy: ScopeAccountPolicy, requireScopedRouting = true): void {
  if (policy.enabled === false) throw new Error("DingTalk account disabled")
  if (requireScopedRouting && (policy.sharedMemoryAcrossConversations === true || policy.groupSessionScope === "group_sender")) {
    throw new Error("Hard memory requires private-user routing and shared-group routing")
  }
  const contains = (items: (string | number)[] | undefined, id: string) => items?.some(value => String(value) === id) === true
  if (input.chatType === "direct") {
    const mode = policy.dmPolicy ?? "open"
    if (mode !== "open" && !(mode === "allowlist" && contains(policy.allowFrom, input.senderId))) {
      throw new Error("DingTalk private sender not admitted")
    }
  } else {
    const mode = policy.groupPolicy ?? "open"
    if (mode !== "open" && !(mode === "allowlist" && contains(policy.groupAllowFrom, input.conversationId!))) {
      throw new Error("DingTalk group not admitted")
    }
    const group = policy.groups?.[input.conversationId!]
    if (group?.enabled === false || (group?.allowFrom && !contains(group.allowFrom, input.senderId))) {
      throw new Error("DingTalk group sender not admitted")
    }
  }
}

export function admitInboundScope(services: ScopeServices, input: InboundScope, assertCurrent: () => void,
  options: { routedSessionKey?: string; deferSupersession?: boolean } = {}) {
  services.assertCurrent()
  const admission = services.admissions.begin(input, () => { services.assertCurrent(); assertCurrent() }, options)
  return Object.freeze({ ...admission,
    activate: (supersede = true) => services.admissions.activate(admission.token, supersede),
    discardPending: () => services.admissions.discardPending(admission.token),
    release: () => services.admissions.release(admission.token),
    run: <T>(dispatch: () => Promise<T>) => services.admissions.runInbound(admission.token, dispatch),
    // Foreground tools remain host-owned; only the detached reviewer has a narrow cap.
    get replyOptions() { return {} },
    context: Object.freeze({
      SessionKey: admission.sessionKey, NativeChannelId: input.conversationId,
      GatewayRunToolBindings: Object.freeze({ [SCOPE_BINDING]: admission.token }),
      ChannelContext: Object.freeze({ chat: Object.freeze({
        [SCOPE_BINDING]: admission.token, dingtalkNativeConversationId: input.conversationId,
      }) }),
    }),
  })
}

export { isolatedSessionKey }
