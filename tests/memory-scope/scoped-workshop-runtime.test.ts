import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { ScopeAdmissions, SCOPE_BINDING } from "../../src/memory-scope/admission.ts"
import { scopedWorkshopAccess, admittedWorkshopFork, publishScopedWorkshopAccess } from "../../src/memory-scope/workshop-api.ts"
import { createScopedWorkshopTool } from "../../plugins/scoped-workshop/src/tool.ts"
const state = vi.hoisted(() => ({ services: undefined as any }))
let root: string
let unpublish: () => void
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-provider-"))
  state.services = { storageRoot: root, assertCurrent() {}, admissions: new ScopeAdmissions({ captureSessionLease: () => () => {} }), stop() { this.admissions.stop() } }
  unpublish = publishScopedWorkshopAccess(state.services)
})
afterEach(() => { unpublish(); state.services.admissions.stop(); fs.rmSync(root, { recursive: true, force: true }) })
function context(sender = "alice", group?: string) {
  const admission = state.services.admissions.begin({ tenantId: "corp", accountId: "bot", agentId: "main", senderId: sender,
    chatType: group ? "group" : "direct", conversationId: group ?? `dm-${sender}` }, () => {})
  return { agentId: "main", sessionKey: admission.sessionKey, sessionId: group ?? sender, messageChannel: "dingtalk-connector",
    agentAccountId: "bot", requesterSenderId: sender, nativeChannelId: group ?? `dm-${sender}`, toolBindings: { [SCOPE_BINDING]: admission.token },
    assertInvocationCurrent() {}, channel: "dingtalk-connector", accountId: "bot", senderId: sender,
    channelContext: { chat: { [SCOPE_BINDING]: admission.token, dingtalkNativeConversationId: group ?? `dm-${sender}` } } }
}
const content = '---\nname: verify-example\ndescription: Verify repeatable results\n---\nCheck actual results before reporting success.'
function tool(ctx: ReturnType<typeof context>, review = false) {
  const lease = scopedWorkshopAccess.forInvocation(ctx)
  return createScopedWorkshopTool(lease.open(ctx.assertInvocationCurrent), ctx.assertInvocationCurrent, () => {}, review)
}
it("native actions preserve private isolation, supporting files and versioned undo", async () => {
  const a = tool(context())
  await a.execute("create", { action: "create", name: "verify-example", content })
  const b = tool(context("bob"))
  expect((await b.execute("view", { action: "view", name: "verify-example" })).details).toBeNull()
  await a.execute("view", { action: "view", name: "verify-example" })
  await a.execute("file", { action: "write_file", name: "verify-example", file_path: "scripts/check.py", content: "assert 1 == 1" })
  await a.execute("view", { action: "view", name: "verify-example" })
  await a.execute("patch", { action: "patch", name: "verify-example", old_text: "actual results", new_text: "actual tool results" })
  expect((await a.execute("file", { action: "view", name: "verify-example", file_path: "scripts/check.py" })).details).toMatchObject({ content: "assert 1 == 1" })
  await a.execute("undo", { action: "restore", name: "verify-example" })
  const restored = (await a.execute("view", { action: "view", name: "verify-example" })).details as { content: string }
  expect(restored.content).toContain("Check actual results before reporting success.")
  expect(restored.content).not.toContain("actual tool results")
})
it("members share only their group and a later member revokes the previous admission", async () => {
  const a = tool(context("alice", "group-one"))
  await a.execute("create", { action: "create", name: "verify-example", content })
  const b = tool(context("bob", "group-one"))
  expect((await b.execute("view", { action: "view", name: "verify-example" })).details).not.toBeNull()
  await expect(a.execute("late", { action: "list" })).rejects.toThrow()
  expect((await tool(context("bob", "group-two")).execute("list", { action: "list" })).details).toEqual([])
})
it("patch stores literal replacement markers without JavaScript substitution", async () => {
  const a = tool(context())
  await a.execute("create", { action: "create", name: "verify-example", content })
  await a.execute("view", { action: "view", name: "verify-example" })
  await a.execute("patch", { action: "patch", name: "verify-example", old_text: "Check actual results", new_text: "Print $& and $` and $' literally" })
  const viewed = (await a.execute("view", { action: "view", name: "verify-example" })).details as { content: string }
  expect(viewed.content).toContain("Print $& and $` and $' literally")
})
it("fork access requires a captured live source and exact host provenance", async () => {
  const ctx = context(); const lease = scopedWorkshopAccess.forCompletedTurn(ctx)
  const fork = { runId: "review-id", agentId: "main", inputProvenance: { kind: "internal_system", sourceTool: "session_fork", sourceSessionKey: ctx.sessionKey } }
  expect(admittedWorkshopFork(fork)).toBeUndefined()
  await lease.withFork("review-id", async () => {
    expect(admittedWorkshopFork(fork)).toEqual({ agentId: "main", sessionKey: ctx.sessionKey })
    expect(() => admittedWorkshopFork({ ...fork, inputProvenance: { ...fork.inputProvenance, sourceSessionKey: "forged" } })).toThrow()
    context() // New real input revokes the captured source, even before the fork commits.
    expect(() => lease.open(() => {}).list()).toThrow()
  })
  expect(admittedWorkshopFork(fork)).toBeUndefined()
})
it("a published service generation revokes retained leases and cannot be unregistered by its predecessor", () => {
  const original = context()
  const lease = scopedWorkshopAccess.forInvocation(original)
  expect(lease.open(() => {}).list()).toEqual([])
  const next = { storageRoot: root, assertCurrent() {}, admissions: new ScopeAdmissions({ captureSessionLease: () => () => {} }), stop() { this.admissions.stop() } }
  const unpublishNext = publishScopedWorkshopAccess(next as any)
  unpublish()
  expect(() => lease.open(() => {}).list()).toThrow(/generation|revoked/)
  expect(() => scopedWorkshopAccess.forInvocation(original)).toThrow()
  unpublishNext(); next.admissions.stop()
})
it("rejects scope arguments, traversal and stale patches; an abstaining review has no effects", async () => {
  const ctx = context(); const lease = scopedWorkshopAccess.forCompletedTurn(ctx); const store = lease.open(() => {})
  const review = createScopedWorkshopTool(store, lease.assertCurrent, () => {}, true)
  const stamp = store.stamp()
  await review.execute("list", { action: "list" })
  expect(store.stamp()).toBe(stamp)
  await expect(review.execute("spoof", { action: "create", name: "verify-example", content, userId: "bob" })).rejects.toThrow()
  await review.execute("save", { action: "create", name: "verify-example", content })
  await expect(review.execute("second", { action: "archive", name: "verify-example" })).rejects.toThrow("one change")
  const a = tool(ctx); await a.execute("view", { action: "view", name: "verify-example" })
  await expect(a.execute("badpath", { action: "write_file", name: "verify-example", file_path: "../escape", content: "bad" })).rejects.toThrow()
  store.save({ ...store.view("verify-example")!.skill, body: "Concurrent correction" }, store.view("verify-example")!.revision)
  await expect(a.execute("stale", { action: "patch", name: "verify-example", old_text: "Concurrent", new_text: "Overwritten" })).rejects.toThrow("View")
})
