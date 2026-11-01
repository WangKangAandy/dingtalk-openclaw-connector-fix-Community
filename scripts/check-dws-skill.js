#!/usr/bin/env node
/**
 * postinstall: same probe as official connector `isDwsInstalled()`.
 */
import { execFileSync } from "node:child_process"

const PREFIX = "[dingtalk-connector]"
const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"

function isDwsInstalled() {
  try {
    execFileSync("dws", ["--version"], { stdio: "pipe" })
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
