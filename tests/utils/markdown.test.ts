import { describe, expect, it } from "vitest";
import {
  ensureTableBlankLines,
  hardenMarkdownLineBreaks,
  prepareDingTalkMarkdown,
} from "../../src/utils/markdown.ts";

describe("hardenMarkdownLineBreaks", () => {
  it("turns a soft break into a hard break without adding a blank line", () => {
    expect(hardenMarkdownLineBreaks("这个是测试\n嗨，欢迎")).toBe("这个是测试  \n嗨，欢迎");
  });

  it("leaves existing paragraph breaks alone", () => {
    expect(hardenMarkdownLineBreaks("已空行\n\n下一段")).toBe("已空行\n\n下一段");
  });

  it("does not insert a blank line before a fenced code block", () => {
    expect(hardenMarkdownLineBreaks("前\n```\na\nb\n```\n后")).toBe("前\n```\na\nb\n```\n后");
  });

  it("does not rewrite fenced code internals", () => {
    const src = "```\nline1\nline2\n```";
    expect(hardenMarkdownLineBreaks(src)).toBe(src);
  });

  it("keeps GFM table row separators as single newlines", () => {
    const table = "| 方式 | 入口 |\n| --- | --- |\n| 一 | App |";
    expect(hardenMarkdownLineBreaks(table)).toBe(table);
  });

  it("keeps FAQ 方式 lines stacked without extra blank rows", () => {
    expect(
      hardenMarkdownLineBreaks("方式一：招行 App\n方式二：扫码\n方式三：点链接"),
    ).toBe("方式一：招行 App  \n方式二：扫码  \n方式三：点链接");
  });

  it("does not loosen tight lists", () => {
    const list = "- 方式一\n- 方式二\n- 方式三";
    expect(hardenMarkdownLineBreaks(list)).toBe(list);
  });

  it("does not add a hard break after a heading", () => {
    expect(hardenMarkdownLineBreaks("## 标题\n下一行")).toBe("## 标题\n下一行");
  });

  it("is idempotent", () => {
    const once = hardenMarkdownLineBreaks("方式一\n方式二");
    expect(hardenMarkdownLineBreaks(once)).toBe(once);
  });
});

describe("ensureTableBlankLines", () => {
  it("inserts a blank line before a table that follows prose", () => {
    expect(ensureTableBlankLines("说明\n| 方式 | 入口 |\n| --- | --- |\n| 一 | App |")).toBe(
      "说明\n\n| 方式 | 入口 |\n| --- | --- |\n| 一 | App |",
    );
  });

  it("does not add another blank line when one is already there", () => {
    const src = "说明\n\n| 方式 | 入口 |\n| --- | --- |";
    expect(ensureTableBlankLines(src)).toBe(src);
  });
});

describe("prepareDingTalkMarkdown", () => {
  it("applies hard breaks and table separators together", () => {
    expect(
      prepareDingTalkMarkdown("方式一\n方式二\n| a | b |\n| --- | --- |\n| 1 | 2 |"),
    ).toBe("方式一  \n方式二\n\n| a | b |\n| --- | --- |\n| 1 | 2 |");
  });

  it("does not invent extra blank lines between FAQ lines", () => {
    const out = prepareDingTalkMarkdown("方式一：招行 App\n方式二：扫码\n方式三：点链接");
    expect(out).toBe("方式一：招行 App  \n方式二：扫码  \n方式三：点链接");
    expect(out.includes("\n\n")).toBe(false);
  });

  it("is idempotent", () => {
    const once = prepareDingTalkMarkdown("方式一\n方式二\n| a | b |\n| --- | --- |");
    expect(prepareDingTalkMarkdown(once)).toBe(once);
  });
});
