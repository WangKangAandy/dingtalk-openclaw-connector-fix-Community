import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

describe("status-cache", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { _resetDwsOAuthStateForTests } = await import("../../src/dws-oauth.ts");
    _resetDwsOAuthStateForTests();
  });

  afterEach(async () => {
    const { _resetDwsOAuthStateForTests } = await import("../../src/dws-oauth.ts");
    _resetDwsOAuthStateForTests();
  });

  it("caches auth status within TTL", async () => {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === "function") as (
        err: null,
        stdout: string,
        stderr: string,
      ) => void;
      cb?.(null, JSON.stringify({ authenticated: true }), "");
    });

    const { queryDwsAuthStatus } = await import("../../src/dws-oauth.ts");
    const first = await queryDwsAuthStatus("605724761", "acc-1");
    const second = await queryDwsAuthStatus("605724761", "acc-1");

    expect(first.authenticated).toBe(true);
    expect(second.authenticated).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache after login success path", async () => {
    let callCount = 0;
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === "function") as (
        err: null,
        stdout: string,
        stderr: string,
      ) => void;
      callCount += 1;
      const authenticated = callCount === 1;
      cb?.(null, JSON.stringify({ authenticated }), "");
    });

    const { queryDwsAuthStatus, invalidateAuthStatusCache } = await import(
      "../../src/dws-auth/status-cache.ts"
    );
    await queryDwsAuthStatus("642225641");
    invalidateAuthStatusCache("642225641");
    const after = await queryDwsAuthStatus("642225641");

    expect(after.authenticated).toBe(false);
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });
});
