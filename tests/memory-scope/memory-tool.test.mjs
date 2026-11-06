import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ScopedMemoryStore } from "../../src/memory-scope/store.ts"
import { scopedMemoryTool } from "../../src/memory-scope/memory-tool.ts"
import { admitScope, revokeScope, SCOPE_OPERATIONS } from "../../src/memory-scope/authority.ts"

test("actual memory tool enforces its bound identity across CRUD and search", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scoped-tool-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = new ScopedMemoryStore(root)
  const grant = senderId => admitScope({ tenantId: "corp", accountId: "bot", agentId: "main", senderId, chatType: "direct",
    sessionKey: `session-${senderId}`, sessionId: `id-${senderId}`, operations: SCOPE_OPERATIONS, assertCurrent() {} })
  const ga = grant("Alice"), gb = grant("alice")
  const a = scopedMemoryTool(store, ga, () => {}), b = scopedMemoryTool(store, gb, () => {})
  assert.equal(a.parameters.type, 'object')
  assert.equal(a.parameters.oneOf, undefined)
  assert.match(a.parameters.properties.expectedRevision.description, /omit or pass null only to create/)
  const call = async (tool, args) => (await tool.execute("call", args)).details
  const omitted = await call(a, { action: "put", key: "omitted-create", value: "new-only" })
  assert.equal(omitted.value, "new-only")
  await assert.rejects(call(a, { action: "put", key: "omitted-create", value: "cannot-overwrite" }), /conflict/)
  const first = await call(a, { action: "put", key: "preference", value: "private-A-only", expectedRevision: null })
  assert.equal((await call(a, { action: "search", query: "private-A" }))[0].value, "private-A-only")
  assert.deepEqual(await call(b, { action: "search", query: "private-A" }), [])
  assert.equal(await call(b, { action: "get", key: "preference" }), null)
  assert.deepEqual(await call(b, { action: "list" }), [])
  for (const extra of [{ userId: "Alice" }, { scope: ga.namespace }, { path: root }, { grant: ga }]) {
    await assert.rejects(call(b, { action: "list", ...extra }))
  }
  await assert.rejects(call(a, { action: "put", key: "preference", value: "stale", expectedRevision: null }), /conflict/)
  const deleted = await call(a, { action: "delete", key: "preference", expectedRevision: first.revision })
  assert.equal(deleted.deleted, true)
  assert.deepEqual(await call(a, { action: "search", query: "private-A" }), [])
  revokeScope(ga)
  await assert.rejects(call(a, { action: "list" }), /revoked/)
})
