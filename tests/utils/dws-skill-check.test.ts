import { describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from "node:child_process"
import path from "node:path"
import {
  buildDwsVersionInvocation,
  isDwsInstalled,
  resolveWindowsCmdExe,
  warnIfDwsSkillMissing,
} from "../../src/utils/dws-skill-check.ts"

describe("dws-skill-check", () => {
  it("launches Windows npm shim via cmd.exe, not execFile(dws.cmd)", () => {
    const invocation = buildDwsVersionInvocation("win32", {
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
    })
    expect(invocation.file.toLowerCase()).toContain("cmd.exe")
    expect(invocation.args).toEqual(["/d", "/s", "/c", "dws --version"])
  })

  it("resolves cmd.exe from COMSPEC/SYSTEMROOT after env spread", () => {
    expect(
      resolveWindowsCmdExe({
        COMSPEC: "D:\\Windows\\System32\\cmd.exe",
      }),
    ).toBe("D:\\Windows\\System32\\cmd.exe")
    expect(
      resolveWindowsCmdExe({
        SYSTEMROOT: "D:\\Windows",
      }),
    ).toBe(path.join("D:\\Windows", "System32", "cmd.exe"))
  })

  it("falls back to the host interpreter when isolated env omitted ComSpec", () => {
    const resolved = resolveWindowsCmdExe({ PATH: "C:\\tmp-only" })
    expect(resolved.toLowerCase()).toContain("cmd.exe")
    if (process.platform === "win32") {
      expect(path.isAbsolute(resolved)).toBe(true)
    }
  })

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
