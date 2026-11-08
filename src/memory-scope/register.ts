import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"
import { createHardScopeRuntime, hardScopeEnabled, setHardScopeRuntime } from "./hard-runtime.ts"
import { ScopedMemoryStore } from "./store.ts"
import { MEMORY_TOOL, scopedMemoryTool } from "./memory-tool.ts"
import { NATIVE_SCOPE_TOOLS, runtimeToolsEnabled, scopeContextSelected, scopedWorkshopSelected } from "./scope-policy.js"
import { registerRuntimeTools } from "../runtime-tools/register.ts"
import { admittedWorkshopFork, publishScopedWorkshopAccess } from "./workshop-api.ts"

/** A removal-only bootstrap boundary. Session spelling is never used to grant access. */
export function stripUnscopedMemory(files: { name: string; path: string }[]) {
  return files.filter(file => {
    const path = file.path.replaceAll("\\", "/").toLowerCase()
    return !["memory.md", "user.md"].includes(file.name.toLowerCase()) && !path.split("/").includes("memory")
  })
}

/** One trusted DingTalk admission owner; storage and business tools opt in separately. */
export function registerMemoryScope(api: OpenClawPluginApi): void {
  setHardScopeRuntime(undefined)
  const scoped = hardScopeEnabled(api.config)
  if (!scoped && !runtimeToolsEnabled(api.config)) {
    return
  }
  const runtime = createHardScopeRuntime(api)
  setHardScopeRuntime(runtime)
  const services = runtime.services
  const unpublish = scoped ? publishScopedWorkshopAccess(services) : () => {}
  // Reload/unload can dispose a plugin without stopping the Gateway. Revoke
  // the old instance even if its configuration snapshot has not changed.
  api.lifecycle?.onDispose?.(() => { unpublish(); services.stop() })
  if (!scoped) {
    registerRuntimeTools(api, services)
    api.on("gateway_stop", () => services.stop())
    api.logger.info("[dingtalk-connector] runtime tools registered with trusted sender admission; scoped storage remains disabled")
    return
  }
  const store = new ScopedMemoryStore(services.storageRoot)
  api.registerTool({ contextVersion: 2, create(ctx) {
    try {
      services.assertCurrent()
      const grant = services.admissions.toolGrant(ctx, ["memory.read", "memory.search", "memory.list", "memory.write", "memory.delete"])
      return scopedMemoryTool(store, grant, () => { services.assertCurrent(); ctx.assertInvocationCurrent() })
    } catch (error) {
      if (ctx.messageChannel === "dingtalk-connector") api.logger.warn(`[memory-scope] scoped_memory unavailable: ${String(error)}`)
      return null
    }
  } }, { name: MEMORY_TOOL })
  registerRuntimeTools(api, services)
  api.registerHook("agent:bootstrap", event => {
    if (event.type !== "agent" || event.action !== "bootstrap") return
    const context = event.context
    if (!scopeContextSelected(api.runtime.config.current(), context)) return
    if (typeof context.sessionKey !== "string" || !context.sessionKey.includes(":dingtalk-connector:")) return
    if (Array.isArray(context.bootstrapFiles)) context.bootstrapFiles = stripUnscopedMemory(context.bootstrapFiles)
  }, { name: "dingtalk-hard-memory-bootstrap", description: "Exclude unscoped memory from DingTalk prompts" })
  api.on("before_prompt_build", (_event, ctx) => {
    if (!ctx.toolAuthority?.allows(MEMORY_TOOL)) return
    try {
      ctx.toolAuthority.assertActive()
      services.admissions.sourceGrant(ctx, ["memory.read"], services.assertCurrent)
      return { prependSystemContext: "## Scoped durable memory\nUse scoped_memory for facts/preferences. The trusted current conversation fixes the scope: private user in direct chat, shared group in group chat. Read before updating; respect revision conflicts. Do not use workspace MEMORY.md or native memory tools as a fallback. Shared AGENTS rules are guidance, not private memory." }
    } catch { return }
  }, { priority: 40, requiresToolAuthority: true })
  api.on("before_agent_run", (_event, ctx) => {
    if (ctx.channel !== "dingtalk-connector" && !ctx.sessionKey?.includes(":dingtalk-connector:")) return
    if (!hardScopeEnabled(api.runtime.config.current(), ctx.agentId)) return
    try {
      const fork = admittedWorkshopFork(ctx)
      if (fork) { runtime.assertExecution(fork); return }
      runtime.assertExecution(ctx)
      // Foreground source identity must survive the host dispatch unchanged.
      // Detached reviews have no channel identity and retain their own opaque
      // runner binding plus work lease; this gate does not mint them a grant.
      if (ctx.channel === "dingtalk-connector") services.admissions.sourceGrant(ctx, ["memory.read"], services.assertCurrent)
    } catch (error) {
      return { outcome: "block" as const, reason: String(error),
        message: "Scoped memory refused this runtime: compatible host capabilities and a trusted scope binding are required. Run dingtalk-connector scope check." }
    }
  })
  api.on("before_tool_call", (event, ctx) => {
    if (ctx.requester?.channel !== "dingtalk-connector" && !ctx.sessionKey?.includes(":dingtalk-connector:")) return
    if (!hardScopeEnabled(api.runtime.config.current(), ctx.agentId)) return
    if (NATIVE_SCOPE_TOOLS.includes(event.toolName)
      && !(event.toolName === "skill_workshop" && scopedWorkshopSelected(api.runtime.config.current()))) {
      return { block: true, blockReason: "Use the scoped memory/learning tool for this conversation." }
    }
  })
  api.on("before_reset", (event, ctx) => { if (ctx.sessionKey) services.admissions.invalidateForReset(ctx.sessionKey, event.reason) })
  api.on("session_end", (event, ctx) => { if (ctx.sessionKey) services.admissions.invalidateForReset(ctx.sessionKey, event.reason) })
  api.on("gateway_stop", () => { unpublish(); services.stop() })
  api.logger.info("[memory-scope] scoped memory registered; sandbox, mounts and ordinary tools remain host-owned")
}
