import { describe, expect, it } from "vitest";

describe("denial-parser", () => {
  it("parses DWS_AUTH_DENIAL contract line", async () => {
    const { parseLoginDenial } = await import("../../src/dws-auth/denial-parser.ts");
    const output = [
      "Step 4 checking...",
      "DWS_AUTH_DENIAL reason=user_not_allowed",
      "⚠️  您不在该组织的 CLI 授权人员范围内",
    ].join("\n");
    const parsed = parseLoginDenial(output);
    expect(parsed).toEqual({
      denialReason: "user_not_allowed",
      message: "您不在该组织的 CLI 授权人员范围内",
    });
  });

  it("maps cli_not_enabled from contract line", async () => {
    const { parseLoginDenial } = await import("../../src/dws-auth/denial-parser.ts");
    const parsed = parseLoginDenial("DWS_AUTH_DENIAL reason=cli_not_enabled\n");
    expect(parsed?.denialReason).toBe("cli_not_enabled");
  });

  it("maps auth_denied from contract line", async () => {
    const { parseLoginDenial } = await import("../../src/dws-auth/denial-parser.ts");
    const parsed = parseLoginDenial("DWS_AUTH_DENIAL reason=auth_denied\n");
    expect(parsed?.denialReason).toBe("auth_denied");
  });

  it("falls back to Chinese stderr when contract line missing", async () => {
    const { parseLoginDenial } = await import("../../src/dws-auth/denial-parser.ts");
    const parsed = parseLoginDenial("⚠️  您不在该组织的 CLI 授权人员范围内");
    expect(parsed?.denialReason).toBe("user_not_allowed");
  });

  it("prefers contract line over fallback text", async () => {
    const { parseLoginDenial } = await import("../../src/dws-auth/denial-parser.ts");
    const output = [
      "DWS_AUTH_DENIAL reason=auth_denied",
      "该组织尚未开启 CLI 数据访问权限",
    ].join("\n");
    const parsed = parseLoginDenial(output);
    expect(parsed?.denialReason).toBe("auth_denied");
  });
});
