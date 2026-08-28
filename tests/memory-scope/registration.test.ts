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
      logger: { info() {}, warn() {} },
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

  it("declares the installed-plugin middleware and memoryScope schema contracts", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve("openclaw.plugin.json"), "utf8"),
    )
    expect(manifest.contracts.agentToolResultMiddleware).toEqual(["openclaw"])
    expect(
      manifest.channelConfigs["dingtalk-connector"].schema.properties.memoryScope
        .additionalProperties,
    ).toBe(false)
  })
})
