import { createHash } from "node:crypto"

const PRODUCTS = new Set(["contact", "aisearch", "calendar", "todo", "doc", "drive", "wiki", "chat", "minutes", "mail", "oa", "attendance", "report", "aitable", "sheet", "ding", "schema"])
const LOCAL_ACTIONS = new Set(["sync", "import", "export", "upload", "download", "execute", "exec", "run", "script"])
const FORBIDDEN = /^(?:profile|client-id|client-secret|token|config|config-dir|mcp-url|pre-url|env|file|file-path|input|input-file|output|output-dir|body-stdin|source|source-file|sql-file|download-resources|debug|verbose|mock)$/

/** The CLI never receives identity, endpoint or local-file authority from model arguments. */
export function validateDwsArguments(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 100 || raw.some(v => typeof v !== "string" || !v || v.includes("\0"))
    || Buffer.byteLength(JSON.stringify(raw)) > 64_000) throw new Error("Invalid DWS argument array")
  const args = raw as string[]
  if (args.length === 2 && args[0] === "auth" && args[1] === "status") return [...args]
  if (!PRODUCTS.has(args[0])) throw new Error("DWS authentication, profiles, developer/admin and arbitrary API commands are not exposed")
  const command = args.slice(1, args.findIndex((v, i) => i > 0 && v.startsWith("-")) < 0 ? args.length : args.findIndex((v, i) => i > 0 && v.startsWith("-")))
  if (command.some(v => LOCAL_ACTIONS.has(v.toLowerCase()) || /^\+.*(?:upload|download|import|export|sync)/i.test(v))) throw new Error("Local file operations require the authorized file tool")
  for (const arg of args) {
    if (arg === "--" || /^-[^-]/.test(arg)) throw new Error("Use full flag names; short flags and option terminators are not supported")
    if (arg.startsWith("--") && FORBIDDEN.test(arg.slice(2).split("=", 1)[0])) throw new Error("DWS identity, endpoints and local files are host-controlled")
  }
  if (args.some(v => /^--markdown(?:=|$)/.test(v)) && args.some(v => /!\s*\[/.test(v))) throw new Error("Use the authorized file tool for media; DWS local Markdown media is not exposed")
  return [...args]
}

export function dwsIdentity(tenantId: string, senderId: string) {
  if (![tenantId, senderId].every(v => /^[A-Za-z0-9_-]+$/.test(v))) throw new Error("Invalid trusted DWS identity")
  return { profile: `${tenantId}:${senderId}`, directory: createHash("sha256").update(JSON.stringify([tenantId, senderId])).digest("hex") }
}
