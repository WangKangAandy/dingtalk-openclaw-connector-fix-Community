import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  AGENTS_MEMORY_BEGIN_MARKER,
  AGENTS_MEMORY_END_MARKER,
} from "../../src/memory-scope/constants.ts"
import { AGENTS_MEMORY_SECTION_MARKDOWN } from "../../src/memory-scope/agents-memory-rules.ts"
import { __memoryScopeTestables } from "../../src/memory-scope/testables.ts"

const { ensureAgentsMemoryScopeSections, agentsMemoryMarkersPresent } = __memoryScopeTestables

const SAMPLE_AGENTS = `# AGENTS.md - Your Workspace

## Session Startup

Use runtime-provided startup context first.

That context may already include:

- \`IDENTITY.md\`, \`AGENTS.md\`, \`SOUL.md\`, and \`USER.md\`
- recent daily memory such as \`memory/YYYY-MM-DD.md\`
- \`MEMORY.md\` when this is the main session

Do not manually reread startup files unless:

1. The user explicitly asks

## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** \`memory/YYYY-MM-DD.md\` (create \`memory/\` if needed) — raw logs of what happened
- **Long-term:** \`MEMORY.md\` — your curated memories, like a human's long-term memory

Capture what matters. Decisions, context, things to remember. Skip the secrets unless asked to keep them.

### 🧠 MEMORY.md - Your Long-Term Memory

- **ONLY load in main session** (direct chats with your human)
- You can **read, edit, and update** MEMORY.md freely in main sessions

### 📝 Write It Down - No "Mental Notes"!

- **Memory is limited** — if you want to remember something, WRITE IT TO A FILE
- When someone says "remember this" → update \`memory/YYYY-MM-DD.md\` or relevant file
- **Text > Brain** 📝

## Red Lines

- Don't exfiltrate private data. Ever.

<!-- AUTODEPLOY:BEGIN -->
## MUSA Platform Rules
MUSA content stays
<!-- AUTODEPLOY:END -->

## 💓 Heartbeats - Be Proactive!

**Proactive work you can do without asking:**

- Read and organize memory files
- Check on projects (git status, etc.)
- Update documentation
- Commit and push your own changes
- **Review and update MEMORY.md** (see below)

### 🔄 Memory Maintenance (During Heartbeats)

Periodically (every few days), use a heartbeat to:

1. Read through recent \`memory/YYYY-MM-DD.md\` files
2. Update \`MEMORY.md\` with distilled learnings

The goal: Be helpful without being annoying.
`

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agents-memory-sync-"))
}

describe("agents-memory-sync", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("applies memory sections on first sync", () => {
    const dir = makeTempWorkspace()
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "AGENTS.md"), SAMPLE_AGENTS, "utf8")

    const result = ensureAgentsMemoryScopeSections(dir)
    expect(result).toEqual({ applied: true, skipped: false })

    const content = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")
    expect(content).toContain(AGENTS_MEMORY_BEGIN_MARKER)
    expect(content).toContain(AGENTS_MEMORY_END_MARKER)
    expect(content).not.toContain("ONLY load in main session")
    expect(content).not.toContain("freely edit")
    expect(content).not.toContain("Review and update MEMORY.md")
    expect(content).toContain("Capture what matters")
    expect(content).toContain("Text > Brain")
    expect(content).toContain("Memory architecture (DingTalk)")
    expect(content).toContain("MUSA content stays")
    expect(content).not.toMatch(/<!-- \/dingtalk-memory-scope:agents-memory -->\n## Red Lines/)
    expect(content).toContain("Don't exfiltrate private data")
  })

  it("refreshes marked sections on gateway restart", () => {
    const dir = makeTempWorkspace()
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "AGENTS.md"), SAMPLE_AGENTS, "utf8")

    ensureAgentsMemoryScopeSections(dir)
    const afterFirst = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")

    const stale = afterFirst.replace(
      "Agents must not write/edit root `MEMORY.md`.",
      "Agents must not write/edit root `MEMORY.md`. STALE",
    )
    fs.writeFileSync(path.join(dir, "AGENTS.md"), stale, "utf8")

    const result = ensureAgentsMemoryScopeSections(dir)
    expect(result).toEqual({ applied: true, skipped: false })

    const afterSecond = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")
    expect(afterSecond).not.toContain("STALE")
    expect(afterSecond).toContain(AGENTS_MEMORY_SECTION_MARKDOWN)
  })

  it("skips when AGENTS.md is missing", () => {
    const dir = makeTempWorkspace()
    tempDirs.push(dir)
    expect(ensureAgentsMemoryScopeSections(dir)).toEqual({
      applied: false,
      skipped: true,
      reason: "agents-missing",
    })
  })

  it("skips when ## Memory section is missing", () => {
    const dir = makeTempWorkspace()
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# AGENTS\n\n## Red Lines\n\n- line\n", "utf8")
    expect(ensureAgentsMemoryScopeSections(dir)).toEqual({
      applied: false,
      skipped: true,
      reason: "memory-section-missing",
    })
  })

  it("detects memory-scope markers in AGENTS.md", () => {
    expect(agentsMemoryMarkersPresent("no markers")).toBe(false)
    expect(agentsMemoryMarkersPresent(`x ${AGENTS_MEMORY_BEGIN_MARKER} y`)).toBe(true)
  })
})
