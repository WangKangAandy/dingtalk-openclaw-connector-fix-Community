import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGroupMention } from "../../src/utils/group-mention.ts";

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
const mockSendMediaToDingTalk = vi.hoisted(() => vi.fn());
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
  registerActiveCard: vi.fn(),
  unregisterActiveCard: vi.fn(),
}));

vi.mock("../../src/services/messaging.ts", () => ({
  sendMessage: mockSendMessage,
  sendTextMessage: mockSendTextMessage,
  sendMarkdownMessage: mockSendMarkdownMessage,
  sendMediaToDingTalk: mockSendMediaToDingTalk,
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
    mockSendMediaToDingTalk.mockResolvedValue({ ok: true });
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

  it("waits for a late final instead of emitting an empty-output placeholder", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-late-final",
      senderId: "user-late-final",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();

    const idlePromise = args.onIdle();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await args.deliver({ text: "迟到但完整的最终回答" }, { kind: "final" });
    await idlePromise;

    expect(mockFinishAICard).toHaveBeenCalledTimes(1);
    const [, finalText] = mockFinishAICard.mock.calls[0];
    expect(finalText).toBe("迟到但完整的最终回答");
    expect(finalText).not.toContain("无文本输出");
  });

  it("sends payload mediaUrl via sendMedia and does not fold it into the card", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-media-url",
      senderId: "user-media-url",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/inbound/hr003-qrcode.png";
    await args.deliver(
      {
        text: "查看工资单（FAQ HR-003，人力）：\n\n或扫码（二维码见附件）\n\n人工解答对接人：Penny",
        mediaUrl: png,
      },
      { kind: "final" },
    );
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    await args.onIdle();

    expect(mockFinishAICard).toHaveBeenCalledTimes(1);
    const [, finalText] = mockFinishAICard.mock.calls[0];
    expect(finalText).toContain("人工解答对接人：Penny");
    expect(finalText).not.toContain("MEDIA:");
    expect(finalText).not.toContain("hr003-qrcode.png");
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    expect(mockFinishAICard.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendMediaToDingTalk.mock.invocationCallOrder[0],
    );
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: png,
        target: "user-media-url",
      }),
    );
    expect(mockSendMediaToDingTalk.mock.calls[0][0].text).toBeUndefined();
  });

  it("defers sendMedia until flushOutboundMedia in asyncMode", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const { flushOutboundMedia } = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-async-media",
      senderId: "user-async-media",
      isDirect: true,
      sessionWebhook: "http://webhook",
      asyncMode: true,
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/inbound/hr003-qrcode.png";
    await args.deliver({ text: "或扫码（二维码见附件）", mediaUrl: png }, { kind: "final" });
    await args.onIdle();
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    await flushOutboundMedia();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: png, target: "user-async-media" }),
    );
  });

  it("sends payload mediaUrl from a block when OpenClaw never delivers final", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-media-block",
      senderId: "user-media-block",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/outbound/payslip-qr---9a32408f.png";
    await result.replyOptions.onPartialReply?.({
      text: "这次是真的附上了\n\n3. 或直接扫下面这张码。",
    });
    await args.deliver(
      {
        text: "这次是真的附上了\n\n3. 或直接扫下面这张码。",
        mediaUrl: png,
      },
      { kind: "block" },
    );
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    await args.onIdle();

    expect(mockFinishAICard).toHaveBeenCalledTimes(1);
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    expect(mockFinishAICard.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendMediaToDingTalk.mock.invocationCallOrder[0],
    );
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: png,
        target: "user-media-block",
      }),
    );
  });

  it("keeps queued mediaUrl across a second onReplyStart before the card closes", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-media-rentry",
      senderId: "user-media-rentry",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/outbound/payslip-qr---9a32408f.png";
    await result.replyOptions.onPartialReply?.({ text: "扫下面这张码。" });
    await args.deliver({ text: "扫下面这张码。", mediaUrl: png }, { kind: "block" });
    await args.onReplyStart();
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    await args.onIdle();
    expect(mockFinishAICard).toHaveBeenCalledTimes(1);
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    expect(mockFinishAICard.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendMediaToDingTalk.mock.invocationCallOrder[0],
    );
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: png, target: "user-media-rentry" }),
    );
  });

  it("sends payload mediaUrl when the card closes with no body", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-media-nobody",
      senderId: "user-media-nobody",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/outbound/payslip-qr---9a32408f.png";
    await args.deliver({ text: "status", mediaUrl: png }, { kind: "block" });
    await args.onIdle();
    expect(mockFinishAICard).not.toHaveBeenCalled();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: png, target: "user-media-nobody" }),
    );
  });

  it("does not sendMedia when a later card body embeds the same path", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-media-late-embed",
      senderId: "user-media-late-embed",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/inbound/hr003-qrcode.png";
    await args.deliver({ text: "status", mediaUrl: png }, { kind: "block" });
    await args.deliver(
      {
        text: `扫码：\n\n![](${png})\n\n人工解答对接人：Penny`,
        mediaUrl: png,
      },
      { kind: "final" },
    );
    await args.onIdle();
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    const [, finalText] = mockFinishAICard.mock.calls[0];
    expect(finalText).toContain(png);
  });

  it("does not sendMedia when the same path is already in the card markdown", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "conv-media-inline",
      senderId: "user-media-inline",
      isDirect: true,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    const png = "/home/mccxadmin/.openclaw/media/inbound/hr003-qrcode.png";
    await args.deliver(
      {
        text: `扫码：\n\n![](${png})\n\n人工解答对接人：Penny`,
        mediaUrl: png,
      },
      { kind: "final" },
    );
    await args.onIdle();

    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    const [, finalText] = mockFinishAICard.mock.calls[0];
    expect(finalText).toContain(png);
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

  it("sends accumulated text when card close fails with a definite error", async () => {
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

    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    await result.replyOptions.onPartialReply?.({ text: "完整回答" });
    await args.deliver({ text: "完整回答" }, { kind: "final" });

    mockFinishAICard.mockRejectedValueOnce(new Error("card finalize failed"));
    mockIsAmbiguousCardError.mockReturnValue(false);
    await args.onIdle();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage.mock.calls[0][2]).toContain("完整回答");
    expect(mockSendMessage.mock.calls[0][2]).not.toContain("消息发送失败");
  });

  it("group replies deliver AI Card with senderStaffId atUserIds", async () => {
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    const result = createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "cid-group",
      senderId: "$:LWCP_v1:$encrypted",
      groupMention: resolveGroupMention({
        isDirect: false,
        senderStaffId: "staff_1",
        senderNick: "张三",
      }),
      isDirect: false,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    expect(mockCreateAICardForTarget).toHaveBeenCalledWith(
      expect.anything(),
      {
        type: "group",
        openConversationId: "cid-group",
        atUserIds: { staff_1: "张三" },
      },
      expect.anything(),
    );
    await result.replyOptions.onPartialReply?.({ text: "你好" });
    expect(mockStreamAICard.mock.calls[0][1]).toBe("你好 @张三");
  });

  it("group webhook fallback @s senderStaffId, not encrypted senderId", async () => {
    mockCreateAICardForTarget.mockResolvedValue(null);
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "cid-group",
      senderId: "$:LWCP_v1:$encrypted",
      groupMention: resolveGroupMention({
        isDirect: false,
        senderStaffId: "staff_1",
        senderNick: "张三",
      }),
      isDirect: false,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    await args.deliver({ text: "普通回复" }, { kind: "final" });
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage.mock.calls[0][3]).toEqual(
      expect.objectContaining({ atUserId: "staff_1" }),
    );
  });

  it("does not @ on group replies when senderStaffId is absent", async () => {
    mockCreateAICardForTarget.mockResolvedValue(null);
    const { createDingtalkReplyDispatcher } = await import("../../src/reply-dispatcher");
    createDingtalkReplyDispatcher({
      cfg: {} as any,
      agentId: "a1",
      runtime: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      conversationId: "cid-group",
      senderId: "$:LWCP_v1:$encrypted",
      isDirect: false,
      sessionWebhook: "http://webhook",
    });
    const args = (globalThis as any).__dispatcherArgs;
    await args.onReplyStart();
    expect(mockCreateAICardForTarget.mock.calls[0][1].atUserIds).toBeUndefined();
    await args.deliver({ text: "普通回复" }, { kind: "final" });
    expect(mockSendMessage.mock.calls[0][3].atUserId).toBeUndefined();
  });
});
