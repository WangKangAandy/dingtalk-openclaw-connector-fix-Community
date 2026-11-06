import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeEach, afterEach, it, expect, vi } from "vitest"
import { ScopeAdmissions, SCOPE_BINDING } from "../../src/memory-scope/admission.ts"
import { scopedWorkshopAccess, publishScopedWorkshopAccess } from "../../src/memory-scope/workshop-api.ts"
const state = vi.hoisted(() => ({ services: undefined as any }))
vi.mock("@dingtalk-real-ai/dingtalk-connector/scope-api", async () => await import("../../src/memory-scope/workshop-api.ts"))
vi.mock("openclaw/plugin-sdk/skill-workshop-host-runtime", () => ({
  hasActiveSessionRuns: () => false, isExpectedRunCancellation: () => false,
  isInternalSessionEffectsKey: (key: string) => key.includes("internal:"), resolveFailoverReasonFromError: () => undefined,
}))
import plugin from "../../plugins/scoped-workshop/index.ts"
import { assertReplacement } from "../../plugins/scoped-workshop/src/config.ts"
let root: string, hooks: Map<string, Function>, factory: any, jobs: Function[], config: any, host: any, learnContribution: any
let unpublish: () => void
const body = "---\nname: tested-flow\ndescription: Check reusable results\n---\nCompare the actual result with the expected value."
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "replacement-workshop-")); hooks = new Map(); jobs = []
  state.services = { storageRoot: root, assertCurrent() {}, admissions: new ScopeAdmissions({ captureSessionLease: () => () => {} }), stop() { this.admissions.stop() } }
  unpublish = publishScopedWorkshopAccess(state.services)
  config = { meta: { migrations: { skillWorkshopPlugin: true } }, plugins: { entries: { "skill-workshop": { enabled: false }, "dingtalk-scoped-workshop": { enabled: true, config: { autonomous: { mode: "auto" } } } } } }
  host = { config: { current: () => config }, logging: { getChildLogger: () => ({ debug() {}, warn() {}, info() {} }) },
    agent: { resolveAgentTimeoutMs: () => 60000 }, subagent: { runForkedTurn: vi.fn(async p => { await p.onSettled({ ok: true, source: { sessionId: "physical", lifecycleRevision: null } }); return { status: "settled" } }) } }
  plugin.register({ config, runtime: host, logger: { debug() {} },
    registerTool(value: any) { factory = value }, on(name: string, handler: Function) { hooks.set(name, handler) }, registerLearnContribution(value: any) { learnContribution = value },
    registerService(service: any) { service.start({ scheduler: { signal: new AbortController().signal, schedule({ run }: any) { jobs.push(run); return { cancel() {} } } } }) },
  } as any)
})
afterEach(() => { unpublish(); state.services.admissions.stop(); fs.rmSync(root, { recursive: true, force: true }) })
function ctx(sender = "alice") {
  const admission = state.services.admissions.begin({ tenantId: "corp", accountId: "bot", agentId: "main", senderId: sender, chatType: "direct", conversationId: `dm-${sender}` }, () => {})
  return { agentId: "main", runId: `foreground-${sender}`, sessionKey: admission.sessionKey, sessionId: "physical", messageChannel: "dingtalk-connector", agentAccountId: "bot", requesterSenderId: sender,
    nativeChannelId: `dm-${sender}`, toolBindings: { [SCOPE_BINDING]: admission.token }, assertInvocationCurrent() {},
    channel: "dingtalk-connector", accountId: "bot", senderId: sender, channelContext: { chat: { [SCOPE_BINDING]: admission.token, dingtalkNativeConversationId: `dm-${sender}` } },
    completedTurn: { sessionId: "physical", entryId: "completed-entry" }, toolNames: ["skill_workshop"], modelProviderId: "fixture", modelId: "fixture", workspaceDir: root }
}
it("rejects an unmarked pre-plugin config even when it contains an ignored disabled entry", () => {
  expect(() => assertReplacement({ ...config, meta: undefined })).toThrow("Migrate")
})
it("declares sandbox compatibility while leaving actual tool access to host policy", () => {
  expect(learnContribution).toMatchObject({ medium: "skills", toolNames: ["skill_workshop"], sandboxCompatible: true })
})
it("counts a Code Mode catalog tool only when the host authorized that same run at prompt build", () => {
  const admitted: any = ctx()
  admitted.toolNames = ["exec", "wait"]
  admitted.toolAuthority = { allows: (name: string) => name === "skill_workshop" }
  hooks.get("before_prompt_build")!({}, admitted)
  hooks.get("agent_end")!({ success: true, modelIterations: 10, messages: [{ role: "user", content: "verify" }] }, admitted)
  expect(jobs).toHaveLength(1)

  const denied: any = ctx("bob")
  denied.toolNames = ["exec", "wait"]
  denied.toolAuthority = { allows: () => false }
  hooks.get("before_prompt_build")!({}, denied)
  hooks.get("agent_end")!({ success: true, modelIterations: 10, messages: [{ role: "user", content: "verify" }] }, denied)
  expect(jobs).toHaveLength(1)
})
it("runs exactly one native fork with the captured source; an abstaining model creates nothing", async () => {
  const context = ctx(); const lease = scopedWorkshopAccess.forCompletedTurn(context); const before = lease.open(() => {}).stamp()
  hooks.get("agent_end")!({ success: true, modelIterations: 10, messages: [{ role: "user", content: "Do not learn this task" }] }, context)
  expect(jobs).toHaveLength(1); expect(host.subagent.runForkedTurn).not.toHaveBeenCalled()
  await jobs.shift()!()
  const call = host.subagent.runForkedTurn.mock.calls[0][0]
  expect(call).toMatchObject({ sessionKey: context.sessionKey, through: context.completedTurn, tools: ["skill_workshop"] })
  expect(call.prompt).toContain("user's own restrictions")
  expect(lease.open(() => {}).stamp()).toBe(before)
})
it("fork tools require matching plugin owner, source, agent and active run, then write only that scope", async () => {
  const context = ctx()
  let retained: any
  host.subagent.runForkedTurn.mockImplementation(async (p: any) => {
    const fork = { agentId: "main", runId: p.runId, assertInvocationCurrent() {}, backgroundRun: { ownerPluginId: "dingtalk-scoped-workshop", sourceSessionKey: context.sessionKey } }
    expect(factory.create({ ...fork, backgroundRun: { ...fork.backgroundRun, ownerPluginId: "other-plugin" } })).toBeNull()
    expect(factory.create({ ...fork, agentId: "other-agent" })).toBeNull()
    retained = factory.create(fork)
    await retained.execute("create", { action: "create", name: "tested-flow", content: body })
    const refreshed = factory.create(fork)
    await expect(refreshed.execute("second", { action: "create", name: "second", content: body.replace("tested-flow", "second") })).rejects.toThrow("one change")
    await p.onSettled({ ok: true, source: { sessionId: "physical", lifecycleRevision: null } })
    return { status: "settled" }
  })
  hooks.get("agent_end")!({ success: true, modelIterations: 10, messages: [] }, context); await jobs.shift()!()
  await expect(retained.execute("late", { action: "list" })).rejects.toThrow("expired")
  expect(scopedWorkshopAccess.forInvocation(ctx("bob")).open(() => {}).list()).toEqual([])
})
it("does not launch a second review after the foreground already saved or when auto is off", async () => {
  const context = ctx(); const tool = factory.create(context)
  await tool.execute("create", { action: "create", name: "tested-flow", content: body })
  hooks.get("agent_end")!({ success: true, modelIterations: 12, messages: [] }, context)
  expect(jobs).toHaveLength(0)
  config.plugins.entries["dingtalk-scoped-workshop"].config.autonomous.mode = "off"
  hooks.get("agent_end")!({ success: true, modelIterations: 12, messages: [] }, ctx("bob"))
  expect(jobs).toHaveLength(0)
})
it("a pending candidate keeps its lease across unrelated turns and refreshes on a shorter same-session turn", async () => {
  const original = ctx()
  hooks.get("agent_end")!({ success: true, modelIterations: 10, messages: [] }, original)
  for (let i = 0; i < 70; i++) hooks.get("agent_end")!({ success: true, modelIterations: 1, messages: [] }, ctx(`other-${i}`))
  expect(jobs).toHaveLength(1)
  const latest = { ...ctx(), runId: "alice-next", completedTurn: { sessionId: "physical", entryId: "latest-entry" } }
  hooks.get("agent_end")!({ success: true, modelIterations: 1, messages: [] }, latest)
  await jobs.pop()!()
  expect(host.subagent.runForkedTurn).toHaveBeenCalledOnce()
  expect(host.subagent.runForkedTurn.mock.calls[0][0].through).toEqual(latest.completedTurn)
})
