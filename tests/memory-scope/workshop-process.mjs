import fs from "node:fs"
import path from "node:path"
import { WorkshopStore } from "../../src/memory-scope/scoped-workshop/storage.ts"
import { fixtureGrant } from "./workshop-fixtures.ts"

const [workspace, action, expected] = process.argv.slice(2)
const store = new WorkshopStore(workspace, fixtureGrant())
const draft = { name: "concurrent-skill", description: "Verify concurrent updates", body: `Verified by ${action}`, files: {} }
const pause = new Int32Array(new SharedArrayBuffer(4))
try {
  process.send({ type: "attempt" })
  const result = store.transaction(() => {
    if (action === "hold" || action === "crash") {
      process.send({ type: "locked" })
      if (action === "crash") {
        // A crash after the immutable bundle was created but before publishing the head.
        const orphan = path.join(store.root, draft.name, "versions", "11111111-1111-4111-8111-111111111111")
        fs.mkdirSync(orphan, { recursive: true })
        fs.writeFileSync(path.join(orphan, "partial.txt"), "unreferenced")
        process.exit(7)
      }
      const deadline = Date.now() + 30000
      while (!fs.existsSync(path.join(workspace, "release"))) {
        if (Date.now() >= deadline) throw new Error("Test barrier timed out")
        Atomics.wait(pause, 0, 0, 10)
      }
    }
    return store.save(draft, expected === "null" ? null : expected)
  })
  process.send({ type: "result", revision: result.revision })
} catch (error) { process.send({ type: "error", message: error.message }) }
finally { process.disconnect() }
