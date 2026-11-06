#!/usr/bin/env node
/**
 * Install the OpenClaw per-exec --profile shim at ~/.openclaw/bin/dws.
 * before_tool_call selects this shim; resolve_exec_env supplies invocation identity.
 *
 * Env:
 *   DWS_SKIP_PROFILE_SHIM=1 — skip
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DWS_BIN_PATH, DWS_SHIM_DIR, DWS_SHIM_PATH } from "./dws-community-config.js"

const PREFIX = "[dingtalk-connector]"
const MARKER = "DINGTALK_CONNECTOR_DWS_PROFILE_SHIM"
const SHIM_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../bin/dws-openclaw-profile.js",
)

function log(msg) {
  console.log(`${PREFIX} ${msg}`)
}

function warn(msg) {
  console.warn(`${PREFIX} ${msg}`)
}

function isShim(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").includes(MARKER)
  } catch {
    return false
  }
}

function main() {
  if (process.env.DWS_SKIP_PROFILE_SHIM === "1") {
    log("DWS_SKIP_PROFILE_SHIM=1 — skipped dws --profile shim")
    return
  }
  if (!fs.existsSync(SHIM_SRC)) {
    warn(`dws profile shim source missing: ${SHIM_SRC}`)
    return
  }

  fs.mkdirSync(DWS_SHIM_DIR, { recursive: true })
  fs.copyFileSync(path.join(path.dirname(SHIM_SRC), "dws-profile-args.mjs"),
    path.join(DWS_SHIM_DIR, "dws-profile-args.mjs"))
  fs.copyFileSync(SHIM_SRC, DWS_SHIM_PATH)
  try {
    fs.chmodSync(DWS_SHIM_PATH, 0o755)
  } catch {
    /* Windows */
  }
  log(`installed dws --profile shim → ${DWS_SHIM_PATH}`)

  if (isShim(DWS_BIN_PATH)) {
    warn(
      `${DWS_BIN_PATH} is still a previous connector shim. Restore the official dws binary there ` +
        `(npm i -g ${"dingtalk-workspace-cli"} or copy from ~/.local/lib/dingtalk-connector/dws). ` +
        `This install no longer overwrites ~/.local/bin/dws.`,
    )
  }

  const nvmHint = path.join(
    os.homedir(),
    ".nvm/versions/node",
  )
  if (fs.existsSync(nvmHint)) {
    log(
      "OpenClaw exec PATH is prepended with ~/.openclaw/bin so the shim beats nvm's older dws. " +
        "Interactive shells still use whichever dws is first on the login PATH.",
    )
  }
}

try {
  main()
} catch (err) {
  warn(`dws --profile shim install failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
}
