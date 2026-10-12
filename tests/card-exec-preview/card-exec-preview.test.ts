import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  buildCardExecPreviewHooks,
  composeNotifyCallback,
} from "../../src/card-exec-preview/attach.ts";
import {
  appendProcessLine,
  clipLine,
  formatItemEventLine,
  formatPlanUpdateLine,
  formatReasoningText,
  formatToolStartLine,
} from "../../src/card-exec-preview/format.ts";
import {
  canWriteFlowExecuting,
  canWriteProcessText,
  createCardExecPreviewSession,
  markContentStarted,
  markTerminal,
} from "../../src/card-exec-preview/session.ts";
import { resolveCardExecPreviewConfig } from "../../src/card-exec-preview/types.ts";
import { createCardExecPreviewController } from "../../src/card-exec-preview/update.ts";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";

afterEach(() => {
  updateCalls.length = 0;
  drainMock.mockClear();
  vi.useRealTimers();
});

function makeCard(overrides: Partial<{ cardInstanceId: string; inputingStarted: boolean }> = {}) {
  return {
    cardInstanceId: overrides.cardInstanceId ?? "card_1",
    accessToken: "t",
    tokenExpireTime: Date.now() + 60_000,
    inputingStarted: overrides.inputingStarted ?? false,
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
  it("is disabled when process/reasoning vars are absent", () => {
    expect(resolveCardExecPreviewConfig({}).enabled).toBe(false);
    expect(resolveCardExecPreviewConfig({ cardContentVar: "content" }).enabled).toBe(false);
    expect(
      buildCardExecPreviewHooks({
        config: resolveCardExecPreviewConfig({}),
        controller: null as never,
      }),
    ).toEqual({});
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
    expect(
      resolveCardExecPreviewConfig({
        cardContentVar: "  content  ",
        cardProcessVar: "  process  ",
      }),
    ).toMatchObject({ contentVar: "content", processVar: "process", enabled: true });
  });

  it("treats blank strings as unset", () => {
    expect(resolveCardExecPreviewConfig({ cardProcessVar: "   ", cardReasoningVar: "" }).enabled).toBe(
      false,
    );
  });
});

describe("session gates", () => {
  it("allows EXECUTING only in idle/executing", () => {
    const s = createCardExecPreviewSession();
    expect(canWriteFlowExecuting(s)).toBe(true);
    expect(canWriteProcessText(s)).toBe(true);

    markContentStarted(s);
    expect(s.phase).toBe("contentStarted");
    expect(canWriteFlowExecuting(s)).toBe(false);
    expect(canWriteProcessText(s)).toBe(true);

    markTerminal(s);
    expect(canWriteFlowExecuting(s)).toBe(false);
    expect(canWriteProcessText(s)).toBe(false);
  });

  it("does not reopen terminal when markContentStarted is called late", () => {
    const s = createCardExecPreviewSession();
    markTerminal(s);
    markContentStarted(s);
    expect(s.phase).toBe("terminal");
  });
});

describe("format helpers", () => {
  it("formats tool start without dumping args", () => {
    expect(formatToolStartLine({ name: "web_search", phase: "start" })).toBe("🔧 web_search…");
    expect(formatToolStartLine({ name: "web_search", phase: "end" })).toBe("🔧 web_search · end");
    expect(formatToolStartLine({ name: "" })).toBeNull();
  });

  it("formats item and plan lines", () => {
    expect(formatItemEventLine({ title: "fetch", progressText: "30%" })).toBe("• fetch: 30%");
    expect(formatItemEventLine({ name: "only" })).toBe("• only");
    expect(formatItemEventLine({})).toBeNull();

    expect(formatPlanUpdateLine({ title: "Plan", explanation: "do X" })).toBe("📋 Plan — do X");
    expect(formatPlanUpdateLine({ steps: ["a", "b", "c"] })).toBe("📋 a · b · c");
    expect(formatPlanUpdateLine({})).toBeNull();
  });

  it("clips and rolls process lines", () => {
    expect(clipLine("  hello   world  ")).toBe("hello world");
    expect(clipLine("x".repeat(300)).endsWith("…")).toBe(true);
    expect(formatReasoningText("  think\n hard  ")).toBe("think hard");

    let text = "";
    text = appendProcessLine(text, "a");
    text = appendProcessLine(text, "b");
    text = appendProcessLine(text, "b"); // duplicate trailing ignored
    expect(text).toBe("a\nb");

    for (let i = 0; i < 20; i++) {
      text = appendProcessLine(text, `line-${i}`);
    }
    const lines = text.split("\n");
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe("line-8");
    expect(lines.at(-1)).toBe("line-19");
  });
});

describe("composeNotifyCallback", () => {
  it("runs existing first and isolates preview errors", () => {
    const existing = vi.fn(() => "ok");
    const preview = vi.fn(() => {
      throw new Error("preview boom");
    });
    const composed = composeNotifyCallback(existing, preview)!;
    expect(composed("x")).toBe("ok");
    expect(existing).toHaveBeenCalledWith("x");
    expect(preview).toHaveBeenCalledWith("x");
  });

  it("returns undefined when only preview throws", () => {
    const composed = composeNotifyCallback(undefined, () => {
      throw new Error("boom");
    })!;
    expect(composed()).toBeUndefined();
  });

  it("passes through existing when preview is absent", () => {
    const existing = vi.fn(() => 1);
    expect(composeNotifyCallback(existing, undefined)).toBe(existing);
    expect(composeNotifyCallback(undefined, undefined)).toBeUndefined();
  });
});

