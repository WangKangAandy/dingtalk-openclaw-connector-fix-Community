import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

import { listDingtalkAccountIds } from "../config/accounts.ts"
import { handleMemoryScopeBootstrapEvent } from "./bootstrap-handler.ts"
import { LOG_PREFIX } from "./constants.ts"
import { resolveMemoryScopeConfig } from "./config.ts"
import { ensureAgentsMemoryScopeSections } from "./agents-memory-sync.ts"
import { ensureScopedMemoryFile } from "./paths.ts"
import { buildMemoryScopePrompt } from "./prompt-handler.ts"
import { createMemorySearchResultMiddleware } from "./result-middleware.ts"
import { ensureRootMemoryScopeSection } from "./root-memory-sync.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"
import { evaluateMemoryToolCall } from "./tool-guard.ts"
import type { DingtalkSessionScopeOptions } from "./types.ts"

const REGISTERED_APIS = new WeakSet<object>()

function resolveWorkspaceDir(api: OpenClawPluginApi): string | undefined {
  return api.config.agents?.defaults?.workspace?.trim() || undefined
}

function resolveSessionScopeOptions(api: OpenClawPluginApi): DingtalkSessionScopeOptions {
  const channel = api.config.channels?.["dingtalk-connector"] as
    | {
        groupSessionScope?: "group" | "group_sender"
        separateSessionByConversation?: boolean
        sharedMemoryAcrossConversations?: boolean
        accounts?: Record<string, {
          groupSessionScope?: "group" | "group_sender"
          separateSessionByConversation?: boolean
          sharedMemoryAcrossConversations?: boolean
        } | undefined>
      }
    | undefined
  const accountIds = listDingtalkAccountIds(api.config)
  const effective = accountIds.map((accountId) => {
    const account = channel?.accounts?.[accountId]
    return {
      groupSessionScope: account?.groupSessionScope ?? channel?.groupSessionScope ?? "group",
      separateSessionByConversation:
        account?.separateSessionByConversation ?? channel?.separateSessionByConversation ?? true,
      sharedMemoryAcrossConversations:
        account?.sharedMemoryAcrossConversations ?? channel?.sharedMemoryAcrossConversations ?? false,
    }
  })
  const groupModes = new Set(effective.map((entry) => entry.groupSessionScope))
  const invalidConversationIsolation = effective.some(
    (entry) => !entry.separateSessionByConversation || entry.sharedMemoryAcrossConversations,
  )
  return {
    accountIds,
    groupSessionScope: groupModes.size === 1
      ? effective[0]?.groupSessionScope ?? "group"
      : "group",
    requireAccountForDirect: true,
    configurationError:
      api.config.session?.dmScope !== "per-account-channel-peer"
        ? "session.dmScope must be per-account-channel-peer"
        : invalidConversationIsolation
          ? "conversation isolation settings are not safe for private memory scopes"
          : undefined,
    groupConfigurationError:
      groupModes.size !== 1
        ? "groupSessionScope differs across accounts and cannot be derived from the group session key"
        : accountIds.length > 1
          ? "multi-account group session keys do not carry a trusted account segment"
          : undefined,
  }
}

/**
 * Register per-user / per-group memory isolation hooks for DingTalk sessions.
 * Keeps all memory-scope logic self-contained; entry point only wires hooks.
 */
export function registerMemoryScope(api: OpenClawPluginApi): void {
  if (REGISTERED_APIS.has(api)) {
    api.logger?.warn?.(`${LOG_PREFIX} duplicate registration skipped`)
    return
  }
  REGISTERED_APIS.add(api)
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
        handleMemoryScopeBootstrapEvent(event, resolveSessionScopeOptions(api))
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
      const scope = parseDingtalkMemoryScope(ctx.sessionKey, resolveSessionScopeOptions(api))
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

  if (typeof api.registerAgentToolResultMiddleware !== "function") {
    api.logger?.warn?.(`${LOG_PREFIX} agent tool result middleware unavailable; hard search isolation disabled`)
  } else {
    const middleware = createMemorySearchResultMiddleware(() => ({
      ...resolveSessionScopeOptions(api),
      workspaceDir: resolveWorkspaceDir(api),
    }))
    api.registerAgentToolResultMiddleware(
      async (event, ctx) => isEnabled() ? await middleware(event, ctx) : undefined,
      { runtimes: ["openclaw"] },
    )
  }

  api.on(
    "before_tool_call",
    async (event, ctx) => {
      if (!isEnabled()) return
      const decision = evaluateMemoryToolCall({
        toolName: event.toolName,
        toolParams: event.params,
        sessionKey: ctx.sessionKey,
        workspaceDir: resolveWorkspaceDir(api),
        scopeOptions: resolveSessionScopeOptions(api),
      })
      if (decision.action === "block") {
        return { block: true, blockReason: decision.reason }
      }
    },
    { priority: 100 },
  )

  api.logger?.info?.(
    `${LOG_PREFIX} registered (enabled=${isEnabled()}, syncRootMemoryRules=${memoryScopeConfig().syncRootMemoryRules}, syncAgentsMemoryRules=${memoryScopeConfig().syncAgentsMemoryRules})`,
  )
}
