import { execFileSync } from "node:child_process"

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"

/** Same URLs/commands as official connector `bin/dingtalk-connector.js`. */
export const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"
export const DWS_NPM_PACKAGE = "dingtalk-workspace-cli"

export const DWS_INSTALL_HINT =
  `  npm install -g ${DWS_NPM_PACKAGE}\n` +
  `  或：curl -fsSL ${DWS_INSTALL_SCRIPT_URL} | sh`

export type DwsInstallProbeOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

/** npm global on Windows exposes `dws.cmd`, not `dws.exe`. */
export function dwsCommandCandidates(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") {
    return ["dws.cmd", "dws.exe", "dws"]
  }
  return ["dws"]
}

/**
 * Official connector probe (`dws --version`), plus Windows npm shim.
 */
export function isDwsInstalled(options: DwsInstallProbeOptions = {}): boolean {
  const env = options.env ?? process.env
  for (const bin of dwsCommandCandidates(options.platform ?? process.platform)) {
    try {
      execFileSync(bin, ["--version"], { stdio: "pipe", env, windowsHide: true })
      return true
    } catch {
      // try next candidate
    }
  }
  return false
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
