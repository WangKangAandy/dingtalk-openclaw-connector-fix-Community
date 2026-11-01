import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { attachCardFeedback, createCardCallbackListener } from "../../src/card-feedback/attach.ts";
import { parseCardCallbackFrame, resolveCardFeedbackAction } from "../../src/card-feedback/parse.ts";
import { attachCardInstanceId, recordFeedbackToSession } from "../../src/card-feedback/record.ts";
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
            dislike_reason: ["鍥炵瓟涓嶅噯纭?],
            custom_dislike_reason: "娌℃湁缁欏嚭鍏蜂綋浠ｇ爜",
          },
        },
      },
    });
    expect(resolveCardFeedbackAction(frame!, custom)).toEqual({
      kind: "dislike",
      outTrackId: "card_2",
      userId: "u1",
      dislikeReasons: ["鍥炵瓟涓嶅噯纭?],
      customDislikeReason: "娌℃湁缁欏嚭鍏蜂綋浠ｇ爜",
    });
  });

  it("returns null for unknown buttons", () => {
    const frame = parseCardCallbackFrame({
      data: { outTrackId: "card_3", cardPrivateData: { actionIds: ["copy"] } },
    });
    expect(resolveCardFeedbackAction(frame!, config)).toBeNull();
  });

  it("distinguishes official 鎿嶄綔鍖?like/dislike via params.feedback", () => {
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
          params: { feedback: "bad", comment: "娌℃湁缁欏嚭鍏蜂綋浠ｇ爜" },
        },
      },
    });
    expect(resolveCardFeedbackAction(dislike!, config)).toEqual({
      kind: "dislike",
      outTrackId: "card_off_2",
      userId: "u2",
      customDislikeReason: "娌℃湁缁欏嚭鍏蜂綋浠ｇ爜",
    });
  });

  it("treats official tag submit without feedback as dislike", () => {
    const frame = parseCardCallbackFrame({
      data: {
        outTrackId: "card_off_3",
        cardPrivateData: {
          actionIds: ["sys_action_like_component"],
          params: { dislike_reason: ["鍐呭涓嶅尮閰?] },
        },
      },
    });
    expect(resolveCardFeedbackAction(frame!, config)).toMatchObject({
      kind: "dislike",
      dislikeReasons: ["鍐呭涓嶅尮閰?],
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
  it("registers and looks up card sessions", () => {
    const store = createCardSessionStore({ persistFile: path.join(tempDir(), "map.json") });
    store.register("card_a", { sessionKey: "agent:main:dingtalk:user-1", agentId: "main", targetHint: "user-1" });
    expect(store.lookup("card_a")?.sessionKey).toBe("agent:main:dingtalk:user-1");
    expect(store.lookup("missing")).toBeUndefined();
  });

  it("attaches cardInstanceId then writes feedback on the same SQLite assistant row", async () => {
    let DatabaseSync: new (path: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        run: (...params: unknown[]) => unknown;
        get: (...params: unknown[]) => unknown;
        all: (...params: unknown[]) => unknown[];
      };
      close: () => void;
    };
    try {
      ({ DatabaseSync } = await import("node:sqlite"));
    } catch {
      return;
    }

    const dir = tempDir();
    const home = path.join(dir, "openclaw");
    const agentDir = path.join(home, "agents", "main", "agent");
    fs.mkdirSync(agentDir, { recursive: true });

    const sessionKey = "agent:main:dingtalk-connector:direct:u1";
    const sessionId = "sess-sqlite-1";
    const dbPath = path.join(agentDir, "openclaw-agent.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE session_windows (
        session_id TEXT NOT NULL PRIMARY KEY
      );
      CREATE TABLE session_nodes (
        session_key TEXT NOT NULL PRIMARY KEY,
        current_session_id TEXT NOT NULL,
        entry_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE transcript_events (
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_json TEXT,
        created_at INTEGER NOT NULL,
        event_zstd BLOB,
        event_utf8_bytes INTEGER,
        navigation_json TEXT,
        PRIMARY KEY (session_id, seq)
      );
    `);
    db.prepare("INSERT INTO session_windows (session_id) VALUES (?)").run(sessionId);
    db.prepare(
      "INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, '{}', 1)",
    ).run(sessionKey, sessionId);
    db.prepare(
      "INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(
      sessionId,
      1,
      JSON.stringify({
        type: "message",
        id: "old",
        message: { role: "assistant", content: [{ type: "text", text: "鏃? }] },
      }),
      1,
    );
    const newEventJson = JSON.stringify({
      type: "message",
      id: "new",
      message: { role: "assistant", content: [{ type: "text", text: "鏂板洖澶? }] },
    });
    db.prepare(
      "INSERT INTO transcript_events (session_id, seq, event_json, created_at, event_utf8_bytes) VALUES (?, ?, ?, ?, ?)",
    ).run(sessionId, 2, newEventJson, 2, Buffer.byteLength(newEventJson, "utf8"));
    db.close();

    const store = createCardSessionStore({ persistFile: path.join(dir, "map.json") });
    store.register("card_9", { sessionKey, agentId: "main" });

    const prevHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_HOME = home;
    try {
      // No stamp yet 鈫?sidecar still receives the event; transcript row unchanged.
      expect(await recordFeedbackToSession({ kind: "like", outTrackId: "card_9" }, { store })).toBe(
        true,
      );

      expect(attachCardInstanceId("card_9", { sessionKey, agentId: "main" })).toBe(true);
      expect(await recordFeedbackToSession({ kind: "dislike", outTrackId: "card_9" }, { store })).toBe(
        true,
      );
      expect(await recordFeedbackToSession({ kind: "like", outTrackId: "card_9" }, { store })).toBe(
        true,
      );

      const verify = new DatabaseSync(dbPath);
      const rows = verify
        .prepare("SELECT seq, event_json, event_utf8_bytes FROM transcript_events ORDER BY seq")
        .all() as Array<{ seq: number; event_json: string; event_utf8_bytes: number | null }>;
      verify.close();
      expect(JSON.parse(rows[0]!.event_json)).not.toHaveProperty("cardInstanceId");
      expect(JSON.parse(rows[1]!.event_json)).toMatchObject({
        id: "new",
        cardInstanceId: "card_9",
        feedback: { like: 1 },
      });
      // Patch must keep utf8 size metadata in sync, never clear it to NULL.
      expect(rows[1]!.event_utf8_bytes).toBe(Buffer.byteLength(rows[1]!.event_json, "utf8"));
      expect(rows[1]!.event_utf8_bytes).toBeGreaterThan(Buffer.byteLength(newEventJson, "utf8"));

      const sidecar = fs
        .readFileSync(path.join(home, "dingtalk-card-feedback.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(sidecar.some((row) => row.op === "attach" && row.cardInstanceId === "card_9")).toBe(true);
      expect(sidecar.some((row) => row.op === "feedback" && row.kind === "dislike")).toBe(true);
      expect(sidecar.every((row) => !("jsonl" in (row.persisted || {})))).toBe(true);
    } finally {
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
