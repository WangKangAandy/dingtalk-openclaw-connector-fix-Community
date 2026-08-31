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
  classifyDingtalkSession,
  normalizeMemoryHitPath,
  isMemoryPathAllowed,
  filterMemorySearchPayload,
  filterMemorySearchToolResult,
  createMemorySearchResultMiddleware,
} = __memoryScopeTestables

const WORKSPACE = "/tmp/openclaw-workspace"

function jsonToolResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  }
}

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "memory-scope-"))
}

const CROSS_SCOPE_SYMLINK_CASES = [
  {
    label: "direct user",
    sessionKey: "agent:main:dingtalk-connector:direct:A",
    scopeOptions: undefined,
    allowedDir: "memory/users/A",
    deniedDir: "memory/users/B",
  },
  {
    label: "group",
    sessionKey: "agent:main:dingtalk-connector:group:G",
    scopeOptions: undefined,
    allowedDir: "memory/groups/G",
    deniedDir: "memory/groups/H",
  },
  {
    label: "group sender",
    sessionKey: "agent:main:dingtalk-connector:group:G:A",
    scopeOptions: { groupSessionScope: "group_sender" as const },
    allowedDir: "memory/groups/G/users/A",
    deniedDir: "memory/groups/G/users/B",
  },
]

function makeCrossScopeSymlinkWorkspace(allowedDir: string, deniedDir: string): string {
  const dir = makeTempWorkspace()
  fs.mkdirSync(path.join(dir, allowedDir), { recursive: true })
  fs.mkdirSync(path.join(dir, deniedDir), { recursive: true })
  fs.writeFileSync(path.join(dir, deniedDir, "secret.md"), "secret", "utf8")
  fs.symlinkSync(
    path.relative(path.join(dir, allowedDir), path.join(dir, deniedDir)),
    path.join(dir, allowedDir, "link"),
  )
  return dir
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
      expect(scope?.scopeDir).toBe("memory/groups/~Y2lkd2VodWxrcG93MzFmcm9uenUvdnFxdz09")
    })

    it("parses group_sender style peer ids", () => {
      const scope = parseDingtalkMemoryScope(
        "agent:main:dingtalk-connector:group:conv123:605725474",
        { groupSessionScope: "group_sender" },
      )
      expect(scope?.scopeDir).toBe("memory/groups/conv123/users/605725474")
    })

    it("returns null for non-dingtalk sessions", () => {
      expect(parseDingtalkMemoryScope("agent:main:webchat:direct:user")).toBeNull()
    })

    it("preserves peer id case and rejects an unconfigured account", () => {
      const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:UserA")
      expect(scope?.peerId).toBe("UserA")
      expect(
        classifyDingtalkSession(
          "agent:main:dingtalk-connector:unknown:direct:UserA",
          { accountIds: ["default"] },
        ).kind,
      ).toBe("malformed_dingtalk")
    })

    it("uses collision-safe path encoding for unsafe ids", () => {
      const slash = parseDingtalkMemoryScope("agent:main:dingtalk-connector:group:a/b")
      const underscore = parseDingtalkMemoryScope("agent:main:dingtalk-connector:group:a_b")
      expect(slash?.scopeDir).not.toBe(underscore?.scopeDir)
      expect(slash?.scopeDir).toMatch(/^memory\/groups\/~[A-Za-z0-9_-]+$/)
    })
  })

  describe("buildMemoryScopePrompt", () => {
    it("includes session paths only", () => {
      const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:605725474")!
      const prompt = buildMemoryScopePrompt(scope)
      expect(prompt).toContain("Session memory paths")
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
      expect(content).toContain("scoped long-term memory")
      expect(content).toContain("memory/dingtalk-issue.md")
      expect(content).toContain("memory/musa-stack-issue.md")
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

    it("allows public workspace root MEMORY.md", () => {
      expect(isPathAllowedForScope(scope, "MEMORY.md")).toBe(true)
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

    it("allows public root memory and blocks another user's private memory", () => {
      const dir = makeTempWorkspace()
      fs.writeFileSync(path.join(dir, "MEMORY.md"), "public", "utf8")
      fs.mkdirSync(path.join(dir, "memory/users/other"), { recursive: true })
      fs.writeFileSync(path.join(dir, "memory/users/other/MEMORY.md"), "secret", "utf8")
      try {
        expect(evaluateMemoryToolCall({
          toolName: "read",
          toolParams: { path: "MEMORY.md" },
          sessionKey,
          workspaceDir: dir,
        }).action).toBe("allow")
        expect(evaluateMemoryToolCall({
          toolName: "memory_get",
          toolParams: { path: "memory/users/other/MEMORY.md" },
          sessionKey,
          workspaceDir: dir,
        }).action).toBe("block")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("does not intercept writes in the read-only enforcement phase", () => {
      const result = evaluateMemoryToolCall({
        toolName: "write",
        toolParams: { path: "memory/2026-06-02.md", content: "note" },
        sessionKey,
        workspaceDir: WORKSPACE,
      })
      expect(result.action).toBe("allow")
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

    it("allows absolute non-memory reads inside the workspace", () => {
      const dir = makeTempWorkspace()
      const agentsPath = path.join(dir, "AGENTS.md")
      fs.writeFileSync(agentsPath, "workspace rules", "utf8")
      try {
        expect(evaluateMemoryToolCall({
          toolName: "read",
          toolParams: { path: agentsPath },
          sessionKey,
          workspaceDir: dir,
        }).action).toBe("allow")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it("applies memory scope checks to absolute paths inside the workspace", () => {
      const dir = makeTempWorkspace()
      fs.mkdirSync(path.join(dir, "memory/users/605725474"), { recursive: true })
      fs.mkdirSync(path.join(dir, "memory/users/other"), { recursive: true })
      const ownPath = path.join(dir, "memory/users/605725474/MEMORY.md")
      const otherPath = path.join(dir, "memory/users/other/MEMORY.md")
      fs.writeFileSync(ownPath, "own", "utf8")
      fs.writeFileSync(otherPath, "secret", "utf8")
      try {
        expect(evaluateMemoryToolCall({
          toolName: "read",
          toolParams: { path: ownPath },
          sessionKey,
          workspaceDir: dir,
        }).action).toBe("allow")
        expect(evaluateMemoryToolCall({
          toolName: "read",
          toolParams: { path: otherPath },
          sessionKey,
          workspaceDir: dir,
        }).action).toBe("block")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
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

    it("blocks malformed DingTalk sessions and non-memory corpora", () => {
      expect(evaluateMemoryToolCall({
        toolName: "memory_get",
        toolParams: { path: "MEMORY.md" },
        sessionKey: "agent:main:dingtalk-connector:broken",
        workspaceDir: WORKSPACE,
      }).action).toBe("block")
      expect(evaluateMemoryToolCall({
        toolName: "memory_get",
        toolParams: { path: "MEMORY.md", corpus: "wiki" },
        sessionKey,
        workspaceDir: WORKSPACE,
      }).action).toBe("block")
    })

    it("blocks a public-looking memory path that escapes through a symlink", () => {
      const dir = makeTempWorkspace()
      const outside = makeTempWorkspace()
      fs.writeFileSync(path.join(outside, "secret.md"), "secret", "utf8")
      fs.mkdirSync(path.join(dir, "memory"), { recursive: true })
      fs.symlinkSync(outside, path.join(dir, "memory/link"))
      try {
        expect(evaluateMemoryToolCall({
          toolName: "read",
          toolParams: { path: "memory/link/secret.md" },
          sessionKey,
          workspaceDir: dir,
        }).action).toBe("block")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
        fs.rmSync(outside, { recursive: true, force: true })
      }
    })

    it.each(CROSS_SCOPE_SYMLINK_CASES)(
      "blocks $label symlinks that resolve into another scope",
      ({ sessionKey: scopedSessionKey, scopeOptions, allowedDir, deniedDir }) => {
        const dir = makeCrossScopeSymlinkWorkspace(allowedDir, deniedDir)
        try {
          expect(evaluateMemoryToolCall({
            toolName: "read",
            toolParams: { path: `${allowedDir}/link/secret.md` },
            sessionKey: scopedSessionKey,
            workspaceDir: dir,
            scopeOptions,
          }).action).toBe("block")
        } finally {
          fs.rmSync(dir, { recursive: true, force: true })
        }
      },
    )
  })

  describe("path classifier", () => {
    const userA = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:A")!
    const groupG = parseDingtalkMemoryScope("agent:main:dingtalk-connector:group:G")!
    const groupSender = parseDingtalkMemoryScope(
      "agent:main:dingtalk-connector:group:G:A",
      { groupSessionScope: "group_sender" },
    )!

    it("implements the public/current-private negative isolation matrix", () => {
      expect(isMemoryPathAllowed("MEMORY.md", userA)).toBe(true)
      expect(isMemoryPathAllowed("memory/2026-08-28.md", userA)).toBe(true)
      expect(isMemoryPathAllowed("memory/users/A/MEMORY.md", userA)).toBe(true)
      expect(isMemoryPathAllowed("memory/users/AB/MEMORY.md", userA)).toBe(false)
      expect(isMemoryPathAllowed("memory/groups/G/MEMORY.md", userA)).toBe(false)

      expect(isMemoryPathAllowed("memory/groups/G/MEMORY.md", groupG)).toBe(true)
      expect(isMemoryPathAllowed("memory/groups/G/users/A/MEMORY.md", groupG)).toBe(false)
      expect(isMemoryPathAllowed("memory/groups/G/users/A/MEMORY.md", groupSender)).toBe(true)
      expect(isMemoryPathAllowed("memory/groups/G/users/B/MEMORY.md", groupSender)).toBe(false)
    })

    it.each([
      "/etc/passwd",
      "memory/../MEMORY.md",
      "memory\\users\\A\\MEMORY.md",
      "memory/%2e%2e/MEMORY.md",
      "memory/%252e%252e/MEMORY.md",
      "memory//MEMORY.md",
    ])("rejects unsafe path %s", (candidate) => {
      expect(normalizeMemoryHitPath(candidate).kind).toBe("invalid")
    })
  })

  describe("memory_search result filtering", () => {
    const scope = parseDingtalkMemoryScope("agent:main:dingtalk-connector:direct:A")!

    it("keeps public and current hits while dropping other private corpora", () => {
      const payload = {
        results: [
          { corpus: "memory", source: "memory", path: "MEMORY.md", snippet: "PUBLIC_MARKER" },
          { corpus: "memory", source: "memory", path: "memory/topic.md", snippet: "PUBLIC_TOPIC" },
          { corpus: "memory", source: "memory", path: "memory/users/A/MEMORY.md", snippet: "USER_A_SECRET" },
          { corpus: "memory", source: "memory", path: "memory/users/B/MEMORY.md", snippet: "USER_B_SECRET" },
          { corpus: "sessions", source: "sessions", path: "sessions/x.jsonl", snippet: "SESSION_SECRET" },
          { corpus: "wiki", path: "wiki/public.md", privacyTier: "public", snippet: "PUBLIC_WIKI" },
          { corpus: "wiki", path: "wiki/private.md", privacyTier: "private", snippet: "PRIVATE_WIKI" },
          { corpus: "unknown", path: "x", snippet: "UNKNOWN" },
        ],
        debug: { hits: 8 },
      }
      const filtered = filterMemorySearchPayload(payload, scope)
      expect((filtered.results as Array<{ snippet: string }>).map((hit) => hit.snippet)).toEqual([
        "PUBLIC_MARKER",
        "PUBLIC_TOPIC",
        "USER_A_SECRET",
        "PUBLIC_WIKI",
      ])
      expect((filtered.debug as { hits: number }).hits).toBe(4)
    })

    it("rebuilds content and details from exactly the same payload", () => {
      const original = jsonToolResult({
        results: [
          { source: "memory", path: "memory/users/A/MEMORY.md", snippet: "USER_A_SECRET" },
          { source: "memory", path: "memory/users/B/MEMORY.md", snippet: "USER_B_SECRET" },
        ],
        debug: { hits: 2 },
      })
      const filtered = filterMemorySearchToolResult(original, scope)
      const visible = JSON.parse((filtered.content[0] as { text: string }).text)
      expect(visible).toEqual(filtered.details)
      expect(JSON.stringify(visible)).not.toContain("USER_B_SECRET")
      expect(visible.debug.hits).toBe(1)
    })

    it.each(CROSS_SCOPE_SYMLINK_CASES)(
      "drops $label search hits that resolve through a symlink into another scope",
      ({ sessionKey: scopedSessionKey, scopeOptions, allowedDir, deniedDir }) => {
        const dir = makeCrossScopeSymlinkWorkspace(allowedDir, deniedDir)
        try {
          const scoped = parseDingtalkMemoryScope(scopedSessionKey, scopeOptions)!
          const filtered = filterMemorySearchPayload({
            results: [{
              source: "memory",
              path: `${allowedDir}/link/secret.md`,
              snippet: "OTHER_SCOPE_SECRET",
            }],
          }, scoped, dir)
          expect(filtered.results).toEqual([])
        } finally {
          fs.rmSync(dir, { recursive: true, force: true })
        }
      },
    )

    it("fails closed for missing context, malformed sessions, and inconsistent payloads", async () => {
      const middleware = createMemorySearchResultMiddleware(() => ({}))
      const original = jsonToolResult({ results: [] })
      const event = {
        toolCallId: "call-1",
        toolName: "memory_search",
        args: {},
        result: original,
      }
      const missing = await middleware(event, { runtime: "openclaw" })
      expect((missing?.result.details as { debug: { isolation: string } }).debug.isolation).toBe("fail-closed")

      const malformed = await middleware(event, {
        runtime: "openclaw",
        sessionKey: "agent:main:dingtalk-connector:broken",
      })
      expect((malformed?.result.details as { results: unknown[] }).results).toEqual([])

      const inconsistent = {
        ...event,
        result: { ...original, content: [{ type: "text" as const, text: JSON.stringify({ results: [{ path: "leak" }] }) }] },
      }
      const rejected = await middleware(inconsistent, {
        runtime: "openclaw",
        sessionKey: "agent:main:dingtalk-connector:direct:A",
      })
      expect(JSON.stringify(rejected?.result)).not.toContain('"path":"leak"')
    })

    it("leaves non-DingTalk results unchanged", async () => {
      const middleware = createMemorySearchResultMiddleware(() => ({}))
      const event = {
        toolCallId: "call-2",
        toolName: "memory_search",
        args: {},
        result: jsonToolResult({ results: [{ source: "memory", path: "memory/users/B/MEMORY.md" }] }),
      }
      expect(await middleware(event, {
        runtime: "openclaw",
        sessionKey: "agent:main:webchat:direct:user",
      })).toBeUndefined()
    })

    it("does not cross A/B scopes under concurrent middleware calls", async () => {
      const middleware = createMemorySearchResultMiddleware(() => ({}))
      const event = (secretA: string, secretB: string) => ({
        toolCallId: `${secretA}-${secretB}`,
        toolName: "memory_search",
        args: {},
        result: jsonToolResult({ results: [
          { source: "memory", path: "memory/users/A/MEMORY.md", snippet: secretA },
          { source: "memory", path: "memory/users/B/MEMORY.md", snippet: secretB },
        ] }),
      })
      const [forA, forB] = await Promise.all([
        middleware(event("A_ONLY", "B_LEAK"), {
          runtime: "openclaw",
          sessionKey: "agent:main:dingtalk-connector:direct:A",
        }),
        middleware(event("A_LEAK", "B_ONLY"), {
          runtime: "openclaw",
          sessionKey: "agent:main:dingtalk-connector:direct:B",
        }),
      ])
      expect(JSON.stringify(forA)).toContain("A_ONLY")
      expect(JSON.stringify(forA)).not.toContain("B_LEAK")
      expect(JSON.stringify(forB)).toContain("B_ONLY")
      expect(JSON.stringify(forB)).not.toContain("A_LEAK")
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
    it("defaults to disabled with memory rule sync preferences preserved", () => {
      expect(resolveMemoryScopeConfig(undefined)).toEqual({
        enabled: false,
        syncRootMemoryRules: true,
        syncAgentsMemoryRules: true,
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
        syncAgentsMemoryRules: true,
      })
    })

    it("respects syncRootMemoryRules=false", () => {
      expect(
        resolveMemoryScopeConfig({
          channels: {
            "dingtalk-connector": {
              memoryScope: { enabled: true, syncRootMemoryRules: false },
            },
          },
        }),
      ).toEqual({
        enabled: true,
        syncRootMemoryRules: false,
        syncAgentsMemoryRules: true,
      })
    })

    it("respects syncAgentsMemoryRules=false", () => {
      expect(
        resolveMemoryScopeConfig({
          channels: {
            "dingtalk-connector": {
              memoryScope: { enabled: true, syncAgentsMemoryRules: false },
            },
          },
        }),
      ).toEqual({
        enabled: true,
        syncRootMemoryRules: true,
        syncAgentsMemoryRules: false,
      })
    })
  })
})
