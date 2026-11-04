import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { WorkshopStore } from "../../src/memory-scope/scoped-workshop/storage.ts"
import { validateDraft } from "../../src/memory-scope/scoped-workshop/contract.ts"
import { fixtureGrant } from "./workshop-fixtures.ts"
import { revokeScope, delegateScope } from "../../src/memory-scope/authority.ts"
import { reviewEvidence } from "../../src/memory-scope/scoped-workshop/review.ts"
import { workshopTool } from "../../src/memory-scope/scoped-workshop/tool.ts"

const draft = { name: "inspect-trace", description: "Diagnose a failed request using its trace", body: "1. Obtain the trace ID.\n2. Correlate the request.\n3. Verify the cause before editing.", files: {} }
let workspace: string
let store: WorkshopStore
beforeEach(() => { workspace = fs.mkdtempSync(path.join(os.tmpdir(), "scoped-workshop-")); store = new WorkshopStore(workspace, fixtureGrant()) })
afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }))

describe("scoped workshop storage", () => {
  it("documents save fields in discovery and rejects the observed redundant name without a partial write", async () => {
    let mutations = 0
    const tool = workshopTool(store, () => {}, () => { mutations++ })
    expect(tool.description).toContain('never send top-level name')
    expect(tool.parameters.properties.name.description).toContain('Omit for list and save')
    await expect(tool.execute('invalid-save', { action: 'save', name: draft.name, skill: draft, expectedRevision: null }))
      .rejects.toThrow('no storage operation was executed')
    expect(mutations).toBe(0)
    expect(fs.existsSync(store.root)).toBe(false)
    const result = await tool.execute('corrected-save', { action: 'save', skill: draft, expectedRevision: null })
    expect(result.details).toMatchObject({ name: draft.name, skill: draft })
    expect(mutations).toBe(1)
    expect(fs.readdirSync(path.join(store.root, draft.name, 'versions'))).toHaveLength(1)
  })
  it("rejects async transactions before their body can start", () => {
    let invoked = false
    // @ts-expect-error Async callbacks are intentionally outside this synchronous API.
    expect(() => store.transaction(async () => { invoked = true })).toThrow("synchronous")
    expect(invoked).toBe(false)
  })

  it("attributes group changes to trusted actors without disclosing private audit fields", async () => {
    const alice = new WorkshopStore(workspace, fixtureGrant({ chatType: "group", conversationId: "room", sessionId: "alice-session" }))
    const bob = new WorkshopStore(workspace, fixtureGrant({ chatType: "group", conversationId: "room", senderId: "bob", sessionId: "bob-session" }))
    const first = alice.save(draft, null)
    const attribution = JSON.parse(fs.readFileSync(path.join(path.dirname(first.path), "attribution.json"), "utf8"))
    expect(attribution).toMatchObject({ actorId: "alice", sessionId: "alice-session" })
    bob.archive(draft.name, first.revision)
    const head = () => JSON.parse(fs.readFileSync(path.join(bob.root, draft.name, "head.json"), "utf8"))
    expect(head().lastMutation).toMatchObject({ actorId: "bob", sessionId: "bob-session" })
    alice.restore(draft.name)
    expect(head().lastMutation.actorId).toBe("alice")
    const view = await workshopTool(bob, () => {}, () => {}).execute("view", { action: "view", name: draft.name })
    expect(JSON.stringify(view)).not.toContain("alice-session")
    expect(JSON.stringify(view)).not.toContain("attribution")
    expect(JSON.stringify(view)).not.toContain(bob.root)
  })
  // The real disk store must keep different users and channel accounts separate.
  it("isolates users and accounts without writing global Workshop", () => {
    const saved = store.save(draft, null)
    expect(fs.readFileSync(saved.path, "utf8")).toContain("name: inspect-trace")
    expect(new WorkshopStore(workspace, fixtureGrant({ senderId: "bob" })).list()).toEqual([])
    expect(new WorkshopStore(workspace, fixtureGrant({ accountId: "other-account" })).list()).toEqual([])
    expect(fs.existsSync(path.join(workspace, "workshop-skills"))).toBe(false)
    expect(fs.existsSync(path.join(workspace, "agents"))).toBe(false)
  })

  // Restarting the plugin must preserve both the active bundle and its undo history.
  it("restores update, archive, and creation across store instances", () => {
    const first = store.save({ ...draft, files: { "references/check.md": "original" } }, null)
    const second = store.save({ ...draft, body: "Corrected procedure", files: { "references/check.md": "changed" } }, first.revision)
    store = new WorkshopStore(workspace, fixtureGrant())
    store.archive(draft.name, second.revision)
    expect(store.list()).toEqual([])
    expect(store.restore(draft.name)?.skill.body).toBe("Corrected procedure")
    const original = store.restore(draft.name)!
    expect(original.skill.files["references/check.md"]).toBe("original")
    expect(store.restore(draft.name)).toBeNull()
  })

  // A stale model response must never replace a foreground correction.
  it("rejects stale or malformed writes without changing the current skill", () => {
    const first = store.save(draft, null)
    const latest = store.save({ ...draft, body: "User correction" }, first.revision)
    expect(() => store.save(draft, first.revision)).toThrow("changed")
    expect(() => store.save("not JSON", latest.revision)).toThrow()
    expect(() => store.save({ ...draft, scope: "bob" }, latest.revision)).toThrow()
    expect(store.view(draft.name)?.revision).toBe(latest.revision)
  })

  // Broken state must be surfaced, not replaced with factory state.
  it("preserves an unreadable head", () => {
    store.save(draft, null)
    const head = path.join(store.root, draft.name, "head.json")
    fs.writeFileSync(head, "broken")
    expect(() => store.save(draft, null)).toThrow()
    expect(fs.readFileSync(head, "utf8")).toBe("broken")
  })

  // Retain ten undo steps and actually reclaim older on-disk revision bundles.
  it("bounds revision storage without breaking retained undo", () => {
    let saved = store.save(draft, null)
    for (let i = 0; i < 13; i++) saved = store.save({ ...draft, body: `Verified revision ${i}` }, saved.revision)
    store.compact(draft.name)
    expect(fs.readdirSync(path.join(store.root, draft.name, "versions"))).toHaveLength(11)
    for (let i = 0; i < 10; i++) expect(store.restore(draft.name)).not.toBeNull()
    expect(() => store.restore(draft.name)).toThrow("No previous version")
  })

  // Discovery alone is not use; explicitly viewing a skill refreshes its use time.
  it("archives unused skills after 30 days with undo", () => {
    const saved = store.save(draft, null)
    const headPath = path.join(store.root, draft.name, "head.json")
    const head = JSON.parse(fs.readFileSync(headPath, "utf8")); head.touchedAt = 0
    fs.writeFileSync(headPath, JSON.stringify(head))
    expect(store.archiveUnused()).toEqual([draft.name])
    expect(store.restore(draft.name)?.revision).toBe(saved.revision)
    expect(store.archiveUnused()).toEqual([])
  })

  // Windows junctions exercise the same lstat boundary without requiring symlink privilege.
  it("rejects scope junctions and changed roots", () => {
    const outside = path.join(workspace, "outside"); fs.mkdirSync(outside)
    fs.mkdirSync(path.dirname(store.root), { recursive: true })
    fs.symlinkSync(outside, store.root, "junction")
    expect(() => store.save(draft, null)).toThrow("Linked")
    expect(() => new WorkshopStore(workspace, fixtureGrant())).toThrow("Linked")
    expect(fs.readdirSync(outside)).toEqual([])
  })

  // Models cannot choose filesystem locations through names or supporting files.
  it.each(["../other", "references/../../other", "references/./a", "references/a//b", "scripts/evil."])("rejects unsafe path %s", file => {
    expect(() => store.save({ ...draft, files: { [file]: "bad" } }, null)).toThrow()
    expect(store.list()).toEqual([])
  })

  // Limits are measured in bytes and common credentials are rejected before disk writes.
  it("rejects oversized and credential-bearing skills", () => {
    expect(() => validateDraft({ ...draft, body: "汉".repeat(14_000) })).toThrow("size")
    expect(() => validateDraft({ ...draft, body: "-----BEGIN PRIVATE KEY-----" })).toThrow("Credential")
    expect(() => validateDraft({ ...draft, description: "line\nbreak" })).toThrow()
  })

  // Tool authority must be checked at invocation, not just during construction.
  it("checks invocation lifetime and rejects model-supplied scope", async () => {
    let current = true
    const tool = workshopTool(store, () => { if (!current) throw new Error("expired") }, () => {})
    await expect(tool.execute("1", { action: "save", skill: draft, expectedRevision: null, scope: "bob" })).rejects.toThrow()
    current = false
    await expect(tool.execute("2", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow("expired")
    expect(store.list()).toEqual([])
  })

  it("shares a group across actors, preserves ID case, and rejects forged or expired grants", () => {
    const a = fixtureGrant({ chatType: "group", conversationId: "Room" })
    new WorkshopStore(workspace, a).save(draft, null)
    expect(new WorkshopStore(workspace, fixtureGrant({ chatType: "group", conversationId: "Room", senderId: "bob" })).list()).toHaveLength(1)
    expect(new WorkshopStore(workspace, fixtureGrant({ chatType: "group", conversationId: "room" })).list()).toEqual([])
    expect(() => new WorkshopStore(workspace, { ...a })).toThrow("Unknown")
    const saved = new WorkshopStore(workspace, a)
    revokeScope(a)
    expect(() => saved.list()).toThrow("revoked")
    expect(() => saved.save(draft, null)).toThrow("revoked")
    const read = new WorkshopStore(workspace, delegateScope(fixtureGrant(), ["workshop.read", "workshop.list"], () => {}))
    expect(() => read.save(draft, null)).toThrow("denied")
  })

  // Old evidence outside the bounded window is omitted and explicitly marked truncated.
  it("bounds evidence and marks truncation", () => {
    const evidence = reviewEvidence([{ role: "toolResult", content: "SECRET_RAW_OUTPUT" },
      ...Array.from({ length: 100 }, () => ({ role: "assistant", content: "汉".repeat(8000) }))])
    expect(Buffer.byteLength(evidence)).toBeLessThanOrEqual(32_000)
    expect(evidence).not.toContain("SECRET_RAW_OUTPUT")
    expect(evidence).toContain('"evidenceTruncated":true')
  })
})
