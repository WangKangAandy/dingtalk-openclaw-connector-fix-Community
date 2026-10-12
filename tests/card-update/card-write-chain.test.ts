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
  drainCardWrites,
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
    tokenExpireTime: Date.now() + 60_000,
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

describe("enqueueCardWrite / drainCardWrites", () => {
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

  it("drain waits for the in-flight tail", async () => {
    const gate = deferred();
    let entered = false;
    void enqueueCardWrite("drain-card", async () => {
      entered = true;
      await gate.promise;
    });
    await vi.waitFor(() => expect(entered).toBe(true));

    let drained = false;
    const wait = drainCardWrites("drain-card").then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    gate.resolve();
    await wait;
    expect(drained).toBe(true);
  });

  it("drain resolves immediately when nothing is queued", async () => {
    await expect(drainCardWrites("empty-card")).resolves.toBeUndefined();
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

  it("drain after updateAICardParams waits until PUT finishes", async () => {
    const id = "params-drain";
    const putGate = deferred<{ status: number; data: Record<string, never> }>();
    putMock.mockImplementation(() => putGate.promise);

    const updatePromise = updateAICardParams(
      card(id),
      { params: { process: "line" } },
      undefined,
    );
    await vi.waitFor(() => expect(putMock).toHaveBeenCalled());

    let drained = false;
    const drainPromise = drainCardWrites(id).then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    putGate.resolve({ status: 200, data: {} });
    await updatePromise;
    await drainPromise;
    expect(drained).toBe(true);
  });

  it("skips empty updates without enqueueing HTTP", async () => {
    await updateAICardParams(card("empty-update"), {}, undefined);
    expect(putMock).not.toHaveBeenCalled();
  });
});
