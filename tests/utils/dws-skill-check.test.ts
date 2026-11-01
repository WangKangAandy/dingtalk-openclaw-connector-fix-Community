import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  probeDwsSkillAvailability,
  warnIfDwsSkillMissing,
} from "../../src/utils/dws-skill-check.ts"

const MONO_BODY = `---
name: dws
description: community mono skill
---

# 钉钉全产品 Skill

${"x".repeat(180)}
`

const MULTI_DOC_BODY = `---
name: dingtalk-doc
description: 钉钉在线文档
metadata:
  requires:
    bins:
      - dws
---

# 钉钉文档 Skill

${"y".repeat(180)}
`

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dws-skill-check-"))
}

function writeFile(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body)
}

describe("dws-skill-check", () => {
  const homes: string[] = []

  afterEach(() => {
    for (const home of homes.splice(0)) {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it("treats missing skills as none", () => {
    const home = makeHome()
    homes.push(home)
    const probe = probeDwsSkillAvailability(home)
    expect(probe.managed).toBe(false)
    expect(probe.layout).toBe("none")
    expect(probe.multiSkills).toEqual([])
  })

  it("accepts community mono ~/.openclaw/skills/dws", () => {
    const home = makeHome()
    homes.push(home)
    writeFile(path.join(home, ".openclaw/skills/dws/SKILL.md"), MONO_BODY)
    const probe = probeDwsSkillAvailability(home)
    expect(probe.layout).toBe("mono")
    expect(probe.managed).toBe(true)
  })

  it("accepts official multi under ~/.openclaw/skills/dingtalk-*", () => {
    const home = makeHome()
    homes.push(home)
    writeFile(path.join(home, ".openclaw/skills/dingtalk-doc/SKILL.md"), MULTI_DOC_BODY)
    const probe = probeDwsSkillAvailability(home)
    expect(probe.layout).toBe("multi")
    expect(probe.managed).toBe(true)
    expect(probe.multiSkills).toEqual(["dingtalk-doc"])
  })

  it("follows official multi skills installed under ~/.agents/skills", () => {
    const home = makeHome()
    homes.push(home)
    writeFile(path.join(home, ".agents/skills/dingtalk-calendar/SKILL.md"), MULTI_DOC_BODY.replace("dingtalk-doc", "dingtalk-calendar"))
    const probe = probeDwsSkillAvailability(home)
    expect(probe.layout).toBe("multi")
    expect(probe.multiSkills).toEqual(["dingtalk-calendar"])
    expect(probe.managedPath).toBe(path.join(home, ".agents/skills/dingtalk-calendar/SKILL.md"))
  })

  it("reports both when mono and official multi coexist", () => {
    const home = makeHome()
    homes.push(home)
    writeFile(path.join(home, ".openclaw/skills/dws/SKILL.md"), MONO_BODY)
    writeFile(path.join(home, ".openclaw/skills/dingtalk-doc/SKILL.md"), MULTI_DOC_BODY)
    const probe = probeDwsSkillAvailability(home)
    expect(probe.layout).toBe("both")
    expect(probe.managed).toBe(true)
  })

  it("rejects stub or unnamed skill files", () => {
    const home = makeHome()
    homes.push(home)
    writeFile(path.join(home, ".openclaw/skills/dws/SKILL.md"), "# test skill")
    writeFile(path.join(home, ".openclaw/skills/dingtalk-doc/SKILL.md"), "# not a real skill\n")
    const probe = probeDwsSkillAvailability(home)
    expect(probe.layout).toBe("none")
  })

  it("warns only when neither layout is present", () => {
    const home = makeHome()
    homes.push(home)
    const warn = vi.fn()
    const info = vi.fn()
    warnIfDwsSkillMissing({ logger: { warn, info } } as any, home)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain("dws skill 未就绪")
    expect(String(warn.mock.calls[0][0])).toContain("skill setup --mode multi")
    expect(info).not.toHaveBeenCalled()
  })

  it("logs official multi as ready instead of warning", () => {
    const home = makeHome()
    homes.push(home)
    writeFile(path.join(home, ".openclaw/skills/dingtalk-doc/SKILL.md"), MULTI_DOC_BODY)
    const warn = vi.fn()
    const info = vi.fn()
    warnIfDwsSkillMissing({ logger: { warn, info } } as any, home)
    expect(warn).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledOnce()
    expect(String(info.mock.calls[0][0])).toContain("official multi")
  })
})
