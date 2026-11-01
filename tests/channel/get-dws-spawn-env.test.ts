import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDwsSpawnEnv } from "../../src/channel.ts";

describe("getDwsSpawnEnv", () => {
  const savedClientId = process.env.DWS_CLIENT_ID;
  const savedClientSecret = process.env.DWS_CLIENT_SECRET;
  const savedIdentity = process.env.DWS_AUTH_IDENTITY;

  beforeEach(() => {
    delete process.env.DWS_CLIENT_ID;
    delete process.env.DWS_CLIENT_SECRET;
    delete process.env.DWS_AUTH_IDENTITY;
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
    if (savedIdentity === undefined) {
      delete process.env.DWS_AUTH_IDENTITY;
    } else {
      process.env.DWS_AUTH_IDENTITY = savedIdentity;
    }
  });

  it("does not inject retired DWS_AUTH_IDENTITY or robot DWS_CLIENT_* (path 1)", () => {
    process.env.DWS_AUTH_IDENTITY = "legacy-sender";
    const env = getDwsSpawnEnv("main");
    expect(env.DINGTALK_AGENT).toBe("DING_DWS_CLAW");
    expect(env.DWS_AUTH_IDENTITY).toBeUndefined();
    expect(env.DWS_CLIENT_ID).toBeUndefined();
    expect(env.DWS_CLIENT_SECRET).toBeUndefined();
  });
});
