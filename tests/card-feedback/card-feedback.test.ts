import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { attachCardFeedback, createCardCallbackListener } from "../../src/card-feedback/attach.ts";
import { parseCardCallbackFrame, resolveCardFeedbackAction } from "../../src/card-feedback/parse.ts";
import { recordFeedbackToSession } from "../../src/card-feedback/record.ts";
import { buildCardFeedbackAck, CARD_CALLBACK_PARSE_FAILURE } from "../../src/card-feedback/response.ts";
import { createCardSessionStore } from "../../src/card-feedback/session-map.ts";
import { resolveCardFeedbackConfig } from "../../src/card-feedback/types.ts";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";
import { QuoteBodyStore, setQuoteBodyStoreForTest } from "../../src/utils/quote-body-store.ts";

const tmpDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-feedback-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function likePayload(overrides: Record<string, unknown> = {}) {
  return {
    headers: { messageId: "mid-1" },
    data: JSON.stringify({
      outTrackId: "card_1",
      userId: "staff-9",
      content: JSON.stringify({
        cardPrivateData: {
          actionIds: ["ai_res_like"],
          params: {},
        },
      }),
      ...overrides,
    }),
  };
}

describe("card-feedback parse", () => {
  const config = resolveCardFeedbackConfig();

  it("reads nested JSON content and action ids", () => {
    const frame = parseCardCallbackFrame(likePayload());
    expect(frame).toMatchObject({
      messageId: "mid-1",
      outTrackId: "card_1",
      userId: "staff-9",
      actionIds: ["ai_res_like"],
    });
    expect(resolveCardFeedbackAction(frame!, config)).toEqual({
      kind: "like",
      outTrackId: "card_1",
      userId: "staff-9",
    });
  });

  it("honors custom action ids and dislike reasons", () => {
    const custom = resolveCardFeedbackConfig({
      cardLikeActionId: "thumbs_up",
      cardDislikeActionId: "thumbs_down",
    });
    const frame = parseCardCallbackFrame({
      headers: { messageId: "mid-2" },
      data: {
        outTrackId: "card_2",
        userId: "u1",
        cardPrivateData: {
          actionIds: ["thumbs_down"],
          params: {
            dislike_reason: ["回答不准确"],
            custom_dislike_reason: "没有给出具体代码",
          },
        },
      },
    });
    expect(resolveCardFeedbackAction(frame!, custom)).toEqual({
      kind: "dislike",
      outTrackId: "card_2",
      userId: "u1",
      dislikeReasons: ["回答不准确"],
      customDislikeReason: "没有给出具体代码",
    });
  });

  it("returns null for unknown buttons", () => {
    const frame = parseCardCallbackFrame({
      data: { outTrackId: "card_3", cardPrivateData: { actionIds: ["copy"] } },
    });
    expect(resolveCardFeedbackAction(frame!, config)).toBeNull();
  });

  it("distinguishes official 操作区 like/dislike via params.feedback", () => {
    const like = parseCardCallbackFrame({
      data: {
        outTrackId: "card_off_1",
        userId: "u2",
        cardPrivateData: {
          actionIds: ["sys_action_like_component"],
          params: { feedback: "good" },
        },
      },
    });
    expect(resolveCardFeedbackAction(like!, config)).toEqual({
      kind: "like",
      outTrackId: "card_off_1",
      userId: "u2",
    });

    const dislike = parseCardCallbackFrame({
      data: {
        outTrackId: "card_off_2",
        userId: "u2",
        cardPrivateData: {
          actionIds: ["sys_action_like_component"],
          params: { feedback: "bad", comment: "没有给出具体代码" },
        },
      },
    });
    expect(resolveCardFeedbackAction(dislike!, config)).toEqual({
      kind: "dislike",
      outTrackId: "card_off_2",
      userId: "u2",
      customDislikeReason: "没有给出具体代码",
    });
  });

  it("treats official tag submit without feedback as dislike", () => {
    const frame = parseCardCallbackFrame({
      data: {
        outTrackId: "card_off_3",
        cardPrivateData: {
          actionIds: ["sys_action_like_component"],
          params: { dislike_reason: ["内容不匹配"] },
        },
      },
    });
    expect(resolveCardFeedbackAction(frame!, config)).toMatchObject({
      kind: "dislike",
      dislikeReasons: ["内容不匹配"],
    });
  });

  it("does not guess when official actionId has no distinguishing params", () => {
    const frame = parseCardCallbackFrame({
      data: {
        outTrackId: "card_off_4",
        cardPrivateData: { actionIds: ["sys_action_like_component"], params: {} },
      },
    });
    expect(resolveCardFeedbackAction(frame!, config)).toBeNull();
  });

  it("reads official actionCallback envelope and numeric like params", () => {
    const like = parseCardCallbackFrame({
      data: {
        type: "actionCallback",
        outTrackId: "card_off_5",
        userId: "u3",
        content: {
          cardPrivateData: {
            actionIds: ["sys_action_like_component"],
            params: { like: 1 },
          },
        },
      },
    });
    expect(resolveCardFeedbackAction(like!, config)).toEqual({
      kind: "like",
      outTrackId: "card_off_5",
      userId: "u3",
    });

    const dislike = parseCardCallbackFrame({
      data: {
        type: "actionCallback",
        outTrackId: "card_off_6",
        content: {
          cardPrivateData: {
            actionIds: ["sys_action_like_component"],
            params: { like: -1 },
          },
        },
      },
    });
    expect(resolveCardFeedbackAction(dislike!, config)).toMatchObject({
      kind: "dislike",
      outTrackId: "card_off_6",
    });
  });
});

