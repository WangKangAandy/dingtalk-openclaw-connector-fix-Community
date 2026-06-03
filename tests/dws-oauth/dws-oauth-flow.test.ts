import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.hoisted(() => vi.fn());
const mockSendProactive = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
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

describe("dws-oauth auth push flow", () => {
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

  it("spawns per-sender login and pushes device link on IDENTITY_NOT_AUTHENTICATED", async () => {
    const proc = createMockLoginProc();
    mockSpawn.mockReturnValue(proc);

    const { handleDwsAuthCommandOutput } = await import("../../src/dws-oauth.ts");
    const config = { clientId: "app", clientSecret: "secret" };

    await handleDwsAuthCommandOutput({
      phase: "end",
      exitCode: 5,
      output:
        '{"code":"IDENTITY_NOT_AUTHENTICATED","identity":"623656500","senderId":"623656500"}',
      senderId: "623656500",
      accountId: "acc-1",
      config,
      isDirect: true,
      conversationId: "623656500",
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "dws",
      ["auth", "login", "--sender-id", "623656500", "--device"],
      expect.objectContaining({
        env: expect.objectContaining({ DWS_AUTH_IDENTITY: "623656500" }),
      }),
    );

    proc.stdout?.emit(
      "data",
      Buffer.from(
        "https://login.dingtalk.com/oauth2/device/verify.htm?user_code=ABCD-EFGH\n",
      ),
    );

    await vi.waitFor(() => {
      expect(mockSendProactive).toHaveBeenCalled();
    });

    const [, target, text] = mockSendProactive.mock.calls[0] ?? [];
    expect(target).toEqual({ userId: "623656500" });
    expect(String(text)).toContain("user_code=ABCD-EFGH");
  });

  it("ignores command output before phase end", async () => {
    const { handleDwsAuthCommandOutput } = await import("../../src/dws-oauth.ts");

    await handleDwsAuthCommandOutput({
      phase: "start",
      exitCode: 5,
      output: '{"code":"IDENTITY_NOT_AUTHENTICATED","senderId":"x"}',
      senderId: "x",
      config: { clientId: "app", clientSecret: "secret" },
      isDirect: true,
      conversationId: "x",
    });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockSendProactive).not.toHaveBeenCalled();
  });

  it("pushes mismatch message without spawning login", async () => {
    const { handleDwsAuthCommandOutput } = await import("../../src/dws-oauth.ts");

    await handleDwsAuthCommandOutput({
      phase: "end",
      exitCode: 1,
      output: '{"code":"IDENTITY_MISMATCH","expected":"a","actual":"b"}',
      senderId: "user-a",
      config: { clientId: "app", clientSecret: "secret" },
      isDirect: true,
      conversationId: "user-a",
    });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockSendProactive).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-a" },
      expect.stringContaining("扫码账号与当前钉钉用户不一致"),
      expect.any(Object),
    );
  });
});
