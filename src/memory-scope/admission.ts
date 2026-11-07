import { randomUUID } from "node:crypto"
import { AsyncLocalStorage } from "node:async_hooks"
import { admitScope, delegateScope, revokeScope, scopeNamespace, SCOPE_OPERATIONS,
  type AdmittedScopeInput, type ScopeGrant, type ScopeIdentity, type ScopeOperation } from "./authority.ts"
import type { CaptureScopeSessionLease } from "./session-lease.ts"

export const SCOPE_BINDING = "dingtalk.memoryScope.v1"
export type InboundScope = Pick<AdmittedScopeInput, "tenantId" | "accountId" | "agentId" | "senderId" | "chatType" | "conversationId">
export type AdmissionOptions = { routedSessionKey?: string; deferSupersession?: boolean }

/** Derive before routing so host lowercasing cannot merge case-distinct native identities. */
export function inboundIdentity(input: InboundScope): ScopeIdentity {
  // Use the same strict validation as grants. No authority escapes this helper.
  const grant = admitScope({ ...input, sessionKey: "validation", sessionId: "validation",
    assertCurrent() {}, operations: ["memory.read"] })
  revokeScope(grant)
  return grant.identity
}

export function isolatedSessionKey(input: InboundScope): string {
  const identity = inboundIdentity(input)
  // Hash the complete tuple, including the agent, before the host applies key normalization.
  // Agent IDs are OpenClaw-configured identifiers, never platform sender IDs.
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(identity.agentId)) throw new Error("Hard scope requires a canonical host agent ID")
  return `agent:${identity.agentId}:dingtalk-connector:${input.chatType}:${scopeNamespace(identity)}`
}

type Source = {
  input: InboundScope
  sessionKey: string
  scopedStorage: boolean
  sessionId?: string
  assertAdmissionCurrent: () => void
  assertSessionCurrent?: () => void
  grant?: ScopeGrant
  active: boolean
  expiresAt: number
  dispatchStarted?: boolean
  pendingSupersession?: boolean
}

export type ScopeHostContext = {
  agentId?: string
  sessionKey?: string
  sessionId?: string
  messageChannel?: string
  agentAccountId?: string
  requesterSenderId?: string
  nativeChannelId?: string
  toolBindings?: Readonly<Record<string, unknown>>
  assertInvocationCurrent?: () => void
  assertMemoryAudienceCurrent?: () => void
}

export type ScopeHookContext = {
  agentId?: string; sessionKey?: string; sessionId?: string; channel?: string;
  accountId?: string; senderId?: string; chatId?: string;
  channelContext?: { chat?: { [key: string]: unknown } };
  assertMemoryAudienceCurrent?: () => void;
}

/** Owns ephemeral admitted turns. No serialized grant or session-key lookup is accepted. */
export class ScopeAdmissions {
  private readonly dispatchContext = new AsyncLocalStorage<{ token: string; active: boolean }>()
  private readonly sources = new Map<string, Source>()
  private readonly sessionTokens = new Map<string, Set<string>>()
  private stopped = false
  private readonly capacity: number
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly captureSessionLease?: CaptureScopeSessionLease

