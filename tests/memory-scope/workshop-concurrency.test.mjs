import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fork } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import { WorkshopStore } from "../../src/memory-scope/scoped-workshop/storage.ts"
import { fixtureGrant } from "./workshop-fixtures.ts"

function child(workspace, action, expected = "null") {
  const process = fork(new URL("./workshop-process.mjs", import.meta.url), [workspace, action, expected],
    { execArgv: ["--experimental-transform-types"], stdio: ["ignore", "ignore", "pipe", "ipc"] })
  const messages = []
  let errors = ""
  process.stderr.on("data", chunk => errors += chunk)
  process.on("message", message => messages.push(message))
  const exit = once(process, "exit")
  async function wait(type) {
    const deadline = Date.now() + 60000
    while (!messages.some(m => m.type === type)) {
      if (process.exitCode !== null || Date.now() > deadline) throw new Error(`Missing ${type}: ${JSON.stringify(messages)} ${errors}`)
      await delay(10)
    }
    return messages.find(m => m.type === type)
  }
  return { process, messages, exit, wait }
}

test("cross-process CAS serializes creation and update; only one writer wins", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-cas-"))
  const children = []
  try {
    const store = new WorkshopStore(workspace, fixtureGrant())
    for (const expected of [null, "update"]) {
      const revision = expected === null ? "null" : store.view("concurrent-skill").revision
      fs.rmSync(path.join(workspace, "release"), { force: true })
      const first = child(workspace, "hold", revision); children.push(first)
      await first.wait("locked")
      const second = child(workspace, "racer", revision); children.push(second)
      await second.wait("attempt")
      await delay(100)
      assert.equal(second.messages.some(m => m.type === "result" || m.type === "error"), false,
        "second process must wait for the transaction before reading the head")
      fs.writeFileSync(path.join(workspace, "release"), "go")
      const winner = await first.wait("result")
      assert.match((await second.wait("error")).message, /changed/)
      await Promise.all([first.exit, second.exit])
      assert.equal(store.view("concurrent-skill").revision, winner.revision)
    }
    assert.notEqual(store.restore("concurrent-skill"), null)
    assert.equal(store.restore("concurrent-skill"), null)
  } finally {
    for (const c of children) if (c.process.exitCode === null) { c.process.kill(); await c.exit }
    fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test("killed writer releases SQLite lock; an orphan bundle is recoverable", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-crash-"))
  const children = []
  try {
    const crashed = child(workspace, "crash")
    children.push(crashed)
    assert.equal((await crashed.exit)[0], 7)
    const store = new WorkshopStore(workspace, fixtureGrant())
    assert.equal(store.view("concurrent-skill"), null)
    const recovered = child(workspace, "recover")
    children.push(recovered)
    await recovered.wait("result"); await recovered.exit
    const versions = fs.readdirSync(path.join(store.root, "concurrent-skill", "versions"))
    assert.deepEqual(versions, [store.view("concurrent-skill").revision])
  } finally {
    for (const c of children) if (c.process.exitCode === null) { c.process.kill(); await c.exit }
    fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
