import assert from "node:assert/strict"
import { test } from "node:test"
import { ScopeAdmissions, SCOPE_BINDING, isolatedSessionKey } from "../../src/memory-scope/admission.ts"
import { assertScopeGrant } from "../../src/memory-scope/authority.ts"

const inbound = (changes = {}) => ({ tenantId: "corp", accountId: "bot", agentId: "main",
  senderId: "Alice", chatType: "direct", conversationId: "dm-1", ...changes })
const host = (admission, changes = {}) => ({ agentId: "main", sessionKey: admission.sessionKey, sessionId: "session-1",
  messageChannel: "dingtalk-connector", agentAccountId: "bot", requesterSenderId: "Alice", nativeChannelId: "dm-1",
  toolBindings: { [SCOPE_BINDING]: admission.token }, assertInvocationCurrent() {}, assertMemoryAudienceCurrent() {}, ...changes })

test("routing cannot collapse case-distinct users, tenants, accounts or chat kinds", () => {
  const a = isolatedSessionKey(inbound())
  for (const change of [{ senderId: "alice" }, { tenantId: "CORP" }, { accountId: "BOT" },
    { chatType: "group", conversationId: "Alice" }]) {
    assert.notEqual(a.toLowerCase(), isolatedSessionKey(inbound(change)).toLowerCase())
  }
  assert.equal(isolatedSessionKey(inbound({ chatType: "group", conversationId: "G" })),
    isolatedSessionKey(inbound({ chatType: "group", conversationId: "G", senderId: "Bob" })))
})

test("every host field must match the admission, session-shaped strings alone cannot authorize", () => {
  const registry = new ScopeAdmissions()
  const admission = registry.begin(inbound(), () => {})
  const ctx = host(admission)
  assertScopeGrant(registry.toolGrant(ctx), "memory.read")
  for (const field of ["agentId", "sessionKey", "sessionId", "messageChannel", "agentAccountId", "requesterSenderId", "nativeChannelId"]) {
    assert.throws(() => registry.toolGrant({ ...ctx, [field]: "wrong" }), field)
    assert.throws(() => registry.toolGrant({ ...ctx, [field]: undefined }), field)
  }
  assert.throws(() => registry.toolGrant({ ...ctx, toolBindings: undefined }))
  assert.throws(() => registry.toolGrant({ ...ctx, toolBindings: { [SCOPE_BINDING]: "forged" } }))
  assert.throws(() => registry.toolGrant({ ...ctx, assertInvocationCurrent: undefined }))
})

test("background keeps source authority after foreground ends, but loses it on reset", () => {
  let foregroundLive = true, sessionLive = true
  const registry = new ScopeAdmissions({ captureSessionLease: () => () => { if (!sessionLive) throw Error("session reset") } })
  const admission = registry.begin(inbound(), () => {})
  const ctx = host(admission, {
    assertInvocationCurrent() { if (!foregroundLive) throw Error("foreground ended") },
    assertMemoryAudienceCurrent() { if (!sessionLive) throw Error("session reset") },
  })
  const foreground = registry.toolGrant(ctx)
  const background = registry.backgroundGrant(ctx, ["workshop.write"], () => {})
  foregroundLive = false
  assert.throws(() => assertScopeGrant(foreground, "memory.read"), /foreground ended/)
  assertScopeGrant(background, "workshop.write")
  sessionLive = false
  assert.throws(() => assertScopeGrant(background, "workshop.write"), /session reset/)
})

test("background without a live host session guard is rejected", () => {
  const registry = new ScopeAdmissions()
  const admission = registry.begin(inbound(), () => {})
  assert.throws(() => registry.backgroundGrant(host(admission, { assertMemoryAudienceCurrent: undefined }),
    ["workshop.write"], () => {}), /session lease unavailable/)
})

test("hook lookup uses the same admission and refuses absent, forged or stale session authority", () => {
  const registry = new ScopeAdmissions({ captureSessionLease: () => () => {} })
  const admission = registry.begin(inbound(), () => {})
  const tool = registry.toolGrant(host(admission))
  const ctx = { agentId: "main", sessionKey: admission.sessionKey, sessionId: "session-1",
    channel: "dingtalk-connector", accountId: "bot", senderId: "Alice", chatId: "dm-1",
    channelContext: { chat: { [SCOPE_BINDING]: admission.token, dingtalkNativeConversationId: "dm-1" } } }
  const background = registry.sourceGrant(ctx, ["workshop.write"], () => {})
  assert.equal(tool.namespace, background.namespace)
  assert.throws(() => registry.sourceGrant({ ...ctx, channelContext: {} }, ["workshop.write"], () => {}))
  assert.throws(() => registry.sourceGrant({ ...ctx, channelContext: { chat: { [SCOPE_BINDING]: admission.token } } }, ["workshop.write"], () => {}))
  assert.throws(() => registry.sourceGrant({ ...ctx, sessionId: "other" }, ["workshop.write"], () => {}))
  registry.invalidateSession(admission.sessionKey)
  assert.throws(() => assertScopeGrant(background, "workshop.write"))
})

