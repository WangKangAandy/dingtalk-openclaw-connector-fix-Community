import { describe, it, expect, vi } from "vitest"
import { dwsIdentity, validateDwsArguments } from "../../src/runtime-tools/dws-policy.ts"
import { ScopeAdmissions, SCOPE_BINDING } from "../../src/memory-scope/admission.ts"
import { registerRuntimeTools } from "../../src/runtime-tools/register.ts"
import { assertAuthorizedMediaReadAllowed, configureOutboundMediaPolicy } from "../../src/services/media/outbound-policy.ts"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

vi.mock("node:child_process", () => ({ spawn: vi.fn() }))

describe("DingTalk runtime requester boundary", () => {
  it("uses the bound DWS tool without a second Host approval gate", () => {
    const hooks = new Map<string, Function>()
    const config = { plugins: { entries: { "dingtalk-connector": { config: { runtimeTools: { enabled: true } } } } } }
    registerRuntimeTools({ config, runtime: { config: { current: () => config } }, registerTool() {},
      on(name: string, handler: Function) { hooks.set(name, handler) } } as any,
      { assertCurrent() {}, admissions: {} } as any)
    expect(hooks.has("before_tool_call")).toBe(false)
    expect(validateDwsArguments(["contact", "+me", "--yes"])).toEqual(["contact", "+me", "--yes"])
    expect(() => validateDwsArguments(["contact", "+me", "--profile", "other", "--yes"])).toThrow(/host-controlled/)
  })
  it.each([0, 3])("preserves CLI output in the Code Mode result projection (exit %i)", async (exitCode) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dws-contract-"))
    // Windows temp paths may contain a platform-managed junction. The deployment
    // is Linux; use the canonical root so this test exercises its directory rule.
    const stateRoot = fs.realpathSync(root)
    const stdout = JSON.stringify({ name: "Alice", corpId: "corp" })
    const stderr = exitCode ? JSON.stringify({ error: { reason: "permission_denied", retryable: false } }) : ""
    vi.mocked(spawn).mockImplementation(((_cmd: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
      queueMicrotask(() => {
        if (args[0] === "run") { child.stdout.write(stdout); child.stderr.write(stderr) }
        child.emit("close", args[0] === "run" ? exitCode : 0)
      })
      return child
    }) as any)
    try {
      let factory: any
      const config = { plugins: { entries: { "dingtalk-connector": { config: { runtimeTools: { enabled: true, dwsImage: `sha256:${"a".repeat(64)}`, dwsStateRoot: stateRoot } } } } } }
      registerRuntimeTools({ config, runtime: { config: { current: () => config } }, registerTool(f: any) { factory = f }, on() {} } as any,
        { assertCurrent() {}, admissions: { requester: () => ({ tenantId: "corp", senderId: "Alice", assertCurrent() {} }) } } as any)
      const tool = factory.create({ assertInvocationCurrent() {} }).find((t: any) => t.name === "dingtalk_dws")
      const result = await tool.execute("business", { args: ["contact", "+me", "--yes"] })
      expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(expect.arrayContaining(["--profile", "corp:Alice", "contact", "+me", "--yes"]))
      expect(result.details).toEqual({ profile: "corp:Alice", exitCode, stdout, stderr })
      expect(JSON.parse(result.content[0].text)).toEqual(result.details)
      expect(result.isError).toBe(exitCode !== 0)
    } finally { fs.rmSync(root, { recursive: true, force: true }); vi.mocked(spawn).mockReset() }
  })
  it("sends only through the current host route and never accepts a model target", async () => {
    let factory: any; let active = true
    const config = { plugins: { entries: { "dingtalk-connector": { config: { runtimeTools: { enabled: true } } } } } }
    const guard = () => { if (!active) throw new Error("expired") }
    const send = vi.fn().mockResolvedValue(undefined)
    registerRuntimeTools({ config, runtime: { config: { current: () => config } }, registerTool(f: any) { factory = f }, on() {} } as any,
      { assertCurrent: guard, admissions: { requester: () => ({ tenantId: "corp", senderId: "Alice", assertCurrent: guard }) } } as any)
    const file = factory.create({ delivery: { send }, assertInvocationCurrent: guard }).find((t: any) => t.name === "dingtalk_send_file")
    expect(file.parameters.type).toBe("object")
    expect(file.parameters.oneOf).toHaveLength(2)
    expect(file.parameters.oneOf.map((v: any) => v.required)).toEqual(expect.arrayContaining([["workspaceRelativePath"], ["path"]]))
    await expect(file.execute("bad", { workspaceRelativePath: "/workspace/a.txt", target: "other-user" })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    for (const path of ["/workspace/a.txt", "../other/a.txt", "reports/../../a.txt", "file:///home/dws/keyring", "C:\\secret.txt", "https://example.com/a", "~/a.txt"]) {
      await expect(file.execute("outside", { workspaceRelativePath: path })).rejects.toThrow()
    }
    expect(send).not.toHaveBeenCalled()
    await file.execute("valid", { workspaceRelativePath: "reports/a.txt" }); expect(send).toHaveBeenCalledWith({ mediaUrl: "reports/a.txt" })
    await file.execute("legacy", { path: "reports/a.txt" }); expect(send).toHaveBeenCalledWith({ mediaUrl: "reports/a.txt" })
    await expect(file.execute("legacy-outside", { path: "../openclaw.json" })).rejects.toThrow()
    active = false; await expect(file.execute("late", { workspaceRelativePath: "b.txt" })).rejects.toThrow("expired")
    expect(send).toHaveBeenCalledTimes(2)
  })
  it("limits blocked-media bypass to the authorized file delivery call", async () => {
    let factory: any
    const config = { plugins: { entries: { "dingtalk-connector": { config: { runtimeTools: { enabled: true } } } } } }
    const send = vi.fn(async () => { assertAuthorizedMediaReadAllowed() })
    registerRuntimeTools({ config, runtime: { config: { current: () => config } }, registerTool(f: any) { factory = f }, on() {} } as any,
      { assertCurrent() {}, admissions: { requester: () => ({ tenantId: "corp", senderId: "Alice", assertCurrent() {} }) } } as any)
    const file = factory.create({ delivery: { send }, assertInvocationCurrent() {} }).find((t: any) => t.name === "dingtalk_send_file")
    configureOutboundMediaPolicy(true)
    try {
      await file.execute("send", { workspaceRelativePath: "report.txt" })
      expect(send).toHaveBeenCalledOnce()
      expect(() => assertAuthorizedMediaReadAllowed()).toThrow()
    } finally { configureOutboundMediaPolicy(false) }
  })
  it("keeps DWS identity private per sender even for a shared group", () => {
    const registry = new ScopeAdmissions()
    const input = {tenantId:"corp",accountId:"bot",agentId:"main",senderId:"Alice",chatType:"group" as const,conversationId:"cid-group"}
    const a=registry.begin(input,()=>{})
    const context=(admission:typeof a,sender:string)=>({agentId:"main",agentAccountId:"bot",messageChannel:"dingtalk-connector",requesterSenderId:sender,nativeChannelId:"cid-group",sessionId:"physical",sessionKey:admission.sessionKey,toolBindings:{[SCOPE_BINDING]:admission.token},assertInvocationCurrent(){}})
    const alice=registry.requester(context(a,"Alice")); expect(alice.senderId).toBe("Alice")
    expect(()=>registry.requester(context(a,"Bob"))).toThrow("requesterSenderId")
    const b=registry.begin({...input,senderId:"Bob"},()=>{});const bob=registry.requester(context(b,"Bob"))
    expect(a.sessionKey).toBe(b.sessionKey)
    expect(dwsIdentity(alice.tenantId,alice.senderId).directory).not.toBe(dwsIdentity(bob.tenantId,bob.senderId).directory)
    expect(()=>alice.assertCurrent()).toThrow();expect(()=>bob.assertCurrent()).not.toThrow()
    registry.invalidateSession(b.sessionKey);expect(()=>bob.assertCurrent()).toThrow()
  })
  it("preserves normal cloud commands without interpreting shell metacharacters", () => {
    const args=["chat","+messages-send","--text","hello; $(whoami)","--group","cid-test","--yes"]
    expect(validateDwsArguments(args)).toEqual(args)
    expect(validateDwsArguments(["schema","--cli-path","calendar event list"])).toHaveLength(3)
  })
  it("rejects local actions regardless of global flag placement, but keeps flag values as data", () => {
    for (const args of [
      ["drive", "download", "--node", "synthetic"],
      ["drive", "--yes", "download", "--node", "synthetic"],
      ["drive", "--format", "json", "--yes", "sync", "cloud"],
      ["drive", "--yes", "+download", "--node", "synthetic"],
      ["drive", "download-version", "--node", "synthetic", "--version", "1"],
      ["mail", "message", "export", "--email", "test@example.invalid", "--id", "synthetic"],
      ["mail", "message", "--yes", "export", "--email", "test@example.invalid", "--id", "synthetic"],
      ["mail", "attachment", "--format=json", "download", "--id", "synthetic"],
    ]) expect(() => validateDwsArguments(args)).toThrow(/authorized file tool/)
    expect(validateDwsArguments(["chat", "+messages-send", "--text", "download"])).toEqual(["chat", "+messages-send", "--text", "download"])
    expect(validateDwsArguments(["chat", "message", "send", "--group", "synthetic", "--title", "probe", "download", "--yes"])).toEqual([
      "chat", "message", "send", "--group", "synthetic", "--title", "probe", "download", "--yes",
    ])
    expect(validateDwsArguments(["chat", "message", "send", "download", "--group", "synthetic", "--title", "probe", "--yes"])).toEqual([
      "chat", "message", "send", "download", "--group", "synthetic", "--title", "probe", "--yes",
    ])
    expect(validateDwsArguments(["doc", "media", "download", "--node", "DOC_ID", "--resource-id", "RESOURCE_ID"])).toEqual([
      "doc", "media", "download", "--node", "DOC_ID", "--resource-id", "RESOURCE_ID",
    ])
    expect(() => validateDwsArguments(["doc", "+media-download", "--node", "DOC_ID", "--resource-id", "RESOURCE_ID"])).toThrow(/authorized file tool/)
  })
  it.each([
    ["auth","export","--base64"],["profile","switch","another"],["dev","app","credentials"],["api","GET","/tokens"],
    ["chat","+messages-send","--profile=corp:other"],["contact","me","--client-secret","secret"],
    ["doc","import","x"],["drive","sync","/home/dws","cloud"],["chat","+messages-send","--file","/home/dws/config"],
    ["contact","me","--mcp-url","https://other"],["contact","me","-p","other"],
    ["contact","+me","--delegator-user-id","Bob"], ["doc","+create","--content","@/home/dws/config"],
    ["doc","+create","--content= @/home/dws/config"], ["chat","+messages-send","--groups-file","credentials"],
    ["doc","+create","--content","![secret](/home/dws/config)"],
  ])("rejects identity/credential/local-IO route %j", (...args) => { expect(()=>validateDwsArguments(args)).toThrow() })
})
