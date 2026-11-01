#!/usr/bin/env node
/**
 * postinstall: verify dws the same way official connector does (`dws --version`),
 * plus the community skill path written by install-community-dws.js.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { DWS_BIN_PATH, DWS_COMMUNITY_REPO, DWS_SKILL_DIR, DWS_VENDOR_DIR } from "./dws-community-config.js"

const PREFIX = "[dingtalk-connector]"
const DWS_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh"

function isValidSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") return false
    return content.length > 200 && (content.includes("name: dws") || content.includes("钉钉全产品 Skill"))
  } catch {
    return false
  }
}

/** Official `isDwsInstalled()`. */
function isDwsInstalled() {
  try {
    execFileSync("dws", ["--version"], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

const skillMd = path.join(DWS_SKILL_DIR, "SKILL.md")
const skillOk = isValidSkillMd(skillMd)
const cliOk = isDwsInstalled() || fs.existsSync(DWS_BIN_PATH)

if (skillOk) {
  console.log(`${PREFIX} dws skill OK (${DWS_SKILL_DIR})`)
} else if (cliOk) {
  console.log(`${PREFIX} dws CLI OK`)
} else {
  console.warn(
    `${PREFIX} dws missing\n` +
      `  Official: npm install -g dingtalk-workspace-cli\n` +
      `  Official: curl -fsSL ${DWS_INSTALL_SCRIPT_URL} | sh\n` +
      `  Community: npm install (in connector dir) or node scripts/install-community-dws.js\n` +
      `  Or set DWS_SKIP_AUTO_INSTALL=1 and install manually from ${DWS_COMMUNITY_REPO}`,
  )
}

if (skillOk && cliOk) {
  console.log(`${PREFIX} dws CLI OK${fs.existsSync(DWS_BIN_PATH) ? ` (${DWS_BIN_PATH})` : ""}`)
} else if (!cliOk) {
  console.warn(
    `${PREFIX} dws CLI not found\n` +
      `  Official: npm install -g dingtalk-workspace-cli\n` +
      `  Official: curl -fsSL ${DWS_INSTALL_SCRIPT_URL} | sh\n` +
      `  Community: cd ${DWS_VENDOR_DIR} && go build -o ${DWS_BIN_PATH} ./cmd`,
  )
}

if (!skillOk && !cliOk) {
  process.exitCode = 0
}
