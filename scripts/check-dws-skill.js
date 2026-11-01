#!/usr/bin/env node
/**
 * postinstall: same probe as official connector `isDwsInstalled()`,
 * plus Windows npm `dws.cmd` shim.
 */
import { execFileSync } from "node:child_process"

const PREFIX = "[dingtalk-connector]"
const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"

function dwsCommandCandidates() {
  if (process.platform === "win32") {
    return ["dws.cmd", "dws.exe", "dws"]
  }
  return ["dws"]
}

function isDwsInstalled() {
  for (const bin of dwsCommandCandidates()) {
    try {
      execFileSync(bin, ["--version"], { stdio: "pipe", windowsHide: true })
      return true
    } catch {
      // try next
    }
  }
  return false
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
