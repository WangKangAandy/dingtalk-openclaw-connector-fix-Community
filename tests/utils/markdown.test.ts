import { describe, expect, it } from "vitest";
import { hardenMarkdownLineBreaks } from "../../src/utils/markdown.ts";

describe("hardenMarkdownLineBreaks", () => {
  it("turns soft breaks into paragraph breaks for DingTalk", () => {
    expect(hardenMarkdownLineBreaks("这个是测试\n嗨，欢迎")).toBe("这个是测试\n\n嗨，欢迎");
  });

  it("leaves existing blank lines alone", () => {
    expect(hardenMarkdownLineBreaks("已空行\n\n下一段")).toBe("已空行\n\n下一段");
  });

  it("does not rewrite fenced code blocks", () => {
    expect(hardenMarkdownLineBreaks("前\n```\na\nb\n```\n后")).toBe("前\n\n```\na\nb\n```\n后");
  });

  it("keeps GFM table row separators as single newlines", () => {
    const table = "| 方式 | 入口 |\n| --- | --- |\n| 一 | App |";
    expect(hardenMarkdownLineBreaks(table)).toBe(table);
  });

  it("hardens FAQ-style 方式 lines without turning them into one paragraph", () => {
    expect(
      hardenMarkdownLineBreaks("方式一：招行 App\n方式二：扫码\n方式三：点链接"),
    ).toBe("方式一：招行 App\n\n方式二：扫码\n\n方式三：点链接");
  });

  it("is idempotent", () => {
    const once = hardenMarkdownLineBreaks("方式一\n方式二");
    expect(hardenMarkdownLineBreaks(once)).toBe(once);
  });
});
