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
import {
  appendProcessLine,
  clipLine,
  formatItemEventLine,
  formatPlanUpdateLine,
  formatReasoningText,
  formatToolStartLine,
} from "../../src/card-exec-preview/format.ts";
import { resolveCardExecPreviewConfig } from "../../src/card-exec-preview/types.ts";
import {
  canWriteFlowExecuting,
  canWriteProcessText,
  createCardExecPreviewController,
  createCardExecPreviewSession,
  markContentStarted,
  markTerminal,
} from "../../src/card-exec-preview/update.ts";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";

afterEach(() => {
  updateCalls.length = 0;
  drainMock.mockClear();
  vi.useRealTimers();
});

function makeCard(overrides: Partial<{ cardInstanceId: string }> = {}) {
  return {
    cardInstanceId: overrides.cardInstanceId ?? "card_1",
    accessToken: "t",
    tokenExpireTime: Date.now() + 60_000,
    inputingStarted: false,
  };
}

function flushMicrotasks(times = 3) {
  let chain: Promise<void> = Promise.resolve();
  for (let i = 0; i < times; i++) {
    chain = chain.then(() => undefined);
  }
  return chain;
}

describe("resolveCardExecPreviewConfig", () => {
  it("is disabled without process/reasoning vars", () => {
    expect(resolveCardExecPreviewConfig({}).enabled).toBe(false);
    expect(resolveCardExecPreviewConfig({ cardProcessVar: "   " }).enabled).toBe(false);
    expect(
      buildCardExecPreviewHooks({
        config: resolveCardExecPreviewConfig({}),
        controller: null as never,
      }),
    ).toEqual({});
  });

  it("enables when either process or reasoning is set", () => {
    expect(resolveCardExecPreviewConfig({ cardProcessVar: " process " })).toMatchObject({
      enabled: true,
      processVar: "process",
    });
    expect(resolveCardExecPreviewConfig({ cardReasoningVar: "reasoning" })).toMatchObject({
      enabled: true,
      reasoningVar: "reasoning",
    });
  });
});

describe("session gates", () => {
  it("blocks EXECUTING after contentStarted and all writes after terminal", () => {
    const s = createCardExecPreviewSession();
    expect(canWriteFlowExecuting(s)).toBe(true);
    markContentStarted(s);
    expect(canWriteFlowExecuting(s)).toBe(false);
    expect(canWriteProcessText(s)).toBe(true);
    markTerminal(s);
    expect(canWriteProcessText(s)).toBe(false);
  });

  it("does not reopen terminal on late markContentStarted", () => {
    const s = createCardExecPreviewSession();
    markTerminal(s);
    markContentStarted(s);
    expect(s.phase).toBe("terminal");
  });
});

describe("format helpers", () => {
  it("formats tool/plan/item without dumping raw args", () => {
    expect(formatToolStartLine({ name: "web_search", phase: "start" })).toBe("🔧 web_search…");
    expect(formatPlanUpdateLine({ title: "Plan", explanation: "do X" })).toBe("📋 Plan — do X");
    expect(formatItemEventLine({ title: "fetch", progressText: "30%" })).toBe("• fetch: 30%");
    expect(formatReasoningText("  think\n hard  ")).toBe("think hard");
  });

  it("clips and rolls process lines", () => {
    expect(clipLine("x".repeat(300)).endsWith("…")).toBe(true);
    let text = "";
    text = appendProcessLine(text, "a");
    text = appendProcessLine(text, "b");
    text = appendProcessLine(text, "b");
    expect(text).toBe("a\nb");
    for (let i = 0; i < 20; i++) text = appendProcessLine(text, `line-${i}`);
    const lines = text.split("\n");
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe("line-8");
  });
});

describe("buildCardExecPreviewHooks", () => {
  it("wires tool+plan when processVar set, not item events", () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    const hooks = buildCardExecPreviewHooks({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      controller,
    });
    expect(hooks.suppressDefaultToolProgressMessages).toBe(true);
    expect(hooks.onToolStart).toBe(controller.onToolStart);
    expect(hooks.onPlanUpdate).toBe(controller.onPlanUpdate);
    expect(hooks.onItemEvent).toBeUndefined();
    expect(hooks.onReasoningStream).toBeUndefined();
  });

  it("wires reasoning alone when only reasoningVar is set", () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardReasoningVar: "reasoning" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    const hooks = buildCardExecPreviewHooks({
      config: resolveCardExecPreviewConfig({ cardReasoningVar: "reasoning" }),
      controller,
    });
    expect(hooks.onToolStart).toBeUndefined();
    expect(hooks.onReasoningStream).toBe(controller.onReasoningStream);
  });
});

