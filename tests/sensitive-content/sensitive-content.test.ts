import { expect, it, vi } from "vitest"
import { classifyWithAgent } from "../../src/sensitive-content/classifier.ts"
import { P3_REPLY, P4_REPLY } from "../../src/sensitive-content/index.ts"

const config = { agents: { defaults: { models: { "mtcode/deepseek-flash": { alias: "deepseek-flash" } } } } }
function harness(text: string) {
  const runEmbeddedAgent = vi.fn().mockResolvedValue({ payloads: [{ text }], meta: {} })
  return { agent: { runEmbeddedAgent, resolveAgentWorkspaceDir: () => "/tmp" } }
}
it.each([
  ["allow_procedure", "none", undefined],
  ["allow_general", "none", undefined],
  ["block_p3", "P3", P3_REPLY],
  ["block_p4", "P4", P4_REPLY],
  ["review", "none", undefined],
])("routes %s", async (decision, level, reply) => {
  const runtime = harness(JSON.stringify({ decision, level, confidence: 0.99 }))
  expect(await classifyWithAgent(runtime, config, "我的工资是多少")).toEqual({ decision, reply })
  expect(runtime.agent.runEmbeddedAgent.mock.calls[0][0]).toMatchObject({
    provider: "mtcode", model: "deepseek-flash", config, modelFallbacksOverride: [],
    sessionKey: expect.stringMatching(/^agent:main:sensitive-policy:/),
    disableTools: true, disableMessageTool: true, modelRun: true,
  })
})
it.each(["", "invalid", '{"decision":"allow_general"}',
  '{"decision":"allow_general","level":"P3","confidence":1}',
  '{"decision":"allow_general","level":"none","confidence":2}',
])("allows non-P3/P4 invalid output %s", async text => {
  expect((await classifyWithAgent(harness(text), config, "你好")).decision).toBe("allow_general")
  expect((await classifyWithAgent(harness(text), config, "你好")).reply).toBeUndefined()
})
it("allows missing runtime or model and thrown errors", async () => {
  expect((await classifyWithAgent({}, config, "你好")).decision).toBe("allow_general")
  const runtime = harness("")
  expect((await classifyWithAgent(runtime, {}, "你好")).decision).toBe("allow_general")
  expect(runtime.agent.runEmbeddedAgent).not.toHaveBeenCalled()
  runtime.agent.runEmbeddedAgent.mockRejectedValue(new Error("provider error"))
  expect((await classifyWithAgent(runtime, config, "你好")).decision).toBe("allow_general")
})
it("uses distinct sessions per call", async () => {
  const runtime = harness('{"decision":"allow_general","level":"none","confidence":1}')
  await classifyWithAgent(runtime, config, "你好")
  await classifyWithAgent(runtime, config, "你好")
  expect(runtime.agent.runEmbeddedAgent.mock.calls[0][0].sessionKey)
    .not.toBe(runtime.agent.runEmbeddedAgent.mock.calls[1][0].sessionKey)
})
