import assert from "node:assert/strict"
import os from "node:os"
import { test } from "node:test"
import { createScopeServices } from "../../src/memory-scope/services.ts"
import { createHostSessionAuthority } from "../../src/memory-scope/host-session.ts"
import { assertScopeGrant } from "../../src/memory-scope/authority.ts"
import { SCOPE_BINDING } from "../../src/memory-scope/admission.ts"

function fixture() {
  let entry = { sessionId: "id-1", lifecycleRevision: "rev-1" }, store = "configured-store", enabled = true
  const controller = new AbortController(), calls = []
  const host = {
    resolveStorePath(configured, { agentId }) { assert.equal(agentId, "main"); return `${configured}/${agentId}` },
    getSessionEntry(params) { calls.push(params); return entry },
    async runWithWorkAdmission(params, run) { calls.push(params); return run(controller.signal) },
  }
  const authority = createHostSessionAuthority(host, () => store)
  const services = createScopeServices({ stateDir: os.tmpdir(), ...authority,
    assertCurrent() { if (!enabled) throw Error("disabled") } })
  const a = services.admissions.begin({ tenantId: "corp", accountId: "bot", agentId: "main", senderId: "A",
    chatType: "direct", conversationId: "native-chat" }, services.assertCurrent)
  const grant = services.admissions.sourceGrant({ agentId: "main", sessionKey: a.sessionKey, sessionId: "id-1",
    channel: "dingtalk-connector", accountId: "bot", senderId: "A",
    channelContext: { chat: { [SCOPE_BINDING]: a.token, dingtalkNativeConversationId: "native-chat" } } },
    ["memory.read", "workshop.write"], () => {})
  return { services, grant, calls, controller, entry: value => { entry = value }, store: value => { store = value }, disable: () => { enabled = false } }
}

test("public host session adapter uses trusted agent store and exact latest reads", async () => {
  const f = fixture()
  let retained
  assert.equal(await f.services.withSourceWork(f.grant, undefined, async (grant, signal) => {
    retained = grant
    assert.equal(signal.aborted, false)
    assertScopeGrant(grant, "memory.read")
    assertScopeGrant(grant, "workshop.write")
    assert.throws(() => assertScopeGrant(grant, "memory.write"), /denied/)
    return "done"
  }), "done")
  assert.throws(() => assertScopeGrant(retained, "memory.read"), /revoked/)
  assertScopeGrant(f.grant, "memory.read")
  for (const read of f.calls.filter(call => call.readConsistency)) {
    assert.equal(read.readConsistency, "latest")
    assert.equal(read.storePath, "configured-store/main")
    assert.equal(read.agentId, "main")
    assert.equal(read.sessionKey, f.grant.sessionKey)
  }
})

test("host reset/caller cancellation and same-id revision changes invalidate final effects", async () => {
  for (const trigger of [f => f.controller.abort(), (f, c) => c.abort(),
    f => f.entry({ sessionId: "id-1", lifecycleRevision: "rev-2" }),
    f => f.entry(undefined), f => f.store("different-store"), f => f.disable(), f => f.services.stop()]) {
    const f = fixture(), caller = new AbortController()
    await assert.rejects(f.services.withSourceWork(f.grant, caller.signal, async workGrant => {
      trigger(f, caller)
      assert.throws(() => assertScopeGrant(workGrant, "workshop.write"))
      return "must not return success"
    }))
  }
})

test("copied grant and already cancelled task never enter the work callback", async () => {
  const f = fixture(), controller = new AbortController()
  controller.abort()
  let called = false
  const run = async () => { called = true }
  await assert.rejects(f.services.withSourceWork({ ...f.grant }, undefined, run), /Unknown/)
  await assert.rejects(f.services.withSourceWork(f.grant, controller.signal, run))
  assert.equal(called, false)
})
