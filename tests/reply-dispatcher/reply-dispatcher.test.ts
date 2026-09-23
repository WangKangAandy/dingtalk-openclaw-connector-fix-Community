import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateReplyDispatcherWithTyping = vi.hoisted(() => vi.fn());
const mockResolveDingtalkAccount = vi.hoisted(() => vi.fn());
const mockGetDingtalkRuntime = vi.hoisted(() => vi.fn());
const mockCreateAICardForTarget = vi.hoisted(() => vi.fn());
const mockStreamAICard = vi.hoisted(() => vi.fn());
const mockFinishAICard = vi.hoisted(() => vi.fn());
const mockIsQpsLimitError = vi.hoisted(() => vi.fn());
const mockIsAmbiguousCardError = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockSendTextMessage = vi.hoisted(() => vi.fn());
const mockSendMarkdownMessage = vi.hoisted(() => vi.fn());
const mockGetOapiAccessToken = vi.hoisted(() => vi.fn());

vi.mock("openclaw/plugin-sdk", () => ({
  createReplyPrefixOptions: vi.fn(() => ({
    onModelSelected: vi.fn(),
  })),
  createTypingCallbacks: vi.fn(() => ({
    onActive: vi.fn(),
    onIdle: vi.fn(),
    onCleanup: vi.fn(),
  })),
  logTypingFailure: vi.fn(),
}));

vi.mock("../../src/config/accounts.ts", () => ({
  resolveDingtalkAccount: mockResolveDingtalkAccount,
}));

vi.mock("../../src/runtime.ts", () => ({
  getDingtalkRuntime: mockGetDingtalkRuntime,
}));

vi.mock("../../src/services/messaging/card.ts", () => ({
  createAICardForTarget: mockCreateAICardForTarget,
  streamAICard: mockStreamAICard,
  finishAICard: mockFinishAICard,
  isQpsLimitError: mockIsQpsLimitError,
  isAmbiguousCardError: mockIsAmbiguousCardError,
}));

vi.mock("../../src/services/messaging.ts", () => ({
  sendMessage: mockSendMessage,
  sendTextMessage: mockSendTextMessage,
  sendMarkdownMessage: mockSendMarkdownMessage,
}));

vi.mock("../../src/services/media/image.ts", () => ({
  processLocalImages: vi.fn(async (s: string) => s),
}));

vi.mock("../../src/services/media/video.ts", () => ({
  processVideoMarkers: vi.fn(async (s: string) => s),
}));

vi.mock("../../src/services/media/audio.ts", () => ({
  processAudioMarkers: vi.fn(async (s: string) => s),
}));

vi.mock("../../src/services/media/file.ts", () => ({
  uploadAndReplaceFileMarkers: vi.fn(async (s: string) => s),
}));

vi.mock("../../src/utils/token.ts", () => ({
  getAccessToken: vi.fn(),
  getOapiAccessToken: mockGetOapiAccessToken,
}));

