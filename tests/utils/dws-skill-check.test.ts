import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from "node:child_process"
import { probeDwsSkillAvailability, warnIfDwsSkillMissing } from "../../src/utils/dws-skill-check.ts"

const MONO_BODY = `---
name: dws
description: community skill
---

# 钉钉全产品 Skill

${"x".repeat(180)}
`

describe("dws-skill-check", () => {
  const homedir = vi.spyOn(os, "homedir")
  let home = ""

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "dws-skill-check-"))
    homedir.mockReturnValue(home)
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not on PATH")
    })
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it("warns when neither community skill nor official CLI is present", () => {
    const warn = vi.fn()
    const info = vi.fn()
    expect(probeDwsSkillAvailability().managed).toBe(false)
    warnIfDwsSkillMissing({ logger: { warn, info } } as any)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain("dws 未就绪")
    expect(String(warn.mock.calls[0][0])).toContain("npm install -g dingtalk-workspace-cli")
    expect(info).not.toHaveBeenCalled()
  })

  it("accepts community ~/.openclaw/skills/dws", () => {
    const skillMd = path.join(home, ".openclaw/skills/dws/SKILL.md")
    fs.mkdirSync(path.dirname(skillMd), { recursive: true })
    fs.writeFileSync(skillMd, MONO_BODY)
    expect(probeDwsSkillAvailability().managed).toBe(true)
  })

  it("accepts official CLI via dws --version", () => {
    vi.mocked(execFileSync).mockReturnValue("dws version v1.0.66\n")
    expect(probeDwsSkillAvailability().managed).toBe(true)
    const warn = vi.fn()
    const info = vi.fn()
    warnIfDwsSkillMissing({ logger: { warn, info } } as any)
    expect(warn).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledOnce()
  })
})
