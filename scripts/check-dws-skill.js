#!/usr/bin/env node
/**
 * postinstall: official `dws --version`.
 * Windows npm shim is dws.cmd; never execFile the .cmd (EINVAL).
 */
import { execFileSync } from "node:child_process"
import path from "node:path"

const PREFIX = "[dingtalk-connector]"
const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"

function resolveWindowsCmdExe() {
  if (process.env.ComSpec) return process.env.ComSpec
  if (process.env.SystemRoot) return path.join(process.env.SystemRoot, "System32", "cmd.exe")
  return "cmd.exe"
}

function isDwsInstalled() {
  try {
    if (process.platform === "win32") {
      execFileSync(resolveWindowsCmdExe(), ["/d", "/s", "/c", "dws --version"], {
        stdio: "pipe",
        windowsHide: true,
      })
    } else {
      execFileSync("dws", ["--version"], { stdio: "pipe" })
    }
    return true
  } catch {
    return false
  }
}

if (isDwsInstalled()) {
  console.log(`${PREFIX} dws CLI OK`)
} else {
  console.warn(
    `${PREFIX} dws CLI not found\n` +
      `  Official: npm install -g dingtalk-workspace-cli\n` +
      `  Official: curl -fsSL ${DWS_INSTALL_SCRIPT_URL} | sh`,
  )
}
