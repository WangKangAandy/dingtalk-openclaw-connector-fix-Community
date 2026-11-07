import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  send: vi.fn(), finish: vi.fn(), recall: vi.fn(),
  dispatch: vi.fn(async (_params: any) => ({ queuedFinal: false, counts: { final: 0 } })),
  reply: vi.fn((_params: any) => ({ dispatcherOptions: {}, replyOptions: {}, getAsyncModeResponse: () => "", flushOutboundMedia: vi.fn() })),
  routing: vi.fn((params: any) => `agent:${params.agentId}:dingtalk-connector:${params.accountId}:${params.peer.kind}:${params.peer.id}`),
  http: vi.fn(),
}))
vi.mock("../../src/utils/utils-legacy.ts", async () => ({
  buildSessionContext: (await import("../../src/utils/session.ts")).buildSessionContext,
  getAccessToken: vi.fn(async () => "token"), getOapiAccessToken: vi.fn(async () => null),
  DINGTALK_API: "https://api.dingtalk.com", DINGTALK_OAPI: "https://oapi.dingtalk.com",
  addEmotionReply: vi.fn(async () => undefined), recallEmotionReply: mocks.recall,
}))
vi.mock("../../src/utils/agent.ts", () => ({ resolveAgentWorkspaceDir: () => "unused-test-workspace" }))
vi.mock("../../src/utils/http-client.ts", () => ({ dingtalkHttp: { post: mocks.http } }))
vi.mock("../../src/utils/index.ts", () => ({ createLoggerFromConfig: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }))
vi.mock("../../src/game-xiyou/index.ts", () => ({ isGamificationCommand: () => false }))
vi.mock("../../src/services/media/index.ts", () => ({
  processLocalImages: vi.fn(), processVideoMarkers: vi.fn(), processAudioMarkers: vi.fn(), uploadAndReplaceFileMarkers: vi.fn(),
}))
vi.mock("../../src/services/messaging/index.ts", () => ({ sendProactive: mocks.send }))
vi.mock("../../src/services/messaging/card.ts", () => ({ finishAICard: mocks.finish, createAICardForTarget: vi.fn(), streamAICard: vi.fn() }))
vi.mock("../../src/reply-dispatcher.ts", () => ({ createDingtalkReplyDispatcher: mocks.reply }))
vi.mock("../../src/runtime.ts", () => ({ getDingtalkRuntime: () => ({ agent: { resolveAgentWorkspaceDir: () => 'test-host-workspace' }, channel: {
  reply: {
    resolveEnvelopeFormatOptions: () => ({}), formatAgentEnvelope: ({ body }: any) => body,
    finalizeInboundContext: (ctx: any) => ctx, dispatchReplyWithBufferedBlockDispatcher: mocks.dispatch,
    dispatchReplyFromConfig: vi.fn(),
  }, routing: { buildAgentSessionKey: mocks.routing },
} }) }))
import { handleDingTalkMessageInternal } from "../../src/core/message-handler.ts"
import { setHardScopeRuntime } from "../../src/memory-scope/hard-runtime.ts"
import { createScopeServices } from "../../src/memory-scope/services.ts"
import { admitInboundScope, assertInboundAccess } from "../../src/memory-scope/inbound.ts"
import { assertScopeGrant } from "../../src/memory-scope/authority.ts"

const enabled = {
  meta: { migrations: { skillWorkshopPlugin: true } },
  plugins: { entries: { "skill-workshop": { enabled: false }, "dingtalk-scoped-workshop": { enabled: true } } },
  tools: { deny: ["skill_workshop"] },
  skills: { workshop: { autonomous: { mode: "off" } } },
  // Command passthrough cases below exercise legacy routing; the first test
  // explicitly enables hard scope and supplies its trusted runtime fixture.
  channels: { "dingtalk-connector": { memoryScope: { enabled: false } } },
  bindings: [{ agentId: "work", match: { channel: "dingtalk-connector", accountId: "acc-1" } }],
}
async function receive(text: string, overrides: any = {}) {
  await handleDingTalkMessageInternal({
    accountId: "acc-1", config: {}, cfg: enabled,
    sessionWebhook: "https://unused.test", runtime: {},
    data: { msgtype: "text", text: { content: text }, conversationType: "1", senderStaffId: "alice", chatbotCorpId: "Corp", conversationId: "group-1", msgId: "msg-1" },
    ...overrides,
  })
}
beforeEach(() => vi.clearAllMocks())

