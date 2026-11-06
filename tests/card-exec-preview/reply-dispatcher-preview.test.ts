import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamCalls: Array<{ content: string; varName?: string }> = [];
const updateCalls: Array<{ flowStatus?: string; params?: Record<string, string> }> = [];

const accountState: { config: Record<string, unknown> } = { config: {} };

vi.mock("openclaw/plugin-sdk/channel-outbound", () => ({
  createReplyPrefixOptions: () => ({ onModelSelected: vi.fn() }),
  createTypingCallbacks: () => ({
    onActive: vi.fn(),
    onIdle: vi.fn(),
    onCleanup: vi.fn(),
  }),
  logTypingFailure: vi.fn(),
}));

vi.mock("../../src/channel.ts", () => ({
  CHANNEL_ID: "dingtalk-connector",
}));

vi.mock("../../src/runtime.ts", () => ({
  getDingtalkRuntime: () => ({
    channel: {
      text: {
        resolveTextChunkLimit: () => 4000,
        resolveChunkMode: () => "length",
      },
      reply: {
        resolveHumanDelayConfig: () => ({}),
        createReplyDispatcherWithTyping: (opts: { onReplyStart?: () => void }) => ({
          dispatcher: {},
          replyOptions: { onReplyStart: opts.onReplyStart },
          markDispatchIdle: vi.fn(),
        }),
      },
    },
  }),
}));

vi.mock("../../src/config/accounts.ts", () => ({
  resolveDingtalkAccount: () => ({
    accountId: "default",
    config: accountState.config,
  }),
}));

vi.mock("../../src/utils/logger.ts", () => ({
  createLoggerFromConfig: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../src/card-feedback/index.ts", () => ({
  recordCardAnswer: vi.fn(),
  registerCardSession: vi.fn(),
}));

vi.mock("../../src/services/messaging.ts", () => ({
  sendMessage: vi.fn(),
  sendTextMessage: vi.fn(),
  sendMarkdownMessage: vi.fn(),
  sendMediaToDingTalk: vi.fn(),
}));

vi.mock("../../src/utils/token.ts", () => ({
  getOapiAccessToken: vi.fn(async () => "tok"),
}));

vi.mock("../../src/services/media/index.ts", () => ({
  processLocalImages: vi.fn(async (t: string) => t),
  processVideoMarkers: vi.fn(async (t: string) => t),
  processAudioMarkers: vi.fn(async (t: string) => t),
  uploadAndReplaceFileMarkers: vi.fn(async (t: string) => t),
  createOutboundMediaChannel: () => ({
    blockedNotice() { return undefined; },
    reset() {},
    remember() {},
    flush: async () => {},
  }),
}));

vi.mock("../../src/services/media/common.ts", () => ({
  FILE_MARKER_PATTERN: /(?!)/g,
  VIDEO_MARKER_PATTERN: /(?!)/g,
  AUDIO_MARKER_PATTERN: /(?!)/g,
}));

vi.mock("../../src/services/messaging/card.ts", () => ({
  AICardStatus: {
    PROCESSING: "1",
    INPUTING: "2",
    FINISHED: "3",
    EXECUTING: "4",
    FAILED: "5",
  },
  createAICardForTarget: vi.fn(),
  finishAICard: vi.fn(async () => undefined),
  isAmbiguousCardError: () => false,
  registerActiveCard: vi.fn(),
  unregisterActiveCard: vi.fn(),
  streamAICard: vi.fn(async (
    _card: unknown,
    content: string,
    _finished?: boolean,
    _config?: unknown,
    _log?: unknown,
    varName?: string,
  ) => {
    streamCalls.push({ content, varName });
  }),
  updateAICardParams: vi.fn(async (
    _card: unknown,
    update: { flowStatus?: string; params?: Record<string, string> },
  ) => {
    updateCalls.push({
      flowStatus: update.flowStatus,
      params: update.params ? { ...update.params } : undefined,
    });
  }),
}));

import { createDingtalkReplyDispatcher } from "../../src/reply-dispatcher.ts";

const preCreatedCard = {
  cardInstanceId: "card_preview_1",
  accessToken: "tok",
  tokenExpireTime: Date.now() + 60 * 60_000,
  inputingStarted: false,
};

