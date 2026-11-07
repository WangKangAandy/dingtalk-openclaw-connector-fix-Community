import { createHash } from "node:crypto"

const PRODUCTS = new Set(["contact", "aisearch", "calendar", "todo", "doc", "drive", "wiki", "chat", "minutes", "mail", "oa", "attendance", "report", "aitable", "sheet", "ding", "schema"])
const LOCAL_ACTIONS = new Set(["sync", "import", "export", "upload", "download", "download-version", "version-download", "execute", "exec", "run", "script"])
// DWS accepts global flags between any command levels. Treat known boolean
// flags as standalone; every other long flag consumes its following token as a
// value while collecting the command path. This keeps message bodies from
// being treated as subcommands, while nested local operations remain blocked.
const BOOLEAN_FLAGS = new Set(["yes", "dry-run", "force", "json", "no-color", "help", "version"])
const LOCAL_COMMAND_PREFIXES = [
  ["drive", "download"], ["drive", "download-version"], ["drive", "version-download"], ["drive", "upload"],
  ["drive", "pull"], ["drive", "push"], ["drive", "sync"],
  ["doc", "export"], ["doc", "import"], ["doc", "media-download"],
  ["doc", "resource-download"], ["doc", "download-overwrite"], ["doc", "script"], ["doc", "media-upload"],
  ["doc", "media-insert"], ["doc", "create-with-media"], ["doc", "resource-update"],
  ["chat", "messages-resource-download"], ["chat", "messages-resources-download"], ["chat", "conversation-file"],
  ["mail", "message", "export"], ["mail", "attachment", "download"],
  ["aitable", "import-file"], ["sheet", "export"], ["minutes", "export"], ["minutes", "download"],
] as const
const FORBIDDEN = /^(?:profile|client-id|client-secret|token|config|config-dir|mcp-url|pre-url|base-url|endpoint|env|file|file-path|input|input-file|output|output-dir|body-stdin|source|source-file|sql-file|download-resources|debug|verbose|mock|checkpoint|plan|delegator-user-id|delegator-corp-id|delegator-open-dingtalk-id)$/

/** The CLI never receives identity, endpoint or local-file authority from model arguments. */
export function validateDwsArguments(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 100 || raw.some(v => typeof v !== "string" || !v || v.includes("\0"))
    || Buffer.byteLength(JSON.stringify(raw)) > 64_000) throw new Error("Invalid DWS argument array")
  const args = raw as string[]
  if (args.length === 2 && args[0] === "auth" && args[1] === "status") return [...args]
  if (!PRODUCTS.has(args[0])) throw new Error("DWS authentication, profiles, developer/admin and arbitrary API commands are not exposed")
  const command: string[] = []
  for (let i = 1; i < args.length; i += 1) {
    const value = args[i]
    if (value.startsWith("--")) {
      const flag = value.slice(2).split("=", 1)[0].toLowerCase()
      if (!value.includes("=") && !BOOLEAN_FLAGS.has(flag) && i + 1 < args.length && !args[i + 1].startsWith("-")) i += 1
      continue
    }
    command.push(value)
  }
  const normalized = [args[0], ...command].map(v => v.replace(/^\+/, "").toLowerCase())
  const directLocal = LOCAL_ACTIONS.has(normalized[1] ?? "") || /^\+.*(?:upload|download|import|export|sync)/i.test(command[0] ?? "")
  const nestedLocal = LOCAL_COMMAND_PREFIXES.some(prefix => prefix.every((value, index) => normalized[index] === value))
  if (directLocal || nestedLocal) throw new Error("Local file operations require the authorized file tool")
  for (const arg of args) {
    if (arg === "--" || /^-[^-]/.test(arg)) throw new Error("Use full flag names; short flags and option terminators are not supported")
    const flag = arg.startsWith("--") ? arg.slice(2).split("=", 1)[0] : ""
    if (flag && (FORBIDDEN.test(flag) || /(?:^|-)file(?:s)?(?:-|$)/.test(flag) || flag.startsWith("delegator-"))) throw new Error("DWS identity, endpoints and local files are host-controlled")
    const value = arg.startsWith("--") && arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : arg
    if (value.trimStart().startsWith("@")) throw new Error("DWS @file expansion is not exposed; pass inline content")
  }
  if (args.some(v => /!\s*\[/.test(v))) throw new Error("Use the authorized file tool for media; DWS local Markdown media is not exposed")
  return [...args]
}

export function dwsIdentity(tenantId: string, senderId: string) {
  if (![tenantId, senderId].every(v => /^[A-Za-z0-9_-]+$/.test(v))) throw new Error("Invalid trusted DWS identity")
  return { profile: `${tenantId}:${senderId}`, directory: createHash("sha256").update(JSON.stringify([tenantId, senderId])).digest("hex") }
}
