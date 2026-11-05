import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fork } from "node:child_process"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { admitScope, delegateScope, SCOPE_OPERATIONS } from "../../src/memory-scope/authority.ts"
import { ScopedMemoryStore } from "../../src/memory-scope/store.ts"

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hard-memory-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const grant = (changes = {}) => admitScope({ tenantId: "corp", accountId: "bot", agentId: "main",
    senderId: "A", chatType: "direct", sessionKey: "route", sessionId: "sid",
    assertCurrent() {}, operations: SCOPE_OPERATIONS, ...changes })
  return { root, store: new ScopedMemoryStore(root), grant }
}

test("two users get independent CRUD, list and search across a reopened store", t => {
  const { root, store, grant } = fixture(t), a = grant(), b = grant({ senderId: "B" })
  const first = store.put(a, "preference", "A secret", null)
  assert.equal(store.get(b, "preference"), null)
  assert.deepEqual(store.search(b, "secret"), [])
  assert.deepEqual(store.list(b), [])
  assert.throws(() => store.delete(b, "preference", first.revision), /conflict/)
  store.put(b, "preference", "B secret", null)
  const reopened = new ScopedMemoryStore(root)
  assert.equal(reopened.get(a, "preference").value, "A secret")
  assert.equal(reopened.search(b, "secret")[0].value, "B secret")
})

test("group members share records while stale revisions cannot overwrite or resurrect deleted facts", t => {
  const { store, grant } = fixture(t)
  const a = grant({ chatType: "group", conversationId: "G" }), b = grant({ chatType: "group", conversationId: "G", senderId: "B" })
  const one = store.put(a, "decision", "v1", null)
  const two = store.put(b, "decision", "v2", one.revision)
  assert.equal(store.get(a, "decision").actorId, "B")
  assert.throws(() => store.put(a, "decision", "stale", one.revision), /conflict/)
  const deleted = store.delete(a, "decision", two.revision)
  assert.equal(deleted.value, null)
  assert.deepEqual(store.search(b, "v2"), [])
  assert.deepEqual(store.list(b), [])
  assert.equal(store.list(b, { includeDeleted: true })[0].revision, deleted.revision)
  assert.throws(() => store.put(b, "decision", "stale create", null), /conflict/)
  assert.throws(() => store.put(b, "decision", "stale update", two.revision), /conflict/)
  assert.equal(store.put(b, "decision", "reviewed restore", deleted.revision).value, "reviewed restore")
})

test("path-like keys and SQL-looking queries cannot cross scope", t => {
  const { store, grant } = fixture(t), a = grant(), b = grant({ senderId: "B" })
  store.put(a, "../../other.sqlite", "private", null)
  store.put(b, "other", "public to B only", null)
  assert.deepEqual(store.search(b, "' OR 1=1 --"), [])
  assert.equal(store.get(b, "../../other.sqlite"), null)
  assert.equal(store.list(a).length, 1)
})

test("final-effect revocation rolls back a pending write", t => {
  const { store, grant } = fixture(t)
  let calls = 0
  const g = grant({ assertCurrent() { if (++calls >= 3) throw Error("revoked at commit") } })
  assert.throws(() => store.put(g, "secret", "must not commit", null), /revoked at commit/)
  assert.equal(store.get(grant(), "secret"), null)
})

test("read-only grants cannot mutate, and copied grants cannot open a database", t => {
  const { root, store, grant } = fixture(t)
  const g = grant(), readonly = delegateScope(g, ["memory.read"], () => {})
  assert.throws(() => store.put(readonly, "x", "y", null), /denied/)
  assert.throws(() => store.get({ ...g }, "x"), /Unknown/)
  assert.deepEqual(fs.readdirSync(root), [])
})

test("corrupt data and mismatched scope database are never treated as empty", t => {
  const { root, store, grant } = fixture(t), a = grant(), b = grant({ senderId: "B" })
  store.put(a, "x", "y", null)
  fs.copyFileSync(path.join(root, `${a.namespace}.sqlite`), path.join(root, `${b.namespace}.sqlite`))
  assert.throws(() => store.get(b, "x"), /identity mismatch/)
  fs.writeFileSync(path.join(root, `${b.namespace}.sqlite`), "broken")
  assert.throws(() => store.put(b, "x", "replacement", null))
  assert.equal(fs.readFileSync(path.join(root, `${b.namespace}.sqlite`), "utf8"), "broken")
})

test("hardlinked database and symlinked store directory are rejected", t => {
  const { root, store, grant } = fixture(t), a = grant(), b = grant({ senderId: "B" })
  store.put(a, "x", "y", null)
  fs.linkSync(path.join(root, `${a.namespace}.sqlite`), path.join(root, `${b.namespace}.sqlite`))
  assert.throws(() => store.get(b, "x"), /Linked/)
  const link = path.join(root, "linked")
  fs.symlinkSync(root, link, process.platform === "win32" ? "junction" : "dir")
  assert.throws(() => new ScopedMemoryStore(link), /Linked/)
})

test("initialized schema and revision damage is refused instead of silently recreated", t => {
  const { root, store, grant } = fixture(t)
  const damage = ['DROP TABLE memories', 'DROP TABLE sequence', 'DELETE FROM sequence',
    'UPDATE sequence SET value=0', 'DELETE FROM scope_identity', 'PRAGMA user_version=0', 'PRAGMA user_version=999']
  for (const [index, sql] of damage.entries()) {
    const g = grant({ senderId: `schema-${index}` })
    store.put(g, 'fact', 'preserve', null)
    const file = path.join(root, `${g.namespace}.sqlite`)
    const db = new DatabaseSync(file)
    db.exec(sql); db.close()
    const before = fs.readFileSync(file)
    assert.throws(() => store.get(g, 'fact'))
    assert.throws(() => store.put(g, 'other', 'replacement', null))
    assert.deepEqual(fs.readFileSync(file), before)
  }
})

test("bounds and explicit revision protect storage from unrestricted input", t => {
  const { store, grant } = fixture(t), g = grant()
  assert.throws(() => store.put(g, "x", "a".repeat(65537), null), /oversized/)
  assert.throws(() => store.put(g, "x", "v", undefined), /revision/)
  assert.throws(() => store.list(g, { limit: 10000 }), /limit/)
  assert.throws(() => store.search(g, ""), /query/)
})

test("two actual processes cannot both commit the same expected group revision", async t => {
  const { root, store, grant } = fixture(t)
  const g = grant({ chatType: "group", conversationId: "G" })
  const first = store.put(g, "decision", "original", null)
  const children = ["A", "B"].map(value => fork(fileURLToPath(new URL("./store-writer.fixture.mjs", import.meta.url)),
    [root, String(first.revision), value], { stdio: ["ignore", "ignore", "inherit", "ipc"] }))
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill() })
  await Promise.all(children.map(child => new Promise((resolve, reject) => {
    child.once("message", resolve); child.once("error", reject)
    child.once("exit", code => { if (code) reject(Error(`Writer exited ${code}`)) })
  })))
  const completed = children.map(child => new Promise((resolve, reject) => {
    let result
    child.once("message", message => { result = message })
    child.once("error", reject)
    child.once("exit", code => code === 0 && result ? resolve(result) : reject(Error(`Writer failed ${code}`)))
  }))
  for (const child of children) child.send("commit")
  const results = await Promise.all(completed)
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.match(results.find(r => !r.ok).error, /revision conflict/)
  assert.equal(store.get(g, "decision").value, results.find(r => r.ok).record.value)
})
