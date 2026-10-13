import { afterEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn(async () => ({ status: 200, data: {} }));

vi.mock("../../src/utils/http-client.ts", () => ({
  dingtalkHttp: {
    put: (...args: unknown[]) => putMock(...args),
    post: vi.fn(),
  },
  dingtalkOapiHttp: { put: vi.fn(), post: vi.fn() },
  dingtalkUploadHttp: { put: vi.fn(), post: vi.fn() },
}));

import {
  enqueueCardWrite,
  updateAICardParams,
  type AICardInstance,
} from "../../src/services/messaging/card.ts";

afterEach(() => {
  putMock.mockReset();
  putMock.mockImplementation(async () => ({ status: 200, data: {} }));
});

function card(id = "card_chain_1"): AICardInstance {
  return {
    cardInstanceId: id,
    accessToken: "tok",
    tokenExpireTime: Date.now() + 60 * 60_000,
    inputingStarted: false,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("enqueueCardWrite", () => {
  it("serializes tasks for the same card id", async () => {
    const order: string[] = [];
    const gate = deferred();

    const first = enqueueCardWrite("same-card", async () => {
      order.push("first-enter");
      await gate.promise;
      order.push("first-done");
    });
    await vi.waitFor(() => expect(order).toContain("first-enter"));

    const second = enqueueCardWrite("same-card", async () => {
      order.push("second-done");
    });
    await Promise.resolve();
    expect(order).toEqual(["first-enter"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-enter", "first-done", "second-done"]);
  });

  it("does not serialize across different card ids", async () => {
    const started: string[] = [];
    const gateA = deferred();
    const gateB = deferred();

    const a = enqueueCardWrite("card-a", async () => {
      started.push("a");
      await gateA.promise;
    });
    const b = enqueueCardWrite("card-b", async () => {
      started.push("b");
      await gateB.promise;
    });

    await vi.waitFor(() => expect(started.sort()).toEqual(["a", "b"]));
    gateA.resolve();
    gateB.resolve();
    await Promise.all([a, b]);
  });

  it("keeps the chain alive after a rejected task", async () => {
    await enqueueCardWrite("recover-card", async () => {
      throw new Error("boom");
    }).catch(() => undefined);
    const value = await enqueueCardWrite("recover-card", async () => 42);
    expect(value).toBe(42);
  });

  it("settled chain does not block a later enqueue on the same id", async () => {
    await enqueueCardWrite("reuse-card", async () => "done");
    const value = await enqueueCardWrite("reuse-card", async () => 7);
    expect(value).toBe(7);
  });

  it("trims card id whitespace for chain keying", async () => {
    const order: string[] = [];
    const gate = deferred();

    const first = enqueueCardWrite("  spaced  ", async () => {
      order.push("first-enter");
      await gate.promise;
      order.push("first-done");
    });
    await vi.waitFor(() => expect(order).toContain("first-enter"));

    const second = enqueueCardWrite("spaced", async () => {
      order.push("second-done");
    });
    await Promise.resolve();
    expect(order).toEqual(["first-enter"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-enter", "first-done", "second-done"]);
  });
});

describe("updateAICardParams write-chain integration", () => {
  it("queues PUT instances behind prior chain tasks (A2 ordering)", async () => {
    const id = "params-order";
    const events: string[] = [];
    const gate = deferred();

    void enqueueCardWrite(id, async () => {
      events.push("prior-enter");
      await gate.promise;
      events.push("prior-done");
    });
    await vi.waitFor(() => expect(events).toContain("prior-enter"));

    putMock.mockImplementation(async () => {
      events.push("put");
      return { status: 200, data: {} };
    });

    const updatePromise = updateAICardParams(
      card(id),
      { flowStatus: "4", params: { process: "🔧 tool…" } },
      undefined,
    );

    await Promise.resolve();
    expect(events).toEqual(["prior-enter"]);
    expect(putMock).not.toHaveBeenCalled();

    gate.resolve();
    await updatePromise;
    expect(events).toEqual(["prior-enter", "prior-done", "put"]);

    const body = putMock.mock.calls[0]?.[1] as {
      outTrackId: string;
      cardData: { cardParamMap: Record<string, string> };
    };
    expect(body.outTrackId).toBe(id);
    expect(body.cardData.cardParamMap).toMatchObject({
      flowStatus: "4",
      process: "🔧 tool…",
    });
  });

  it("updateAICardParams waits until PUT finishes", async () => {
    const id = "params-wait";
    const putGate = deferred<{ status: number; data: Record<string, never> }>();
    putMock.mockImplementation(() => putGate.promise);

    const updatePromise = updateAICardParams(
      card(id),
      { params: { process: "line" } },
      undefined,
    );
    await vi.waitFor(() => expect(putMock).toHaveBeenCalled());

    let done = false;
    const wait = updatePromise.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    putGate.resolve({ status: 200, data: {} });
    await wait;
    expect(done).toBe(true);
  });

  it("skips empty updates without enqueueing HTTP", async () => {
    await updateAICardParams(card("empty-update"), {}, undefined);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("serializes streamAICard behind prior process updates", async () => {
    const { streamAICard } = await import("../../src/services/messaging/card.ts");
    const id = "stream-after-process";
    const events: string[] = [];
    const gate = deferred();

    void enqueueCardWrite(id, async () => {
      events.push("process-enter");
      await gate.promise;
      events.push("process-done");
    });
    await vi.waitFor(() => expect(events).toContain("process-enter"));

    putMock.mockImplementation(async (url: unknown) => {
      events.push(String(url).includes("/streaming") ? "stream" : "put");
      return { status: 200, data: {} };
    });

    const streamPromise = streamAICard(
      card(id),
      "hello",
      false,
      { clientId: "ding_test", clientSecret: "sec", cardContentVar: "content" } as any,
      undefined,
    );
    await Promise.resolve();
    expect(events).toEqual(["process-enter"]);

    gate.resolve();
    await streamPromise;
    expect(events[0]).toBe("process-enter");
    expect(events[1]).toBe("process-done");
    expect(events.slice(2).some((e) => e === "put" || e === "stream")).toBe(true);
  });
});
