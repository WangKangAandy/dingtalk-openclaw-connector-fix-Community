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

vi.mock("../../src/utils/quote-message.ts", () => ({
  rememberQuoteBody: vi.fn(),
}));

import {
  finishAICard,
  streamAICard,
  type AICardInstance,
} from "../../src/services/messaging/card.ts";

afterEach(() => {
  putMock.mockReset();
  putMock.mockImplementation(async () => ({ status: 200, data: {} }));
});

function card(): AICardInstance {
  return {
    cardInstanceId: "card_var_1",
    accessToken: "tok",
    // Far enough ahead to skip ensureValidToken refresh (5min skew).
    tokenExpireTime: Date.now() + 60 * 60_000,
    inputingStarted: false,
  };
}

function cfg(extra: Record<string, string> = {}) {
  return {
    clientId: "ding_test",
    clientSecret: "sec_test",
    ...extra,
  } as any;
}

function lastStreamingKey(): string | undefined {
  // streamAICard may PUT instances (INPUTING) then PUT streaming
  for (let i = putMock.mock.calls.length - 1; i >= 0; i--) {
    const url = String(putMock.mock.calls[i]?.[0] ?? "");
    const body = putMock.mock.calls[i]?.[1] as { key?: string; cardData?: { cardParamMap?: Record<string, string> } };
    if (url.includes("/card/streaming") && body?.key) return body.key;
    const map = body?.cardData?.cardParamMap;
    if (map) {
      const keys = Object.keys(map).filter((k) => !["flowStatus", "staticMsgContent", "sys_full_json_obj", "config", "like"].includes(k));
      if (keys.length) return keys[0];
    }
  }
  return undefined;
}

describe("streamAICard content var selection", () => {
  it("does not fall back to cardProcessVar when streaming body text", async () => {
    await streamAICard(
      card(),
      "hello",
      false,
      cfg({
        cardContentVar: "content",
        cardProcessVar: "process",
        cardReasoningVar: "reasoning",
      }),
      undefined,
    );
    expect(lastStreamingKey()).toBe("content");
  });

  it("honors explicit contentVar override (e.g. tool var)", async () => {
    const c = card();
    c.inputingStarted = true;
    await streamAICard(
      c,
      "tool out",
      false,
      cfg({ cardContentVar: "content", cardProcessVar: "process" }),
      undefined,
      "toolOut",
    );
    expect(lastStreamingKey()).toBe("toolOut");
  });

  it("finishAICard finalizes content + like, not process", async () => {
    await finishAICard(
      card(),
      "# 终稿正文",
      cfg({
        cardContentVar: "content",
        cardProcessVar: "process",
        cardFeedbackStatusKey: "like",
      }),
      undefined,
    );

    const streamingKeys = putMock.mock.calls
      .filter((c) => String(c[0]).includes("/card/streaming"))
      .map((c) => (c[1] as { key?: string }).key);
    expect(streamingKeys.every((k) => k === "content")).toBe(true);

    const finishBody = putMock.mock.calls
      .map((c) => c[1] as { cardData?: { cardParamMap?: Record<string, string> } })
      .find((b) => b?.cardData?.cardParamMap?.flowStatus === "3");
    expect(finishBody?.cardData?.cardParamMap).toMatchObject({
      flowStatus: "3",
      content: "# 终稿正文",
      like: "0",
    });
    expect(finishBody?.cardData?.cardParamMap?.process).toBeUndefined();
  });
});
