import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPut = vi.hoisted(() => vi.fn());

vi.mock("../src/utils/http-client.ts", () => ({
  dingtalkHttp: { put: mockPut, post: vi.fn(), get: vi.fn() },
  dingtalkOapiHttp: { get: vi.fn(), post: vi.fn() },
  dingtalkUploadHttp: { post: vi.fn() },
}));

import { isAmbiguousCardError, streamAICard } from "../src/services/messaging/card.ts";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe("card stream policy", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockPut.mockResolvedValue({ status: 200, data: {} });
  });

  it("reports a partial INPUTING failure as not written", async () => {
    mockPut.mockRejectedValue(new Error("Status update failed"));
    const card = { cardInstanceId: "card_1", accessToken: "token123", inputingStarted: false };

    await expect(streamAICard(card as any, "Hello", false, undefined, log)).resolves.toEqual({
      written: false,
    });
    expect(card.inputingStarted).toBe(false);
    expect(mockPut.mock.calls.every((c) => !String(c[0]).includes("/v1.0/card/streaming"))).toBe(true);
  });

  it("reports a partial streaming failure as not written", async () => {
    mockPut.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1.0/card/streaming")) {
        throw new Error("stream put failed");
      }
      return { status: 200, data: {} };
    });
    const card = { cardInstanceId: "card_1", accessToken: "token123", inputingStarted: true };

    await expect(streamAICard(card as any, "Hello", false, undefined, log)).resolves.toEqual({
      written: false,
    });
  });

  it("retries finalize streaming failures and then reports written", async () => {
    let streamingAttempts = 0;
    mockPut.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1.0/card/streaming")) {
        streamingAttempts += 1;
        if (streamingAttempts < 3) {
          const err: any = new Error("temporary");
          err.code = "ECONNRESET";
          throw err;
        }
      }
      return { status: 200, data: {} };
    });
    const card = { cardInstanceId: "card_1", accessToken: "token123", inputingStarted: true };

    await expect(streamAICard(card as any, "Final", true, undefined, log)).resolves.toEqual({
      written: true,
    });
    expect(streamingAttempts).toBe(3);
  });

  it("does not retry a definite 4xx finalize failure", async () => {
    let streamingAttempts = 0;
    mockPut.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1.0/card/streaming")) {
        streamingAttempts += 1;
        const err: any = new Error("bad request");
        err.response = { status: 400, data: { code: "InvalidParameter" } };
        throw err;
      }
      return { status: 200, data: {} };
    });
    const card = { cardInstanceId: "card_1", accessToken: "token123", inputingStarted: true };

    await expect(streamAICard(card as any, "Final", true, undefined, log)).rejects.toThrow("bad request");
    expect(streamingAttempts).toBe(1);
  });

  it("retries finalize INPUTING before streaming", async () => {
    let inputingAttempts = 0;
    mockPut.mockImplementation(async (url: string) => {
      if (String(url).includes("/v1.0/card/instances")) {
        inputingAttempts += 1;
        if (inputingAttempts < 3) {
          const err: any = new Error("temporary");
          err.code = "ECONNRESET";
          throw err;
        }
      }
      return { status: 200, data: {} };
    });
    const card = { cardInstanceId: "card_1", accessToken: "token123", inputingStarted: false };

    await expect(streamAICard(card as any, "Final", true, undefined, log)).resolves.toEqual({
      written: true,
    });
    expect(inputingAttempts).toBe(3);
    expect(card.inputingStarted).toBe(true);
    expect(mockPut.mock.calls.some((c) => String(c[0]).includes("/v1.0/card/streaming"))).toBe(true);
  });

  it("keeps an empty error message out of the ambiguous set", () => {
    const reset: any = new Error("socket hang up");
    reset.code = "ECONNRESET";
    expect(isAmbiguousCardError(reset)).toBe(true);

    const http: any = new Error("bad request");
    http.response = { status: 400, data: {} };
    expect(isAmbiguousCardError(http)).toBe(false);

    expect(isAmbiguousCardError(new Error(""))).toBe(false);
  });
});
