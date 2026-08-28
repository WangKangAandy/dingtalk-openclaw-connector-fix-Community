import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { registerMemoryScope } from "../../src/memory-scope/register.ts"

function jsonToolResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  }
}

describe("memory-scope runtime registration", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("registers middleware and before_tool_call once with the actual contracts", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-scope-register-"))
    tempDirs.push(workspace)
    fs.writeFileSync(path.join(workspace, "MEMORY.md"), "PUBLIC_MARKER", "utf8")
    fs.mkdirSync(path.join(workspace, "memory/users/A"), { recursive: true })
    fs.mkdirSync(path.join(workspace, "memory/users/B"), { recursive: true })
    fs.writeFileSync(path.join(workspace, "memory/users/A/MEMORY.md"), "USER_A_SECRET", "utf8")
    fs.writeFileSync(path.join(workspace, "memory/users/B/MEMORY.md"), "USER_B_SECRET", "utf8")

    const typedHooks = new Map<string, Function>()
    const middlewareRegistrations: Array<{ handler: Function; options: unknown }> = []
    const api = {
      config: {
        session: { dmScope: "per-account-channel-peer" },
        agents: { defaults: { workspace } },
        channels: {
          "dingtalk-connector": {
            separateSessionByConversation: true,
            sharedMemoryAcrossConversations: false,
            groupSessionScope: "group",
            memoryScope: {
              enabled: true,
              syncRootMemoryRules: false,
              syncAgentsMemoryRules: false,
            },
          },
        },
      },
      registerHook() {},
      on(name: string, handler: Function) { typedHooks.set(name, handler) },
      registerAgentToolResultMiddleware(handler: Function, options: unknown) {
        middlewareRegistrations.push({ handler, options })
      },
      logger: { info() {}, warn() {}, error() {} },
    }

    registerMemoryScope(api as never)
    registerMemoryScope(api as never)
    expect(middlewareRegistrations).toHaveLength(1)
    expect(middlewareRegistrations[0]?.options).toEqual({ runtimes: ["openclaw"] })
    expect(typedHooks.has("before_tool_call")).toBe(true)

    const result = await middlewareRegistrations[0]!.handler(
      {
        toolCallId: "call-a",
        toolName: "memory_search",
        args: {},
        result: jsonToolResult({
          results: [
            { source: "memory", path: "MEMORY.md", snippet: "PUBLIC_MARKER" },
            { source: "memory", path: "memory/users/A/MEMORY.md", snippet: "USER_A_SECRET" },
            { source: "memory", path: "memory/users/B/MEMORY.md", snippet: "USER_B_SECRET" },
          ],
        }),
      },
      {
        runtime: "openclaw",
        sessionKey: "agent:main:dingtalk-connector:default:direct:A",
      },
    )
    expect(JSON.stringify(result)).toContain("PUBLIC_MARKER")
    expect(JSON.stringify(result)).toContain("USER_A_SECRET")
    expect(JSON.stringify(result)).not.toContain("USER_B_SECRET")

    const blocked = await typedHooks.get("before_tool_call")!(
      { toolName: "memory_get", params: { path: "memory/users/B/MEMORY.md" } },
      { sessionKey: "agent:main:dingtalk-connector:default:direct:A" },
    )
    expect(blocked).toMatchObject({ block: true })
  })

  it.each([
    ["unavailable", undefined],
    ["registration failure", () => { throw new Error("registration failed") }],
  ])("blocks DingTalk memory_search when result middleware is %s", async (_label, registerMiddleware) => {
    const typedHooks = new Map<string, Function>()
    const errors: string[] = []
    const api = {
      config: {
        session: { dmScope: "per-account-channel-peer" },
        channels: {
          "dingtalk-connector": {
            memoryScope: {
              enabled: true,
              syncRootMemoryRules: false,
              syncAgentsMemoryRules: false,
            },
          },
        },
      },
      registerHook() {},
      on(name: string, handler: Function) { typedHooks.set(name, handler) },
      ...(registerMiddleware
        ? { registerAgentToolResultMiddleware: registerMiddleware }
        : {}),
      logger: { info() {}, warn() {}, error(message: string) { errors.push(message) } },
    }

    registerMemoryScope(api as never)
    const blocked = await typedHooks.get("before_tool_call")!(
      { toolName: "memory_search", params: { query: "secret" } },
      { sessionKey: "agent:main:dingtalk-connector:default:direct:A" },
    )
    expect(blocked).toMatchObject({
      block: true,
      blockReason: expect.stringContaining("result isolation middleware is unavailable"),
    })
    expect(await typedHooks.get("before_tool_call")!(
      { toolName: "memory_search", params: { query: "public" } },
      { sessionKey: "agent:main:webchat:direct:A" },
    )).toBeUndefined()
    expect(errors.join("\n")).toContain("memory_search will be blocked")
  })

  it("does not intercept tools unless memoryScope is explicitly enabled", async () => {
    const typedHooks = new Map<string, Function>()
    const errors: string[] = []
    const api = {
      config: { channels: { "dingtalk-connector": {} } },
      registerHook() {},
      on(name: string, handler: Function) { typedHooks.set(name, handler) },
      logger: { info() {}, warn() {}, error(message: string) { errors.push(message) } },
    }

    registerMemoryScope(api as never)
    expect(await typedHooks.get("before_tool_call")!(
      { toolName: "memory_search", params: { query: "secret" } },
      { sessionKey: "agent:main:dingtalk-connector:direct:A" },
    )).toBeUndefined()
    expect(errors).toEqual([])
  })

  it.each([
    [
      "unsafe dmScope",
      { session: { dmScope: "per-channel-peer" }, accounts: undefined },
      "agent:main:dingtalk-connector:direct:A",
      "session.dmScope must be per-account-channel-peer",
    ],
    [
      "multiple accounts",
      {
        session: { dmScope: "per-account-channel-peer" },
        accounts: { accountA: {}, accountB: {} },
      },
      "agent:main:dingtalk-connector:accounta:direct:A",
      "does not yet support multiple DingTalk accounts",
    ],
  ])("fails closed for %s", async (_label, setup, sessionKey, reason) => {
    const typedHooks = new Map<string, Function>()
    const errors: string[] = []
    const api = {
      config: {
        session: setup.session,
        channels: {
          "dingtalk-connector": {
            accounts: setup.accounts,
            memoryScope: {
              enabled: true,
              syncRootMemoryRules: false,
              syncAgentsMemoryRules: false,
            },
          },
        },
      },
      registerHook() {},
      on(name: string, handler: Function) { typedHooks.set(name, handler) },
      registerAgentToolResultMiddleware() {},
      logger: { info() {}, warn() {}, error(message: string) { errors.push(message) } },
    }

    registerMemoryScope(api as never)
    const blocked = await typedHooks.get("before_tool_call")!(
      { toolName: "memory_search", params: { query: "secret" } },
      { sessionKey },
    )
    expect(blocked).toMatchObject({
      block: true,
      blockReason: expect.stringContaining(reason),
    })
    expect(await typedHooks.get("before_tool_call")!(
      { toolName: "memory_get", params: { path: "MEMORY.md" } },
      { sessionKey },
    )).toMatchObject({
      block: true,
      blockReason: expect.stringContaining(reason),
    })
    expect(errors.join("\n")).toContain(reason)
  })

  it("declares the installed-plugin middleware and memoryScope schema contracts", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve("openclaw.plugin.json"), "utf8"),
    )
    expect(manifest.contracts.agentToolResultMiddleware).toEqual(["openclaw"])
    expect(
      manifest.channelConfigs["dingtalk-connector"].schema.properties.memoryScope
        .additionalProperties,
    ).toBe(false)
    expect(
      manifest.channelConfigs["dingtalk-connector"].schema.properties.accounts
        .additionalProperties.properties.memoryScope,
    ).toBeUndefined()
  })
})
