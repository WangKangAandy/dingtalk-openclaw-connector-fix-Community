#!/usr/bin/env node
/**
 * postinstall: verify dws skill (official multi or community mono) and CLI.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { DWS_BIN_PATH, DWS_COMMUNITY_REPO, DWS_SKILL_DIR, DWS_VENDOR_DIR } from "./dws-community-config.js"

const PREFIX = "[dingtalk-connector]"
const HOME = os.homedir()

function isValidMonoSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") return false
    return content.length > 200 && (content.includes("name: dws") || content.includes("钉钉全产品 Skill"))
  } catch {
    return false
  }
}

function isValidOfficialMultiSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    if (content.trim() === "# test skill") return false
    return content.length > 200 && /^name:\s*dingtalk-[a-z0-9-]+/m.test(content)
  } catch {
    return false
  }
}

function listOfficialMultiSkills() {
  const found = new Set()
  for (const root of [path.join(HOME, ".openclaw/skills"), path.join(HOME, ".agents/skills")]) {
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.name.startsWith("dingtalk-")) continue
      if (isValidOfficialMultiSkillMd(path.join(root, entry.name, "SKILL.md"))) {
        found.add(entry.name)
      }
    }
  }
  return [...found].sort()
}

const skillMd = path.join(DWS_SKILL_DIR, "SKILL.md")
const monoOk = isValidMonoSkillMd(skillMd)
const multiSkills = listOfficialMultiSkills()
const skillOk = monoOk || multiSkills.length > 0
const cliOk = fs.existsSync(DWS_BIN_PATH) || fs.existsSync(path.join(HOME, ".local/node/bin/dws"))

if (skillOk) {
  if (monoOk && multiSkills.length > 0) {
    console.log(`${PREFIX} dws skills OK (mono + official multi: ${multiSkills.join(", ")})`)
  } else if (monoOk) {
    console.log(`${PREFIX} dws skill OK (${DWS_SKILL_DIR})`)
  } else {
    console.log(`${PREFIX} dws skills OK (official multi: ${multiSkills.join(", ")})`)
  }
} else {
  console.warn(
    `${PREFIX} dws skill missing\n` +
      `  Official multi: curl install.sh | sh && dws skill setup --mode multi --target openclaw --yes\n` +
      `  Community mono: npm install (in connector dir) or node scripts/install-community-dws.js\n` +
      `  Or set DWS_SKIP_AUTO_INSTALL=1 and install manually from ${DWS_COMMUNITY_REPO}`,
  )
}

if (cliOk) {
  console.log(`${PREFIX} dws CLI OK`)
} else {
  console.warn(
    `${PREFIX} dws CLI not found at ${DWS_BIN_PATH}\n` +
      `  Official: curl install.sh from DingTalk-Real-AI/dingtalk-workspace-cli\n` +
      `  Community: cd ${DWS_VENDOR_DIR} && go build -o ${DWS_BIN_PATH} ./cmd`,
  )
}

if (!skillOk) {
  process.exitCode = 0
}
