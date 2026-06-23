import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

export const DWS_SKILL_NAME = "dws"

/** Community fork with per-sender OAuth (pairs with this connector). */
export const DWS_COMMUNITY_REPO = "https://github.com/WangKangAandy/dingtalk-workspace-cli"
export const DWS_VENDOR_DIR = path.join(os.homedir(), ".openclaw/vendor/dingtalk-workspace-cli")
export const DWS_BIN_PATH = path.join(os.homedir(), ".local/bin/dws")

export const DWS_INSTALL_HINT =
  `社区版 dws 通常由 connector postinstall 自动安装；若缺失可手动：\n` +
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

export type DwsSkillProbe = {
  managed: boolean
  managedPath: string
}

export function probeDwsSkillAvailability(): DwsSkillProbe {
  const managedPath = path.join(resolveManagedDwsSkillDir(), "SKILL.md")
  return {
    managed: isValidDwsSkillMd(managedPath),
    managedPath,
  }
}

export function warnIfDwsSkillMissing(api: OpenClawPluginApi): void {
  const probe = probeDwsSkillAvailability()
  if (probe.managed) {
    api.logger?.info?.("[dingtalk-connector] dws skill detected (~/.openclaw/skills/dws)")
    return
  }

  const msg =
    `[dingtalk-connector] dws skill 未就绪：Agent 无法正确路由钉钉文档/日程等业务命令。\n` +
    `  已移除内置 dws-cli skill；社区版需单独安装配套 dws fork：\n` +
    DWS_INSTALL_HINT.split("\n").map((line) => `  ${line}`).join("\n") +
    `\n  检查路径：${probe.managedPath}`
  api.logger?.warn?.(msg)
}
