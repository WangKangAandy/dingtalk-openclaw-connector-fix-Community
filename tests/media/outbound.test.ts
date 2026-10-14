import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendMediaToDingTalk = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/messaging.ts", () => ({
  sendMediaToDingTalk: mockSendMediaToDingTalk,
}));

import { createOutboundMediaChannel } from "../../src/services/media/outbound.ts";

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
});