describe("card-feedback response and attach", () => {
  it("acks parse failures with success=false", () => {
    expect(CARD_CALLBACK_PARSE_FAILURE).toEqual({ success: false });
  });

  it("updates the configured status key", () => {
    const ack = buildCardFeedbackAck(
      { kind: "dislike", outTrackId: "card_1" },
      resolveCardFeedbackConfig({ cardFeedbackStatusKey: "feedbackStatus" }),
    );
    expect(ack.cardUpdateOptions.updateCardDataByKey).toBe(true);
    expect(ack.cardData.cardParamMap.feedbackStatus).toBe("-1");
    expect(ack.cardData.cardParamMap.submitted).toBe("true");
    expect(ack.userPrivateData.cardParamMap.feedbackStatus).toBe("-1");
  });

  it("responds on TOPIC_CARD and detaches the listener", () => {
    const acks: unknown[] = [];
    let registered: ((res: unknown) => unknown) | undefined;
    const client = {
      registerCallbackListener(_topic: string, listener: (res: unknown) => unknown) {
        registered = listener;
      },
      deregisterCallbackListener() {
        registered = undefined;
      },
      socketCallBackResponse(_id: string, body: unknown) {
        acks.push(body);
      },
    };
    const handle = attachCardFeedback({ client, log: {} });
    registered?.(likePayload());
    expect(acks[0]).toMatchObject({
      cardUpdateOptions: { updateCardDataByKey: true, updatePrivateDataByKey: true },
      cardData: { cardParamMap: { like: "1" } },
    });
    handle.detach();
    expect(registered).toBeUndefined();
  });

  it("acks unknown callbacks without throwing", () => {
    const acks: unknown[] = [];
    const client = {
      registerCallbackListener() {},
      socketCallBackResponse(_id: string, body: unknown) {
        acks.push(body);
      },
    };
    const listener = createCardCallbackListener({ client });
    listener({ headers: { messageId: "mid-x" }, data: "{not-json" });
    expect(acks).toEqual([{ success: false }]);
  });

  it("acks unknown buttons with an empty card update instead of success=false", () => {
    const acks: unknown[] = [];
    const client = {
      registerCallbackListener() {},
      socketCallBackResponse(_id: string, body: unknown) {
        acks.push(body);
      },
    };
    const listener = createCardCallbackListener({ client });
    listener({
      headers: { messageId: "mid-copy" },
      data: { outTrackId: "card_3", cardPrivateData: { actionIds: ["copy"] } },
    });
    expect(acks[0]).toMatchObject({
      cardUpdateOptions: { updateCardDataByKey: true },
      cardData: { cardParamMap: {} },
    });
  });
});

