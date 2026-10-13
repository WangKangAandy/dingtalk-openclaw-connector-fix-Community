import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamCalls: Array<{ content: string; varName?: string }> = [];
const updateCalls: Array<{ flowStatus?: string; params?: Record<string, string> }> = [];

const accountState: { config: Record<string, unknown> } = { config: {} };

vi.mock("openclaw/plugin-sdk/channel-runtime", () => ({
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
  attachCardInstanceId: vi.fn(),
  registerCardSession: vi.fn(),
}));

vi.mock("../../src/services/messaging.ts", () => ({
  sendMessage: vi.fn(),
  sendTextMessage: vi.fn(),
  sendMarkdownMessage: vi.fn(),
}));

vi.mock("../../src/utils/token.ts", () => ({
  getOapiAccessToken: vi.fn(async () => "tok"),
}));

vi.mock("../../src/services/media/index.ts", () => ({
  processLocalImages: vi.fn(async (t: string) => t),
  processVideoMarkers: vi.fn(async (t: string) => t),
  processAudioMarkers: vi.fn(async (t: string) => t),
  uploadAndReplaceFileMarkers: vi.fn(async (t: string) => t),
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

async function startReply(replyOptions: { onReplyStart?: () => void }) {
  replyOptions.onReplyStart?.();
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

describe("reply-dispatcher exec-preview wiring", () => {
  it("does not attach preview hooks when process/reasoning vars are unset", () => {
    const { replyOptions } = makeDispatcher();
    expect(replyOptions.suppressDefaultToolProgressMessages).toBeUndefined();
    expect(replyOptions.onToolStart).toBeUndefined();
    expect(replyOptions.onPlanUpdate).toBeUndefined();
    expect(replyOptions.onReasoningStream).toBeUndefined();
    expect(typeof replyOptions.onPartialReply).toBe("function");
  });

  it("attaches process hooks and skips cardToolVar dump when processVar is set", async () => {
    accountState.config.cardProcessVar = "process";
    const { replyOptions } = makeDispatcher();
    expect(replyOptions.suppressDefaultToolProgressMessages).toBe(true);
    expect(typeof replyOptions.onToolStart).toBe("function");
    expect(typeof replyOptions.onPlanUpdate).toBe("function");

    await startReply(replyOptions);
    (replyOptions.onCommandOutput as (p: { title?: string; output?: string }) => void)({
      title: "ls",
      output: "RAW TOOL DUMP",
    });
    await Promise.resolve();
    expect(streamCalls).toEqual([]);
    expect(updateCalls.some((c) => c.params?.process?.includes("ls"))).toBe(true);

    const { replyOptions: fenceOptions } = makeDispatcher();
    await startReply(fenceOptions);
    updateCalls.length = 0;
    (fenceOptions.onCommandOutput as (p: { title?: string; phase?: string; output?: string }) => void)({
      title: "commandprinttext -> runsedtransformation($HOME/.openclaw/media/inbound/x)",
      phase: "start",
      output: "RAW TOOL DUMP",
    });
    await Promise.resolve();
    expect(streamCalls).toEqual([]);
    expect(updateCalls[0]?.params?.process?.includes("```")).toBe(true);
  });

  it("reasoning-only does not suppress tool progress or steal command output", async () => {
    accountState.config.cardReasoningVar = "reasoning";
    const { replyOptions } = makeDispatcher();
    expect(replyOptions.suppressDefaultToolProgressMessages).toBeUndefined();
    expect(replyOptions.onToolStart).toBeUndefined();
    expect(typeof replyOptions.onReasoningStream).toBe("function");

    await startReply(replyOptions);
    (replyOptions.onCommandOutput as (p: { title?: string; output?: string }) => void)({
      title: "ls",
      output: "RAW TOOL DUMP",
    });
    await Promise.resolve();
    expect(streamCalls).toEqual([{ content: "RAW TOOL DUMP", varName: "toolOut" }]);
  });

  it("does not attach preview hooks when streaming is disabled", () => {
    accountState.config.cardProcessVar = "process";
    accountState.config.streaming = false;
    const { replyOptions } = makeDispatcher();
    expect(replyOptions.suppressDefaultToolProgressMessages).toBeUndefined();
    expect(replyOptions.onToolStart).toBeUndefined();
    expect(replyOptions.onPartialReply).toBeUndefined();
  });

  it("flushes buffered process before the first content stream", async () => {
    accountState.config.cardProcessVar = "process";
    const { replyOptions } = makeDispatcher();
    const order: string[] = [];
    const { streamAICard, updateAICardParams } = await import("../../src/services/messaging/card.ts");
    vi.mocked(updateAICardParams).mockImplementation(async () => {
      order.push("process");
    });
    vi.mocked(streamAICard).mockImplementation(async () => {
      order.push("stream");
    });

    await startReply(replyOptions);
    (replyOptions.onToolStart as (p: { name?: string; phase?: string }) => void)({
      name: "lookup",
      phase: "start",
    });
    await Promise.resolve();
    expect(order).toEqual(["process"]);

    await (replyOptions.onPartialReply as (p: { text?: string }) => Promise<void>)({
      text: "hello body",
    });
    expect(order[0]).toBe("process");
    expect(order[order.length - 1]).toBe("stream");
    expect(order).toContain("stream");
  });
});
