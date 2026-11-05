import assert from "node:assert/strict"
import { test } from "node:test"
import { captureScopeSessionLease } from "../../src/memory-scope/session-lease.ts"

const facts = { agentId: "main", sessionKey: "opaque", sessionId: "sid" }
test("session lease survives foreground completion, but rejects reset retaining the same sessionId", () => {
  let row = { sessionId: "sid", lifecycleRevision: "r1", permissionMode: "default" }
  const check = captureScopeSessionLease(facts, () => row)
  check()
  // No invocation/audience callback is retained. The read is current on each effect.
  row = { ...row, lifecycleRevision: "r2" }
  assert.throws(check, /incarnation/)
  row.lifecycleRevision = "r1"
  assert.throws(check, /revoked/)
})
test("absent/deleted/replaced/archived/policy-changed session and read failure reject", () => {
  for (const replacement of [undefined, { sessionId: "different", lifecycleRevision: "r1" },
    { sessionId: "sid", lifecycleRevision: "r1", archived: true },
    { sessionId: "sid", lifecycleRevision: "r1", archivedAt: 1 },
    { sessionId: "sid", lifecycleRevision: "r1", permissionMode: "deny" },
    { sessionId: "sid", lifecycleRevision: "r1", toolOverrides: { deny: ["scoped_memory"] } }]) {
    let row = { sessionId: "sid", lifecycleRevision: "r1" }
    const check = captureScopeSessionLease(facts, () => row)
    row = replacement
    assert.throws(check)
  }
  for (const lifecycleRevision of [null, "", 1, {}]) {
    assert.throws(() => captureScopeSessionLease(facts, () => ({ sessionId: "sid", lifecycleRevision })))
  }
  let fail = false
  const check = captureScopeSessionLease(facts, () => { if (fail) throw Error("store unavailable"); return { sessionId: "sid", lifecycleRevision: "r1" } })
  fail = true
  assert.throws(check, /unavailable/)
})
test("official absent initial revision is an exact generation, never a wildcard", () => {
  let row = { sessionId: "sid" }
  const check = captureScopeSessionLease(facts, () => row)
  check()
  row = { ...row, lifecycleRevision: "first-reset" }
  assert.throws(check, /incarnation/)
  row = { sessionId: "sid" }
  assert.throws(check, /revoked/)
  let current = { sessionId: "sid", lifecycleRevision: "existing" }
  const existing = captureScopeSessionLease(facts, () => current)
  current = { sessionId: "sid" }
  assert.throws(existing, /incarnation/)
})
