#!/usr/bin/env node
/**
 * postinstall: verify community dws skill (and optionally CLI) after auto-install.
 */
import fs from "node:fs"
import path from "node:path"

import { DWS_BIN_PATH, DWS_COMMUNITY_REPO, DWS_SKILL_DIR, DWS_VENDOR_DIR } from "./dws-community-config.js"

const PREFIX = "[dingtalk-connector]"

function isValidSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") return false
    return content.length > 200 && (content.includes("name: dws") || content.includes("钉钉全产品 Skill"))
  } catch {
    return false
  }
}

const skillMd = path.join(DWS_SKILL_DIR, "SKILL.md")
const skillOk = isValidSkillMd(skillMd)
const cliOk = fs.existsSync(DWS_BIN_PATH)

if (skillOk) {
  console.log(`${PREFIX} dws skill OK (${DWS_SKILL_DIR})`)
} else {
  console.warn(
    `${PREFIX} dws skill missing at ${skillMd}\n` +
      `  Re-run: npm install (in connector dir) or node scripts/install-community-dws.js\n` +
      `  Or set DWS_SKIP_AUTO_INSTALL=1 and install manually from ${DWS_COMMUNITY_REPO}`,
  )
}

if (cliOk) {
  console.log(`${PREFIX} dws CLI OK (${DWS_BIN_PATH})`)
} else {
  console.warn(
    `${PREFIX} dws CLI not found at ${DWS_BIN_PATH}\n` +
      `  Install Go, then: cd ${DWS_VENDOR_DIR} && go build -o ${DWS_BIN_PATH} ./cmd`,
  )
}

if (!skillOk) {
  process.exitCode = 0
}