describe("buildCardExecPreviewHooks", () => {
  it("wires process hooks only when processVar is set", () => {
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
    expect(typeof hooks.onToolStart).toBe("function");
    expect(typeof hooks.onItemEvent).toBe("function");
    expect(typeof hooks.onPlanUpdate).toBe("function");
    expect(hooks.onReasoningStream).toBeUndefined();
  });

  it("wires reasoning without process hooks when only reasoningVar is set", () => {
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
    expect(typeof hooks.onReasoningStream).toBe("function");
  });
});

describe("card-exec-preview controller", () => {
  it("writes EXECUTING + process on tool start, then blocks flowStatus=4 after contentStarted", async () => {
    const card = makeCard();
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
    await flushMicrotasks();
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0]?.flowStatus).toBe("4");
    expect(updateCalls[0]?.params?.process).toContain("lookup");

    await controller.prepareContentStream(card);
    expect(controller.session.phase).toBe("contentStarted");
    expect(drainMock).toHaveBeenCalledWith("card_1");

    updateCalls.length = 0;
    controller.session.lastProcessPushAt = 0;
    controller.onToolStart({ name: "other", phase: "start" });
    await flushMicrotasks();
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of updateCalls) {
      expect(call.flowStatus).toBeUndefined();
      expect(call.params?.process).toBeTruthy();
    }
  });

  it("marks contentStarted synchronously before awaiting drain (A1)", async () => {
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
    expect(canWriteFlowExecuting(controller.session)).toBe(false);

    resolveDrain();
    await pending;
  });

  it("skips drain when card id is missing", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => null,
      dingtalkConfig: {} as any,
    });
    await controller.prepareContentStream(null);
    expect(controller.session.phase).toBe("contentStarted");
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("rejects process and reasoning writes after terminal", async () => {
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
    controller.onReasoningStream({ text: "should not write" });
    await flushMicrotasks();
    expect(updateCalls).toEqual([]);
  });

  it("writes item/plan lines into process", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.onItemEvent({ title: "step", status: "running" });
    await flushMicrotasks();
    expect(updateCalls[0]?.params?.process).toContain("step");

    updateCalls.length = 0;
    controller.session.lastProcessPushAt = 0;
    controller.onPlanUpdate({ title: "Next", explanation: "call tool" });
    await flushMicrotasks();
    expect(updateCalls.some((c) => c.params?.process?.includes("Next"))).toBe(true);
  });

  it("writes reasoning when configured and can open EXECUTING alone", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardReasoningVar: "reasoning" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.onReasoningStream({ text: "thinking about the ask" });
    await flushMicrotasks();
    const hit = updateCalls.find((c) => c.params?.reasoning?.includes("thinking"));
    expect(hit).toBeTruthy();
    expect(hit?.flowStatus).toBe("4");
  });

  it("does not push when getCard returns null", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => null,
      dingtalkConfig: {} as any,
    });
    controller.onToolStart({ name: "lookup" });
    await flushMicrotasks();
    expect(updateCalls).toEqual([]);
    expect(controller.session.processText).toContain("lookup");
  });

  it("throttles process pushes but keeps accumulating text", async () => {
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
    expect(updateCalls.at(-1)?.params?.process).toContain("third");
  });

  it("only sends EXECUTING once even across process then reasoning", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({
        cardProcessVar: "process",
        cardReasoningVar: "reasoning",
      }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.onToolStart({ name: "t1" });
    await flushMicrotasks();
    expect(updateCalls.filter((c) => c.flowStatus === "4")).toHaveLength(1);

    updateCalls.length = 0;
    controller.session.lastReasoningPushAt = 0;
    controller.onReasoningStream({ text: "more thoughts" });
    await flushMicrotasks();
    expect(updateCalls.some((c) => c.params?.reasoning)).toBe(true);
    expect(updateCalls.every((c) => c.flowStatus === undefined)).toBe(true);
  });

  it("isolates handler exceptions without throwing to caller", () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    // Non-object payloads must not escape
    expect(() => controller.onToolStart(null as never)).not.toThrow();
    expect(() => controller.onItemEvent(undefined as never)).not.toThrow();
    expect(() => controller.onPlanUpdate(null as never)).not.toThrow();
    expect(() => controller.onReasoningStream(null as never)).not.toThrow();
  });

  it("pushProcessLine used by onCommandOutput path never dumps raw output", async () => {
    const controller = createCardExecPreviewController({
      config: resolveCardExecPreviewConfig({ cardProcessVar: "process" }),
      getCard: () => makeCard(),
      dingtalkConfig: {} as any,
    });
    controller.pushProcessLine("⚙ dws aitable list…");
    await flushMicrotasks();
    expect(updateCalls[0]?.params?.process).toBe("⚙ dws aitable list…");
    expect(updateCalls[0]?.params?.process).not.toMatch(/\{|stdout|stderr/i);
  });
});

describe("schema", () => {
  it("accepts cardProcessVar / cardReasoningVar / memoryScope", () => {
    const out = DingtalkConfigSchema.parse({
      cardProcessVar: "process",
      cardReasoningVar: "reasoning",
      memoryScope: { enabled: true },
    });
    expect(out.cardProcessVar).toBe("process");
    expect(out.cardReasoningVar).toBe("reasoning");
    expect(out.memoryScope).toEqual({ enabled: true });
  });
});
