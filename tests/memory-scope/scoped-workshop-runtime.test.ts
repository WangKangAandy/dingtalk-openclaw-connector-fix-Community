import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AsyncLocalStorage } from "node:async_hooks"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { registerScopedWorkshop } from "../../src/memory-scope/scoped-workshop/register.ts"
import { WorkshopStore } from "../../src/memory-scope/scoped-workshop/storage.ts"
import { fixtureGrant } from "./workshop-fixtures.ts"
import { ScopeAdmissions, SCOPE_BINDING } from "../../src/memory-scope/admission.ts"
import type { ScopeServices } from "../../src/memory-scope/services.ts"
import { bindScopeLifetime, revokeScope } from "../../src/memory-scope/authority.ts"
import { reviewEvidence, reviewPrompt } from "../../src/memory-scope/scoped-workshop/review.ts"

let workspace: string
const hooks = new Map<string, Function>()
let factory: any
let config: any
let complete: ReturnType<typeof vi.fn>
const draft = { name: "diagnose-request", description: "Find the cause of a failed request", body: "Inspect trace, reproduce failure, validate fix.", files: {} }
let services: ScopeServices
const ambient = new AsyncLocalStorage<string>()
let background: ReturnType<typeof vi.fn>
let dispose: () => void
const admitted = new Map<string, { token: string; sessionKey: string }>()
const context = (name = "alice") => {
  let admission = admitted.get(name)
  if (!admission) {
    admission = services.admissions.begin({ tenantId: "test-tenant", accountId: "test-account", agentId: "main",
      senderId: name, chatType: "direct", conversationId: `dm-${name}` }, () => {})
    admitted.set(name, admission)
  }
  return { agentId: "main", sessionKey: admission.sessionKey, sessionId: name, workspaceDir: workspace,
    channel: "dingtalk-connector", accountId: "test-account", senderId: name, chatId: `dm-${name}`,
    messageChannel: "dingtalk-connector", agentAccountId: "test-account", requesterSenderId: name, nativeChannelId: `dm-${name}`,
    channelContext: { chat: { [SCOPE_BINDING]: admission.token, dingtalkNativeConversationId: `dm-${name}` } }, toolBindings: { [SCOPE_BINDING]: admission.token },
    assertMemoryAudienceCurrent: () => {}, toolAuthority: { allows: () => true, assertActive: () => {} } }
}
// Independent test-owned grants inspect disk even after the production binding was revoked.
const workshopBinding = (ctx: ReturnType<typeof context>) => ({ store: new WorkshopStore(workspace, fixtureGrant({ senderId: ctx.senderId })) })
const invoke = (hook: string, event: any = {}, ctx = context()) => hooks.get(hook)!(event, ctx)
beforeEach(() => {
  vi.useFakeTimers(); hooks.clear()
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-runtime-"))
  admitted.clear()
  const admissions = new ScopeAdmissions({ now: () => 0, captureSessionLease: () => () => {} })
  services = { admissions, storageRoot: workspace, assertCurrent() {}, stop() { admissions.stop() },
    async withSourceWork(grant, signal, run) {
      const combined = signal ?? new AbortController().signal
      const work = bindScopeLifetime(grant, () => combined.throwIfAborted())
      try { return await run(work, combined) } finally { revokeScope(work) }
    } }
  config = { tools: { deny: ["skill_workshop"] }, skills: { workshop: { autonomous: { mode: "off" } } }, channels: { "dingtalk-connector": { memoryScope: { scopedLearning: { enabled: true, reviewAfterIterations: 2, reviewIdleMs: 1000 } } } } }
  complete = vi.fn(async (input: any) => {
    const tool = factory.create({ ...context(), toolBindings: input.toolBindings, assertInvocationCurrent: () => {} })
    await tool.execute("save", { action: "save", skill: draft, expectedRevision: null })
    return { meta: { durationMs: 1 } }
  })
  background = vi.fn(run => ambient.run("plugin-background", run))
  registerScopedWorkshop({ config, runtime: { agent: { runEmbeddedAgent: complete }, subagent: { complete } }, logger: { warn: vi.fn() },
    lifecycle: { runInBackgroundContext: background, onDispose: (callback: () => void) => { dispose = callback } },
    on: (name: string, callback: Function) => hooks.set(name, callback),
    registerTool: (value: any) => { factory = value },
  } as any, services)
})
afterEach(() => { invoke("gateway_stop"); vi.useRealTimers(); fs.rmSync(workspace, { recursive: true, force: true }) })
function finish(ctx = context()) {
  invoke("before_prompt_build", {}, ctx)
  invoke("model_call_ended", { outcome: "completed" }, ctx); invoke("model_call_ended", { outcome: "completed" }, ctx)
  invoke("agent_end", { success: true, messages: [{ role: "user", content: "We verified the repeatable fix." }] }, ctx)
}