function makeDispatcher() {
  return createDingtalkReplyDispatcher({
    cfg: { channels: { "dingtalk-connector": accountState.config } } as any,
    agentId: "main",
    runtime: { log: vi.fn(), error: vi.fn() },
    conversationId: "cid-1",
    senderId: "u-1",
    isDirect: true,
    accountId: "default",
    sessionWebhook: "https://example.test/hook",
    preCreatedCard: preCreatedCard as any,
    sessionKey: "sess-1",
  });
}

async function startReply(result: { dispatcherOptions: { onReplyStart?: () => void | Promise<void> } }) {
  await result.dispatcherOptions.onReplyStart?.();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  streamCalls.length = 0;
  updateCalls.length = 0;
  accountState.config = {
    cardContentVar: "content",
    cardToolVar: "toolOut",
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reply-dispatcher public progress wiring", () => {
  it("does not attach hooks with no progress variables", () => {
    delete accountState.config.cardToolVar;
    const { replyOptions } = makeDispatcher();
    expect(replyOptions.onToolStart).toBeUndefined();
    expect(replyOptions.onReasoningStream).toBeUndefined();
    expect(typeof replyOptions.onPartialReply).toBe("function");
  });
  it.each(["cardProcessVar", "cardToolVar"])("uses %s only for public categories, never raw output", async variable => {
    accountState.config = { cardContentVar: "content", [variable]: "public" };
    const created = makeDispatcher();
    await startReply(created);
    const hooks = created.replyOptions as any;
    expect(typeof hooks.onItemEvent).toBe("function");
    expect(typeof hooks.onApprovalEvent).toBe("function");
    expect(hooks.onReasoningStream).toBeUndefined();
    hooks.onToolStart({ toolCallId: "a", name: "exec", args: { token: "PRIVATE" } });
    hooks.onCommandOutput({ toolCallId: "a", title: "curl --token PRIVATE", output: "PRIVATE", phase: "end", exitCode: 0 });
    await hooks.onPartialReply({ text: "public answer" });
    await created.dispatcherOptions.deliver({ text: "public answer" }, { kind: "final" });
    await created.dispatcherOptions.onIdle();
    expect(updateCalls.at(-1)?.params?.public).toContain("已完成");
    expect(JSON.stringify(updateCalls)).not.toMatch(/PRIVATE|curl/);
    expect(streamCalls.some(c => c.content === "public answer")).toBe(true);
    expect(streamCalls.every(c => c.varName !== "public")).toBe(true);
  });
  it("the old reasoning template field contains public counts without subscribing to internal reasoning", async () => {
    accountState.config = { cardContentVar: "content", cardReasoningVar: "summary" };
    const created = makeDispatcher(); await startReply(created);
    const hooks = created.replyOptions as any;
    expect(hooks.onReasoningStream).toBeUndefined();
    hooks.onItemEvent({ itemId: "read", name: "read", status: "completed", summary: "PRIVATE" });
    expect(updateCalls.at(-1)?.params?.summary).toBe("已完成 1");
    await hooks.onPartialReply({ text: "answer" }); await created.dispatcherOptions.onIdle();
    expect(JSON.stringify(updateCalls)).not.toContain("PRIVATE");
  });
  it("does not attach preview hooks when streaming is disabled", () => {
    accountState.config.streaming = false;
    const { replyOptions } = makeDispatcher();
    expect(replyOptions.onToolStart).toBeUndefined(); expect(replyOptions.onPartialReply).toBeUndefined();
  });
  it("settles cancellation explicitly and never accepts progress after final", async () => {
    accountState.config.cardProcessVar = "process";
    const created = makeDispatcher(); await startReply(created);
    const hooks = created.replyOptions as any;
    hooks.onToolStart({ toolCallId: "a", name: "read" });
    await hooks.onPartialReply({ text: "partial answer" });
    await created.dispatcherOptions.onError(Object.assign(new Error("PRIVATE"), { name: "AbortError" }), { kind: "final" });
    expect(updateCalls.at(-1)?.params?.process).toContain("已取消");
    const count = updateCalls.length;
    hooks.onItemEvent({ toolCallId: "a", status: "completed" });
    expect(updateCalls).toHaveLength(count);
  });
});
