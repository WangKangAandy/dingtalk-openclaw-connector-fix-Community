import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DWS_BIN_PATH, resolveDwsBinPath } from "../../src/utils/dws-skill-check.ts"

describe("resolveDwsBinPath", () => {
  it("prefers ~/.local/bin/dws when executable", () => {
    try {
      fs.accessSync(DWS_BIN_PATH, fs.constants.X_OK)
      expect(resolveDwsBinPath()).toBe(DWS_BIN_PATH)
    } catch {
      expect(resolveDwsBinPath()).toBe("dws")
    }
  })

  it("falls back to PATH name when community binary is missing", () => {
    const missing = path.join(os.homedir(), ".local/bin/dws-does-not-exist-for-test")
    expect(missing).not.toBe(DWS_BIN_PATH)
    // resolveDwsBinPath only checks DWS_BIN_PATH; on machines without it we get "dws".
    if (!fs.existsSync(DWS_BIN_PATH)) {
      expect(resolveDwsBinPath()).toBe("dws")
    }
  })
})
