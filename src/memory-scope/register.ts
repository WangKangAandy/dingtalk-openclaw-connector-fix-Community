import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

import { handleMemoryScopeBootstrapEvent } from "./bootstrap-handler.ts"
import { LOG_PREFIX } from "./constants.ts"
import { resolveMemoryScopeConfig } from "./config.ts"
import { ensureAgentsMemoryScopeSections } from "./agents-memory-sync.ts"
import { ensureScopedMemoryFile } from "./paths.ts"
import { buildMemoryScopePrompt } from "./prompt-handler.ts"
import { ensureRootMemoryScopeSection } from "./root-memory-sync.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"

function resolveWorkspaceDir(api: OpenClawPluginApi): string | undefined {
  return api.config.agents?.defaults?.workspace?.trim() || undefined
}

/**
 * Register per-user / per-group memory isolation hooks for DingTalk sessions.
 * Keeps all memory-scope logic self-contained; entry point only wires hooks.
 */
export function registerMemoryScope(api: OpenClawPluginApi): void {
  const memoryScopeConfig = () => resolveMemoryScopeConfig(api.config)
  const isEnabled = () => memoryScopeConfig().enabled

  if (typeof api.registerHook !== "function" || typeof api.on !== "function") {
    api.logger?.warn?.(`${LOG_PREFIX} plugin hooks unavailable; memory scope disabled`)
    return
  }

  const workspaceDir = resolveWorkspaceDir(api)
  if (workspaceDir && isEnabled() && memoryScopeConfig().syncRootMemoryRules) {
    try {
      ensureRootMemoryScopeSection(workspaceDir)
      api.logger?.info?.(`${LOG_PREFIX} synced root MEMORY.md rules section`)
    } catch (err) {
      api.logger?.warn?.(`${LOG_PREFIX} root MEMORY sync failed: ${String(err)}`)
    }
  }

  if (workspaceDir && isEnabled() && memoryScopeConfig().syncAgentsMemoryRules) {
    try {
      const result = ensureAgentsMemoryScopeSections(workspaceDir)
      if (result.applied) {
        api.logger?.info?.(`${LOG_PREFIX} synced AGENTS.md memory marked sections`)
      }
    } catch (err) {
      api.logger?.warn?.(`${LOG_PREFIX} AGENTS.md memory sync failed: ${String(err)}`)
    }
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
      description: "Inject root + scoped MEMORY.md into DingTalk session bootstrap",
    },
  )

  api.on(
    "before_prompt_build",
    async (_event, ctx) => {
      if (!isEnabled()) return
      const scope = parseDingtalkMemoryScope(ctx.sessionKey)
      if (!scope) return

      const wsDir = resolveWorkspaceDir(api)
      if (wsDir) {
        try {
          ensureScopedMemoryFile(wsDir, scope)
        } catch (err) {
          api.logger?.warn?.(`${LOG_PREFIX} ensure scope memory failed: ${String(err)}`)
        }
      }

      return { prependSystemContext: buildMemoryScopePrompt(scope) }
    },
    { priority: 40 },
  )

  api.logger?.info?.(
    `${LOG_PREFIX} registered (enabled=${isEnabled()}, syncRootMemoryRules=${memoryScopeConfig().syncRootMemoryRules}, syncAgentsMemoryRules=${memoryScopeConfig().syncAgentsMemoryRules})`,
  )
}
