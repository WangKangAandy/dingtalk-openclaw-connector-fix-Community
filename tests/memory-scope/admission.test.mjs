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
