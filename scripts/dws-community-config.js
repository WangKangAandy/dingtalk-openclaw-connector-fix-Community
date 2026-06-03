import os from "node:os"
import path from "node:path"

/** Community dws fork paired with this connector (per-sender OAuth). */
export const DWS_COMMUNITY_REPO = "https://github.com/WangKangAandy/dingtalk-workspace-cli"
export const DWS_COMMUNITY_GIT = `${DWS_COMMUNITY_REPO}.git`
export const DWS_COMMUNITY_REF = process.env.DWS_COMMUNITY_REF || "main"

export const DWS_VENDOR_DIR = path.join(os.homedir(), ".openclaw/vendor/dingtalk-workspace-cli")
export const DWS_SKILL_DIR = path.join(os.homedir(), ".openclaw/skills/dws")
export const DWS_BIN_DIR = path.join(os.homedir(), ".local/bin")
export const DWS_BIN_PATH = path.join(DWS_BIN_DIR, "dws")