test("new admitted group input revokes old work while keeping the shared durable namespace", () => {
  const registry = new ScopeAdmissions()
  const a = registry.begin(inbound({ chatType: "group", conversationId: "G" }), () => {})
  const ga = registry.toolGrant(host(a, { nativeChannelId: "G" }))
  const b = registry.begin(inbound({ chatType: "group", conversationId: "G", senderId: "Bob" }), () => {})
  const gb = registry.toolGrant(host(b, { nativeChannelId: "G", requesterSenderId: "Bob" }))
  assert.equal(ga.namespace, gb.namespace)
  assert.throws(() => assertScopeGrant(ga, "workshop.write"))
  assertScopeGrant(gb, "workshop.write")
})

test("Host-deferred input preserves executing authority until adoption and keeps later queued tokens", () => {
  const registry = new ScopeAdmissions()
  const first = registry.begin(inbound(), () => {})
  const oldGrant = registry.toolGrant(host(first))
  const second = registry.begin(inbound(), () => {}, { deferSupersession: true })
  const third = registry.begin(inbound(), () => {}, { deferSupersession: true })
  assertScopeGrant(oldGrant, "memory.read")
  registry.activate(second.token)
  assert.throws(() => assertScopeGrant(oldGrant, "memory.read"))
  const nextGrant = registry.toolGrant(host(second))
  assertScopeGrant(nextGrant, "memory.read")
  registry.activate(third.token)
  assert.throws(() => assertScopeGrant(nextGrant, "memory.read"))
  assertScopeGrant(registry.toolGrant(host(third)), "memory.read")
})

test("parallel control does not replace the foreground and abandoned pending input grants nothing later", () => {
  const registry = new ScopeAdmissions()
  const main = registry.begin(inbound(), () => {})
  const foreground = registry.toolGrant(host(main))
  const side = registry.begin(inbound(), () => {}, { deferSupersession: true })
  registry.activate(side.token, false)
  const sideGrant = registry.toolGrant(host(side))
  assertScopeGrant(foreground, "memory.read")
  registry.release(side.token)
  assertScopeGrant(foreground, "memory.read")
  assert.throws(() => assertScopeGrant(sideGrant, "memory.read"))
  const dropped = registry.begin(inbound(), () => {}, { deferSupersession: true })
  registry.discardPending(dropped.token)
  assert.throws(() => registry.activate(dropped.token), /Unknown/)
  assertScopeGrant(foreground, "memory.read")
})

test("pending interaction keeps source liveness without extending the original tool invocation", () => {
  let invocation = true, session = true
  const registry = new ScopeAdmissions({ captureSessionLease: () => () => { if (!session) throw Error('session ended') } })
  const source = registry.begin(inbound(), () => {})
  const context = host(source, { assertInvocationCurrent() { if (!invocation) throw Error('tool ended') } })
  const guard = registry.captureSourceGuard(context)
  invocation = false
  guard()
  assert.throws(() => registry.captureSourceGuard(context), /tool ended/)
  session = false
  assert.throws(guard, /session ended/)
})

test("config revocation, registry stop and expiry all revoke captured grants", () => {
  let configEnabled = true, now = 0
  const registry = new ScopeAdmissions({ now: () => now, ttlMs: 100 })
  const admission = registry.begin(inbound(), () => { if (!configEnabled) throw Error("disabled") })
  const grant = registry.toolGrant(host(admission))
  configEnabled = false
  assert.throws(() => assertScopeGrant(grant, "memory.write"), /disabled/)
  configEnabled = true
  assert.throws(() => assertScopeGrant(grant, "memory.write"), /revoked/)
  const fresh = registry.begin(inbound(), () => {})
  const freshGrant = registry.toolGrant(host(fresh))
  now = 100
  assert.throws(() => assertScopeGrant(freshGrant, "memory.write"), /expired/)
  registry.stop()
  assert.throws(() => registry.begin(inbound(), () => {}), /stopped/)
})

test("capacity failure does not evict another user's live admission", () => {
  const registry = new ScopeAdmissions({ capacity: 1 })
  const admission = registry.begin(inbound(), () => {})
  const grant = registry.toolGrant(host(admission))
  assert.throws(() => registry.begin(inbound({ senderId: "Bob" }), () => {}), /capacity/)
  assertScopeGrant(grant, "memory.read")
})