  constructor(options: { capacity?: number; ttlMs?: number; now?: () => number; captureSessionLease?: CaptureScopeSessionLease } = {}) {
    this.capacity = options.capacity ?? 4096
    this.ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000
    this.now = options.now ?? Date.now
    this.captureSessionLease = options.captureSessionLease
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || !Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1) {
      throw new Error("Invalid admission resource limits")
    }
  }

  /** Call after channel access checks; new admitted input invalidates retained work for this session. */
  begin(input: InboundScope, assertAdmissionCurrent: () => void, options: AdmissionOptions = {}): Readonly<{ token: string; sessionKey: string }> {
    if (this.stopped) throw new Error("Scope registry stopped")
    if (typeof assertAdmissionCurrent !== "function") throw new Error("Live admission guard required")
    assertAdmissionCurrent()
    if (!input.conversationId || input.conversationId !== input.conversationId.trim()) {
      throw new Error("Native conversation ID required for admission")
    }
    // Scoped storage owns its isolated session key; runtime-only tools retain
    // the channel's existing routing while binding the same trusted sender.
    const sessionKey = options.routedSessionKey ?? isolatedSessionKey(input)
    if (typeof sessionKey !== "string" || !sessionKey) throw new Error("Trusted session key required")
    if (!options.deferSupersession) this.invalidateSession(sessionKey)
    this.sweep()
    if (this.sources.size >= this.capacity) throw new Error("Scope admission capacity exceeded")
    const token = randomUUID()
    const source: Source = { input: Object.freeze({ ...input }), sessionKey, scopedStorage: options.routedSessionKey === undefined,
      active: true, assertAdmissionCurrent, expiresAt: this.now() + this.ttlMs,
      pendingSupersession: options.deferSupersession === true }
    this.sources.set(token, source)
    const tokens = this.sessionTokens.get(sessionKey) ?? new Set<string>()
    tokens.add(token)
    this.sessionTokens.set(sessionKey, tokens)
    return Object.freeze({ token, sessionKey })
  }

  /** Queued input replaces the previous source only when Host adopts it. */
  activate(token: string, supersede = true): void {
    const source = this.sources.get(token)
    if (!source) throw new Error("Unknown scope binding")
    this.assertSource(token, source)
    if (!source.pendingSupersession) return
    if (supersede) for (const other of this.sessionTokens.get(source.sessionKey) ?? []) {
      if (other !== token && !this.sources.get(other)?.pendingSupersession) this.release(other)
    }
    source.pendingSupersession = false
  }

  discardPending(token: string): void {
    if (this.sources.get(token)?.pendingSupersession) this.release(token)
  }

  private assertSource(token: string, source: Source): void {
    if (this.stopped || !source.active || this.sources.get(token) !== source || this.now() >= source.expiresAt) {
      throw new Error("Scope admission expired")
    }
    source.assertAdmissionCurrent()
    source.assertSessionCurrent?.()
  }

  private match(ctx: ScopeHostContext): { token: string; source: Source } {
    const token = ctx.toolBindings?.[SCOPE_BINDING]
    if (typeof token !== "string") throw new Error("Missing trusted scope binding")
    const source = this.sources.get(token)
    if (!source) throw new Error("Unknown scope binding")
    this.assertSource(token, source)
    const expectedChat = source.input.conversationId
    const expected = { messageChannel: "dingtalk-connector", agentId: source.input.agentId,
      agentAccountId: source.input.accountId, requesterSenderId: source.input.senderId,
      sessionKey: source.sessionKey, nativeChannelId: expectedChat }
    for (const field of Object.keys(expected) as (keyof typeof expected)[]) {
      if (!expected[field] || ctx[field] !== expected[field]) throw new Error(`Host context does not match admitted scope: ${field}`)
    }
    if (!ctx.sessionId || typeof ctx.assertInvocationCurrent !== "function") throw new Error("Host context does not match admitted scope: invocation lifetime")
    ctx.assertInvocationCurrent()
    if (source.sessionId && source.sessionId !== ctx.sessionId) throw new Error("Source session incarnation changed")
    if (!source.sessionId) {
      // Capture using the actual host sessionId, not the session key's apparent shape.
      source.assertSessionCurrent = this.captureSessionLease?.({
        agentId: source.input.agentId, sessionKey: source.sessionKey, sessionId: ctx.sessionId,
      })
      source.sessionId = ctx.sessionId
    }
    return { token, source }
  }

  /** A tool owns only a child invocation grant. Source authority outlives that invocation. */
  requester(ctx: ScopeHostContext) {
    const { token, source } = this.match(ctx)
    return Object.freeze({ tenantId: source.input.tenantId, senderId: source.input.senderId,
      assertCurrent: () => { ctx.assertInvocationCurrent!(); this.assertSource(token, source) } })
  }

  toolGrant(ctx: ScopeHostContext, allowed: readonly ScopeOperation[] = SCOPE_OPERATIONS): ScopeGrant {
    const { token, source } = this.match(ctx)
    if (!source.scopedStorage) throw new Error("Scoped storage is not admitted for this turn")
    if (!source.grant) {
      source.grant = admitScope({ ...source.input, sessionKey: source.sessionKey, sessionId: source.sessionId!,
        assertCurrent: () => this.assertSource(token, source), operations: SCOPE_OPERATIONS })
    }
    return delegateScope(source.grant, allowed, ctx.assertInvocationCurrent!)
  }

  /** Background needs an independent session lease, not the foreground memory audience. */
  backgroundGrant(ctx: ScopeHostContext, allowed: readonly ScopeOperation[], assertTaskCurrent: () => void): ScopeGrant {
    const { token, source } = this.match(ctx)
    if (!source.assertSessionCurrent) throw new Error("Host session lease unavailable for background scope")
    this.toolGrant(ctx)
    this.assertSource(token, source)
    return delegateScope(source.grant!, allowed, assertTaskCurrent)
  }

  /** Hook lookup requires the out-of-band token plus the actual host session incarnation. */
  private sourceContext(ctx: ScopeHookContext): ScopeHostContext {
    const token = ctx.channelContext?.chat?.[SCOPE_BINDING]
    const source = typeof token === "string" ? this.sources.get(token) : undefined
    if (!source || typeof token !== "string") throw new Error("Missing trusted source binding")
    return {
      agentId: ctx.agentId, sessionKey: ctx.sessionKey, sessionId: ctx.sessionId,
      messageChannel: ctx.channel, agentAccountId: ctx.accountId, requesterSenderId: ctx.senderId,
      nativeChannelId: ctx.channelContext?.chat?.dingtalkNativeConversationId as string | undefined,
      toolBindings: { [SCOPE_BINDING]: token },
      // The source grant has its own host lease; foreground audience release grants nothing.
      assertInvocationCurrent: () => this.assertSource(token, source),
    }
  }

  /** Prompt guidance can verify a requester without granting memory or Workshop storage. */
  sourceRequester(ctx: ScopeHookContext) { return this.requester(this.sourceContext(ctx)) }

  sourceGrant(ctx: ScopeHookContext, allowed: readonly ScopeOperation[], assertTaskCurrent: () => void): ScopeGrant {
    return this.backgroundGrant(this.sourceContext(ctx), allowed, assertTaskCurrent)
  }

  release(token: string): void {
    const source = this.sources.get(token)
    if (!source) return
    source.active = false
    if (source.grant) revokeScope(source.grant)
    this.sources.delete(token)
    const set = this.sessionTokens.get(source.sessionKey)
    set?.delete(token)
    if (!set?.size) this.sessionTokens.delete(source.sessionKey)
  }

  /** Lexically bind the real host dispatch, never a model-selected session key. */
  async runInbound<T>(token: string, run: () => Promise<T>): Promise<T> {
    const source = this.sources.get(token)
    if (!source) throw new Error("Unknown scope binding")
    this.assertSource(token, source)
    if (source.dispatchStarted) throw new Error("Inbound scope already dispatched")
    source.dispatchStarted = true
    const context = { token, active: true }
    try { return await this.dispatchContext.run(context, run) }
    finally { context.active = false }
  }

  /**
   * Host rollover ends the previous incarnation before binding the new inbound turn.
   * Preserve only that still-unbound, lexically active ingress capability. No
   * existing grant/lease is renewed; admin resets and detached callbacks have no
   * such capability and revoke everything. A session key can only revoke.
   */
  invalidateForReset(sessionKey: string, reason?: string): void {
    const context = this.dispatchContext.getStore()
    const incoming = context?.active ? this.sources.get(context.token) : undefined
    const preserve = ["new", "reset", "idle", "daily"].includes(reason ?? "") && incoming?.sessionKey === sessionKey
      && !incoming.sessionId && !incoming.grant && !incoming.assertSessionCurrent
      ? context?.token : undefined
    for (const token of this.sessionTokens.get(sessionKey) ?? []) {
      if (token !== preserve) this.release(token)
    }
  }

  invalidateSession(sessionKey: string): void {
    for (const token of this.sessionTokens.get(sessionKey) ?? []) this.release(token)
  }

  private sweep(): void {
    for (const [token, source] of this.sources) if (this.now() >= source.expiresAt) this.release(token)
  }

  stop(): void {
    this.stopped = true
    for (const token of this.sources.keys()) this.release(token)
  }
}
