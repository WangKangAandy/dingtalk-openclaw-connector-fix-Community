import { describe, expect, it } from "vitest";
import { resolveGroupMention } from "../../src/utils/group-mention.ts";

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
    expect(
      resolveGroupMention({
        isDirect: false,
        senderStaffId: " staff_1 ",
        senderNick: " 张三 ",
      }),
    ).toEqual({
      atUserId: "staff_1",
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
      atUserIds: { staff_1: "staff_1" },
    });
  });
});