// Real hooks, scheduler, store, prompt projection and undo are exercised together; only the model is stubbed.
it("detaches timer installation and work admission from the finished foreground request", async () => {
  const withWork = services.withSourceWork.bind(services)
  services.withSourceWork = async (...args) => {
    expect(ambient.getStore()).toBe("plugin-background")
    return withWork(...args)
  }
  ambient.run("foreground-request", () => finish())
  expect(background).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(background).toHaveBeenCalledTimes(2)
  expect(complete).toHaveBeenCalledOnce()
})

it("plugin disposal cancels scheduled review before model or storage work", async () => {
  finish(); dispose()
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).not.toHaveBeenCalled()
  expect(workshopBinding(context())!.store.list()).toEqual([])
})

it("learns within the originating scope, exposes it next turn, and supports undo", async () => {
  finish()
  expect(complete).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).toHaveBeenCalledOnce()
  expect(complete.mock.calls[0][0]).not.toHaveProperty("toolsAlsoAllow")
  const alicePrompt = invoke("before_prompt_build").prependSystemContext
  expect(alicePrompt).toContain("diagnose-request")
  expect(alicePrompt).toContain("Learned:")
  expect(invoke("before_prompt_build", {}, context("bob")).prependSystemContext).not.toContain("diagnose-request")
  const tool = factory.create({ ...context(), assertInvocationCurrent: () => {} })
  await tool.execute("undo", { action: "restore", name: draft.name })
  expect(workshopBinding(context())!.store.list()).toEqual([])
})

it("runs the background review with a trusted scope binding and only the scoped tool", async () => {
  complete.mockImplementation(async (input: any) => {
    expect(input.sessionPersistence).toBe("detached")
    expect(input.toolsAllow).toEqual(["scoped_skill_workshop"])
    expect(input.toolExecutionAllow).toEqual(["scoped_skill_workshop"])
    expect(input.toolBindings?.dingtalkScopedReview).toEqual(expect.any(String))
    // Host hooks also fire for the helper run. They must not cancel it or schedule recursion.
    const child = { ...context(), runId: input.runId }
    invoke("before_prompt_build", {}, child)
    invoke("model_call_ended", { outcome: "completed" }, child)
    invoke("agent_end", { success: true, messages: [] }, child)
    const tool = factory.create({ ...context(), toolBindings: input.toolBindings, assertInvocationCurrent: () => {} })
    const listed = await tool.execute("list", { action: "list" })
    expect(listed.details).toEqual([])
    await tool.execute("save", { action: "save", skill: draft, expectedRevision: null })
    return { meta: { durationMs: 1 } }
  })
  finish(); await vi.advanceTimersByTimeAsync(1000)
  expect(workshopBinding(context())!.store.list().map(item => item.name)).toEqual([draft.name])
  expect(workshopBinding(context("bob"))!.store.list()).toEqual([])
})

// A single review can both learn a new method and retire an old one.
it("reports both learning and unused-skill archival from the same review", async () => {
  const store = workshopBinding(context())!.store
  store.save({ ...draft, name: "old-method" }, null)
  vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60_000)
  finish(); await vi.advanceTimersByTimeAsync(1000)
  expect(store.list().map(item => item.name)).toEqual([draft.name])
  const prompt = invoke("before_prompt_build").prependSystemContext
  expect(prompt).toContain(`Learned: ${draft.name}`)
  expect(prompt).toContain("Archived unused learned skills: old-method")
  const nextPrompt = invoke("before_prompt_build").prependSystemContext
  expect(nextPrompt).not.toContain("Learned:")
  expect(nextPrompt).not.toContain("Archived unused")
})