test("inbound /new can bind a fresh incarnation without reviving old tools or background grants", async () => {
  const registry = new ScopeAdmissions({ captureSessionLease: () => () => {} })
  const old = registry.begin(inbound(), () => {})
  const oldTool = registry.toolGrant(host(old))
  const oldBackground = registry.backgroundGrant(host(old), ["workshop.write"], () => {})
  const incoming = registry.begin(inbound(), () => {})
  await registry.runInbound(incoming.token, async () => {
    registry.invalidateForReset(incoming.sessionKey, "new")
    // Both memory and workshop subscribers see the same host reset event.
    registry.invalidateForReset(incoming.sessionKey, "new")
    const current = registry.toolGrant(host(incoming, { sessionId: "session-2" }))
    assert.equal(current.namespace, oldTool.namespace)
    assertScopeGrant(current, "memory.read")
    assert.throws(() => assertScopeGrant(oldTool, "memory.read"))
    assert.throws(() => assertScopeGrant(oldBackground, "workshop.write"))
    // A subsequent reset after tools are bound can never refresh that lease.
    registry.invalidateForReset(incoming.sessionKey, "reset")
    assert.throws(() => assertScopeGrant(current, "memory.read"))
    assert.throws(() => registry.toolGrant(host(incoming, { sessionId: "session-3" })))
  })
})

test("reset without active matching ingress revokes even unbound admission", async () => {
  for (const reason of ["new", "reset", "idle", "daily", "deleted", "shutdown", "restart", "unknown", "compaction", undefined]) {
    const registry = new ScopeAdmissions()
    const incoming = registry.begin(inbound(), () => {})
    registry.invalidateForReset(incoming.sessionKey, reason)
    assert.throws(() => registry.toolGrant(host(incoming)))
  }
  const registry = new ScopeAdmissions()
  const incoming = registry.begin(inbound(), () => {})
  await registry.runInbound(incoming.token, async () => {})
  registry.invalidateForReset(incoming.sessionKey, "new")
  assert.throws(() => registry.toolGrant(host(incoming)))
})

test("another user's reset, non-reset commands and delayed callbacks cannot reuse ingress authority", async () => {
  const registry = new ScopeAdmissions()
  const alice = registry.begin(inbound(), () => {})
  const bob = registry.begin(inbound({ senderId: "Bob" }), () => {})
  let delayed
  await registry.runInbound(alice.token, async () => {
    registry.invalidateForReset(bob.sessionKey, "new")
    assert.throws(() => registry.toolGrant(host(bob, { requesterSenderId: "Bob" })))
    // This promise resumes with the captured ALS store after dispatch returns.
    delayed = new Promise(resolve => setTimeout(() => {
      registry.invalidateForReset(alice.sessionKey, "new")
      resolve()
    }, 10))
  })
  await delayed
  assert.throws(() => registry.toolGrant(host(alice)))
  const other = registry.begin(inbound(), () => {})
  await registry.runInbound(other.token, async () => registry.invalidateForReset(other.sessionKey, "delete"))
  assert.throws(() => registry.toolGrant(host(other)))
})

test("one ingress capability cannot dispatch twice", async () => {
  const registry = new ScopeAdmissions()
  const incoming = registry.begin(inbound(), () => {})
  await registry.runInbound(incoming.token, async () => {})
  await assert.rejects(registry.runInbound(incoming.token, async () => {}), /already dispatched/)
})

test("idle and daily rollover retain only the current not-yet-bound inbound capability", async () => {
  for (const reason of ["idle", "daily"]) {
    const registry = new ScopeAdmissions()
    const old = registry.begin(inbound(), () => {})
    const oldGrant = registry.toolGrant(host(old))
    const fresh = registry.begin(inbound(), () => {})
    await registry.runInbound(fresh.token, async () => {
      registry.invalidateForReset(fresh.sessionKey, reason)
      const current = registry.toolGrant(host(fresh, { sessionId: "next-session" }))
      assertScopeGrant(current, "memory.read")
      assert.throws(() => assertScopeGrant(oldGrant, "memory.read"))
      registry.invalidateForReset(fresh.sessionKey, reason)
      assert.throws(() => assertScopeGrant(current, "memory.read"))
    })
  }
})

test("deletion, shutdown and compaction never preserve pending inbound authority", async () => {
  for (const reason of ["deleted", "shutdown", "restart", "unknown", "compaction", undefined]) {
    const registry = new ScopeAdmissions()
    const fresh = registry.begin(inbound(), () => {})
    await registry.runInbound(fresh.token, async () => registry.invalidateForReset(fresh.sessionKey, reason))
    assert.throws(() => registry.toolGrant(host(fresh)))
  }
})
