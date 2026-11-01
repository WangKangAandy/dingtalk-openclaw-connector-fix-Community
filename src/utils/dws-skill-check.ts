import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"

export const DWS_SKILL_NAME = "dws"

/** Community fork with per-sender OAuth (pairs with this connector). */
export const DWS_COMMUNITY_REPO = "https://github.com/WangKangAandy/dingtalk-workspace-cli"
export const DWS_VENDOR_DIR = path.join(os.homedir(), ".openclaw/vendor/dingtalk-workspace-cli")
export const DWS_BIN_PATH = path.join(os.homedir(), ".local/bin/dws")

/** Same URLs/commands as official connector `bin/dingtalk-connector.js`. */
export const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"
export const DWS_NPM_PACKAGE = "dingtalk-workspace-cli"

export const DWS_INSTALL_HINT =
  `官方（与官方 connector install 相同）：\n` +
  `  npm install -g ${DWS_NPM_PACKAGE}\n` +
  `  或：curl -fsSL ${DWS_INSTALL_SCRIPT_URL} | sh\n` +
  `社区 fork（postinstall / per-sender OAuth）：\n` +
  `  cd <connector-dir> && node scripts/install-community-dws.js\n` +
  `或：git clone ${DWS_COMMUNITY_REPO}.git ${DWS_VENDOR_DIR}\n` +
  `  cd dingtalk-workspace-cli && go build -o ${DWS_BIN_PATH} ./cmd`

export function resolveManagedDwsSkillDir(): string {
  return path.join(os.homedir(), ".openclaw/skills/dws")
}

function isValidDwsSkillMd(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (!content.includes("name: dws") && !content.includes("# 钉钉全产品 Skill")) {
      return false
    }
    if (content.trim() === "# test skill") {
      return false
    }
    return content.length > 200
  } catch {
    return false
  }
}

/**
 * Official connector probe: `bin/dingtalk-connector.js` `isDwsInstalled()`.
 * A working `dws` on PATH is enough; do not invent skill-layout scanners.
 */
export function isDwsInstalled(): boolean {
  try {
    execFileSync("dws", ["--version"], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

export type DwsSkillProbe = {
  managed: boolean
  managedPath: string
}

export function probeDwsSkillAvailability(): DwsSkillProbe {
  const managedPath = path.join(resolveManagedDwsSkillDir(), "SKILL.md")
  return {
    managed: isValidDwsSkillMd(managedPath) || isDwsInstalled(),
    managedPath,
  }
}

export function warnIfDwsSkillMissing(api: OpenClawPluginApi): void {
  const probe = probeDwsSkillAvailability()
  if (probe.managed) {
    api.logger?.info?.("[dingtalk-connector] dws detected")
    return
  }

  const msg =
    `[dingtalk-connector] dws 未就绪：Agent 无法正确路由钉钉文档/日程等业务命令。\n` +
    `  已移除内置 dws-cli skill；请安装官方 dws CLI，或社区配套 fork：\n` +
    DWS_INSTALL_HINT.split("\n").map((line) => `  ${line}`).join("\n") +
    `\n  检查：dws --version 或 ${probe.managedPath}`
  api.logger?.warn?.(msg)
}
