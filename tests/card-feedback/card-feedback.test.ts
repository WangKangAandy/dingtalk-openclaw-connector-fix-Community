import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { attachCardFeedback, createCardCallbackListener } from "../../src/card-feedback/attach.ts";
import { parseCardCallbackFrame, resolveCardFeedbackAction } from "../../src/card-feedback/parse.ts";
import {
  resolveCardFeedbackLogPath,
  resolveOpenClawStateDir,
} from "../../src/card-feedback/paths.ts";
import { recordCardAnswer, recordCardFeedback } from "../../src/card-feedback/record.ts";
import { buildCardFeedbackAck, CARD_CALLBACK_PARSE_FAILURE } from "../../src/card-feedback/response.ts";
import { createCardSessionStore } from "../../src/card-feedback/session-map.ts";
import { resolveCardFeedbackConfig } from "../../src/card-feedback/types.ts";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";

const tmpDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-feedback-"));
  tmpDirs.push(dir);
  return dir;
}

function readJsonl(file: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
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
      eventId: "mid-1",
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
      eventId: "mid-2",
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

  it("persists before ACK and still ACKs when UI update is requested", () => {
    const dir = tempDir();
    const logPath = path.join(dir, "dingtalk-card-feedback.jsonl");
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
    const handle = attachCardFeedback({ client, log: {}, logPath });
    registered?.(likePayload());
    expect(acks[0]).toMatchObject({
      cardUpdateOptions: { updateCardDataByKey: true, updatePrivateDataByKey: true },
      cardData: { cardParamMap: { like: "1" } },
    });
    const rows = readJsonl(logPath);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "feedback",
      kind: "like",
      cardId: "card_1",
      eventId: "mid-1",
      userId: "staff-9",
    });
    expect(rows[0]).not.toHaveProperty("acked");
    expect(rows[0]).not.toHaveProperty("persisted");
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

describe("card-feedback paths", () => {
  it("prefers OPENCLAW_STATE_DIR over OPENCLAW_HOME/.openclaw", () => {
    const state = path.join(tempDir(), "state");
    const home = path.join(tempDir(), "home");
    expect(
      resolveOpenClawStateDir({
        OPENCLAW_STATE_DIR: state,
        OPENCLAW_HOME: home,
      } as NodeJS.ProcessEnv),
    ).toBe(state);
    expect(
      resolveCardFeedbackLogPath({
        OPENCLAW_STATE_DIR: state,
      } as NodeJS.ProcessEnv),
    ).toBe(path.join(state, "dingtalk-card-feedback.jsonl"));
    expect(
      resolveOpenClawStateDir({
        OPENCLAW_HOME: home,
      } as NodeJS.ProcessEnv),
    ).toBe(path.join(home, ".openclaw"));
  });
});

describe("card-feedback JSONL answer + feedback contract", () => {
  it("registers enrichment bindings without gating persistence", () => {
    const store = createCardSessionStore({ persistFile: path.join(tempDir(), "map.json") });
    store.register("card_a", {
      sessionKey: "agent:main:dingtalk:user-1",
      agentId: "main",
      targetHint: "user-1",
    });
    expect(store.lookup("card_a")?.sessionKey).toBe("agent:main:dingtalk:user-1");
    expect(store.lookup("missing")).toBeUndefined();
  });

  it("records answer snapshots from the real turn, including failed status", () => {
    const logPath = path.join(tempDir(), "dingtalk-card-feedback.jsonl");
    expect(
      recordCardAnswer(
        {
          cardId: "card_ans",
          status: "completed",
          sessionKey: "agent:main:dingtalk:u1",
          agentId: "main",
          accountId: "acc-1",
          corpId: "corp-1",
          conversationId: "conv-1",
          chatType: "group",
          requesterUserId: "u1",
          userPrompt: "怎么写 hello world？",
          assistantText: "```js\nconsole.log('hello')\n```",
        },
        { logPath },
      ),
    ).toBe(true);
    expect(
      recordCardAnswer(
        {
          cardId: "card_fail",
          status: "failed",
          userPrompt: "再试一次",
          assistantText: "部分内容",
          error: "finish timed out",
        },
        { logPath },
      ),
    ).toBe(true);

    const rows = readJsonl(logPath);
    expect(rows).toEqual([
      expect.objectContaining({
        type: "answer",
        cardId: "card_ans",
        status: "completed",
        userPrompt: "怎么写 hello world？",
        assistantText: "```js\nconsole.log('hello')\n```",
        sessionKey: "agent:main:dingtalk:u1",
        chatType: "group",
      }),
      expect.objectContaining({
        type: "answer",
        cardId: "card_fail",
        status: "failed",
        error: "finish timed out",
        assistantText: "部分内容",
      }),
    ]);
    for (const row of rows) {
      expect(row).not.toHaveProperty("acked");
      expect(row).not.toHaveProperty("persisted");
    }
  });

  it("keeps feedback when enrichment map is missing and appends re-ratings", () => {
    const dir = tempDir();
    const logPath = path.join(dir, "dingtalk-card-feedback.jsonl");
    const store = createCardSessionStore({ persistFile: path.join(dir, "map.json") });

    expect(
      recordCardAnswer(
        {
          cardId: "card_old",
          status: "completed",
          sessionKey: "agent:main:dingtalk:u9",
          userPrompt: "旧卡片问题",
          assistantText: "旧卡片回答",
        },
        { logPath },
      ),
    ).toBe(true);

    // No in-memory binding — old cards after restart / TTL still keep feedback.
    expect(
      recordCardFeedback(
        { kind: "like", outTrackId: "card_old", userId: "u9", eventId: "evt-like-1" },
        { store, logPath },
      ),
    ).toBe(true);

    store.register("card_old", {
      sessionKey: "agent:main:dingtalk:u9",
      agentId: "main",
      chatType: "group",
      conversationId: "g-1",
    });

    // Same user changing like → dislike must append, not overwrite / drop history.
    expect(
      recordCardFeedback(
        {
          kind: "dislike",
          outTrackId: "card_old",
          userId: "u9",
          eventId: "evt-dislike-1",
          dislikeReasons: ["不准确"],
        },
        { store, logPath },
      ),
    ).toBe(true);

    // Group: another user can rate the same card.
    expect(
      recordCardFeedback(
        { kind: "like", outTrackId: "card_old", userId: "u2", eventId: "evt-like-u2" },
        { store, logPath },
      ),
    ).toBe(true);

    // Identical eventId retry is still appended; analysis dedupes by eventId.
    expect(
      recordCardFeedback(
        { kind: "like", outTrackId: "card_old", userId: "u2", eventId: "evt-like-u2" },
        { store, logPath },
      ),
    ).toBe(true);

    const rows = readJsonl(logPath);
    expect(rows[0]).toMatchObject({ type: "answer", cardId: "card_old" });
    expect(rows.filter((r) => r.type === "feedback")).toHaveLength(4);
    expect(rows[1]).toMatchObject({
      type: "feedback",
      kind: "like",
      cardId: "card_old",
      eventId: "evt-like-1",
      userId: "u9",
    });
    expect(rows[1]).not.toHaveProperty("sessionKey");
    expect(rows[2]).toMatchObject({
      type: "feedback",
      kind: "dislike",
      userId: "u9",
      eventId: "evt-dislike-1",
      sessionKey: "agent:main:dingtalk:u9",
      conversationId: "g-1",
    });
    expect(rows[3]).toMatchObject({ type: "feedback", userId: "u2", eventId: "evt-like-u2" });
    expect(rows[4]).toMatchObject({ type: "feedback", userId: "u2", eventId: "evt-like-u2" });

    const byEvent = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.type !== "feedback") continue;
      const eventId = String(row.eventId || "");
      if (!eventId) continue;
      byEvent.set(eventId, row);
    }
    expect([...byEvent.keys()].sort()).toEqual([
      "evt-dislike-1",
      "evt-like-1",
      "evt-like-u2",
    ]);
  });

  it("joins feedback to the exact answer by cardId for who/when/which-reply", () => {
    const logPath = path.join(tempDir(), "dingtalk-card-feedback.jsonl");
    const store = createCardSessionStore({ persistFile: path.join(tempDir(), "map.json") });

    expect(
      recordCardAnswer(
        {
          cardId: "card_hello_1",
          status: "completed",
          sessionKey: "agent:main:dingtalk-connector:direct:u1",
          requesterUserId: "u1",
          userPrompt: "你好",
          assistantText: "你好，王康！有什么需要帮忙的吗？",
        },
        { logPath },
      ),
    ).toBe(true);
    expect(
      recordCardAnswer(
        {
          cardId: "card_new_1",
          status: "completed",
          sessionKey: "agent:main:dingtalk-connector:direct:u1",
          requesterUserId: "u1",
          userPrompt: "/new",
          assistantText: "✅ New session started.",
        },
        { logPath },
      ),
    ).toBe(true);
    expect(
      recordCardAnswer(
        {
          cardId: "card_hello_2",
          status: "completed",
          sessionKey: "agent:main:dingtalk-connector:direct:u1",
          requesterUserId: "u1",
          userPrompt: "你好",
          assistantText: "你好，王康！有什么我可以帮你的吗？",
        },
        { logPath },
      ),
    ).toBe(true);

    store.register("card_hello_1", {
      sessionKey: "agent:main:dingtalk-connector:direct:u1",
      agentId: "main",
    });
    store.register("card_new_1", {
      sessionKey: "agent:main:dingtalk-connector:direct:u1",
      agentId: "main",
    });
    store.register("card_hello_2", {
      sessionKey: "agent:main:dingtalk-connector:direct:u1",
      agentId: "main",
    });

    expect(
      recordCardFeedback(
        { kind: "dislike", outTrackId: "card_hello_1", userId: "u1", eventId: "evt-d1" },
        { store, logPath },
      ),
    ).toBe(true);
    expect(
      recordCardFeedback(
        { kind: "dislike", outTrackId: "card_new_1", userId: "u1", eventId: "evt-d2" },
        { store, logPath },
      ),
    ).toBe(true);
    expect(
      recordCardFeedback(
        { kind: "like", outTrackId: "card_hello_2", userId: "u1", eventId: "evt-l3" },
        { store, logPath },
      ),
    ).toBe(true);

    const rows = readJsonl(logPath);
    const answers = new Map(
      rows.filter((r) => r.type === "answer").map((r) => [String(r.cardId), r]),
    );
    const feedbacks = rows.filter((r) => r.type === "feedback");
    expect(feedbacks).toHaveLength(3);

    const joined = feedbacks.map((f) => {
      const answer = answers.get(String(f.cardId));
      return {
        who: f.userId,
        when: f.ts,
        kind: f.kind,
        eventId: f.eventId,
        cardId: f.cardId,
        userPrompt: answer?.userPrompt,
        assistantText: answer?.assistantText,
        sessionKey: answer?.sessionKey ?? f.sessionKey,
      };
    });

    expect(joined).toEqual([
      expect.objectContaining({
        who: "u1",
        kind: "dislike",
        eventId: "evt-d1",
        cardId: "card_hello_1",
        userPrompt: "你好",
        assistantText: "你好，王康！有什么需要帮忙的吗？",
        sessionKey: "agent:main:dingtalk-connector:direct:u1",
      }),
      expect.objectContaining({
        who: "u1",
        kind: "dislike",
        eventId: "evt-d2",
        cardId: "card_new_1",
        userPrompt: "/new",
        assistantText: "✅ New session started.",
      }),
      expect.objectContaining({
        who: "u1",
        kind: "like",
        eventId: "evt-l3",
        cardId: "card_hello_2",
        userPrompt: "你好",
        assistantText: "你好，王康！有什么我可以帮你的吗？",
      }),
    ]);
    for (const row of joined) {
      expect(typeof row.when).toBe("string");
      expect(String(row.when).length).toBeGreaterThan(0);
    }
    // Same prompt text on two cards must still resolve to different replies via cardId.
    expect(joined[0]?.assistantText).not.toBe(joined[2]?.assistantText);
  });

  it("uses OPENCLAW_STATE_DIR for the default log path", () => {
    const state = tempDir();
    const prevState = process.env.OPENCLAW_STATE_DIR;
    const prevHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_STATE_DIR = state;
    delete process.env.OPENCLAW_HOME;
    try {
      expect(recordCardFeedback({ kind: "dislike", outTrackId: "card_state" })).toBe(true);
      const rows = readJsonl(path.join(state, "dingtalk-card-feedback.jsonl"));
      expect(rows).toEqual([
        expect.objectContaining({
          type: "feedback",
          kind: "dislike",
          cardId: "card_state",
        }),
      ]);
    } finally {
      if (prevState === undefined) delete process.env.OPENCLAW_STATE_DIR;
      else process.env.OPENCLAW_STATE_DIR = prevState;
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
