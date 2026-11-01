import { execFileSync } from "node:child_process"
import fs from "node:fs"
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

/** Spread `process.env` loses Windows case-insensitivity; look up ComSpec/SystemRoot either way. */
export function envLookup(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const direct = env[name]
  if (typeof direct === "string" && direct.trim()) {
    return direct
  }
  const target = name.toLowerCase()
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() !== target) {
      continue
    }
    const value = env[key]
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }
  return undefined
}

function cmdExeFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const comSpec = envLookup(env, "ComSpec")
  if (comSpec) {
    return comSpec
  }
  const systemRoot = envLookup(env, "SystemRoot") || envLookup(env, "windir")
  if (systemRoot) {
    return path.join(systemRoot, "System32", "cmd.exe")
  }
  return undefined
}

const WELL_KNOWN_CMD_EXE = "C:\\Windows\\System32\\cmd.exe"

/** Absolute cmd.exe so isolated PATH still works; never execFile a .cmd shim. */
export function resolveWindowsCmdExe(env: NodeJS.ProcessEnv = process.env): string {
  const resolved = cmdExeFromEnv(env) ?? (env === process.env ? undefined : cmdExeFromEnv(process.env))
  if (resolved) {
    return resolved
  }
  try {
    if (fs.existsSync(WELL_KNOWN_CMD_EXE)) {
      return WELL_KNOWN_CMD_EXE
    }
  } catch {
    // ignore
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
