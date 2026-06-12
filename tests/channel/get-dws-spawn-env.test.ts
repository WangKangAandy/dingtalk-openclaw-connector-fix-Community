import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDwsSpawnEnv } from "../../src/channel.ts";

describe("getDwsSpawnEnv", () => {
  const savedClientId = process.env.DWS_CLIENT_ID;
  const savedClientSecret = process.env.DWS_CLIENT_SECRET;

  beforeEach(() => {
    delete process.env.DWS_CLIENT_ID;
    delete process.env.DWS_CLIENT_SECRET;
  });

  afterEach(() => {
    if (savedClientId === undefined) {
      delete process.env.DWS_CLIENT_ID;
    } else {
      process.env.DWS_CLIENT_ID = savedClientId;
    }
    if (savedClientSecret === undefined) {
      delete process.env.DWS_CLIENT_SECRET;
    } else {
      process.env.DWS_CLIENT_SECRET = savedClientSecret;
    }
  });

  it("injects DWS_AUTH_IDENTITY for senderId and does not add robot DWS_CLIENT_* (path 1)", () => {
    const env = getDwsSpawnEnv("main", "staff-42");
    expect(env.DINGTALK_AGENT).toBe("DING_DWS_CLAW");
    expect(env.DWS_AUTH_IDENTITY).toBe("staff-42");
    expect(env.DWS_CLIENT_ID).toBeUndefined();
    expect(env.DWS_CLIENT_SECRET).toBeUndefined();
  });

  it("omits DWS_AUTH_IDENTITY when senderId is not provided", () => {
    const env = getDwsSpawnEnv("main");
    expect(env.DWS_AUTH_IDENTITY).toBeUndefined();
  });
});
