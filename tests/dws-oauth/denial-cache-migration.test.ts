import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("denial-cache legacy migration", () => {
  const senderId = "migration-test-user";
  const legacyFile = path.join(os.homedir(), ".dws", "cache", "denial", `${senderId}.json`);
  const currentFile = path.join(
    os.homedir(),
    ".openclaw",
    "connector",
    "denial",
    `${senderId}.json`,
  );

  afterEach(async () => {
    await fs.unlink(legacyFile).catch(() => undefined);
    await fs.unlink(currentFile).catch(() => undefined);
  });

  it("migrates legacy denial file on read", async () => {
    const entry = {
      senderId,
      denialReason: "user_not_allowed",
      message: "legacy entry",
      recordedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(legacyFile), { recursive: true });
    await fs.writeFile(legacyFile, JSON.stringify(entry), "utf8");

    const mod = await import("../../src/dws-auth/denial-cache.ts");
    const read = await mod.readDenialCache(senderId);

    expect(read?.denialReason).toBe("user_not_allowed");
    await expect(fs.access(currentFile)).resolves.toBeUndefined();
    await expect(fs.access(legacyFile)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
