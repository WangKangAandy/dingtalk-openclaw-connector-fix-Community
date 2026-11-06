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

function boundEnv(sender = "alice", corp = "dingA") {
  return { OPENCLAW_SHELL: "exec", ...handleResolveExecEnv({}, {
    messageProvider: "dingtalk-connector", channelId: "conversation-1",
    channelContext: { sender: { id: sender, corpId: corp } },
  }) };
}

describe("dws exec identity", () => {
  it("rejects encrypted DingTalk senderId", () => {
    expect(isBindableSenderId("$:LWCP_v1:$abc")).toBe(false);
    expect(isBindableSenderId("630818072")).toBe(true);
  });

  it("prefers corpId:userId for official dws --profile", () => {
    expect(buildDwsProfile("630818072", "dingcorp")).toBe("dingcorp:630818072");
    expect(() => buildDwsProfile("630818072")).toThrow(DWS_MISSING_SENDER_ERROR);
  });

  it("reads sender from this-call hook ctx, not a global slot", () => {
    const a = readDwsExecIdentity({
      messageProvider: "dingtalk-connector",
      requesterSenderId: "630818072",
      channel: { sender: { id: "630818072", corpId: "dingA" } },
    });
    const b = readDwsExecIdentity({
      messageProvider: "dingtalk-connector",
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
    expect(handleResolveExecEnv({}, PRODUCTION_BEFORE_TOOL_CTX).OPENCLAW_DINGTALK_BOUND).toBe("0");
  });

  it("does not inject --profile on auth login (official rejects unknown exact profiles)", () => {
    expect(argsAreAuthLogin(["auth", "login", "--device"])).toBe(true);
    expect(argsAreAuthLogin(["--profile", "dingA:1", "auth", "login"])).toBe(true);
    expect(argsAreAuthLogin(["auth", "status"])).toBe(false);
    expect(
      bindDwsArgvForExec(["auth", "login", "--device"], {
        OPENCLAW_SHELL: "exec",
        ...boundEnv("630818072"),
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
        ...boundEnv("630818072"),
      }),
    ).toEqual({ argv: ["--profile", "dingA:630818072", "chat", "+dm"] });
    expect(
      bindDwsArgvForExec(["chat", "+dm"], {
        OPENCLAW_SHELL: "exec",
        ...boundEnv("630818072"),
      }),
    ).toEqual({ argv: ["--profile", "dingA:630818072", "chat", "+dm"] });
    expect(readDwsProfileFromExecEnv({ DWS_PROFILE: "dingA:1" })).toBeUndefined();
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
    expect(command).toContain(dwsShimDir());
    expect(command).toContain(DWS_SHIM_NOT_ON_PATH_ERROR);
    expect(command.endsWith(raw)).toBe(true);
    expect(prefixExecCommandWithDwsShim(command)).toBe(command);
    expect(
      handleBeforeToolCall({ toolName: "exec", params: { command: "grep foo" } }, PRODUCTION_BEFORE_TOOL_CTX),
    ).toBeUndefined();
    expect(handleBeforeToolCall({ toolName: "read" }, PRODUCTION_BEFORE_TOOL_CTX)).toBeUndefined();
  });
});


describe("sender binding regressions", () => {
  it("requires a tenant, rejects CSV/selectors, and never borrows another channel identity", () => {
    expect(boundEnv("alice", "").OPENCLAW_DINGTALK_BOUND).toBe("0");
    for (const id of ["a:b", "a,b", "$:encrypted", "two users"]) expect(isBindableSenderId(id)).toBe(false);
    expect(handleResolveExecEnv({}, { messageProvider: "slack", channelId: "dingtalk-connector",
      channelContext: { sender: { id: "alice", corpId: "dingA" } } })).toEqual({});
    expect(readDwsExecIdentity({ messageProvider: "dingtalk-connector", senderId: "bob",
      channelContext: { sender: { id: "alice", corpId: "dingA" } } })).toBeUndefined();
  });
  it("removes every caller profile while preserving payload values and option terminators", () => {
    expect(bindDwsArgvForExec(["--profile", "other:bob", "auth", "status", "--profile=other:carol"], boundEnv()))
      .toEqual({ argv: ["--profile", "dingA:alice", "auth", "status"] });
    expect(injectDwsProfileIntoArgs(["--jq", "--profile", "doc", "--", "--profile=bob"], "dingA:alice"))
      .toEqual(["--profile", "dingA:alice", "--jq", "--profile", "doc", "--", "--profile=bob"]);
  });
  it("keeps first login profile-free across official format flag positions", () => {
    for (const args of [["-f", "json", "auth", "login", "--device"], ["-fjson", "auth", "login"],
      ["auth", "--format", "json", "login"], ["--profile=other:bob", "auth", "login", "--device"]]) {
      const result = bindDwsArgvForExec(args, boundEnv());
      expect(result).not.toHaveProperty("error");
      expect(result.argv?.some(arg => arg.startsWith("--profile"))).toBe(false);
    }
  });
  it("fails closed on inherited or conflicting identity and preserves interactive operator CLI", () => {
    for (const env of [{ OPENCLAW_SHELL: "exec", DWS_PROFILE: "owner:deployer" },
      { ...boundEnv(), OPENCLAW_DINGTALK_CORP_ID: "other" },
      { ...boundEnv(), ...handleResolveExecEnv({}, PRODUCTION_BEFORE_TOOL_CTX) }]) {
      expect(bindDwsArgvForExec(["auth", "status"], env)).toEqual({ error: DWS_MISSING_SENDER_ERROR });
    }
    expect(bindDwsArgvForExec(["--profile", "owner:operator", "auth", "status"],
      { ...boundEnv(), OPENCLAW_SHELL: undefined }).argv).toEqual(["--profile", "owner:operator", "auth", "status"]);
  });
  it("does not let a comment suppress wrapping and keeps each supported shell idempotent", () => {
    const raw = "# OPENCLAW_DWS_SHIM_DIR=\ndws auth status";
    for (const platform of ["linux", "win32"] as const) {
      const wrapped = prefixExecCommandWithDwsShim(raw, platform);
      expect(wrapped).not.toBe(raw);
      expect(prefixExecCommandWithDwsShim(wrapped, platform)).toBe(wrapped);
      expect(wrapped.endsWith(raw)).toBe(true);
    }
    expect(handleBeforeToolCall({ toolName: "exec", params: { command: "dws --version" } },
      { messageProvider: "slack" })).toBeUndefined();
  });
  it("isolates simultaneous senders and corporate profiles without process-global state", async () => {
    const before = process.env.DWS_PROFILE;
    const results = await Promise.all(Array.from({ length: 20 }, async (_, i) =>
      bindDwsArgvForExec(["auth", "status"], boundEnv(`user${i}`, `corp${i % 2}`))));
    results.forEach((r, i) => expect(r.argv?.[1]).toBe(`corp${i % 2}:user${i}`));
    expect(process.env.DWS_PROFILE).toBe(before);
  });
});
