import path from "node:path"
import { describe, expect, it } from "vitest"

import { __memoryScopeTestables } from "../../src/memory-scope/testables.ts"

const {
  parseDingtalkMemoryScope,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
  evaluateMemoryToolCall,
  applyScopedBootstrapFiles,
  resolveMemoryScopeConfig,
} = __memoryScopeTestables

const WORKSPACE = "/tmp/openclaw-workspace"

describe("memory-scope", () => {
  describe("parseDingtalkMemoryScope", () => {
    it("parses direct session keys", () => {
      const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")
      expect(scope).toEqual({
        channel: "dingtalk-connector",
        chatType: "direct",
        peerId: "605725474",
        scopeDir: "memory/users/605725474",
        memoryFile: "memory/users/605725474/MEMORY.md",
        sessionKey: "agent:main:dingtalk-connector:direct:605725474",
      })
    })

    it("parses group session keys", () => {
      const scope = parseDingtalkMemoryScope(
        "agent:main:dingtalk-connector:group:cidwehulkpow31fronzu/vqqw==",
      )
      expect(scope?.chatType).toBe("group")
      expect(scope?.scopeDir).toBe("memory/groups/cidwehulkpow31fronzu_vqqw==")
    })

    it("parses group_sender style peer ids", () => {
      const scope = parseDingtalkMemoryScope(
        "agent:main:dingtalk-connector:group:conv123:605725474",
      )
      expect(scope?.scopeDir).toBe("memory/groups/conv123/users/605725474")
    })

    it("returns null for non-dingtalk sessions", () => {
      expect(parseDingtalkMemoryScope("agent:main:webchat:direct:user")).toBeNull()
    })
  })

  describe("isPathAllowedForScope", () => {
    const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")!

    it("allows non-memory workspace paths", () => {
      expect(isPathAllowedForScope(scope, "AGENTS.md")).toBe(true)
      expect(isPathAllowedForScope(scope, "skills/foo/SKILL.md")).toBe(true)
    })

    it("blocks workspace root MEMORY.md", () => {
      expect(isPathAllowedForScope(scope, "MEMORY.md")).toBe(false)
    })

    it("blocks other users memory trees", () => {
      expect(isPathAllowedForScope(scope, "memory/users/623656500/MEMORY.md")).toBe(false)
    })

    it("allows current scope memory files", () => {
      expect(isPathAllowedForScope(scope, "memory/users/605725474/MEMORY.md")).toBe(true)
      expect(isPathAllowedForScope(scope, "memory/users/605725474/2026-06-02.md")).toBe(true)
    })
  })

  describe("rewriteMemoryWritePath", () => {
    const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")!

    it("redirects root MEMORY.md writes", () => {
      expect(rewriteMemoryWritePath(scope, "MEMORY.md")).toBe("memory/users/605725474/MEMORY.md")
    })

    it("redirects global daily memory writes", () => {
      expect(rewriteMemoryWritePath(scope, "memory/2026-06-02.md")).toBe(
        "memory/users/605725474/2026-06-02.md",
      )
    })
  })

  describe("evaluateMemoryToolCall", () => {
    const sessionKey = "agent:main:dingtalk-connector:direct:605725474"

    it("blocks read of workspace root MEMORY.md", () => {
      const result = evaluateMemoryToolCall({
        toolName: "read",
        toolParams: { path: "MEMORY.md" },
        sessionKey,
        workspaceDir: WORKSPACE,
      })
      expect(result.action).toBe("block")
    })

    it("rewrites daily memory write path", () => {
      const result = evaluateMemoryToolCall({
        toolName: "write",
        toolParams: { path: "memory/2026-06-02.md", content: "note" },
        sessionKey,
        workspaceDir: WORKSPACE,
      })
      expect(result.action).toBe("rewrite")
      if (result.action === "rewrite") {
        expect(result.params.path).toBe("memory/users/605725474/2026-06-02.md")
      }
    })

    it("allows unrelated reads", () => {
      const result = evaluateMemoryToolCall({
        toolName: "read",
        toolParams: { path: "AGENTS.md" },
        sessionKey,
        workspaceDir: WORKSPACE,
      })
      expect(result.action).toBe("allow")
    })

    it("ignores non-dingtalk sessions", () => {
      const result = evaluateMemoryToolCall({
        toolName: "read",
        toolParams: { path: "MEMORY.md" },
        sessionKey: "agent:main:webchat:direct:user",
        workspaceDir: WORKSPACE,
      })
      expect(result.action).toBe("allow")
    })
  })

  describe("applyScopedBootstrapFiles", () => {
    it("replaces workspace root MEMORY.md with scoped memory entry", () => {
      const rootMemory = path.join(WORKSPACE, "MEMORY.md")
      const scopedMemory = path.join(WORKSPACE, "memory/users/605725474/MEMORY.md")

      const context = {
        workspaceDir: WORKSPACE,
        sessionKey: "agent:main:dingtalk-connector:direct:605725474",
        bootstrapFiles: [
          { name: "AGENTS.md", path: path.join(WORKSPACE, "AGENTS.md"), missing: false },
          { name: "MEMORY.md", path: rootMemory, missing: false, content: "global secret" },
        ],
      }

      applyScopedBootstrapFiles(context)

      expect(context.bootstrapFiles.some((f) => f.path === rootMemory)).toBe(false)
      expect(context.bootstrapFiles.some((f) => f.path === scopedMemory)).toBe(true)
      expect(context.bootstrapFiles.find((f) => f.name === "AGENTS.md")).toBeTruthy()
    })
  })

  describe("resolveMemoryScopeConfig", () => {
    it("defaults to enabled", () => {
      expect(resolveMemoryScopeConfig(undefined).enabled).toBe(true)
    })

    it("respects enabled=false", () => {
      expect(
        resolveMemoryScopeConfig({
          channels: { "dingtalk-connector": { memoryScope: { enabled: false } } },
        }).enabled,
      ).toBe(false)
    })
  })
})
