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
});