describe("reply-dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveDingtalkAccount.mockReturnValue({
      accountId: "acc-1",
      config: { debug: false, streaming: true },
    });
    mockGetOapiAccessToken.mockResolvedValue(null);
    mockCreateAICardForTarget.mockResolvedValue({
      cardInstanceId: "c1",
      accessToken: "tk",
      inputingStarted: false,
    });
    mockStreamAICard.mockResolvedValue(undefined);
    mockFinishAICard.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue({ ok: true });
    mockSendTextMessage.mockResolvedValue({ ok: true });
    mockSendMarkdownMessage.mockResolvedValue({ ok: true });
    // Default: treat 403 + code containing "QpsLimit" as QPS error
    mockIsQpsLimitError.mockImplementation((err: any) => {
      const code = err?.response?.data?.code;
      return (
        err?.response?.status === 403 &&
        typeof code === "string" &&
        code.includes("QpsLimit")
      );
    });
    mockCreateReplyDispatcherWithTyping.mockImplementation((args: any) => {
      (globalThis as any).__dispatcherArgs = args;
      return { dispatcher: {}, replyOptions: {}, markDispatchIdle: vi.fn() };
    });
    mockGetDingtalkRuntime.mockReturnValue({
      channel: {
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "markdown",
          chunkTextWithMode: (text: string) => [text],
        },
        reply: {
          resolveHumanDelayConfig: () => ({ enabled: false }),
          createReplyDispatcherWithTyping: mockCreateReplyDispatcherWithTyping,
        },
      },
    });
  });

  it("normalizes slash commands", async () => {
    const { normalizeSlashCommand } = await import("../../src/utils/session");
    expect(normalizeSlashCommand("/reset")).toBe("/new");
    expect(normalizeSlashCommand("新会话")).toBe("/new");
    expect(normalizeSlashCommand("hello")).toBe("hello");
  });

  it("creates dispatcher and runs streaming lifecycle callbacks", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const runtime = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: runtime as any,
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });

    const args = (globalThis as any).__dispatcherArgs;
    expect(args).toBeTruthy();

    await args.onReplyStart();
    expect(mockCreateAICardForTarget).toHaveBeenCalledTimes(1);

    await args.deliver({ text: "part-1" }, { kind: "block" });
    expect(mockStreamAICard).toHaveBeenCalled();

    await args.deliver({ text: "final-1" }, { kind: "final" });
    // Streaming final payloads are buffered; Card finalization happens once on idle.
    expect(mockFinishAICard).not.toHaveBeenCalled();

    await args.onError(new Error("x"), { kind: "final" });
    expect(mockFinishAICard).toHaveBeenCalledTimes(1);
    await args.onIdle();
    args.onCleanup();

    await result.replyOptions.onPartialReply?.({ text: "partial-2" });
    expect(typeof result.getAsyncModeResponse()).toBe("string");
  });

  it("suppresses an error final without changing the streamed answer", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const runtime = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: runtime as any,
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();

    await result.replyOptions.onPartialReply?.({ text: "前面已经生成的正文" });
    await args.deliver({ text: "前面已经生成的正文" }, { kind: "final" });
    await args.deliver(
      { text: "⚠️ exec 命令执行失败", isError: true },
      { kind: "final" },
    );

    expect(mockFinishAICard).not.toHaveBeenCalled();
    await args.onIdle();

    expect(mockFinishAICard).toHaveBeenCalledTimes(1);
    const [, finalText] = mockFinishAICard.mock.calls[0];
    expect(finalText).toContain("前面已经生成的正文");
    expect(finalText).not.toContain("⚠️ exec 命令执行失败");
  });

  it("suppresses repeated error finals and keeps an empty final from overwriting text", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();

    await args.deliver({ text: "保留这段内容" }, { kind: "final" });
    await args.deliver({ text: "⚠️ 命令失败", isError: true }, { kind: "final" });
    await args.deliver({ text: "⚠️ 命令失败", isError: true }, { kind: "final" });
    await args.deliver({ text: "" }, { kind: "final" });
    await args.onIdle();

    const [, finalText] = mockFinishAICard.mock.calls[0];
    expect(finalText).toContain("保留这段内容");
    expect(finalText).not.toContain("⚠️ 命令失败");
    expect(finalText).not.toContain("无文本输出");
  });

  it("still delivers an isError final when no answer exists yet", async () => {
    // Align WhatsApp incomplete-turn posture: bare failure finals remain visible.
    mockResolveDingtalkAccount.mockReturnValue({
      accountId: "acc-1",
      config: { debug: false, streaming: false },
    });
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-bare-error",
      senderId: "user-bare-error",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.deliver({ text: "⚠️ 唯一的命令错误", isError: true }, { kind: "final" });

    expect(mockSendMessage.mock.calls.length + mockSendMarkdownMessage.mock.calls.length).toBeGreaterThan(0);
  });

  it("suppresses isError finals after a non-streaming answer was already delivered", async () => {
    mockResolveDingtalkAccount.mockReturnValue({
      accountId: "acc-1",
      config: { debug: false, streaming: false },
    });
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-non-streaming",
      senderId: "user-non-streaming",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;

    await args.deliver({ text: "正常回答" }, { kind: "final" });
    const sentBefore =
      mockSendMessage.mock.calls.length +
      mockSendTextMessage.mock.calls.length +
      mockSendMarkdownMessage.mock.calls.length;

    await args.deliver({ text: "⚠️ 非流式命令错误", isError: true }, { kind: "final" });
    const sentAfter =
      mockSendMessage.mock.calls.length +
      mockSendTextMessage.mock.calls.length +
      mockSendMarkdownMessage.mock.calls.length;

    expect(sentBefore).toBeGreaterThan(0);
    expect(sentAfter).toBe(sentBefore);
  });

  it("asyncMode accumulates final response without streaming", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const runtime = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: runtime as any,
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      sessionWebhook: "http://webhook",
      asyncMode: true,
    });
    await result.replyOptions.onPartialReply?.({ text: "async-text" });
    expect(result.getAsyncModeResponse()).toBe("async-text");
  });

  // 回归测试 (issue #510)：onPartialReply 里 streamAICard 抛出 QPS 限流错误时，
  // 不应发送 "⚠️ 消息发送失败，请稍后重试" 兜底消息——该错误是瞬时的，
  // streamAICard 内部已退避重试，下一次 partial 更新会覆盖补齐内容。
  it("does NOT send fallback error message when streamAICard throws QPS limit error", async () => {
    const { createDingtalkReplyDispatcher } = await import(
      "../../src/reply-dispatcher"
    );
    const runtime = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: runtime as any,
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });

    const qpsError: any = new Error("Request failed with status code 403");
    qpsError.response = {
      status: 403,
      data: { code: "QpsLimit.ExceedRealQps", message: "qps exceed" },
    };
    mockStreamAICard.mockRejectedValueOnce(qpsError);

    // 触发 onReplyStart 来预创建 AI Card，保证 onPartialReply 里
    // currentCardTarget 存在、会真的走到 streamAICard 调用。
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();

    await result.replyOptions.onPartialReply?.({ text: "partial-qps-content" });

    // streamAICard 被调用一次并抛 QPS 错误
    expect(mockStreamAICard).toHaveBeenCalledTimes(1);
    // 关键断言：QPS 错误路径下不应发送任何兜底消息
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  // 回归测试：任何 partial 更新错误都不能立即发送用户可见错误。
  // 后续 partial 可能恢复，最终正文由 Card 或 closeStreaming 的文字兜底负责。
  it("does NOT send fallback error message for a non-QPS partial update error", async () => {
    const { createDingtalkReplyDispatcher } = await import(
      "../../src/reply-dispatcher"
    );
    const runtime = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: runtime as any,
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });

    const otherError: any = new Error("Some unexpected error");
    mockStreamAICard.mockRejectedValueOnce(otherError);

    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();

    await result.replyOptions.onPartialReply?.({ text: "partial-other" });

    expect(mockStreamAICard).toHaveBeenCalledTimes(1);
    // partial 错误只记录日志，不应发送任何兜底消息
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
