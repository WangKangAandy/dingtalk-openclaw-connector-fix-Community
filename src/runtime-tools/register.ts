import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"
import type { ScopeServices } from "../memory-scope/services.ts"
import { dwsIdentity, validateDwsArguments } from "./dws-policy.ts"

const dwsInput = z.object({ args: z.array(z.string()).min(2).max(100) }).strict()
// Delivery resolves relative media paths in the host-bound session workspace.
// Container absolute paths are a different namespace and are not host paths.
const relativeFilePath = z.string().min(1).max(2048)
  .regex(/^(?![~/])(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\\:\x00-\x1f])(?!.*\/\/)(?!.*\/$).+$/,
    "Use a workspace-relative filename; absolute paths and traversal are not allowed")
  .describe("Path relative to the current workspace: report.txt for /workspace/report.txt. Never pass a host or container absolute path.")
const fileInput = z.union([
  z.object({ workspaceRelativePath: relativeFilePath }).strict(),
  z.object({ path: relativeFilePath }).strict(),
])
function schema(input: z.ZodType) { const { $schema: _, ...json } = z.toJSONSchema(input); return json as any }
const fileParameters = {
  type: "object",
  properties: {
    workspaceRelativePath: schema(relativeFilePath),
    path: schema(relativeFilePath),
  },
  oneOf: schema(fileInput).anyOf,
}
type Settings = { enabled?: boolean; dwsImage?: string; dwsStateRoot?: string }
function settings(api: OpenClawPluginApi): Settings {
  return (((api.runtime.config?.current?.() ?? api.config)?.plugins?.entries?.["dingtalk-connector"]?.config as any)?.runtimeTools ?? {})
}
function privateDirectory(root: string, name: string): string {
  if (!path.isAbsolute(root)) throw new Error("Absolute DWS state root required")
  const target = path.join(root, name)
  let current = path.parse(target).root
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.existsSync(current)) { if (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink()) throw new Error("Linked DWS state path rejected") }
    else fs.mkdirSync(current, { mode: 0o700 })
  }
  return target
}

/** No shell; only the current person's isolated CLI container receives that person's keyring. */
export async function runDwsContainer(options: { image: string; directory: string; profile: string; args: string[]; assertCurrent: () => void; signal?: AbortSignal }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(options.image)) throw new Error("Pin the DWS runtime image by its local image ID")
  const name = `dingtalk-dws-${randomUUID()}`
  const args = ["run", "--rm", "--name", name, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "--network", "bridge", "--pids-limit", "128", "--memory", "512m", "--tmpfs", "/tmp:rw,nosuid,size=64m", "--tmpfs", "/work:rw,nosuid,size=32m,mode=1777", "--workdir", "/work",
    "--mount", `type=bind,source=${options.directory},target=/home/dws`, "--env", "HOME=/home/dws", "--env", "DWS_CONFIG_DIR=/home/dws/.dws", "--env", "XDG_DATA_HOME=/home/dws/.local/share", "--entrypoint", "dws", options.image,
    "--profile", options.profile, ...options.args, "--format", "json"]
  options.assertCurrent(); options.signal?.throwIfAborted()
  let processStarted = false
  try {
    return await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); processStarted = true
      let stdout = "", stderr = "", bytes = 0, failure: Error | undefined
      const stop = (err: Error) => { failure ??= err; clearTimeout(timer); clearInterval(guard); child.kill("SIGTERM"); reject(err) }
      const timer = setTimeout(() => stop(new Error("DWS deadline exceeded; delivery state may be unknown, do not retry automatically")), 90_000)
      const guard = setInterval(() => { try { options.assertCurrent(); options.signal?.throwIfAborted() } catch { stop(new Error("DWS request authority expired; do not retry automatically")) } }, 250)
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8")
      const collect = (stream: "stdout" | "stderr", chunk: string) => { bytes += Buffer.byteLength(chunk); if (bytes > 512_000) stop(new Error("DWS output exceeded limit")); else if (stream === "stdout") stdout += chunk; else stderr += chunk }
      child.stdout.on("data", chunk => collect("stdout", chunk)); child.stderr.on("data", chunk => collect("stderr", chunk))
      child.on("error", err => { clearTimeout(timer); clearInterval(guard); reject(err) })
      child.on("close", code => { clearTimeout(timer); clearInterval(guard); if (failure) reject(failure); else { try { options.assertCurrent(); resolve({ exitCode: code, stdout, stderr }) } catch (err) { reject(err) } } })
    })
  } finally {
    if (processStarted) await new Promise<void>(resolve => { const p = spawn("docker", ["rm", "-f", name], { stdio: "ignore", windowsHide: true }); p.on("error", () => resolve()); p.on("close", () => resolve()); setTimeout(() => { p.kill(); resolve() }, 5000).unref() })
  }
}

