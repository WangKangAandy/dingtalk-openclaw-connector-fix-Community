import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

const PLUGIN_ROOT = resolvePluginRoot()

function resolvePluginRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "openclaw.plugin.json"))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
}

export const DWS_SKILL_NAME = "dws"

/** Bundled via optionalDependency dingtalk-workspace-cli postinstall. */
export const DWS_SKILL_VENDORED_REL = "./node_modules/dingtalk-workspace-cli/share/skills/dws"

export function resolveBundledDwsSkillDir(): string {
  return path.join(PLUGIN_ROOT, "node_modules/dingtalk-workspace-cli/share/skills/dws")
}

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
  bundled: boolean
  managed: boolean
  bundledPath: string
  managedPath: string
}

export function probeDwsSkillAvailability(): DwsSkillProbe {
  const bundledPath = path.join(resolveBundledDwsSkillDir(), "SKILL.md")
  const managedPath = path.join(resolveManagedDwsSkillDir(), "SKILL.md")
  return {
    bundled: isValidDwsSkillMd(bundledPath),
    managed: isValidDwsSkillMd(managedPath),
    bundledPath,
    managedPath,
  }
}

export function warnIfDwsSkillMissing(api: OpenClawPluginApi): void {
  const probe = probeDwsSkillAvailability()
  if (probe.bundled || probe.managed) {
    const via = probe.bundled ? "plugin optionalDependency" : "~/.openclaw/skills/dws"
    api.logger?.info?.(`[dingtalk-connector] dws skill detected (${via})`)
    return
  }

  const msg =
    `[dingtalk-connector] dws skill 未就绪：Agent 无法正确路由钉钉文档/日程等业务命令。\n` +
    `  已移除内置 dws-cli skill，请安装 dingtalk-workspace-cli（会自动安装 dws skill）：\n` +
    `    npm i -g dingtalk-workspace-cli\n` +
    `  或在 connector 目录执行 npm install（安装 optionalDependency 后重启 gateway）。\n` +
    `  检查路径：\n` +
    `    - ${probe.bundledPath}\n` +
    `    - ${probe.managedPath}`
  api.logger?.warn?.(msg)
}
