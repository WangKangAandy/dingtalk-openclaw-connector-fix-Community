import { describe, expect, it } from "vitest"
import { resolveScopedLearnCommand as resolve } from "../../src/memory-scope/scoped-workshop/learn-command.ts"

const config = {
  skills: { workshop: { autonomous: { mode: "off" } } },
  channels: { "dingtalk-connector": { memoryScope: { scopedLearning: { enabled: true, mode: "off" } } } },
}

describe("DingTalk scoped /learn", () => {
  it.each(["/learner", "/learned", "please /learn", "/learn/list", "/new", "hello"])("leaves %s untouched", text => {
    expect(resolve(text, config)).toBeNull()
  })
  it.each(["/learn", " /LEARN  ", "/learn 排查超时\n保留已验证步骤"])("allows explicit learning with automatic review off: %s", text => {
    const result = resolve(text, config)!
    expect(result.kind).toBe("prompt")
    expect(result.text).toContain("scoped_skill_workshop")
    expect(result.text).toContain("revision")
    expect(result.text).not.toMatch(/^\s*\//)
  })
  it.each([
    ["/learn list", { action: "list" }],
    ["/learn view diagnose-request", { action: "view", name: "diagnose-request" }],
    ["/learn undo diagnose-request", { action: "restore", name: "diagnose-request" }],
  ])("maps %s to an existing tool operation", (text, operation) => {
    expect(resolve(text as string, config)).toMatchObject({ kind: "prompt" })
    expect(resolve(text as string, config)!.text).toContain(JSON.stringify(operation))
  })
  it.each(["/learn list extra", "/learn view", "/learn undo", "/learn undo ../alice", "/learn view two names", "/learn undo UPPER", "/learn help"])("returns usage for %s without invoking a model", text => {
    expect(resolve(text, config)).toMatchObject({ kind: "reply", text: expect.stringContaining("用法") })
  })
  it.each([{}, { channels: { "dingtalk-connector": { memoryScope: { enabled: false, scopedLearning: { enabled: true } } } } }])("does not fall through to native learning when disabled", cfg => {
    expect(resolve("/learn", cfg)).toMatchObject({ kind: "reply", text: expect.stringContaining("未启用") })
  })
  it("fails closed for global Workshop on or malformed configuration", () => {
    expect(resolve("/learn", { ...config, skills: {} })).toMatchObject({ kind: "reply", text: expect.stringContaining("配置不可用") })
    expect(resolve("/learn", { channels: { "dingtalk-connector": { memoryScope: { scopedLearning: { enabled: "yes" } } } } })).toMatchObject({ kind: "reply" })
  })
})
