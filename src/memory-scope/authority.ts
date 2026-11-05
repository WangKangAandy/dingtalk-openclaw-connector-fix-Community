import { createHash } from "node:crypto"

/** Identifiers retain their exact platform spelling. Never normalize an opaque ID. */
export type ScopeIdentity = Readonly<{
  channel: "dingtalk-connector"
  tenantId: string
  accountId: string
  agentId: string
  kind: "user" | "group"
  subjectId: string
}>

export type ScopeOperation =
  | "memory.read" | "memory.search" | "memory.list" | "memory.write" | "memory.delete"
  | "workshop.read" | "workshop.list" | "workshop.write" | "workshop.delete"

export const SCOPE_OPERATIONS: readonly ScopeOperation[] = Object.freeze([
  "memory.read", "memory.search", "memory.list", "memory.write", "memory.delete",
  "workshop.read", "workshop.list", "workshop.write", "workshop.delete",
])

/** Values must be supplied by the admitted channel/runtime, never tool arguments. */
export type AdmittedScopeInput = {
  tenantId: string
  accountId: string
  agentId: string
  senderId: string
  chatType: "direct" | "group"
  conversationId?: string
  sessionKey: string
  sessionId: string
  /** Must reject resets, replaced sessions, revoked admission, and stopped hosts. */
  assertCurrent: () => void
  operations: readonly ScopeOperation[]
}

/** Opaque in-process capability. JSON serialization/copying does not convey authority. */
export type ScopeGrant = Readonly<{
  identity: ScopeIdentity
  namespace: string
  actorId: string
  sessionKey: string
  sessionId: string
}>

type GrantState = {
  operations: ReadonlySet<ScopeOperation>
  assertCurrent: () => void
  revoked: boolean
  parent?: ScopeGrant
}
const grants = new WeakMap<object, GrantState>()

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !value || value.length > 1024
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)
    || /[\ud800-\udfff]/u.test(value)) throw new Error(`Missing or invalid ${name}`)
  return value
}

function operations(values: readonly ScopeOperation[]): ReadonlySet<ScopeOperation> {
  if (!Array.isArray(values) || !values.length || values.some(v => !SCOPE_OPERATIONS.includes(v))) {
    throw new Error("Explicit scope operations are required")
  }
  return new Set(values)
}

/** Stable storage address, not an authorization token. Includes every isolation dimension. */
export function scopeNamespace(identity: ScopeIdentity): string {
  if (identity.channel !== "dingtalk-connector" || !["user", "group"].includes(identity.kind)) {
    throw new Error("Invalid scope identity")
  }
  const tuple = ["dingtalk-scope-v1", identity.channel,
    id(identity.tenantId, "tenantId"), id(identity.accountId, "accountId"),
    id(identity.agentId, "agentId"), identity.kind, id(identity.subjectId, "subjectId")]
  return `v1-${createHash("sha256").update(JSON.stringify(tuple), "utf8").digest("hex")}`
}

/** Called only after channel admission. This function does not authenticate a DingTalk event. */
export function admitScope(input: AdmittedScopeInput): ScopeGrant {
  if (typeof input.assertCurrent !== "function") throw new Error("Live host authority required")
  input.assertCurrent()
  if (input.chatType !== "direct" && input.chatType !== "group") throw new Error("Invalid chat type")
  const actorId = id(input.senderId, "senderId")
  const identity: ScopeIdentity = Object.freeze({
    channel: "dingtalk-connector",
    tenantId: id(input.tenantId, "tenantId"), accountId: id(input.accountId, "accountId"),
    agentId: id(input.agentId, "agentId"), kind: input.chatType === "direct" ? "user" : "group",
    subjectId: input.chatType === "direct" ? actorId : id(input.conversationId, "conversationId"),
  })
  const grant: ScopeGrant = Object.freeze({ identity, namespace: scopeNamespace(identity), actorId,
    sessionKey: id(input.sessionKey, "sessionKey"), sessionId: id(input.sessionId, "sessionId") })
  grants.set(grant, { operations: operations(input.operations), assertCurrent: input.assertCurrent, revoked: false })
  return grant
}

function current(grant: ScopeGrant): GrantState {
  const state = grants.get(grant)
  if (!state || state.revoked) throw new Error("Unknown or revoked scope grant")
  try {
    if (state.parent) current(state.parent)
    state.assertCurrent()
  } catch (error) {
    state.revoked = true
    throw error
  }
  return state
}

/** Check before reads/disclosure and inside the final synchronous commit/transaction. */
export function assertScopeGrant(grant: ScopeGrant, operation: ScopeOperation): void {
  if (!current(grant).operations.has(operation)) throw new Error(`Scope operation denied: ${operation}`)
}

/** Lifecycle-only check; this grants no additional read or write operation. */
export function assertScopeCurrent(grant: ScopeGrant): void { current(grant) }

/** Preserve the exact operation set while adding a work/cancellation lifetime. */
export function bindScopeLifetime(parent: ScopeGrant, assertCurrent: () => void): ScopeGrant {
  return delegateScope(parent, [...current(parent).operations], assertCurrent)
}

/** Background work receives a bounded child; it can never mint a scope or widen permissions. */
export function delegateScope(parent: ScopeGrant, allowed: readonly ScopeOperation[], assertCurrent: () => void): ScopeGrant {
  const state = current(parent)
  const narrowed = operations(allowed)
  if (typeof assertCurrent !== "function") throw new Error("Delegate lifetime required")
  for (const op of narrowed) if (!state.operations.has(op)) throw new Error("Scope delegation cannot widen authority")
  assertCurrent()
  const child = Object.freeze({ ...parent })
  grants.set(child, { operations: narrowed, assertCurrent, parent, revoked: false })
  return child
}

export function revokeScope(grant: ScopeGrant): void {
  const state = grants.get(grant)
  if (!state) throw new Error("Unknown scope grant")
  state.revoked = true
}
