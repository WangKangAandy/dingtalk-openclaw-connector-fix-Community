import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  QuoteBodyStore,
  setQuoteBodyStoreForTest,
} from "../../src/utils/quote-body-store.ts";
import {
  extractQuotedBodyFromRepliedMsg,
  extractQuotedMsgText,
  flattenInteractiveCardContent,
  preferHydratedQuoteBody,
} from "../../src/utils/quote-message.ts";
import { extractMessageContent } from "../../src/core/message-handler.ts";

const tmpDirs: string[] = [];

function tempStore(): QuoteBodyStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quote-body-"));
  tmpDirs.push(dir);
  const store = new QuoteBodyStore(path.join(dir, "bodies.json"));
  setQuoteBodyStoreForTest(store);
  return store;
}

afterEach(() => {
  setQuoteBodyStoreForTest(null);
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("flattenInteractiveCardContent", () => {
  it("flattens TEXT/LINK cardContent", () => {
    const text = flattenInteractiveCardContent({
      cardContent: [
        {
          children: [
            { elementType: "TEXT", value: "嗨，欢迎新同学" },
            { elementType: "TEXT", value: "1. " },
            { elementType: "LINK", value: "https://alidocs.dingtalk.com/x" },
          ],
        },
      ],
    });
    expect(text).toBe(["嗨，欢迎新同学", "1.", "https://alidocs.dingtalk.com/x"].join("\n"));
  });
});

describe("preferHydratedQuoteBody", () => {
  it("keeps structural when no cache", () => {
    expect(preferHydratedQuoteBody("标题", null)).toBe("标题");
  });

  it("replaces placeholder / title-only with cached full body", () => {
    const full = "新人指引\n\n## 一、制度\n\n正文很长……";
    expect(preferHydratedQuoteBody("[interactiveCard消息]", full)).toBe(full);
    expect(preferHydratedQuoteBody("新人指引", full)).toBe(full);
    expect(preferHydratedQuoteBody("新人指引", full, "新人指引")).toBe(full);
  });

  it("does not replace a short unrelated structural just because cache is longer", () => {
    const full = "新人指引\n\n## 一、制度\n\n正文很长……";
    expect(preferHydratedQuoteBody("好的", full)).toBe("好的");
    expect(preferHydratedQuoteBody("[图片]", full)).toBe("[图片]");
  });
});

describe("extractQuotedMsgText unified", () => {
  it("reads interactiveCard cardContent without cache", () => {
    const out = extractQuotedMsgText(
      {
        isReplyMsg: true,
        repliedMsg: {
          msgType: "interactiveCard",
          content: {
            cardContent: [{ children: [{ elementType: "TEXT", value: "入职指引正文" }] }],
          },
        },
      },
      3,
    );
    expect(out).toBe("[引用] 入职指引正文");
  });

  it("keeps original interactiveCard URL fallback when no cardContent", () => {
    const out = extractQuotedMsgText(
      {
        isReplyMsg: true,
        repliedMsg: {
          msgType: "interactiveCard",
          content: { biz_custom_action_url: "https://alidocs.dingtalk.com/x" },
        },
      },
      3,
    );
    expect(out).toBe("[引用] 收到交互式卡片链接：https://alidocs.dingtalk.com/x");
  });

  it("hydrates sampleMarkdown title-only quote via processQueryKey", () => {
    const store = tempStore();
    const full = "嗨，欢迎新同学\n\n## 一、各部门公开制度文档查阅\n\n1. [HR制度](https://x)";
    store.remember({ processQueryKey: "pqk-1" }, full, { title: "新人指引", source: "markdown" });

    const out = extractQuotedMsgText(
      {
        isReplyMsg: true,
        repliedMsg: {
          msgType: "text",
          msgId: "msg-1",
          content: { text: "新人指引" },
        },
      },
      3,
      { originalProcessQueryKey: "pqk-1" },
    );
    expect(out).toBe(`[引用] ${full}`);
  });

  it("hydrates sampleMarkdown title-only quote via stored title when callback has no processQueryKey", () => {
    const store = tempStore();
    const full = "嗨，欢迎新同学\n\n完整新人指引正文……含链接";
    store.remember({ processQueryKey: "pqk-unknown" }, full, { title: "新人指引", source: "markdown" });

    const out = extractQuotedMsgText(
      {
        isReplyMsg: true,
        repliedMsg: {
          msgType: "text",
          content: { text: "新人指引" },
        },
      },
      3,
    );
    expect(out).toBe(`[引用] ${full}`);
  });

  it("hydrates interactiveCard placeholder via cardInstanceId cache", () => {
    const store = tempStore();
    store.remember({ cardInstanceId: "card_abc" }, "缓存的卡片全文", { source: "aicard" });
    const out = extractQuotedMsgText(
      {
        isReplyMsg: true,
        repliedMsg: {
          msgType: "interactiveCard",
          content: { outTrackId: "card_abc" },
        },
      },
      3,
    );
    expect(out).toBe("[引用] 缓存的卡片全文");
  });

  it("keeps nested [引用] prefix and does not replace picture quotes", () => {
    const store = tempStore();
    store.remember({ processQueryKey: "pqk-md" }, "很长的入职正文……", { title: "新人指引" });
    const out = extractQuotedMsgText(
      {
        isReplyMsg: true,
        repliedMsg: {
          msgType: "picture",
          content: {},
        },
      },
      3,
      { originalProcessQueryKey: "pqk-md" },
    );
    expect(out).toBe("[引用] [图片]");
  });
});

describe("extractMessageContent quote path", () => {
  it("exposes hydrated quote on inbound text reply", () => {
    const store = tempStore();
    const full = "完整新人指引正文……含链接";
    store.remember({ processQueryKey: "pqk-md" }, full, { title: "新人指引" });

    const out = extractMessageContent({
      msgtype: "text",
      text: {
        content: "这个消息你能看到吗？",
        isReplyMsg: true,
        repliedMsg: {
          msgType: "text",
          content: { text: "新人指引" },
        },
      },
    });
    expect(out.text).toContain("这个消息你能看到吗？");
    expect(out.text).toContain(full);
    expect(out.text).not.toBe("这个消息你能看到吗？\n[引用] 新人指引");
  });

  it("keeps original top-level interactiveCard URL text", () => {
    const out = extractMessageContent({
      msgtype: "interactiveCard",
      content: { biz_custom_action_url: "https://alidocs.dingtalk.com/doc" },
    });
    expect(out.text).toBe("收到交互式卡片链接：https://alidocs.dingtalk.com/doc");
    expect(out.interactiveCardUrl).toBe("https://alidocs.dingtalk.com/doc");
  });

  it("does not flatten top-level interactiveCard cardContent", () => {
    const out = extractMessageContent({
      msgtype: "interactiveCard",
      content: {
        cardContent: [{ children: [{ elementType: "TEXT", value: "卡片直达正文" }] }],
      },
    });
    expect(out.text).toBe("[interactiveCard消息]");
  });
});

describe("extractQuotedBodyFromRepliedMsg", () => {
  it("keeps plain text quotes", () => {
    expect(
      extractQuotedBodyFromRepliedMsg({
        msgType: "text",
        content: { text: "普通一句话" },
      }),
    ).toBe("普通一句话");
  });
});