export function registerRuntimeTools(api: OpenClawPluginApi, services: ScopeServices) {
  if (!(api.config?.plugins?.entries?.["dingtalk-connector"]?.config as any)?.runtimeTools?.enabled) return
  api.registerTool({ contextVersion: 2, create(ctx) {
    if (!settings(api).enabled) return null
    let caller: ReturnType<ScopeServices["admissions"]["requester"]>
    try { services.assertCurrent(); caller = services.admissions.requester(ctx) } catch { return null }
    const capturedSettings = JSON.stringify(settings(api))
    const assertCurrent = () => { services.assertCurrent(); caller.assertCurrent(); if (!settings(api).enabled || JSON.stringify(settings(api)) !== capturedSettings) throw new Error("Runtime tool configuration changed") }
    return [
      { name: "dingtalk_dws", label: "DingTalk requester business tools", description: "Run official DWS cloud business commands as the authenticated sender, including in a group. Pass CLI args without the dws executable. Profile and credentials are fixed by the host; cannot select another user. Use schema --cli-path for command discovery. Local file, auth/admin and arbitrary API commands are unavailable. Honor DWS confirmation: only pass --yes after the user confirms that concrete operation; never retry unknown delivery. Return actual JSON errors, never assume success.", parameters: schema(dwsInput), async execute(_id: string, raw: unknown, signal?: AbortSignal) {
        assertCurrent(); const input = dwsInput.parse(raw); const args = validateDwsArguments(input.args); const cfg = settings(api); const identity = dwsIdentity(caller.tenantId, caller.senderId)
        if (!cfg.dwsImage || !cfg.dwsStateRoot) throw new Error("DWS runtime is not configured")
        const directory = privateDirectory(cfg.dwsStateRoot, identity.directory)
        const result = await runDwsContainer({ image: cfg.dwsImage, directory, profile: identity.profile, args, assertCurrent, signal })
        // Code Mode projects `details` as the tool result. Keep the business payload
        // here as well as in text; exitCode alone is not a usable CLI result.
        const details = { profile: identity.profile, ...result }
        return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details, isError: result.exitCode !== 0 }
      } },
      { name: "dingtalk_send_file", label: "Send current conversation file", description: "Send a file or image from the current session's authorized workspace to this DingTalk conversation. Pass workspaceRelativePath, a workspace-relative filename such as report.txt or reports/result.png (for a file created at /workspace/report.txt, pass report.txt). The older path field is accepted for existing conversations with the same validation; new calls should use workspaceRelativePath. Absolute paths, parent traversal, targets and identity overrides are rejected. Ask the user before sending if they did not request it. A failure is not proof of delivery; do not retry unknown delivery automatically.", parameters: fileParameters, async execute(_id: string, raw: unknown) {
        assertCurrent(); const input = fileInput.parse(raw); if (!ctx.delivery) throw new Error("Host-authorized current-route delivery unavailable")
        await ctx.delivery.send({ mediaUrl: "workspaceRelativePath" in input ? input.workspaceRelativePath : input.path }); assertCurrent()
        return { content: [{ type: "text" as const, text: JSON.stringify({ delivered: true }) }], details: { delivered: true } }
      } },
    ]
  } }, { names: ["dingtalk_dws", "dingtalk_send_file"] })
  api.on("before_prompt_build", (_event, ctx) => {
    if (!settings(api).enabled || !ctx.toolAuthority?.allows("dingtalk_dws")) return
    try {
      services.admissions.sourceGrant(ctx, ["memory.read"], services.assertCurrent)
      return { prependSystemContext: "## Authorized DingTalk business and files\nUse dingtalk_dws for DWS cloud operations. The host fixes the authenticated sender's profile; do not run DWS via shell or request shared credentials. Profile enumeration/switching is unavailable and unnecessary: for authentication checks use args [\"auth\",\"status\"]. Command/schema arguments go to this tool without the dws executable. Read stdout/stderr and exitCode from the returned result; honor service confirmation requirements. To send a generated file/image to this conversation, use dingtalk_send_file with workspaceRelativePath set to a workspace-relative filename (report.txt for /workspace/report.txt). Do not emit host paths or legacy media markers as a substitute for authorized file delivery." }
    } catch { return }
  }, { requiresToolAuthority: true })
}
