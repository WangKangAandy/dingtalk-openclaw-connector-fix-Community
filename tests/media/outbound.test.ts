import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendMediaToDingTalk = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/messaging.ts", () => ({
  sendMediaToDingTalk: mockSendMediaToDingTalk,
}));

import {
  createOutboundMediaChannel,
  harvestStandaloneMediaTokens,
  stripReplyMediaFailureWarning,
} from "../../src/services/media/outbound.ts";

describe("outbound media channel", () => {
  const png = "/home/mccxadmin/.openclaw/media/inbound/hr003-qrcode.png";

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMediaToDingTalk.mockResolvedValue({ ok: true });
  });

  const channel = (opts?: { isDirect?: boolean; senderId?: string; conversationId?: string }) =>
    createOutboundMediaChannel({
      config: {} as any,
      isDirect: opts?.isDirect ?? true,
      senderId: opts?.senderId ?? "user-1",
      conversationId: opts?.conversationId ?? "cidABC",
    });

  it("remembers mediaUrl and only sends on flush", async () => {
    const c = channel();
    c.remember({ mediaUrl: png }, "或扫码（二维码见附件）");
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
    await c.flush();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: png, target: "user-1" }),
    );
    expect(mockSendMediaToDingTalk.mock.calls[0][0].text).toBeUndefined();
  });

  it("sends mediaUrls and uses group target", async () => {
    const c = channel({ isDirect: false, conversationId: "openconv-1" });
    c.remember({ mediaUrls: ["MEDIA:/tmp/b.png"] }, "hello");
    await c.flush();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: "MEDIA:/tmp/b.png",
        target: "group:openconv-1",
      }),
    );
  });

  it("skips sendMedia when the body already has the image", async () => {
    const c = channel();
    c.remember({ mediaUrl: png }, `扫码\n\n![](${png})`);
    await c.flush();
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
  });

  it("does not send the same path twice in one turn", async () => {
    const c = channel();
    c.remember({ mediaUrl: png }, "hello");
    c.remember({ mediaUrl: png }, "hello");
    await c.flush();
    await c.flush();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(1);
    c.reset();
    c.remember({ mediaUrl: png }, "hello");
    await c.flush();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledTimes(2);
  });

  it("strips OpenClaw Media failed warning from card text", () => {
    const text = "方法三：直接扫下面这张二维码（FAQ 内附）：\n\n⚠️ Media failed.";
    expect(stripReplyMediaFailureWarning(text)).toBe(
      "方法三：直接扫下面这张二维码（FAQ 内附）：",
    );
  });

  it("harvests standalone MEDIA tokens", () => {
    const path = "/home/mccxadmin/.openclaw/media/inbound/payslip-qr.png";
    expect(
      harvestStandaloneMediaTokens(`扫码：\n\nMEDIA:${path}\n`),
    ).toEqual([`MEDIA:${path}`]);
  });

  it("recovers MEDIA from stream text when payload mediaUrl was dropped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dt-media-"));
    const file = join(dir, "payslip-qr.png").replace(/\\/g, "/");
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const c = channel();
    const dropped = "方法三：扫码：\n\n⚠️ Media failed.";
    expect(c.remember({ mediaUrl: undefined, mediaUrls: undefined }, dropped)).toBe(0);
    expect(
      c.rememberRecovered(`方法三：扫码：\n\nMEDIA:${file}\n`, dropped),
    ).toBe(1);
    await c.flush();
    expect(mockSendMediaToDingTalk).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: `MEDIA:${file}` }),
    );
  });

  it("does not sendMedia when recovered MEDIA path is missing", async () => {
    const c = channel();
    const missing = "/home/mccxadmin/.openclaw/media/inbound/payslip-qr.png";
    expect(
      c.rememberRecovered(
        `MEDIA:${missing}`,
        "方法三：扫码：\n\n⚠️ Media failed.",
      ),
    ).toBe(0);
    await c.flush();
    expect(mockSendMediaToDingTalk).not.toHaveBeenCalled();
  });
});