// A new foreground turn must invalidate even a provider that ignores cancellation.
it("discards late results when a new turn starts", async () => {
  let resolve!: (result: { text: string }) => void
  complete.mockImplementation(() => new Promise(r => { resolve = r }))
  finish(); await vi.advanceTimersByTimeAsync(1000)
  const tool = factory.create({ ...context(), toolBindings: complete.mock.calls[0][0].toolBindings, assertInvocationCurrent: () => {} })
  invoke("before_prompt_build")
  await expect(tool.execute("late", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow()
  resolve({ text: JSON.stringify({ action: "save", skill: draft }) })
  await vi.advanceTimersByTimeAsync(0)
  expect(workshopBinding(context())!.store.list()).toEqual([])
  expect(complete.mock.calls[0][0].abortSignal.aborted).toBe(true)
})

// An external session can mutate and undo back to an empty list while review is in flight.
it("detects create-then-undo in another session instead of resurrecting its skill", async () => {
  let resolve!: (result: { text: string }) => void
  complete.mockImplementation(() => new Promise(r => { resolve = r }))
  finish(); await vi.advanceTimersByTimeAsync(1000)
  const store = workshopBinding(context())!.store
  const tool = factory.create({ ...context(), toolBindings: complete.mock.calls[0][0].toolBindings, assertInvocationCurrent: () => {} })
  store.save(draft, null); store.restore(draft.name)
  await expect(tool.execute("late", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow("changed")
  resolve({ text: JSON.stringify({ action: "save", skill: draft }) })
  await vi.advanceTimersByTimeAsync(0)
  expect(store.list()).toEqual([])
})

// Session reset and disabling the feature revoke a previously queued review.
it.each(["session", "config", "shutdown"])("revokes pending review after %s change", async change => {
  finish()
  if (change === "session") invoke("session_end")
  if (change === "config") config.channels["dingtalk-connector"].memoryScope.scopedLearning.enabled = false
  if (change === "shutdown") invoke("gateway_stop")
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).not.toHaveBeenCalled()
  expect(workshopBinding(context())!.store.list()).toEqual([])
})

// Foreground learning already captured the work; do not pay for a duplicate review.
it("does not review a turn that already saved a skill", async () => {
  invoke("before_prompt_build")
  const tool = factory.create({ ...context(), assertInvocationCurrent: () => {} })
  await tool.execute("save", { action: "save", skill: draft, expectedRevision: null })
  invoke("model_call_ended", { outcome: "completed" }); invoke("model_call_ended", { outcome: "completed" })
  invoke("agent_end", { success: true, messages: [{ role: "assistant", content: "Saved" }] })
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).not.toHaveBeenCalled()
})

// Global blocking is limited to enabled DingTalk scope; shared agents elsewhere keep their tools.
it("blocks global Workshop for DingTalk and leaves other channels alone", () => {
  expect(invoke("before_tool_call", { toolName: "skill_workshop" }).block).toBe(true)
  expect(invoke("before_tool_call", { toolName: "read" })).toBeUndefined()
  expect(invoke("before_tool_call", { toolName: "skill_workshop" }, { ...context(), sessionKey: "agent:main:telegram:direct:a" })).toBeUndefined()
})

// Malformed or malicious model responses cannot choose a recipient or produce multiple mutations.
it("rejects a model-selected scope", async () => {
  complete.mockResolvedValue({ text: JSON.stringify({ action: "save", skill: draft, scope: "bob" }) })
  finish(); await vi.advanceTimersByTimeAsync(1000)
  expect(workshopBinding(context())!.store.list()).toEqual([])
})

// Opting into learning cannot override the operator's normal tool policy.
it("cancels review and omits learned prompts when policy hides the scoped tool", async () => {
  finish()
  const ctx = { ...context(), toolAuthority: { allows: () => false, assertActive: () => {} } }
  expect(invoke("before_prompt_build", {}, ctx)).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).not.toHaveBeenCalled()
})

// Provider failures are not successful iterations and must not trigger paid review work.
it("does not count failed provider calls toward review", async () => {
  invoke("before_prompt_build")
  invoke("model_call_ended", { outcome: "error" })
  invoke("model_call_ended", { outcome: "completed" })
  invoke("agent_end", { success: true, messages: [{ role: "assistant", content: "One successful call" }] })
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).not.toHaveBeenCalled()
})

it("allows foreground save and one-step undo when automatic learning is off", async () => {
  config.channels["dingtalk-connector"].memoryScope.scopedLearning.mode = "off"
  const tool = factory.create({ ...context(), assertInvocationCurrent: () => {} })
  await tool.execute("save", { action: "save", skill: draft, expectedRevision: null })
  expect(workshopBinding(context())!.store.list()).toHaveLength(1)
  expect(workshopBinding(context("bob"))!.store.list()).toEqual([])
  await tool.execute("undo", { action: "restore", name: draft.name })
  expect(workshopBinding(context())!.store.list()).toEqual([])
  finish(); await vi.advanceTimersByTimeAsync(1000)
  expect(complete).not.toHaveBeenCalled()
})

