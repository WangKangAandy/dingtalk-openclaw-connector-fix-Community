import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { registerScopedWorkshop } from "../../src/memory-scope/scoped-workshop/register.ts"
import { workshopBinding } from "../../src/memory-scope/scoped-workshop/binding.ts"

let workspace: string
const hooks = new Map<string, Function>()
let factory: any
let config: any
let complete: ReturnType<typeof vi.fn>
const draft = { name: "diagnose-request", description: "Find the cause of a failed request", body: "Inspect trace, reproduce failure, validate fix.", files: {} }
const context = (name = "alice") => ({ agentId: "main", sessionKey: `agent:main:dingtalk-connector:direct:${name}`, sessionId: name, workspaceDir: workspace, assertMemoryAudienceCurrent: () => {}, toolAuthority: { allows: () => true, assertActive: () => {} } })
const invoke = (hook: string, event: any = {}, ctx = context()) => hooks.get(hook)!(event, ctx)
beforeEach(() => {
  vi.useFakeTimers(); hooks.clear()
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-runtime-"))
  config = { skills: { workshop: { autonomous: { mode: "off" } } }, channels: { "dingtalk-connector": { memoryScope: { scopedLearning: { enabled: true, reviewAfterIterations: 2, reviewIdleMs: 1000 } } } } }
  complete = vi.fn(async () => ({ text: JSON.stringify({ action: "save", skill: draft }) }))
  registerScopedWorkshop({ config, runtime: { subagent: { complete } }, logger: { warn: vi.fn() },
    on: (name: string, callback: Function) => hooks.set(name, callback),
    registerTool: (value: any) => { factory = value },
  } as any)
})
afterEach(() => { invoke("gateway_stop"); vi.useRealTimers(); fs.rmSync(workspace, { recursive: true, force: true }) })
function finish(ctx = context()) {
  invoke("before_prompt_build", {}, ctx)
  invoke("model_call_ended", { outcome: "completed" }, ctx); invoke("model_call_ended", { outcome: "completed" }, ctx)
  invoke("agent_end", { success: true, messages: [{ role: "user", content: "We verified the repeatable fix." }] }, ctx)
}

// Real hooks, scheduler, store, prompt projection and undo are exercised together; only the model is stubbed.
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
  invoke("before_prompt_build")
  resolve({ text: JSON.stringify({ action: "save", skill: draft }) })
  await vi.advanceTimersByTimeAsync(0)
  expect(workshopBinding(context())!.store.list()).toEqual([])
  expect(complete.mock.calls[0][0].signal.aborted).toBe(true)
})

// An external session can mutate and undo back to an empty list while review is in flight.
it("detects create-then-undo in another session instead of resurrecting its skill", async () => {
  let resolve!: (result: { text: string }) => void
  complete.mockImplementation(() => new Promise(r => { resolve = r }))
  finish(); await vi.advanceTimersByTimeAsync(1000)
  const store = workshopBinding(context())!.store
  store.save(draft, null); store.restore(draft.name)
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
