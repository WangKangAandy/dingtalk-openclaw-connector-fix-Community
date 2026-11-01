import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { isDwsInstalled } from "../../src/utils/dws-skill-check.ts"

const homes: string[] = []

afterEach(() => {
  for (const dir of homes.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function isolatedEnv(dir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
    Path: `${dir}${path.delimiter}${process.env.Path ?? ""}`,
  }
}

describe("dws-skill-check real process", () => {
  it("detects a real PATH shim via execFileSync", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dws-shim-"))
    homes.push(dir)
    const env = isolatedEnv(dir)

    if (process.platform === "win32") {
      const shim = path.join(dir, "dws.cmd")
      fs.writeFileSync(shim, "@echo dws version v1.0.66\r\n")
      expect(isDwsInstalled({ env, platform: "win32" })).toBe(true)
      expect(execFileSync("dws.cmd", ["--version"], { encoding: "utf8", env, windowsHide: true })).toContain("1.0.66")
    } else {
      const shim = path.join(dir, "dws")
      fs.writeFileSync(shim, "#!/bin/sh\necho 'dws version v1.0.66'\n")
      fs.chmodSync(shim, 0o755)
      expect(isDwsInstalled({ env })).toBe(true)
      expect(execFileSync("dws", ["--version"], { encoding: "utf8", env })).toContain("1.0.66")
    }
  })

  it("treats Windows npm dws.cmd as installed even without dws.exe", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dws-cmd-only-"))
    homes.push(dir)
    const shim = path.join(dir, "dws.cmd")
    if (process.platform === "win32") {
      fs.writeFileSync(shim, "@echo dws version v1.0.66\r\n")
    } else {
      fs.writeFileSync(shim, "#!/bin/sh\necho 'dws version v1.0.66'\n")
      fs.chmodSync(shim, 0o755)
    }
    expect(isDwsInstalled({ env: isolatedEnv(dir), platform: "win32" })).toBe(true)
  })
})
