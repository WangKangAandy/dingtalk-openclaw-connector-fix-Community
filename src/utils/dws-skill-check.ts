import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"

export const DWS_SKILL_NAME = "dws"

/** Community fork with per-sender OAuth (pairs with this connector). */
export const DWS_COMMUNITY_REPO = "https://github.com/WangKangAandy/dingtalk-workspace-cli"
export const DWS_VENDOR_DIR = path.join(os.homedir(), ".openclaw/vendor/dingtalk-workspace-cli")
export const DWS_BIN_PATH = path.join(os.homedir(), ".local/bin/dws")

/** Official DingTalk-Real-AI CLI + multi-skill installer. */
export const DWS_OFFICIAL_INSTALL_SCRIPT =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"

export const DWS_INSTALL_HINT =
  `官方最新 DWS（multi skill，推荐）：\n` +
  `  curl -fsSL ${DWS_OFFICIAL_INSTALL_SCRIPT} | sh\n` +
  `  dws skill setup --mode multi --target openclaw --yes\n` +
  `社区版 fork（mono skill + per-sender OAuth）：\n` +
  `  cd <connector-dir> && node scripts/install-community-dws.js\n` +
  `或：git clone ${DWS_COMMUNITY_REPO}.git ${DWS_VENDOR_DIR}\n` +
  `  cd dingtalk-workspace-cli && go build -o ${DWS_BIN_PATH} ./cmd`

export type DwsSkillLayout = "mono" | "multi" | "both" | "none"

export type DwsSkillProbe = {
  managed: boolean
  layout: DwsSkillLayout
  managedPath: string
  monoPath: string
  multiSkills: string[]
}

export function resolveManagedDwsSkillDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".openclaw/skills/dws")
}

export function resolveDwsSkillRoots(homeDir: string = os.homedir()): string[] {
  return [
    path.join(homeDir, ".openclaw/skills"),
    path.join(homeDir, ".agents/skills"),
  ]
}

function isValidMonoSkillMd(filePath: string): boolean {
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

function isValidOfficialMultiSkillMd(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") {
      return false
    }
    if (!/^name:\s*dingtalk-[a-z0-9-]+/m.test(content)) {
      return false
    }
    return content.length > 200
  } catch {
    return false
  }
}

function listOfficialMultiSkills(homeDir: string): Array<{ name: string; skillMd: string }> {
  const found = new Map<string, string>()
  for (const root of resolveDwsSkillRoots(homeDir)) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.name.startsWith("dingtalk-") || found.has(entry.name)) {
        continue
      }
      const skillMd = path.join(root, entry.name, "SKILL.md")
      if (isValidOfficialMultiSkillMd(skillMd)) {
        found.set(entry.name, skillMd)
      }
    }
  }
  return [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, skillMd]) => ({ name, skillMd }))
}

export function probeDwsSkillAvailability(homeDir: string = os.homedir()): DwsSkillProbe {
  const monoPath = path.join(resolveManagedDwsSkillDir(homeDir), "SKILL.md")
  const mono = isValidMonoSkillMd(monoPath)
  const multiFound = listOfficialMultiSkills(homeDir)
  const multiSkills = multiFound.map((item) => item.name)
  const multi = multiFound.length > 0

  let layout: DwsSkillLayout = "none"
  if (mono && multi) {
    layout = "both"
  } else if (mono) {
    layout = "mono"
  } else if (multi) {
    layout = "multi"
  }

  return {
    managed: mono || multi,
    layout,
    managedPath: mono ? monoPath : (multiFound[0]?.skillMd ?? monoPath),
    monoPath,
    multiSkills,
  }
}

export function warnIfDwsSkillMissing(api: OpenClawPluginApi, homeDir: string = os.homedir()): void {
  const probe = probeDwsSkillAvailability(homeDir)
  if (probe.layout === "mono") {
    api.logger?.info?.("[dingtalk-connector] dws skill detected (community mono ~/.openclaw/skills/dws)")
    return
  }
  if (probe.layout === "multi") {
    api.logger?.info?.(
      `[dingtalk-connector] dws skills detected (official multi: ${probe.multiSkills.join(", ")})`,
    )
    return
  }
  if (probe.layout === "both") {
    api.logger?.info?.(
      `[dingtalk-connector] dws skills detected (mono + official multi: ${probe.multiSkills.join(", ")})`,
    )
    return
  }

  const msg =
    `[dingtalk-connector] dws skill 未就绪：Agent 无法正确路由钉钉文档/日程等业务命令。\n` +
    `  已移除内置 dws-cli skill；请安装官方 DWS multi skill，或社区配套 fork：\n` +
    DWS_INSTALL_HINT.split("\n").map((line) => `  ${line}`).join("\n") +
    `\n  检查路径：${probe.monoPath} 或 ~/.openclaw/skills/dingtalk-*/SKILL.md`
  api.logger?.warn?.(msg)
}
