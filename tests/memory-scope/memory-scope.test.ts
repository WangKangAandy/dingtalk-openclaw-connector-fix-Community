import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  ROOT_MEMORY_RULES_BEGIN_MARKER,
  ROOT_MEMORY_RULES_END_MARKER,
} from "../../src/memory-scope/constants.ts"
import { __memoryScopeTestables } from "../../src/memory-scope/testables.ts"

const {
  parseDingtalkMemoryScope,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
  evaluateMemoryToolCall,
  applyScopedBootstrapFiles,
  resolveMemoryScopeConfig,
  ensureScopedMemoryFile,
  ensureRootMemoryScopeSection,
  buildMemoryScopePrompt,
} = __memoryScopeTestables

const WORKSPACE = "/tmp/openclaw-workspace"

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "memory-scope-"))
}

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

  describe("buildMemoryScopePrompt", () => {
    it("includes session paths only", () => {
      const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")!
      const prompt = buildMemoryScopePrompt(scope)
      expect(prompt).toContain("本 session 记忆路径")
      expect(prompt).toContain("memory/users/605725474/MEMORY.md")
      expect(prompt).not.toContain("不要读取")
      expect(prompt).not.toContain("规则：")
    })
  })

  describe("ensureRootMemoryScopeSection", () => {
    const tempDirs: string[] = []

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("creates MEMORY.md with marked rules when missing", () => {
      const dir = makeTempWorkspace()
      tempDirs.push(dir)
      ensureRootMemoryScopeSection(dir, "## test rules")
      const content = fs.readFileSync(path.join(dir, "MEMORY.md"), "utf8")
      expect(content).toContain(ROOT_MEMORY_RULES_BEGIN_MARKER)
      expect(content).toContain("## test rules")
      expect(content).toContain(ROOT_MEMORY_RULES_END_MARKER)
    })

    it("prepends marked rules and preserves existing body", () => {
      const dir = makeTempWorkspace()
      tempDirs.push(dir)
      fs.writeFileSync(path.join(dir, "MEMORY.md"), "# MEMORY.md - 长期记忆\n\n## dws\n\n- tip\n", "utf8")
      ensureRootMemoryScopeSection(dir, "## synced rules")
      const content = fs.readFileSync(path.join(dir, "MEMORY.md"), "utf8")
      expect(content.indexOf("# MEMORY.md - 长期记忆")).toBeLessThan(content.indexOf("## synced rules"))
      expect(content).toContain("## synced rules")
      expect(content).toContain("## dws")
      expect(content).toContain("- tip")
    })

    it("replaces only the marked section on update", () => {
      const dir = makeTempWorkspace()
      tempDirs.push(dir)
      ensureRootMemoryScopeSection(dir, "## version 1")
      ensureRootMemoryScopeSection(dir, "## version 2")
      const content = fs.readFileSync(path.join(dir, "MEMORY.md"), "utf8")
      expect(content).toContain("## version 2")
      expect(content).not.toContain("## version 1")
    })
  })

  describe("ensureScopedMemoryFile", () => {
    const tempDirs: string[] = []

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("creates scoped MEMORY.md on first call", () => {
      const dir = makeTempWorkspace()
      tempDirs.push(dir)
      const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")!
      const absPath = ensureScopedMemoryFile(dir, scope)
      expect(fs.existsSync(absPath)).toBe(true)
      const content = fs.readFileSync(absPath, "utf8")
      expect(content).toContain("专属长期记忆")
      expect(content).toContain("musa-notes.md")
      expect(content).toContain("dingtalk-issues.md")
    })

    it("does not overwrite existing scoped MEMORY.md", () => {
      const dir = makeTempWorkspace()
      tempDirs.push(dir)
      const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")!
      const rel = scope.memoryFile
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), "custom content", "utf8")
      ensureScopedMemoryFile(dir, scope)
      expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe("custom content")
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
    const tempDirs: string[] = []

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("retains workspace root MEMORY.md and adds scoped memory entry", () => {
      const dir = makeTempWorkspace()
      tempDirs.push(dir)
      const rootMemory = path.join(dir, "MEMORY.md")
      const scopedMemory = path.join(dir, "memory/users/605725474/MEMORY.md")
      fs.writeFileSync(rootMemory, "global public rules", "utf8")

      const context = {
        workspaceDir: dir,
        sessionKey: "agent:main:dingtalk-connector:direct:605725474",
        bootstrapFiles: [
          { name: "AGENTS.md", path: path.join(dir, "AGENTS.md"), missing: false },
          { name: "MEMORY.md", path: rootMemory, missing: false, content: "global public rules" },
        ],
      }

      applyScopedBootstrapFiles(context)

      expect(context.bootstrapFiles.some((f) => f.path === rootMemory)).toBe(true)
      expect(context.bootstrapFiles.some((f) => f.path === scopedMemory)).toBe(true)
      expect(context.bootstrapFiles.find((f) => f.path === rootMemory)?.content).toBe(
        "global public rules",
      )
      expect(context.bootstrapFiles.find((f) => f.path === scopedMemory)?.missing).toBe(false)
      expect(context.bootstrapFiles.find((f) => f.name === "AGENTS.md")).toBeTruthy()
    })
  })

  describe("resolveMemoryScopeConfig", () => {
    it("defaults to enabled with root memory sync", () => {
      expect(resolveMemoryScopeConfig(undefined)).toEqual({
        enabled: true,
        syncRootMemoryRules: true,
      })
    })

    it("respects enabled=false", () => {
      expect(
        resolveMemoryScopeConfig({
          channels: { "dingtalk-connector": { memoryScope: { enabled: false } } },
        }),
      ).toEqual({
        enabled: false,
        syncRootMemoryRules: true,
      })
    })

    it("respects syncRootMemoryRules=false", () => {
      expect(
        resolveMemoryScopeConfig({
          channels: {
            "dingtalk-connector": { memoryScope: { syncRootMemoryRules: false } },
          },
        }),
      ).toEqual({
        enabled: true,
        syncRootMemoryRules: false,
      })
    })
  })
})
