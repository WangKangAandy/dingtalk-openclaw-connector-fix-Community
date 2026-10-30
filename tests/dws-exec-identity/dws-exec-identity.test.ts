import { describe, expect, it, vi } from "vitest";
import {
  buildDingtalkChannelContext,
  buildDwsProfile,
  commandInvokesDws,
  handleBeforeToolCall,
  handleResolveExecEnv,
  injectDwsProfileArgv,
  injectDwsProfileCommand,
  isBindableSenderId,
  readDwsExecIdentity,
  registerDwsExecIdentity,
} from "../../src/dws-exec-identity.ts";

describe("dws exec identity", () => {
  it("rejects encrypted DingTalk senderId", () => {
    expect(isBindableSenderId("$:LWCP_v1:$abc")).toBe(false);
    expect(isBindableSenderId("630818072")).toBe(true);
  });

  it("prefers corpId:userId for official dws --profile", () => {
    expect(buildDwsProfile("630818072", "dingcorp")).toBe("dingcorp:630818072");
    expect(buildDwsProfile("630818072")).toBe("630818072");
  });

  it("reads sender from this-call hook ctx, not a global slot", () => {
    const a = readDwsExecIdentity({
      requesterSenderId: "630818072",
      channel: { sender: { id: "630818072", corpId: "dingA" } },
    });
    const b = readDwsExecIdentity({
      requester: { senderId: "645000001" },
      channelContext: { sender: { id: "645000001", corpId: "dingA" } },
    });
    expect(a?.profile).toBe("dingA:630818072");
    expect(b?.profile).toBe("dingA:645000001");
  });

  it("detects dws in command or argv", () => {
    expect(commandInvokesDws("dws chat +dm --name x")).toBe(true);
    expect(commandInvokesDws("/home/mccxadmin/.local/bin/dws calendar event list")).toBe(true);
    expect(commandInvokesDws("ls /tmp", ["dws", "auth", "status"])).toBe(true);
    expect(commandInvokesDws("echo hello")).toBe(false);
  });

  it("injects --profile after the dws token and overwrites a mismatched flag", () => {
    expect(injectDwsProfileCommand("dws chat +dm --name 郭廷炜", "dingA:630818072")).toBe(
      "dws --profile dingA:630818072 chat +dm --name 郭廷炜",
    );
    expect(
      injectDwsProfileCommand("dws --profile other:1 chat +dm", "dingA:630818072"),
    ).toBe("dws --profile dingA:630818072 chat +dm");
    expect(injectDwsProfileArgv(["dws", "chat", "+dm"], "dingA:1")).toEqual([
      "dws",
      "--profile",
      "dingA:1",
      "chat",
      "+dm",
    ]);
  });

  it("blocks dws exec when this turn has no bindable sender", () => {
    const result = handleBeforeToolCall(
      { toolName: "exec", params: { command: "dws chat +dm --name x" } },
      {},
    );
    expect(result?.block).toBe(true);
    expect(result?.blockReason).toMatch(/currentProfile/);
  });

  it("leaves non-dws exec alone so concurrent shell is unaffected", () => {
    expect(
      handleBeforeToolCall({ toolName: "exec", params: { command: "uname -a" } }, {}),
    ).toBeUndefined();
  });

  it("rewrites this exec only, so two concurrent senders keep distinct profiles", () => {
    const feng = handleBeforeToolCall(
      { toolName: "exec", params: { command: "dws chat +dm --name 郭廷炜 --text 你真帅" } },
      { requesterSenderId: "630818072", channel: { sender: { corpId: "dingA", id: "630818072" } } },
    );
    const guo = handleBeforeToolCall(
      { toolName: "exec", params: { command: "dws calendar event list" } },
      { requesterSenderId: "645000001", channel: { sender: { corpId: "dingA", id: "645000001" } } },
    );
    expect(feng?.params?.command).toContain("--profile dingA:630818072");
    expect(guo?.params?.command).toContain("--profile dingA:645000001");
    expect(feng?.params?.command).not.toContain("645000001");
  });

  it("resolve_exec_env copies identity onto this child env only", () => {
    const env = handleResolveExecEnv(
      { toolName: "exec" },
      { requesterSenderId: "630818072", channel: { sender: { id: "630818072", corpId: "dingA" } } },
    );
    expect(env.DWS_PROFILE).toBe("dingA:630818072");
    expect(env.DWS_AUTH_IDENTITY).toBe("630818072");
    expect(handleResolveExecEnv({}, {})).toEqual({});
  });

  it("builds inbound channelContext for OpenClaw exec copy", () => {
    expect(
      buildDingtalkChannelContext({
        senderId: "630818072",
        corpId: "dingA",
        chatId: "cid1",
      }),
    ).toEqual({
      sender: { id: "630818072", corpId: "dingA" },
      chat: { id: "cid1" },
    });
  });

  it("registers per-call hooks instead of touching process.env", () => {
    const on = vi.fn();
    registerDwsExecIdentity({ on });
    const names = on.mock.calls.map((call) => call[0]);
    expect(names).toContain("before_tool_call");
    expect(names).toContain("resolve_exec_env");
  });
});
