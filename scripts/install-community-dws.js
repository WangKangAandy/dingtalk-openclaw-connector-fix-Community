#!/usr/bin/env node
/**
 * postinstall: clone/update WangKangAandy/dingtalk-workspace-cli, install skill, build CLI.
 * Non-fatal — connector npm install must not fail if network/go is unavailable.
 *
 * Env:
 *   DWS_SKIP_AUTO_INSTALL=1  — skip entirely
 *   DWS_COMMUNITY_REF=main   — git ref (branch/tag) to install
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import {
  DWS_BIN_DIR,
  DWS_BIN_PATH,
  DWS_COMMUNITY_GIT,
  DWS_COMMUNITY_REF,
  DWS_COMMUNITY_REPO,
  DWS_SKILL_DIR,
  DWS_VENDOR_DIR,
} from "./dws-community-config.js"

const PREFIX = "[dingtalk-connector]"

function log(msg) {
  console.log(`${PREFIX} ${msg}`)
}

function warn(msg) {
  console.warn(`${PREFIX} ${msg}`)
}

function hasCommand(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function runGit(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "inherit" })
}

function gitOutput(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
}

/** Prefer a remote that points at the community fork (origin / wangkang / community). */
function ensureCommunityRemote() {
  const remotes = gitOutput(["remote"], DWS_VENDOR_DIR).split("\n").filter(Boolean)
  for (const name of ["community", "wangkang", "origin"]) {
    if (!remotes.includes(name)) continue
    try {
      const url = gitOutput(["remote", "get-url", name], DWS_VENDOR_DIR)
      if (url.includes("WangKangAandy/dingtalk-workspace-cli")) {
        return name
      }
    } catch {
      /* try next */
    }
  }

  if (remotes.includes("origin")) {
    runGit(["remote", "set-url", "origin", DWS_COMMUNITY_GIT], DWS_VENDOR_DIR)
    return "origin"
  }

  runGit(["remote", "add", "community", DWS_COMMUNITY_GIT], DWS_VENDOR_DIR)
  return "community"
}

function ensureRepo() {
  const skillMd = path.join(DWS_VENDOR_DIR, "skills", "SKILL.md")
  if (fs.existsSync(path.join(DWS_VENDOR_DIR, ".git"))) {
    const remote = ensureCommunityRemote()
    log(`updating community dws @ ${DWS_COMMUNITY_REF} (${remote}) → ${DWS_VENDOR_DIR}`)
    runGit(["fetch", "--depth", "1", remote, DWS_COMMUNITY_REF], DWS_VENDOR_DIR)
    runGit(["checkout", "-B", "community-dws", "FETCH_HEAD"], DWS_VENDOR_DIR)
    return
  }

  if (fs.existsSync(DWS_VENDOR_DIR) && fs.existsSync(skillMd)) {
    log(`using existing dws checkout (no .git): ${DWS_VENDOR_DIR}`)
    return
  }

  fs.mkdirSync(path.dirname(DWS_VENDOR_DIR), { recursive: true })
  log(`cloning community dws @ ${DWS_COMMUNITY_REF} → ${DWS_VENDOR_DIR}`)
  runGit([
    "clone",
    "--depth",
    "1",
    "--branch",
    DWS_COMMUNITY_REF,
    DWS_COMMUNITY_GIT,
    DWS_VENDOR_DIR,
  ], path.dirname(DWS_VENDOR_DIR))
}

function installSkillFromRepo() {
  const skillSrc = path.join(DWS_VENDOR_DIR, "skills")
  const srcSkillMd = path.join(skillSrc, "SKILL.md")
  if (!fs.existsSync(srcSkillMd)) {
    throw new Error(`skill source missing: ${srcSkillMd}`)
  }

  fs.rmSync(DWS_SKILL_DIR, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(DWS_SKILL_DIR), { recursive: true })
  fs.cpSync(skillSrc, DWS_SKILL_DIR, { recursive: true })
  log(`dws skill installed → ${DWS_SKILL_DIR}`)
}

function buildCli() {
  if (!hasCommand("go")) {
    warn("go not found — skipped dws CLI build (skill still installed)")
    warn(`install Go, then: cd ${DWS_VENDOR_DIR} && go build -o ${DWS_BIN_PATH} ./cmd`)
    return false
  }

  fs.mkdirSync(DWS_BIN_DIR, { recursive: true })
  log(`building dws CLI → ${DWS_BIN_PATH}`)
  execFileSync("go", ["build", "-o", DWS_BIN_PATH, "./cmd"], {
    cwd: DWS_VENDOR_DIR,
    stdio: "inherit",
  })

  if (fs.existsSync(DWS_BIN_PATH)) {
    const version = execFileSync(DWS_BIN_PATH, ["--version"], { encoding: "utf8" }).trim()
    log(`dws CLI ready: ${version}`)
  } else {
    log(`dws CLI built at ${DWS_BIN_PATH} (ensure ~/.local/bin is on PATH)`)
  }
  return true
}

function main() {
  if (process.env.DWS_SKIP_AUTO_INSTALL === "1") {
    log("DWS_SKIP_AUTO_INSTALL=1 — skipped community dws auto-install")
    return
  }

  if (!hasCommand("git")) {
    warn("git not found — cannot auto-install community dws")
    warn(`manual: git clone ${DWS_COMMUNITY_REPO}.git ${DWS_VENDOR_DIR}`)
    return
  }

  try {
    log(`community dws auto-install (${DWS_COMMUNITY_REPO}@${DWS_COMMUNITY_REF})`)
    ensureRepo()
    installSkillFromRepo()
    buildCli()
    log("community dws auto-install done")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    warn(`community dws auto-install failed (non-fatal): ${message}`)
    warn(`manual: git clone ${DWS_COMMUNITY_REPO}.git ${DWS_VENDOR_DIR}`)
    warn(`  cd ${path.basename(DWS_VENDOR_DIR)} && go build -o ${DWS_BIN_PATH} ./cmd`)
  }
}

main()
