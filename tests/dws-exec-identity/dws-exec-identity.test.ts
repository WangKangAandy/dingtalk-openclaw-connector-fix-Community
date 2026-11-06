import { describe, expect, it, vi } from "vitest";
import {
  argsAreAuthLogin,
  bindDwsArgvForExec,
  buildDingtalkChannelContext,
  buildDwsProfile,
  dwsShimDir,
  DWS_MISSING_SENDER_ERROR,
  DWS_SHIM_NOT_ON_PATH_ERROR,
  handleBeforeToolCall,
  handleResolveExecEnv,
  injectDwsProfileIntoArgs,
  isBindableSenderId,
  prefixExecCommandWithDwsShim,
  readDwsExecIdentity,
  readDwsProfileFromExecEnv,
  registerDwsExecIdentity,
} from "../../src/dws-exec-identity.ts";

const PRODUCTION_BEFORE_TOOL_CTX = {
  toolName: "exec",
  agentId: "main",
  sessionKey: "agent:main:dingtalk-connector:direct:630818072",
  sessionId: "sess-1",
  runId: "run-1",
  toolCallId: "call-1",
  channelId: "dingtalk-connector",
};

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

  it("resolve_exec_env copies identity from production channelContext onto this child env only", () => {
    const env = handleResolveExecEnv(
      { toolName: "exec" },
      {
        agentId: "main",
        sessionKey: "agent:main:dingtalk-connector:direct:630818072",
        channelId: "dingtalk-connector",
        channelContext: { sender: { id: "630818072", corpId: "dingA" } },
      },
    );
    expect(env.DWS_PROFILE).toBe("dingA:630818072");
    expect(env.DWS_AUTH_IDENTITY).toBeUndefined();
    expect(env.PATH).toBeUndefined();
    expect(handleResolveExecEnv({}, PRODUCTION_BEFORE_TOOL_CTX)).toEqual({});
  });

  it("does not inject --profile on auth login (official rejects unknown exact profiles)", () => {
    expect(argsAreAuthLogin(["auth", "login", "--device"])).toBe(true);
    expect(argsAreAuthLogin(["--profile", "dingA:1", "auth", "login"])).toBe(true);
    expect(argsAreAuthLogin(["auth", "status"])).toBe(false);
    expect(
      bindDwsArgvForExec(["auth", "login", "--device"], {
        OPENCLAW_SHELL: "exec",
        DWS_PROFILE: "dingA:630818072",
      }),
    ).toEqual({ argv: ["auth", "login", "--device"] });
  });

  it("PATH shim binds --profile from this exec env, including OpenClaw channel JSON", () => {
    expect(injectDwsProfileIntoArgs(["auth", "status"], "dingA:1")).toEqual([
      "--profile",
      "dingA:1",
      "auth",
      "status",
    ]);
    expect(
      bindDwsArgvForExec(["chat", "+dm"], {
        OPENCLAW_SHELL: "exec",
        DWS_PROFILE: "dingA:630818072",
      }),
    ).toEqual({ argv: ["--profile", "dingA:630818072", "chat", "+dm"] });
    expect(
      bindDwsArgvForExec(["chat", "+dm"], {
        OPENCLAW_SHELL: "exec",
        OPENCLAW_CHANNEL_CONTEXT: JSON.stringify({ sender: { id: "630818072" } }),
        OPENCLAW_DINGTALK_CORP_ID: "dingA",
      }),
    ).toEqual({ argv: ["--profile", "dingA:630818072", "chat", "+dm"] });
    expect(readDwsProfileFromExecEnv({ DWS_PROFILE: "dingA:1" })).toBe("dingA:1");
  });

  it("PATH shim fail-closes OpenClaw exec without a sender and passes through human CLI", () => {
    expect(bindDwsArgvForExec(["auth", "status"], { OPENCLAW_SHELL: "exec" })).toEqual({
      error: DWS_MISSING_SENDER_ERROR,
    });
    expect(bindDwsArgvForExec(["auth", "status"], {})).toEqual({
      argv: ["auth", "status"],
    });
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

  it("registers resolve_exec_env and before_tool_call instead of touching process.env", () => {
    const on = vi.fn();
    registerDwsExecIdentity({ on });
    expect(on.mock.calls.map((call) => call[0])).toEqual([
      "resolve_exec_env",
      "before_tool_call",
    ]);
  });

  it("before_tool_call only rewrites dws exec and fail-closes if command -v dws is not the shim", () => {
    const raw = "command -v dws; dws auth status --format json";
    const result = handleBeforeToolCall(
      { toolName: "exec", params: { command: raw } },
      PRODUCTION_BEFORE_TOOL_CTX,
    );
    const command = result?.params.command ?? "";
    expect(command).toContain(`export PATH='${dwsShimDir()}'`);
    expect(command).toContain(DWS_SHIM_NOT_ON_PATH_ERROR);
    expect(command.endsWith(raw)).toBe(true);
    expect(prefixExecCommandWithDwsShim(command)).toBe(command);
    expect(
      handleBeforeToolCall({ toolName: "exec", params: { command: "grep foo" } }, PRODUCTION_BEFORE_TOOL_CTX),
    ).toBeUndefined();
    expect(handleBeforeToolCall({ toolName: "read" }, PRODUCTION_BEFORE_TOOL_CTX)).toBeUndefined();
  });
});
