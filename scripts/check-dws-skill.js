#!/usr/bin/env node
/**
 * postinstall: verify dws skill is available (bundled or ~/.openclaw/skills/dws).
 * Non-fatal — optionalDependency may be skipped on some platforms.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function isValidSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") return false
    return content.length > 200 && (content.includes("name: dws") || content.includes("钉钉全产品 Skill"))
  } catch {
    return false
  }
}

const bundled = path.join(
  pluginRoot,
  "node_modules/dingtalk-workspace-cli/share/skills/dws/SKILL.md",
)
const managed = path.join(os.homedir(), ".openclaw/skills/dws/SKILL.md")

if (isValidSkillMd(bundled)) {
  console.log("[dingtalk-connector] dws skill OK (bundled in node_modules)")
  process.exit(0)
}
if (isValidSkillMd(managed)) {
  console.log("[dingtalk-connector] dws skill OK (~/.openclaw/skills/dws)")
  process.exit(0)
}

console.warn(
  "[dingtalk-connector] dws skill not found. Install dingtalk-workspace-cli:\n" +
    "  npm i -g dingtalk-workspace-cli\n" +
    "Or re-run npm install in this plugin directory to fetch optionalDependency.",
)
