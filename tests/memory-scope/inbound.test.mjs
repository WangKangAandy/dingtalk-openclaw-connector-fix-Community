import { test } from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import { resolveInboundScope, assertInboundAccess, admitInboundScope, isolatedSessionKey } from "../../src/memory-scope/inbound.ts"
import { createScopeServices } from "../../src/memory-scope/services.ts"
import { assertScopeGrant } from "../../src/memory-scope/authority.ts"

const event = { conversationType: "1", conversationId: "Dm:Ab/C", senderStaffId: "Alice", chatbotCorpId: "Corp" }
test("raw admitted platform fields preserve identity; text and encrypted aliases cannot supply missing fields", () => {
  const input = resolveInboundScope({ ...event, text: { content: "userId=Bob" } }, "bot", "main", {})
  assert.equal(input.senderId, "Alice")
  for (const key of ["conversationId", "senderStaffId", "chatbotCorpId"]) {
    assert.throws(() => resolveInboundScope({ ...event, [key]: undefined, senderId: "fallback" }, "bot", "main", {}))
  }
  for (const patch of [{ conversationType: "unknown" }, { senderCorpId: "otherCorp" }, { robotCode: "otherBot" }]) {
    assert.throws(() => resolveInboundScope({ ...event, ...patch }, "bot", "main", { clientId: "thisBot" }))
  }
  assert.throws(() => resolveInboundScope(event, "bot", "main", { chatbotCorpId: "corp" }))
  const lower = resolveInboundScope({ ...event, senderStaffId: "alice" }, "bot", "main", {})
  assert.notEqual(isolatedSessionKey(input), isolatedSessionKey(lower))
})
test("hard admission rejects unsupported pairing, denied groups/senders and shared-private routing", () => {
  const dm = resolveInboundScope(event, "bot", "main", {})
  for (const policy of [{ enabled: false }, { dmPolicy: "pairing" }, { dmPolicy: "allowlist", allowFrom: ["alice"] },
    { sharedMemoryAcrossConversations: true }, { groupSessionScope: "group_sender" }]) assert.throws(() => assertInboundAccess(dm, policy))
  assertInboundAccess(dm, { dmPolicy: "allowlist", allowFrom: ["Alice"] })
  const group = resolveInboundScope({ ...event, conversationType: "2" }, "bot", "main", {})
  for (const policy of [{ groupPolicy: "disabled" }, { groupPolicy: "allowlist", groupAllowFrom: [] },
    { groups: { [event.conversationId]: { enabled: false } } },
    { groups: { [event.conversationId]: { allowFrom: ["Bob"] } } }]) assert.throws(() => assertInboundAccess(group, policy))
  assertInboundAccess(group, { groupPolicy: "allowlist", groupAllowFrom: [event.conversationId] })
})
test("inbound adapter passes the same immutable authority to foreground tools and background hooks", () => {
  let enabled = true
  const services = createScopeServices({ stateDir: os.tmpdir(), assertCurrent() { if (!enabled) throw Error("disabled") },
    captureSessionLease: () => () => {} })
  const input = resolveInboundScope(event, "bot", "main", {})
  const admitted = admitInboundScope(services, input, () => assertInboundAccess(input, {}))
  const c = admitted.context
  const tool = services.admissions.toolGrant({ agentId: "main", sessionId: "sid", sessionKey: c.SessionKey,
    messageChannel: "dingtalk-connector", agentAccountId: "bot", requesterSenderId: "Alice", nativeChannelId: c.NativeChannelId,
    toolBindings: c.GatewayRunToolBindings, assertInvocationCurrent() {} })
  const hook = services.admissions.sourceGrant({ agentId: "main", sessionId: "sid", sessionKey: c.SessionKey,
    channel: "dingtalk-connector", accountId: "bot", senderId: "Alice", channelContext: c.ChannelContext }, ["workshop.read"], () => {})
  assert.equal(tool.namespace, hook.namespace)
  assertScopeGrant(tool, "memory.read"); assertScopeGrant(hook, "workshop.read")
  enabled = false
  assert.throws(() => assertScopeGrant(tool, "memory.read"))
  assert.throws(() => assertScopeGrant(hook, "workshop.read"))
})