describe("card-exec-preview controller", () => {
  it("writes EXECUTING + process, then omits flowStatus=4 after contentStarted", async () => {
    const card = makeCard();
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({
        cardProcessVar: "process",
        cardReasoningVar: "reasoning",
      }),
      getCard: () => card,
      dingtalkConfig: {} as any,
    });

    controller.onToolStart({ name: "lookup", phase: "start" });
    await flushMicrotasks();
    expect(updateCalls[0]?.flowStatus).toBe("4");
    expect(updateCalls[0]?.params?.process).toContain("lookup");

    await controller.prepareContentStream(card);
    expect(controller.session.phase).toBe("contentStarted");
    expect(drainMock).toHaveBeenCalledWith("card_1");

    updateCalls.length = 0;
    controller.session.lastProcessPushAt = 0;
    controller.onToolStart({ name: "other", phase: "start" });
    await flushMicrotasks();
    for (const call of updateCalls) {
      expect(call.flowStatus).toBeUndefined();
      expect(call.params?.process).toBeTruthy();
    }
  });

  it("marks contentStarted synchronously before awaiting drain", async () => {
    let resolveDrain!: () => void;
    drainMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDrain = resolve;
        }),
    );
    const card = makeCard();
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => card,
      dingtalkConfig: {} as any,
    });
    const pending = controller.prepareContentStream(card);
    expect(controller.session.phase).toBe("contentStarted");
    resolveDrain();
    await pending;
  });

  it("rejects writes after terminal", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({
        cardProcessVar: "process",
        cardReasoningVar: "reasoning",
      }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.markClosed();
    updateCalls.length = 0;
    controller.onToolStart({ name: "x" });
    controller.onReasoningStream({ text: "nope" });
    await flushMicrotasks();
    expect(updateCalls).toEqual([]);
  });

  it("writes plan lines and reasoning; EXECUTING only once", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({
        cardProcessVar: "process",
        cardReasoningVar: "reasoning",
      }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.onPlanUpdate({ title: "Next", explanation: "call tool" });
    await flushMicrotasks();
    expect(updateCalls.filter((c) => c.flowStatus === "4")).toHaveLength(1);

    updateCalls.length = 0;
    controller.session.lastReasoningPushAt = 0;
    controller.onReasoningStream({ text: "thinking" });
    await flushMicrotasks();
    expect(updateCalls.some((c) => c.params?.reasoning?.includes("thinking"))).toBe(true);
    expect(updateCalls.every((c) => c.flowStatus === undefined)).toBe(true);
  });

  it("throttles process pushes while accumulating text", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.onToolStart({ name: "first" });
    await flushMicrotasks();
    expect(updateCalls).toHaveLength(1);
    controller.onToolStart({ name: "second" });
    await flushMicrotasks();
    expect(updateCalls).toHaveLength(1);
    expect(controller.session.processText).toContain("second");
    vi.setSystemTime(new Date("2026-01-01T00:00:01.600Z"));
    controller.onToolStart({ name: "third" });
    await flushMicrotasks();
    expect(updateCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("isolates handler exceptions", () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    expect(() => controller.onToolStart(null as never)).not.toThrow();
    expect(() => controller.onPlanUpdate(null as never)).not.toThrow();
    expect(() => controller.onReasoningStream(null as never)).not.toThrow();
  });

  it("pushProcessLine stays short for command-output path", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.pushProcessLine("⚙ dws aitable list…");
    await flushMicrotasks();
    expect(updateCalls[0]?.params?.process).toBe("⚙ dws aitable list…");
  });
});

describe("schema", () => {
  it("accepts process/reasoning/memoryScope", () => {
    const out = DingtalkConfigSchema.parse({
      cardProcessVar: "process",
      cardReasoningVar: "reasoning",
      memoryScope: { enabled: true },
    });
    expect(out.cardProcessVar).toBe("process");
    expect(out.memoryScope).toEqual({ enabled: true });
  });
});
