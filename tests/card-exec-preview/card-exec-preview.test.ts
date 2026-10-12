import { afterEach, describe, expect, it, vi } from "vitest";

const updateCalls: Array<{ flowStatus?: string; params?: Record<string, string> }> = [];
const drainMock = vi.fn(async () => undefined);

vi.mock("../../src/services/messaging/card.ts", () => ({
  AICardStatus: {
    PROCESSING: "1",
    INPUTING: "2",
    FINISHED: "3",
    EXECUTING: "4",
    FAILED: "5",
  },
  updateAICardParams: vi.fn(async (_card: unknown, update: { flowStatus?: string; params?: Record<string, string> }) => {
    updateCalls.push({
      flowStatus: update.flowStatus,
      params: update.params ? { ...update.params } : undefined,
    });
  }),
  drainCardWrites: (...args: unknown[]) => drainMock(...args),
}));

import { buildCardExecPreviewHooks } from "../../src/card-exec-preview/attach.ts";
import { appendProcessLine, formatToolStartLine } from "../../src/card-exec-preview/format.ts";
import { resolveCardExecPreviewConfig } from "../../src/card-exec-preview/types.ts";
import { createCardExecPreviewController } from "../../src/card-exec-preview/update.ts";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";

afterEach(() => {
  updateCalls.length = 0;
  drainMock.mockClear();
});

describe("resolveCardExecPreviewConfig", () => {
  it("is disabled when process/reasoning vars are absent", () => {
    expect(resolveCardExecPreviewConfig({}).enabled).toBe(false);
    expect(resolveCardExecPreviewConfig({ cardContentVar: "content" }).enabled).toBe(false);
    expect(buildCardExecPreviewHooks({
      config: resolveCardExecPreviewConfig({}),
      controller: null as never,
    })).toEqual({});
  });

  it("enables when either process or reasoning is set", () => {
    expect(resolveCardExecPreviewConfig({ cardProcessVar: "process" })).toMatchObject({
      enabled: true,
      processVar: "process",
    });
    expect(resolveCardExecPreviewConfig({ cardReasoningVar: "reasoning" })).toMatchObject({
      enabled: true,
      reasoningVar: "reasoning",
    });
  });
});

describe("format helpers", () => {
  it("formats tool start without dumping args", () => {
    expect(formatToolStartLine({ name: "web_search", phase: "start" })).toBe("🔧 web_search…");
  });

  it("rolls process lines", () => {
    let text = "";
    text = appendProcessLine(text, "a");
    text = appendProcessLine(text, "b");
    expect(text).toBe("a\nb");
  });
});

describe("card-exec-preview controller", () => {
  const card = {
    cardInstanceId: "card_1",
    accessToken: "t",
    tokenExpireTime: Date.now() + 60_000,
    inputingStarted: false,
  };

  it("writes EXECUTING + process on tool start, then blocks flowStatus=4 after contentStarted", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({
        cardContentVar: "content",
        cardProcessVar: "process",
        cardReasoningVar: "reasoning",
      }),
      getCard: () => card,
      dingtalkConfig: {} as any,
    });

    controller.onToolStart({ name: "lookup", phase: "start" });
    await Promise.resolve();
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0]?.flowStatus).toBe("4");
    expect(updateCalls[0]?.params?.process).toContain("lookup");

    await controller.prepareContentStream(card);
    expect(controller.session.phase).toBe("contentStarted");
    expect(drainMock).toHaveBeenCalledWith("card_1");

    updateCalls.length = 0;
    controller.session.lastProcessPushAt = 0;
    controller.onToolStart({ name: "other", phase: "start" });
    await Promise.resolve();
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of updateCalls) {
      expect(call.flowStatus).toBeUndefined();
      expect(call.params?.process).toBeTruthy();
    }
  });

  it("rejects process writes after terminal", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => card,
      dingtalkConfig: {} as any,
    });
    controller.markClosed();
    updateCalls.length = 0;
    controller.onToolStart({ name: "x" });
    await Promise.resolve();
    expect(updateCalls).toEqual([]);
  });

  it("writes reasoning when configured", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardReasoningVar: "reasoning" }),
      getCard: () => card,
      dingtalkConfig: {} as any,
    });
    controller.onReasoningStream({ text: "thinking about the ask" });
    await Promise.resolve();
    expect(updateCalls.some((c) => c.params?.reasoning?.includes("thinking"))).toBe(true);
  });

  it("build hooks only when enabled", () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => card,
      dingtalkConfig: {} as any,
    });
    const hooks = buildCardExecPreviewHooks({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      controller,
    });
    expect(hooks.suppressDefaultToolProgressMessages).toBe(true);
    expect(typeof hooks.onToolStart).toBe("function");
    expect(hooks.onReasoningStream).toBeUndefined();
  });
});

describe("schema", () => {
  it("accepts cardReasoningVar", () => {
    const out = DingtalkConfigSchema.parse({
      cardProcessVar: "process",
      cardReasoningVar: "reasoning",
    });
    expect(out.cardProcessVar).toBe("process");
    expect(out.cardReasoningVar).toBe("reasoning");
  });
});
