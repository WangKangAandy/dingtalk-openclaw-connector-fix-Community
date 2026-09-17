import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_TEST_TEMPLATE_ID,
  buildFeedbackCardParamMap,
  parseFeedbackCallback,
  recordFeedback,
} from "../../src/services/messaging/feedback-card.ts";

describe("feedback card", () => {
  it("builds the temporary public approval template payload", () => {
    expect(buildFeedbackCardParamMap(PUBLIC_TEST_TEMPLATE_ID, "answer_1")).toEqual({
      title: "机器人回答评价测试",
      type: "回答评价",
      amount: "0",
      reason: "点击同意表示有帮助，点击拒绝表示不够好",
      status: "待处理",
    });
  });

  it("parses the official cardActionData callback nesting", () => {
    expect(parseFeedbackCallback({
      outTrackId: "feedback_1",
      userId: "u1",
      conversationId: "c1",
      cardActionData: {
        cardPrivateData: {
          params: { action: "accept" },
        },
      },
    })).toMatchObject({
      action: "helpful",
      answerId: "feedback_1",
      feedbackCardId: "feedback_1",
      userId: "u1",
      conversationId: "c1",
    });
  });

  it("maps reject to not_helpful and rejects unknown actions", () => {
    expect(parseFeedbackCallback({
      outTrackId: "feedback_2",
      value: JSON.stringify({ params: { action: "reject" } }),
    })).toMatchObject({ action: "not_helpful", answerId: "feedback_2" });
    expect(parseFeedbackCallback({ params: { action: "later" } })).toBeNull();
  });

  it("persists feedback idempotently", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dingtalk-feedback-"));
    const storagePath = path.join(dir, "feedback.jsonl");
    const config = { feedbackStoragePath: storagePath } as any;
    const event = {
      answerId: "answer_1",
      action: "helpful" as const,
      userId: "u1",
      createdAt: new Date().toISOString(),
    };

    await expect(recordFeedback(event, config)).resolves.toBe(true);
    await expect(recordFeedback(event, config)).resolves.toBe(false);
    expect((await readFile(storagePath, "utf8")).trim().split("\n")).toHaveLength(1);
    await rm(dir, { recursive: true, force: true });
  });
});
