import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("denial-cache", () => {
  const senderId = "642225641";
  let cacheFile = "";

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cacheFile) {
      await fs.unlink(cacheFile).catch(() => undefined);
    }
  });

  it("writes and reads denial cache entry", async () => {
    cacheFile = path.join(os.homedir(), ".openclaw", "connector", "denial", `${senderId}.json`);
    const mod = await import("../../src/dws-auth/denial-cache.ts");
    await mod.writeDenialCache({
      senderId,
      denialReason: "user_not_allowed",
      message: "您不在该组织的 CLI 授权人员范围内",
      recordedAt: new Date().toISOString(),
    });
    const entry = await mod.readDenialCache(senderId);
    expect(entry?.denialReason).toBe("user_not_allowed");
    const cleared = await mod.clearDenialCache(senderId);
    expect(cleared).toBe(true);
    expect(await mod.readDenialCache(senderId)).toBeNull();
  });

  it("detects denial-clear phrases", async () => {
    const mod = await import("../../src/dws-auth/denial-cache.ts");
    expect(mod.isDenialClearPhrase("已加名单请重试")).toBe(true);
    expect(mod.isDenialClearPhrase("hello")).toBe(false);
  });
});