describe("card-feedback session map and record", () => {
  it("registers, looks up, and refuses ambiguous target guesses", () => {
    const store = createCardSessionStore({ persistFile: path.join(tempDir(), "map.json") });
    store.register("card_a", { sessionKey: "agent:main:dingtalk:user-1", agentId: "main", targetHint: "user-1" });
    store.register("card_b", { sessionKey: "agent:other:dingtalk:user-1", agentId: "other", targetHint: "user-1" });
    expect(store.lookup("card_a")?.sessionKey).toBe("agent:main:dingtalk:user-1");
    expect(store.guessByTarget("user-1")).toBeUndefined();
    expect(store.guessByTarget("missing")).toBeUndefined();
  });

  it("guesses when all matching cards share one session", () => {
    const store = createCardSessionStore({ persistFile: path.join(tempDir(), "map.json") });
    store.register("card_a", { sessionKey: "sk-1", targetHint: "cid123" });
    store.register("card_b", { sessionKey: "sk-1", targetHint: "cid123" });
    expect(store.guessByTarget("cid123")?.sessionKey).toBe("sk-1");
  });

  it("writes feedback onto the matching assistant message in session jsonl", async () => {
    const dir = tempDir();
    const home = path.join(dir, "openclaw");
    const sessionsDir = path.join(home, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionFile = path.join(sessionsDir, "abc.jsonl");
    fs.writeFileSync(
      sessionFile,
      [
        JSON.stringify({
          type: "message",
          id: "u1",
          message: { role: "user", content: [{ type: "text", text: "在吗" }] },
        }),
        JSON.stringify({
          type: "message",
          id: "a1",
          message: { role: "assistant", content: [{ type: "text", text: "在的，需要帮忙吗？" }] },
        }),
      ].join("\n") + "\n",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({ "sk-1": { sessionFile: "abc.jsonl" } }),
    );
    const quoteStore = new QuoteBodyStore(path.join(dir, "dingtalk-quote-bodies.json"));
    quoteStore.remember({ cardInstanceId: "card_9" }, "在的，需要帮忙吗？", { source: "aicard" });
    setQuoteBodyStoreForTest(quoteStore);

    const store = createCardSessionStore({ persistFile: path.join(dir, "map.json") });
    store.register("card_9", { sessionKey: "sk-1", agentId: "main" });

    const prevHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_HOME = home;
    try {
      const ok = await recordFeedbackToSession(
        {
          kind: "dislike",
          outTrackId: "card_9",
          userId: "u1",
        },
        { store },
      );
      expect(ok).toBe(true);
      const lines = fs.readFileSync(sessionFile, "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!)).not.toHaveProperty("feedback");
      expect(JSON.parse(lines[1]!)).toMatchObject({
        id: "a1",
        type: "message",
        feedback: { like: -1 },
      });
      expect(JSON.parse(lines[1]!).feedback.updatedAt).toEqual(expect.any(String));

      const ok2 = await recordFeedbackToSession(
        { kind: "like", outTrackId: "card_9", userId: "u1" },
        { store },
      );
      expect(ok2).toBe(true);
      const again = JSON.parse(fs.readFileSync(sessionFile, "utf8").trim().split("\n")[1]!);
      expect(again.feedback.like).toBe(1);
      expect(fs.readFileSync(sessionFile, "utf8").trim().split("\n")).toHaveLength(2);
    } finally {
      setQuoteBodyStoreForTest(null);
      if (prevHome === undefined) delete process.env.OPENCLAW_HOME;
      else process.env.OPENCLAW_HOME = prevHome;
    }
  });
});

describe("card-feedback config schema", () => {
  it("accepts optional action ids on the shared config", () => {
    const out = DingtalkConfigSchema.parse({
      cardLikeActionId: "thumbs_up",
      cardDislikeActionId: "thumbs_down",
      cardFeedbackStatusKey: "feedbackStatus",
    });
    expect(out.cardLikeActionId).toBe("thumbs_up");
    expect(out.cardFeedbackStatusKey).toBe("feedbackStatus");
  });
});
