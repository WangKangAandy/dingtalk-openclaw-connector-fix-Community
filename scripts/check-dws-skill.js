#!/usr/bin/env node
/**
 * postinstall: verify dws skill is installed at ~/.openclaw/skills/dws.
 * Community edition pairs with WangKangAandy/dingtalk-workspace-cli (not npm official).
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DWS_COMMUNITY_REPO = "https://github.com/WangKangAandy/dingtalk-workspace-cli"
const DWS_INSTALL_SKILLS_URL =
  "https://raw.githubusercontent.com/WangKangAandy/dingtalk-workspace-cli/main/scripts/install-skills.sh"

function isValidSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") return false
    return content.length > 200 && (content.includes("name: dws") || content.includes("钉钉全产品 Skill"))
  } catch {
    return false
  }
}

const managed = path.join(os.homedir(), ".openclaw/skills/dws/SKILL.md")

if (isValidSkillMd(managed)) {
  console.log("[dingtalk-connector] dws skill OK (~/.openclaw/skills/dws)")
  process.exit(0)
}

console.warn(
  "[dingtalk-connector] dws skill not found at ~/.openclaw/skills/dws\n" +
    "  Community edition requires the paired dws fork (per-sender OAuth). Do NOT use npm i -g dingtalk-workspace-cli.\n" +
    `  git clone ${DWS_COMMUNITY_REPO}.git\n` +
    "  cd dingtalk-workspace-cli && go build -o ~/.local/bin/dws ./cmd\n" +
    `  curl -fsSL ${DWS_INSTALL_SKILLS_URL} | sh\n` +
    "  dws --version",
)
