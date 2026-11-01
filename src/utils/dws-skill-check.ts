import { execFileSync } from "node:child_process"

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"

/** Same URLs/commands as official connector `bin/dingtalk-connector.js`. */
export const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"
export const DWS_NPM_PACKAGE = "dingtalk-workspace-cli"

export const DWS_INSTALL_HINT =
  `  npm install -g ${DWS_NPM_PACKAGE}\n` +
  `  或：curl -fsSL ${DWS_INSTALL_SCRIPT_URL} | sh`

/**
 * Official connector probe: `bin/dingtalk-connector.js` `isDwsInstalled()`.
 */
export function isDwsInstalled(): boolean {
  try {
    execFileSync("dws", ["--version"], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

export function warnIfDwsSkillMissing(api: OpenClawPluginApi): void {
  if (isDwsInstalled()) {
    api.logger?.info?.("[dingtalk-connector] dws CLI detected")
    return
  }

  api.logger?.warn?.(
    `[dingtalk-connector] dws 未就绪：请先安装官方 dws CLI（与官方 connector 相同）。\n` +
      DWS_INSTALL_HINT +
      `\n  检查：dws --version`,
  )
}
