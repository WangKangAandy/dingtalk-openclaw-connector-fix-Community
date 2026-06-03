import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

import { handleMemoryScopeBootstrapEvent } from "./bootstrap-handler.ts"
import { LOG_PREFIX } from "./constants.ts"
import { resolveMemoryScopeConfig } from "./config.ts"
import { ensureScopeDirectory } from "./paths.ts"
import { buildMemoryScopePrompt } from "./prompt-handler.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"
import { evaluateMemoryToolCall } from "./tool-guard.ts"

function resolveWorkspaceDir(api: OpenClawPluginApi): string | undefined {
  return api.config.agents?.defaults?.workspace?.trim() || undefined
}

/**
 * Register per-user / per-group memory isolation hooks for DingTalk sessions.
 * Keeps all memory-scope logic self-contained; entry point only wires hooks.
 */
export function registerMemoryScope(api: OpenClawPluginApi): void {
  const isEnabled = () => resolveMemoryScopeConfig(api.config).enabled

  if (typeof api.registerHook !== "function" || typeof api.on !== "function") {
    api.logger?.warn?.(`${LOG_PREFIX} plugin hooks unavailable; memory scope disabled`)
    return
  }

  api.registerHook(
    "agent:bootstrap",
    async (event) => {
      if (!isEnabled()) return
      try {
        handleMemoryScopeBootstrapEvent(event)
      } catch (err) {
        api.logger?.warn?.(`${LOG_PREFIX} bootstrap hook failed: ${String(err)}`)
      }
    },
    {
      name: "dingtalk-memory-scope-bootstrap",
      description: "Scope DingTalk session bootstrap MEMORY.md to per-user/per-group directories",
    },
  )

  api.on(
    "before_prompt_build",
    async (_event, ctx) => {
      if (!isEnabled()) return
      const scope = parseDingtalkMemoryScope(ctx.sessionKey)
      if (!scope) return

      const workspaceDir = resolveWorkspaceDir(api)
      if (workspaceDir) {
        try {
          ensureScopeDirectory(workspaceDir, scope)
        } catch (err) {
          api.logger?.warn?.(`${LOG_PREFIX} ensure scope dir failed: ${String(err)}`)
        }
      }

      return { prependSystemContext: buildMemoryScopePrompt(scope) }
    },
    { priority: 40 },
  )

  api.on(
    "before_tool_call",
    async (event, ctx) => {
      if (!isEnabled()) return

      const workspaceDir = resolveWorkspaceDir(api)
      const decision = evaluateMemoryToolCall({
        toolName: event.toolName,
        toolParams: event.params,
        sessionKey: ctx.sessionKey,
        workspaceDir,
      })

      if (decision.action === "block") {
        return { block: true, blockReason: decision.reason }
      }
      if (decision.action === "rewrite") {
        return { params: decision.params }
      }
    },
    { priority: 40 },
  )

  api.logger?.info?.(`${LOG_PREFIX} registered (enabled=${isEnabled()})`)
}
