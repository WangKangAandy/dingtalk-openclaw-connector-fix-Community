import { describe, it, expect, vi } from "vitest"
import { dwsIdentity, validateDwsArguments } from "../../src/runtime-tools/dws-policy.ts"
import { ScopeAdmissions, SCOPE_BINDING } from "../../src/memory-scope/admission.ts"
import { registerRuntimeTools } from "../../src/runtime-tools/register.ts"

describe("DingTalk runtime requester boundary", () => {
  it("sends only through the current host route and never accepts a model target", async () => {
    let factory: any; let active = true
    const config = { plugins: { entries: { "dingtalk-connector": { config: { runtimeTools: { enabled: true } } } } } }
    const guard = () => { if (!active) throw new Error("expired") }
    const send = vi.fn().mockResolvedValue(undefined)
    registerRuntimeTools({ config, runtime: { config: { current: () => config } }, registerTool(f: any) { factory = f }, on() {} } as any,
      { assertCurrent: guard, admissions: { requester: () => ({ tenantId: "corp", senderId: "Alice", assertCurrent: guard }) } } as any)
    const file = factory.create({ delivery: { send }, assertInvocationCurrent: guard }).find((t: any) => t.name === "dingtalk_send_file")
    await expect(file.execute("bad", { path: "/workspace/a.txt", target: "other-user" })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    await file.execute("valid", { path: "/workspace/a.txt" }); expect(send).toHaveBeenCalledWith({ mediaUrl: "/workspace/a.txt" })
    active = false; await expect(file.execute("late", { path: "/workspace/b.txt" })).rejects.toThrow("expired")
    expect(send).toHaveBeenCalledTimes(1)
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
  it.each([
    ["auth","export","--base64"],["profile","switch","another"],["dev","app","credentials"],["api","GET","/tokens"],
    ["chat","+messages-send","--profile=corp:other"],["contact","me","--client-secret","secret"],
    ["doc","import","x"],["drive","sync","/home/dws","cloud"],["chat","+messages-send","--file","/home/dws/config"],
    ["contact","me","--mcp-url","https://other"],["contact","me","-p","other"],
  ])("rejects identity/credential/local-IO route %j", (...args) => { expect(()=>validateDwsArguments(args)).toThrow() })
})
