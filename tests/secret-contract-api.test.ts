import { describe, expect, it } from "vitest";
import {
  channelSecrets,
  collectRuntimeConfigAssignments,
  secretTargetRegistryEntries,
} from "../secret-contract-api.ts";

describe("secret-contract-api", () => {
  it("re-exports Host secret contract artifacts", () => {
    expect(channelSecrets).toMatchObject({
      channelKey: "dingtalk-connector",
      accountFields: ["clientSecret"],
      channelFields: ["clientSecret"],
    });
    expect(secretTargetRegistryEntries).toEqual([]);
    expect(collectRuntimeConfigAssignments()).toEqual({});
  });
});
