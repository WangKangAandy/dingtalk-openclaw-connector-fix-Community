import { describe, expect, it } from "vitest";
import {
  appendCardMention,
  applyWebhookTextAt,
  resolveGroupMention,
  webhookAt,
} from "../../src/utils/group-mention.ts";

const mention = resolveGroupMention({
  isDirect: false,
  senderStaffId: " staff_1 ",
  senderNick: " 张三 ",
});

describe("resolveGroupMention", () => {
  it("returns undefined for direct chats", () => {
    expect(
      resolveGroupMention({
        isDirect: true,
        senderStaffId: "staff_1",
        senderNick: "张三",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when senderStaffId is missing", () => {
    expect(
      resolveGroupMention({
        isDirect: false,
        senderStaffId: "",
        senderNick: "张三",
      }),
    ).toBeUndefined();
    expect(
      resolveGroupMention({
        isDirect: false,
        senderNick: "张三",
      }),
    ).toBeUndefined();
  });

  it("maps staffId to nick for group card deliver", () => {
    expect(mention).toEqual({
      atUserId: "staff_1",
      atName: "张三",
      atUserIds: { staff_1: "张三" },
    });
  });

  it("falls back to staffId as display name", () => {
    expect(
      resolveGroupMention({
        isDirect: false,
        senderStaffId: "staff_1",
        senderNick: "  ",
      }),
    ).toEqual({
      atUserId: "staff_1",
      atName: "staff_1",
      atUserIds: { staff_1: "staff_1" },
    });
  });
});

describe("appendCardMention", () => {
  it("appends @nick once", () => {
    expect(appendCardMention("你好", mention)).toBe("你好 @张三");
    expect(appendCardMention("你好 @张三", mention)).toBe("你好 @张三");
  });

  it("leaves text unchanged without a mention", () => {
    expect(appendCardMention("你好")).toBe("你好");
  });
});

describe("webhookAt / applyWebhookTextAt", () => {
  it("exposes atUserId for send* options", () => {
    expect(webhookAt(mention)).toEqual({ atUserId: "staff_1" });
    expect(webhookAt(undefined)).toEqual({});
  });

  it("patches a robot webhook text body", () => {
    const body = { text: { content: "抱歉" } };
    applyWebhookTextAt(body, mention);
    expect(body).toEqual({
      text: { content: "抱歉 @staff_1" },
      at: { atUserIds: ["staff_1"], isAtAll: false },
    });
    applyWebhookTextAt(body, mention);
    expect(body.text.content).toBe("抱歉 @staff_1");
  });
});
