import { describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from "node:child_process"
import { isDwsInstalled, warnIfDwsSkillMissing } from "../../src/utils/dws-skill-check.ts"

describe("dws-skill-check", () => {
  it("warns when official dws CLI is missing", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not on PATH")
    })
    expect(isDwsInstalled()).toBe(false)
    const warn = vi.fn()
    const info = vi.fn()
    warnIfDwsSkillMissing({ logger: { warn, info } } as any)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain("dws 未就绪")
    expect(String(warn.mock.calls[0][0])).toContain("npm install -g dingtalk-workspace-cli")
    expect(info).not.toHaveBeenCalled()
  })

  it("accepts official CLI via dws --version", () => {
    vi.mocked(execFileSync).mockReturnValue("dws version v1.0.66\n")
    expect(isDwsInstalled()).toBe(true)
    const warn = vi.fn()
    const info = vi.fn()
    warnIfDwsSkillMissing({ logger: { warn, info } } as any)
    expect(warn).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledOnce()
  })
})
