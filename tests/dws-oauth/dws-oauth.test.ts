import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDwsSpawnEnv } from "../../src/channel.ts";
import {
  _resetDwsOAuthStateForTests,
  parseDeviceLoginOutput,
  parseDwsAuthError,
} from "../../src/dws-oauth.ts";

describe("dws-oauth", () => {
  beforeEach(() => {
    _resetDwsOAuthStateForTests();
  });

  afterEach(() => {
    _resetDwsOAuthStateForTests();
  });

  describe("parseDwsAuthError", () => {
    it("parses IDENTITY_NOT_AUTHENTICATED JSON", () => {
      expect(
        parseDwsAuthError(
          '{"code":"IDENTITY_NOT_AUTHENTICATED","identity":"user-a","senderId":"user-a"}',
          5,
        ),
      ).toBe("not_authenticated");
    });

    it("parses IDENTITY_MISMATCH", () => {
      expect(parseDwsAuthError('{"code":"IDENTITY_MISMATCH","expected":"a","actual":"b"}', 1)).toBe(
        "identity_mismatch",
      );
    });

    it("parses AUTH_TOKEN_EXPIRED", () => {
      expect(parseDwsAuthError('{"code":"AUTH_TOKEN_EXPIRED","message":"Token验证失败"}', 1)).toBe(
        "token_expired",
      );
    });

    it("does not treat HTTP 403 scope errors as login triggers", () => {
      expect(
        parseDwsAuthError("HTTP 403 forbidden: insufficient scope for calendar", 1),
      ).toBeNull();
    });

    it("returns null for unrelated command failures", () => {
      expect(parseDwsAuthError("invalid argument: --foo", 2)).toBeNull();
    });
  });

  describe("parseDeviceLoginOutput", () => {
    it("extracts verification URL and user code from dws device flow stderr", () => {
      const parsed = parseDeviceLoginOutput(`
请在浏览器中打开以下链接，并输入授权码：

  链接: https://login.dingtalk.com/oauth2/device/verify
  授权码: ABCD-EFGH

或者直接打开以下链接：
  https://login.dingtalk.com/oauth2/device/verify?user_code=ABCD-EFGH
`);
      expect(parsed).not.toBeNull();
      expect(parsed!.verificationUrl).toContain("user_code=ABCD-EFGH");
      expect(parsed!.userCode).toBe("ABCD-EFGH");
    });
  });

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
});
