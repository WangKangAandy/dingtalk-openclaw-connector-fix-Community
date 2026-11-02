import assert from "node:assert/strict"
import { test } from "node:test"
import { admitScope, assertScopeGrant, delegateScope, revokeScope, SCOPE_OPERATIONS } from "../../src/memory-scope/authority.ts"

const input = (overrides = {}) => ({ tenantId: "corp-A", accountId: "bot-A", agentId: "main",
  senderId: "User:A", chatType: "direct", sessionKey: "opaque-runtime-key", sessionId: "incarnation-1",
  assertCurrent() {}, operations: SCOPE_OPERATIONS, ...overrides })

test("all isolation dimensions preserve opaque spelling and avoid delimiter collisions", () => {
  const base = admitScope(input())
  const variants = [
    { senderId: "user:a" }, { senderId: "User_A" }, { senderId: "User/A" },
    { tenantId: "corp-B" }, { accountId: "bot-B" }, { agentId: "other" },
    { chatType: "group", conversationId: "User:A" },
  ].map(change => admitScope(input(change)).namespace)
  assert.equal(new Set([base.namespace, ...variants]).size, variants.length + 1)
})

test("a group shares memory and learning across senders; other groups and private chats do not", () => {
  const a = admitScope(input({ chatType: "group", conversationId: "group:1" }))
  const b = admitScope(input({ chatType: "group", conversationId: "group:1", senderId: "B" }))
  assert.equal(a.namespace, b.namespace)
  assert.notEqual(a.actorId, b.actorId)
  assert.notEqual(a.namespace, admitScope(input({ chatType: "group", conversationId: "group:2" })).namespace)
  assert.notEqual(a.namespace, admitScope(input()).namespace)
})

test("session routing is not identity and reset does not rename durable memory", () => {
  assert.equal(admitScope(input()).namespace,
    admitScope(input({ sessionKey: "unrelated:route", sessionId: "new-incarnation" })).namespace)
})

test("missing identity is refused without owner/default fallback", () => {
  for (const field of ["tenantId", "accountId", "agentId", "senderId", "sessionKey", "sessionId"]) {
    assert.throws(() => admitScope(input({ [field]: "" })))
  }
  assert.throws(() => admitScope(input({ chatType: "group" })))
  for (const value of [" A ", "\u0000", "\ud800", "x".repeat(1025)]) {
    assert.throws(() => admitScope(input({ senderId: value })))
  }
  assert.throws(() => admitScope(input({ assertCurrent: undefined })))
  assert.throws(() => admitScope(input({ operations: [] })))
})

test("copied and JSON grants cannot authorize even with every field correct", () => {
  const grant = admitScope(input())
  assertScopeGrant(grant, "memory.read")
  assert.throws(() => assertScopeGrant({ ...grant }, "memory.read"))
  assert.throws(() => assertScopeGrant(JSON.parse(JSON.stringify(grant)), "workshop.write"))
  assert.throws(() => { grant.identity.subjectId = "B" })
})

test("delegation narrows operations and retains both source and child lifetime checks", () => {
  let sourceActive = true, childActive = true
  const parent = admitScope(input({ operations: ["memory.read", "workshop.write"],
    assertCurrent() { if (!sourceActive) throw Error("source reset") } }))
  const child = delegateScope(parent, ["workshop.write"], () => { if (!childActive) throw Error("review cancelled") })
  const sibling = delegateScope(parent, ["workshop.write"], () => {})
  assertScopeGrant(child, "workshop.write")
  assert.throws(() => assertScopeGrant(child, "memory.read"))
  assert.throws(() => delegateScope(parent, ["memory.delete"], () => {}))
  childActive = false
  assert.throws(() => assertScopeGrant(child, "workshop.write"), /review cancelled/)
  childActive = true; sourceActive = false
  assert.throws(() => assertScopeGrant(child, "workshop.write"), /revoked/)
  assert.throws(() => assertScopeGrant(sibling, "workshop.write"), /source reset/)
})

test("revoking a parent invalidates already captured child and grandchild grants", () => {
  const parent = admitScope(input())
  const child = delegateScope(parent, ["memory.read"], () => {})
  const grandchild = delegateScope(child, ["memory.read"], () => {})
  revokeScope(parent)
  for (const grant of [parent, child, grandchild]) assert.throws(() => assertScopeGrant(grant, "memory.read"), /revoked/)
})

test("concurrent callers retain independent grants, including same group with one revoked sender", async () => {
  const a = admitScope(input({ chatType: "group", conversationId: "g" }))
  const b = admitScope(input({ chatType: "group", conversationId: "g", senderId: "B" }))
  await Promise.all([Promise.resolve().then(() => revokeScope(a)), Promise.resolve().then(() => assertScopeGrant(b, "memory.write"))])
  assert.throws(() => assertScopeGrant(a, "memory.write"))
  assertScopeGrant(b, "memory.write")
})
