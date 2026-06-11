import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExecFile = vi.hoisted(() => vi.fn());
const mockSendProactive = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  execFile: mockExecFile,
}));

vi.mock("../../src/services/messaging/index.ts", () => ({
  sendProactive: mockSendProactive,
}));

function createMockLoginProc(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  Object.assign(proc, {
    pid: 4242,
    killed: false,
    kill: vi.fn(),
    stdout,
    stderr,
  });
  return proc;
}

describe("ensureDwsAuth gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockSendProactive.mockResolvedValue(undefined);
    const { _resetDwsOAuthStateForTests } = await import("../../src/dws-oauth.ts");
    _resetDwsOAuthStateForTests();
  });

  afterEach(async () => {
    const { _resetDwsOAuthStateForTests } = await import("../../src/dws-oauth.ts");
    _resetDwsOAuthStateForTests();
  });

  it("returns enterAgent=true when auth status is authenticated", async () => {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === "function") as (
        err: null,
        stdout: string,
        stderr: string,
      ) => void;
      cb?.(null, JSON.stringify({ authenticated: true }), "");
    });

    const { ensureDwsAuth, isSenderAuthenticated } = await import("../../src/dws-oauth.ts");
    const result = await ensureDwsAuth({
      senderId: "605724761",
      accountId: "acc-1",
      config: { clientId: "app", clientSecret: "secret" },
      isDirect: true,
      conversationId: "605724761",
    });

    expect(result).toEqual({ enterAgent: true, status: "ready" });
    expect(await isSenderAuthenticated("605724761", "acc-1")).toBe(true);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("returns enterAgent=false and spawns login when not authenticated", async () => {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === "function") as (
        err: null,
        stdout: string,
        stderr: string,
      ) => void;
      cb?.(null, JSON.stringify({ authenticated: false }), "");
    });
    const proc = createMockLoginProc();
    mockSpawn.mockReturnValue(proc);

    const { ensureDwsAuth } = await import("../../src/dws-oauth.ts");
    const result = await ensureDwsAuth({
      senderId: "642225641",
      config: { clientId: "app", clientSecret: "secret" },
      isDirect: true,
      conversationId: "642225641",
      userMessage: "帮我搜文档",
    });

    expect(result.enterAgent).toBe(false);
    expect(result.status).toBe("pending");
    expect(mockSpawn).toHaveBeenCalled();
  });
});
