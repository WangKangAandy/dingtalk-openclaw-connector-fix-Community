import { admitScope, SCOPE_OPERATIONS } from "../../src/memory-scope/authority.ts"
import { ScopedMemoryStore } from "../../src/memory-scope/store.ts"
const [root, expectedRevision, value] = process.argv.slice(2)
const grant = admitScope({ tenantId: "corp", accountId: "bot", agentId: "main", senderId: value,
  chatType: "group", conversationId: "G", sessionKey: "route", sessionId: value,
  assertCurrent() {}, operations: SCOPE_OPERATIONS })
const store = new ScopedMemoryStore(root)
process.send({ ready: true })
process.once("message", () => {
  try { process.send({ ok: true, record: store.put(grant, "decision", value, Number(expectedRevision)) }) }
  catch (error) { process.send({ ok: false, error: error.message }) }
  process.disconnect()
})
