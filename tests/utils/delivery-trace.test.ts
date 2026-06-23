import { describe, expect, it, vi } from "vitest";
import { createDeliveryTracer, previewText } from "../../src/utils/delivery-trace";

describe("utils/delivery-trace", () => {
  it("previewText returns head and tail", () => {
    const text = "ABCDEFGHIJ";
    expect(previewText(text, 3)).toEqual({
      textLen: 10,
      textHead: "ABC",
      textTail: "HIJ",
    });
  });

  it("trace emits monotonic seq and searchable prefix", () => {
    const log = vi.fn();
    const tracer = createDeliveryTracer({
      runtime: { log },
      conversationId: "conv-1",
      senderId: "user-1",
      isDirect: true,
      getState: () => ({
        sessionClosed: false,
        hasCard: true,
        accumulatedTextLen: 12,
        streamingEnabled: true,
        cardInstanceId: "card-abc",
      }),
    });

    tracer.reset();
    tracer.trace("deliver_enter", { kind: "final" });

    expect(log).toHaveBeenCalledTimes(2);
    const first = String(log.mock.calls[0][0]);
    const second = String(log.mock.calls[1][0]);
    expect(first).toContain("[DingTalk][delivery-trace]");
    expect(first).toContain('"traceEvent":"reply_cycle_start"');
    expect(first).toContain('"seq":1');
    expect(second).toContain('"traceEvent":"deliver_enter"');
    expect(second).toContain('"seq":2');
    expect(second).toContain('"kind":"final"');
  });
});
