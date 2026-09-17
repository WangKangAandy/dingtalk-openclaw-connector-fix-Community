import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseFeedbackCallback,
  recordFeedback,
  registerAnswerCardContext,
  resetAnswerCardContexts,
  resolveAnswerCardContext,
  unregisterAnswerCardContext,
} from "../../src/services/messaging/feedback-card.ts";

/** 钉钉把卡片回调的上下文序列化到 `value` 字符串里。 */
function officialPayload(cardPrivateData: Record<string, unknown>) {
  return {
    corpId: "corp-1",
    outTrackId: "card_1",
    userId: "u1",
    value: JSON.stringify({ cardPrivateData }),
  };
}

describe("answer card feedback", () => {
  afterEach(() => {
    resetAnswerCardContexts();
  });

  it("parses the explicit feedback params from the answer card", () => {
    expect(parseFeedbackCallback(officialPayload({
      params: { feedback: "good" },
    }))).toMatchObject({
      action: "helpful",
      answerId: "card_1",
      feedbackCardId: "card_1",
      userId: "u1",
    });

    expect(parseFeedbackCallback(officialPayload({
      params: { feedback: "bad" },
    }))).toMatchObject({ action: "not_helpful", answerId: "card_1" });
  });

  it("falls back to actionIds when the template sends no explicit params", () => {
    expect(parseFeedbackCallback(officialPayload({
      actionIds: ["like"],
    }))).toMatchObject({ action: "helpful", answerId: "card_1" });

    expect(parseFeedbackCallback(officialPayload({
      actionIds: ["dislike"],
    }))).toMatchObject({ action: "not_helpful", answerId: "card_1" });
  });

  it("keeps parsing the legacy approval template payload", () => {
    expect(parseFeedbackCallback({
      outTrackId: "card_legacy",
      value: JSON.stringify({ cardPrivateData: { params: { action: "accept" } } }),
    })).toMatchObject({ action: "helpful", answerId: "card_legacy" });

    expect(parseFeedbackCallback({
      outTrackId: "card_legacy",
      cardActionData: { cardPrivateData: { params: { action: "reject" } } },
    })).toMatchObject({ action: "not_helpful", answerId: "card_legacy" });
  });

  it("prefers an explicit answerId param over the card id", () => {
    expect(parseFeedbackCallback(officialPayload({
      params: { feedback: "good", answerId: "answer_9" },
    }))).toMatchObject({ answerId: "answer_9", feedbackCardId: "card_1" });
  });

  it("ignores callbacks that carry no recognisable action", () => {
    expect(parseFeedbackCallback({ outTrackId: "card_1", value: "not-json" })).toBeNull();
    expect(parseFeedbackCallback(officialPayload({ actionIds: ["1"] }))).toBeNull();
    expect(parseFeedbackCallback(officialPayload({ params: { feedback: "" } }))).toBeNull();
    expect(parseFeedbackCallback(null)).toBeNull();
  });

  it("resolves the conversation context registered when the card was created", () => {
    registerAnswerCardContext("card_1", { conversationId: "cid_group" });
    expect(resolveAnswerCardContext("card_1")).toEqual({ conversationId: "cid_group" });

    unregisterAnswerCardContext("card_1");
    expect(resolveAnswerCardContext("card_1")).toBeUndefined();
    expect(resolveAnswerCardContext(undefined)).toBeUndefined();
  });

  it("evicts the oldest card contexts beyond the cap", () => {
    for (let i = 0; i < 2100; i++) {
      registerAnswerCardContext(`card_${i}`, { userId: `u${i}` });
    }
    // 最早的条目被淘汰，最近的仍在
    expect(resolveAnswerCardContext("card_0")).toBeUndefined();
    expect(resolveAnswerCardContext("card_2099")).toEqual({ userId: "u2099" });
  });

  it("persists feedback idempotently", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dingtalk-feedback-"));
    const storagePath = path.join(dir, "feedback.jsonl");
    const config = { feedbackStoragePath: storagePath } as any;
    const event = {
      answerId: "card_1",
      action: "helpful" as const,
      userId: "u1",
      createdAt: new Date().toISOString(),
    };

    await expect(recordFeedback(event, config)).resolves.toBe(true);
    await expect(recordFeedback(event, config)).resolves.toBe(false);
    expect((await readFile(storagePath, "utf8")).trim().split("\n")).toHaveLength(1);
    await rm(dir, { recursive: true, force: true });
  });

  it("records a changed rating as a new event instead of dropping it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dingtalk-feedback-"));
    const storagePath = path.join(dir, "feedback.jsonl");
    const config = { feedbackStoragePath: storagePath } as any;
    const base = { answerId: "card_2", userId: "u1", createdAt: new Date().toISOString() };

    await expect(recordFeedback({ ...base, action: "helpful" }, config)).resolves.toBe(true);
    // 点赞/点踩是可切换控件：改主意是一次语义不同的事件，应当保留。
    await expect(recordFeedback({ ...base, action: "not_helpful" }, config)).resolves.toBe(true);
    // 而 Stream 重投递同一个点击仍被幂等掉。
    await expect(recordFeedback({ ...base, action: "not_helpful" }, config)).resolves.toBe(false);

    expect((await readFile(storagePath, "utf8")).trim().split("\n")).toHaveLength(2);
    await rm(dir, { recursive: true, force: true });
  });
});
