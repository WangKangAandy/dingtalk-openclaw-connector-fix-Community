import assert from "node:assert/strict"
import os from "node:os"
import { test } from "node:test"
import { createScopeServices } from "../../src/memory-scope/services.ts"
import { createHostSessionAuthority } from "../../src/memory-scope/host-session.ts"

function fixture() {
  let entry = { sessionId: "id-1", lifecycleRevision: "rev-1" }
  const store = "configured-store"
  const calls = []
  const host = {
    resolveStorePath(configured, { agentId }) { assert.equal(agentId, "main"); return `${configured}/${agentId}` },
    getSessionEntry(params) { calls.push(params); return entry },
  }
  const authority = createHostSessionAuthority(host, () => store)
  const services = createScopeServices({ stateDir: os.tmpdir(), ...authority, assertCurrent() {} })
  return { authority, services, calls, entry: value => { entry = value } }
}

test("host session authority captures the configured store and latest session generation", () => {
  const f = fixture()
  const lease = f.authority.captureSessionLease({ agentId: "main", sessionKey: "session", sessionId: "id-1" })
  assert.equal(f.calls[0].storePath, "configured-store/main")
  assert.equal(f.calls[0].readConsistency, "latest")
  lease()
  f.entry({ sessionId: "id-1", lifecycleRevision: "rev-2" })
  assert.throws(() => lease(), /incarnation or policy changed/)
})

test("scope services stop invalidates the shared admission owner", () => {
  const f = fixture()
  assert.doesNotThrow(() => f.services.assertCurrent())
  f.services.stop()
  assert.throws(() => f.services.assertCurrent(), /stopped/)
})
