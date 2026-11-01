import { execFileSync } from "node:child_process"
import path from "node:path"

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

export type DwsVersionInvocation = {
  file: string
  args: string[]
}

/** Absolute cmd.exe so isolated PATH still works; never execFile a .cmd shim. */
export function resolveWindowsCmdExe(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ComSpec) {
    return env.ComSpec
  }
  if (env.SystemRoot) {
    return path.join(env.SystemRoot, "System32", "cmd.exe")
  }
  return "cmd.exe"
}

/**
 * Windows npm exposes `dws.cmd`. `execFileSync("dws.cmd")` throws EINVAL.
 * Launch via cmd.exe /c so PATHEXT can resolve the shim.
 */
export function buildDwsVersionInvocation(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): DwsVersionInvocation {
  if (platform === "win32") {
    return {
      file: resolveWindowsCmdExe(env),
      args: ["/d", "/s", "/c", "dws --version"],
    }
  }
  return { file: "dws", args: ["--version"] }
}

export function isDwsInstalled(options: DwsInstallProbeOptions = {}): boolean {
  const env = options.env ?? process.env
  const invocation = buildDwsVersionInvocation(options.platform ?? process.platform, env)
  try {
    execFileSync(invocation.file, invocation.args, { stdio: "pipe", env, windowsHide: true })
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