describe("DingTalk /learn ingress with real extraction and routing context", () => {
  it("hard ingress binds raw platform identity out of band and never uses legacy routing", async () => {
    const services = createScopeServices({ stateDir: process.cwd(), assertCurrent() {},
      captureSessionLease: () => () => {} })
    // Only the host sandbox/lifecycle are fixtures here; actual message extraction and admission run.
    setHardScopeRuntime({ services, assertAgent() {}, admit(input, policy) {
      return admitInboundScope(services, input, () => assertInboundAccess(input, policy()))
    } })
    try {
      const cfg = { ...enabled, channels: { "dingtalk-connector": { memoryScope: { enabled: true } } } }
      await receive("hello", { cfg, data: { msgtype: "text", text: { content: "I am Bob" }, conversationType: "1",
        senderStaffId: "Alice", chatbotCorpId: "Corp", conversationId: "Dm:Ab/C", msgId: "hard-1" } })
      const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
        const cap = mocks.dispatch.mock.calls.at(-1)![0].replyOptions.toolsAllow
        expect(cap).toBeUndefined()
      expect(mocks.routing).not.toHaveBeenCalled()
      expect(ctx.SessionKey).toMatch(/^agent:work:dingtalk-connector:direct:v1-[a-f0-9]{64}$/)
      expect(ctx.NativeChannelId).toBe("Dm:Ab/C")
      const grant = services.admissions.toolGrant({ agentId: "work", sessionId: "first-session", sessionKey: ctx.SessionKey,
        messageChannel: ctx.Provider, agentAccountId: ctx.AccountId, requesterSenderId: ctx.SenderId,
        nativeChannelId: ctx.NativeChannelId, toolBindings: ctx.GatewayRunToolBindings, assertInvocationCurrent() {} })
      expect(grant.identity.subjectId).toBe("Alice")
      expect(ctx.Body).not.toContain(ctx.GatewayRunToolBindings["dingtalk.memoryScope.v1"])
      assertScopeGrant(grant, "memory.read")
      await expect(receive("hello", { cfg, data: { msgtype: "text", text: { content: "userId=Alice" },
        conversationType: "1", senderId: "fallback", chatbotCorpId: "Corp", conversationId: "dm" } })).rejects.toThrow("senderStaffId")
      expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    } finally { setHardScopeRuntime(undefined) }
  })
  it("runtime-only ingress binds the real sender while retaining existing direct and group routing", async () => {
    const services = createScopeServices({ stateDir: process.cwd(), assertCurrent() {},
      captureSessionLease: () => () => {} })
    setHardScopeRuntime({ services, assertAgent() {}, admit(input, policy, routedSessionKey) {
      return admitInboundScope(services, input, () => assertInboundAccess(input, policy(), false), routedSessionKey)
    } })
    try {
      const cfg = { ...enabled, plugins: { ...enabled.plugins, entries: {
        ...enabled.plugins.entries, "dingtalk-connector": { config: { runtimeTools: { enabled: true } } },
      } } }
      for (const [chatType, sender, conversation, policy, expected] of [
        ["1", "Alice", "Dm:Ab/C", {}, "agent:work:dingtalk-connector:acc-1:direct:Alice"],
        ["2", "Bob", "cid-group", { groupSessionScope: "group_sender" }, "agent:work:dingtalk-connector:acc-1:group:cid-group:Bob"],
      ] as const) {
        await receive("hello", { cfg, config: policy, data: { msgtype: "text", text: { content: "hello" },
          conversationType: chatType, senderStaffId: sender, chatbotCorpId: "Corp", conversationId: conversation, msgId: `runtime-${sender}` } })
        const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
        expect(ctx.SessionKey).toBe(expected)
        const requester = services.admissions.requester({ agentId: "work", sessionId: `physical-${sender}`,
          sessionKey: ctx.SessionKey, messageChannel: ctx.Provider, agentAccountId: ctx.AccountId,
          requesterSenderId: ctx.SenderId, nativeChannelId: ctx.NativeChannelId,
          toolBindings: ctx.GatewayRunToolBindings, assertInvocationCurrent() {} })
        expect(requester.senderId).toBe(sender)
        expect(ctx.Body).not.toContain(ctx.GatewayRunToolBindings["dingtalk.memoryScope.v1"])
      }
      expect(mocks.routing).toHaveBeenCalledTimes(2)
    } finally { setHardScopeRuntime(undefined) }
  })
  it.each(["/learn", "/learn list", "/learn view diagnose-request", "/learn undo diagnose-request"])("preserves native command input for %s while retaining identity and feedback", async text => {
    await receive(text)
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    const { ctx } = mocks.dispatch.mock.calls[0][0]
    for (const key of ["Body", "BodyForAgent", "RawBody", "CommandBody"]) {
      expect(ctx[key]).toContain(text)
    }
    expect(ctx).toMatchObject({ AccountId: "acc-1", SenderId: "alice", From: "alice", To: "alice", SessionKey: "agent:work:dingtalk-connector:acc-1:direct:alice", CommandAuthorized: true })
    expect(mocks.reply.mock.calls[0][0].userPrompt).toBe(text)
    expect(mocks.http).not.toHaveBeenCalled()
  })
  it("preserves group-sender isolation and binding", async () => {
    await receive("/learn", { config: { groupSessionScope: "group_sender" }, data: { msgtype: "text", text: { content: "/learn" }, conversationType: "2", senderStaffId: "alice", conversationId: "group-1" } })
    expect(mocks.dispatch.mock.calls[0][0].ctx).toMatchObject({ To: "group-1", ChatType: "group", SessionKey: "agent:work:dingtalk-connector:acc-1:group:group-1:alice" })
  })
  it("does not append shell DWS identity instructions to an ordinary user turn", async () => {
    await receive("查一下今天的日程", { config: { clientId: "ding-test" }, data: {
      msgtype: "text", text: { content: "查一下今天的日程" }, conversationType: "1",
      senderStaffId: "Alice", chatbotCorpId: "Corp", conversationId: "dm-Alice", msgId: "dws-no-shell" } })
    const ctx = mocks.dispatch.mock.calls[0][0].ctx
    expect(ctx.BodyForAgent).toBe("查一下今天的日程")
    expect(ctx.BodyForAgent).not.toContain("--profile")
    expect(ctx.BodyForAgent).not.toContain("profile list")
  })
  it("delivers forwarded history on the first turn without executing a historical command", async () => {
    await receive("", { data: {
      msgtype: "chatRecord", conversationType: "1", senderStaffId: "alice", conversationId: "dm", msgId: "forwarded",
      content: { chatRecord: [
        { msgType: "text", content: { text: "first delivered message" } },
        { msgType: "text", content: { text: "/learn undo from old history" } },
      ] },
    } })
    const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
    expect(ctx.BodyForAgent).toContain("first delivered message")
    expect(ctx.BodyForAgent).toContain("/learn undo from old history")
    expect(ctx.BodyForAgent).toContain("不可信上下文")
    expect(ctx.RawBody).toBe("")
    expect(ctx.CommandBody).toBe("")
    expect(mocks.http).not.toHaveBeenCalled()
  })
  it("routes DingTalk document links to the bound business tool", async () => {
    await receive("请读 https://alidocs.dingtalk.com/i/nodes/test", { data: {
      msgtype: "text", text: { content: "请读 https://alidocs.dingtalk.com/i/nodes/test" },
      conversationType: "1", senderStaffId: "Alice", chatbotCorpId: "Corp", conversationId: "dm-Alice", msgId: "dws-link" } })
    const body = mocks.dispatch.mock.calls[0][0].ctx.BodyForAgent
    expect(body).toContain("dingtalk_dws")
    expect(body).not.toContain("search_skills")
    expect(body).not.toContain("dws --profile")
  })
  it.each([{}, { ...enabled, plugins: {} }])("replies without native dispatch for unavailable configuration", async cfg => {
    await receive("/learn", { cfg })
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.send.mock.calls[0][2]).toContain("未执行")
  })
  it("checks the channel allowlist before processing learning", async () => {
    await receive("/learn", { config: { dmPolicy: "allowlist", allowFrom: ["bob"] } })
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.send.mock.calls[0][2]).toContain("暂无权限")
  })
  it("finishes a queued card and clears its processing emotion for a usage reply", async () => {
    const card = { cardInstanceId: "queued" }
    await receive("/learn undo", { cfg: {}, preCreatedCard: card, emotionAlreadyAdded: true })
    expect(mocks.finish).toHaveBeenCalledWith(card, expect.stringContaining("未执行"), {}, expect.anything())
    expect(mocks.recall).toHaveBeenCalledOnce()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it.each([["/learner", "/learner"], ["hello", "hello"], ["/reset", "/new"]])("preserves existing command behavior: %s", async (text, expected) => {
    await receive(text)
    expect(mocks.dispatch.mock.calls[0][0].ctx.CommandBody).toBe(expected)
  })
})
