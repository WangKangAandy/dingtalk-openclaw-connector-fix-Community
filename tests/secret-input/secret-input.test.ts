import { describe, expect, it } from "vitest";
import {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
} from "../../src/secret-input";

describe("secret-input", () => {
  it("accepts plain string secret", () => {
    const schema = buildSecretInputSchema();
    expect(schema.parse("plain-secret")).toBe("plain-secret");
  });

  it("accepts structured secret object", () => {
    const schema = buildSecretInputSchema();
    const value = schema.parse({
      source: "env",
      provider: "system",
      id: "DINGTALK_SECRET",
    });
    expect(value).toEqual({
      source: "env",
      provider: "system",
      id: "DINGTALK_SECRET",
    });
  });

  it("rejects invalid structured secret object", () => {
    const schema = buildSecretInputSchema();
    expect(() =>
      schema.parse({
        source: "env",
        provider: "",
        id: "",
      }),
    ).toThrow();
  });

  it("accepts Host store SecretRef", () => {
    const schema = buildSecretInputSchema();
    const value = schema.parse({
      source: "store",
      provider: "default",
      id: "DINGTALK_CLIENT_SECRET",
    });
    expect(value).toEqual({
      source: "store",
      provider: "default",
      id: "DINGTALK_CLIENT_SECRET",
    });
  });

  it("rejects invalid store SecretRef id", () => {
    const schema = buildSecretInputSchema();
    expect(() =>
      schema.parse({
        source: "store",
        provider: "default",
        id: "dingtalk-secret",
      }),
    ).toThrow();
  });

  it("re-exported helper functions behave as expected", () => {
    expect(hasConfiguredSecretInput("abc")).toBe(true);
    expect(normalizeSecretInputString(" a ")).toBe("a");
    expect(
      normalizeResolvedSecretInputString({
        value: " b ",
        path: "channels.dingtalk-connector.clientSecret",
      }),
    ).toBe("b");
  });
});
