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

/** PATH contains only the shim dir so host dws cannot leak in. */
function isolatedEnv(dir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: dir,
    Path: dir,
  }
}

describe("dws-skill-check real process", () => {
  it("detects a real isolated PATH shim", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dws-shim-"))
    homes.push(dir)

    if (process.platform === "win32") {
      fs.writeFileSync(path.join(dir, "dws.cmd"), "@echo dws version v1.0.66\r\n")
    } else {
      const shim = path.join(dir, "dws")
      fs.writeFileSync(shim, "#!/bin/sh\necho 'dws version v1.0.66'\n")
      fs.chmodSync(shim, 0o755)
    }

    expect(isDwsInstalled({ env: isolatedEnv(dir) })).toBe(true)
  })

  it("does not see host dws when PATH is isolated and empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dws-empty-"))
    homes.push(dir)
    expect(isDwsInstalled({ env: isolatedEnv(dir) })).toBe(false)
  })
})
