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
vi.mock("../../src/runtime.ts", () => ({ getDingtalkRuntime: () => ({ channel: {
  reply: {
    resolveEnvelopeFormatOptions: () => ({}), formatAgentEnvelope: ({ body }: any) => body,
    finalizeInboundContext: (ctx: any) => ctx, dispatchReplyWithBufferedBlockDispatcher: mocks.dispatch,
    dispatchReplyFromConfig: vi.fn(),
  }, routing: { buildAgentSessionKey: mocks.routing },
} }) }))
import { handleDingTalkMessageInternal } from "../../src/core/message-handler.ts"

const enabled = {
  skills: { workshop: { autonomous: { mode: "off" } } },
  channels: { "dingtalk-connector": { memoryScope: { scopedLearning: { enabled: true, mode: "off" } } } },
  bindings: [{ agentId: "work", match: { channel: "dingtalk-connector", accountId: "acc-1" } }],
}
async function receive(text: string, overrides: any = {}) {
  await handleDingTalkMessageInternal({
    accountId: "acc-1", config: {}, cfg: enabled,
    sessionWebhook: "https://unused.test", runtime: {},
    data: { msgtype: "text", text: { content: text }, conversationType: "1", senderStaffId: "alice", conversationId: "group-1", msgId: "msg-1" },
    ...overrides,
  })
}
beforeEach(() => vi.clearAllMocks())

describe("DingTalk /learn ingress with real extraction and routing context", () => {
  it.each(["/learn", "/learn list", "/learn view diagnose-request", "/learn undo diagnose-request"])("rewrites every host command input for %s while retaining identity and feedback", async text => {
    await receive(text)
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    const { ctx } = mocks.dispatch.mock.calls[0][0]
    for (const key of ["Body", "BodyForAgent", "RawBody", "CommandBody"]) {
      expect(ctx[key]).toContain("scoped_skill_workshop")
      expect(ctx[key]).not.toMatch(/^\s*\/learn/i)
    }
    expect(ctx).toMatchObject({ AccountId: "acc-1", SenderId: "alice", From: "alice", To: "alice", SessionKey: "agent:work:dingtalk-connector:acc-1:direct:alice", CommandAuthorized: true })
    expect(mocks.reply.mock.calls[0][0].userPrompt).toBe(text)
    expect(mocks.http).not.toHaveBeenCalled()
  })
  it("preserves group-sender isolation and binding", async () => {
    await receive("/learn", { config: { groupSessionScope: "group_sender" }, data: { msgtype: "text", text: { content: "/learn" }, conversationType: "2", senderStaffId: "alice", conversationId: "group-1" } })
    expect(mocks.dispatch.mock.calls[0][0].ctx).toMatchObject({ To: "group-1", ChatType: "group", SessionKey: "agent:work:dingtalk-connector:acc-1:group:group-1:alice" })
  })
  it.each([{}, { ...enabled, skills: {} }])("replies without native dispatch for unavailable configuration", async cfg => {
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
    await receive("/learn undo", { preCreatedCard: card, emotionAlreadyAdded: true })
    expect(mocks.finish).toHaveBeenCalledWith(card, expect.stringContaining("用法"), {}, expect.anything())
    expect(mocks.recall).toHaveBeenCalledOnce()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it.each([["/learner", "/learner"], ["hello", "hello"], ["/reset", "/new"]])("preserves existing command behavior: %s", async (text, expected) => {
    await receive(text)
    expect(mocks.dispatch.mock.calls[0][0].ctx.CommandBody).toBe(expected)
  })
})