it("rejects foreground writes after invocation authority or configuration expires", async () => {
  let active = true
  const tool = factory.create({ ...context(), assertInvocationCurrent: () => { if (!active) throw new Error("revoked") } })
  active = false
  await expect(tool.execute("save", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow("revoked")
  active = true
  config.channels["dingtalk-connector"].memoryScope.scopedLearning.enabled = false
  await expect(tool.execute("save", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow("disabled")
  expect(workshopBinding(context())!.store.list()).toEqual([])
})

it.each(["before_reset", "session_end", "gateway_stop", "disabled", "mode-off", "native-tool-enabled", "new-turn"])("rejects background tool writes after %s", async change => {
  let release!: () => void
  complete.mockImplementation(() => new Promise(resolve => { release = () => resolve({ meta: { durationMs: 1 } }) }))
  finish(); await vi.advanceTimersByTimeAsync(1000)
  const input = complete.mock.calls[0][0]
  const tool = factory.create({ ...context(), toolBindings: input.toolBindings, assertInvocationCurrent() {} })
  if (change === "disabled") config.channels["dingtalk-connector"].memoryScope.scopedLearning.enabled = false
  else if (change === "mode-off") config.channels["dingtalk-connector"].memoryScope.scopedLearning.mode = "off"
  else if (change === "native-tool-enabled") config.tools.deny = []
  else invoke(change === "new-turn" ? "before_prompt_build" : change)
  await expect(tool.execute("late", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow()
  release(); await vi.advanceTimersByTimeAsync(0)
  expect(workshopBinding(context())!.store.list()).toEqual([])
})

it("requires a viewed revision and enforces one mutation across factory reconstruction", async () => {
  const store = workshopBinding(context())!.store
  const prior = store.save(draft, null)
  complete.mockImplementation(async input => {
    const ctx = { ...context(), toolBindings: input.toolBindings, assertInvocationCurrent() {} }
    const tool = factory.create(ctx)
    await expect(tool.execute("edit", { action: "save", skill: draft, expectedRevision: prior.revision })).rejects.toThrow("View")
    await expect(tool.execute("undo", { action: "restore", name: draft.name })).rejects.toThrow("undo")
    await tool.execute("view", { action: "view", name: draft.name })
    await tool.execute("edit", { action: "save", skill: { ...draft, body: "Updated verified procedure" }, expectedRevision: prior.revision })
    await expect(factory.create(ctx).execute("second", { action: "save", skill: { ...draft, name: "another" }, expectedRevision: null })).rejects.toThrow("only one")
    expect(factory.create({ ...context("bob"), toolBindings: input.toolBindings, assertInvocationCurrent() {} })).toBeNull()
    return { meta: { durationMs: 1 } }
  })
  finish(); await vi.advanceTimersByTimeAsync(1000)
  expect(store.list()).toHaveLength(1)
  expect(store.view(draft.name)?.skill.body).toBe("Updated verified procedure")
  const token = complete.mock.calls[0][0].toolBindings
  expect(factory.create({ ...context(), toolBindings: token, assertInvocationCurrent() {} })).toBeNull()
})

it("does not lose completed tool writes or notices when the model subsequently fails", async () => {
  complete.mockImplementation(async input => {
    const tool = factory.create({ ...context(), toolBindings: input.toolBindings, assertInvocationCurrent() {} })
    await tool.execute("save", { action: "save", skill: draft, expectedRevision: null })
    throw new Error("provider failed after commit")
  })
  finish(); await vi.advanceTimersByTimeAsync(1000)
  expect(workshopBinding(context())!.store.list()).toHaveLength(1)
  expect(invoke("before_prompt_build").prependSystemContext).toContain("Learned:")
})

it("expires the entire review even if a host retry ignores its per-attempt timeout", async () => {
  let release!: () => void
  complete.mockImplementation(() => new Promise(resolve => { release = () => resolve({ meta: {} }) }))
  finish(); await vi.advanceTimersByTimeAsync(1000)
  const input = complete.mock.calls[0][0]
  const tool = factory.create({ ...context(), toolBindings: input.toolBindings, assertInvocationCurrent() {} })
  expect(input.retryConnectionErrors).toBe(false)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(input.abortSignal.aborted).toBe(true)
  await expect(tool.execute("late", { action: "save", skill: draft, expectedRevision: null })).rejects.toThrow(/expired|deadline/)
  // The abandoned host promise must not block every later review in the serial queue.
  await vi.advanceTimersByTimeAsync(15 * 60_000)
  complete.mockResolvedValue({ meta: {} })
  finish()
  // Late hooks from the revoked run must not cancel the new foreground review.
  invoke("before_prompt_build", {}, { ...context(), runId: input.runId })
  await vi.advanceTimersByTimeAsync(1000)
  expect(complete).toHaveBeenCalledTimes(2)
  release(); await vi.advanceTimersByTimeAsync(0)
  expect(workshopBinding(context()).store.list()).toEqual([])
})

it("keeps failure evidence and budgets the catalog independently from full skill bundles", () => {
  const evidence = reviewEvidence([{ role: "toolResult", toolName: "verify", isError: true, content: "FAIL: checksum mismatch" },
    { role: "assistant", content: "Everything succeeded" }])
  expect(evidence).toContain("checksum mismatch")
  expect(evidence).toContain('"isError":true')
  const store = workshopBinding(context())!.store
  for (const name of ["one", "two", "three", "four"]) store.save({ ...draft, name, body: "x".repeat(34_000) }, null)
  const prompt = reviewPrompt(evidence, store.list())
  expect(prompt).toContain("skillCatalog")
  expect(Buffer.byteLength(prompt)).toBeLessThan(4000)
})
