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
import { classifyDingtalkSession, parseDingtalkMemoryScope } from "./session-scope.ts"
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
      accountIds.length > 1
        ? "memoryScope does not yet support multiple DingTalk accounts in one workspace"
        : api.config.session?.dmScope !== "per-account-channel-peer"
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

  const startupScopeOptions = resolveSessionScopeOptions(api)
  const startupConfigurationValid = !startupScopeOptions.configurationError
  if (isEnabled() && !startupConfigurationValid) {
    api.logger?.error?.(
      `${LOG_PREFIX} unsafe configuration; memory access will fail closed: ${startupScopeOptions.configurationError}`,
    )
  }

  const workspaceDir = resolveWorkspaceDir(api)
  if (workspaceDir && isEnabled() && startupConfigurationValid && memoryScopeConfig().syncRootMemoryRules) {
    try {
      ensureRootMemoryScopeSection(workspaceDir)
      api.logger?.info?.(`${LOG_PREFIX} synced root MEMORY.md rules section`)
    } catch (err) {
      api.logger?.warn?.(`${LOG_PREFIX} root MEMORY sync failed: ${String(err)}`)
    }
  }

  if (workspaceDir && isEnabled() && startupConfigurationValid && memoryScopeConfig().syncAgentsMemoryRules) {
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

  let searchIsolationReady = false
  if (typeof api.registerAgentToolResultMiddleware !== "function") {
    if (isEnabled()) {
      api.logger?.error?.(
        `${LOG_PREFIX} agent tool result middleware unavailable; DingTalk memory_search will be blocked`,
      )
    }
  } else {
    const middleware = createMemorySearchResultMiddleware(() => ({
      ...resolveSessionScopeOptions(api),
      workspaceDir: resolveWorkspaceDir(api),
    }))
    try {
      api.registerAgentToolResultMiddleware(
        async (event, ctx) => isEnabled() ? await middleware(event, ctx) : undefined,
        { runtimes: ["openclaw"] },
      )
      searchIsolationReady = true
    } catch (err) {
      if (isEnabled()) {
        api.logger?.error?.(
          `${LOG_PREFIX} agent tool result middleware registration failed; DingTalk memory_search will be blocked: ${String(err)}`,
        )
      }
    }
  }

  api.on(
    "before_tool_call",
    async (event, ctx) => {
      if (!isEnabled()) return
      const scopeOptions = resolveSessionScopeOptions(api)
      if (event.toolName === "memory_search") {
        const classification = classifyDingtalkSession(ctx.sessionKey, scopeOptions)
        if (classification.kind === "malformed_dingtalk") {
          return {
            block: true,
            blockReason: `memory-scope: invalid DingTalk session context (${classification.reason})`,
          }
        }
        if (classification.kind === "non_dingtalk") {
          if (ctx.sessionKey?.trim() || searchIsolationReady) return
          return {
            block: true,
            blockReason: "memory-scope: memory_search blocked because trusted session context and result isolation middleware are unavailable",
          }
        }
        if (!searchIsolationReady) {
          return {
            block: true,
            blockReason: "memory-scope: memory_search blocked because result isolation middleware is unavailable",
          }
        }
      }
      const decision = evaluateMemoryToolCall({
        toolName: event.toolName,
        toolParams: event.params,
        sessionKey: ctx.sessionKey,
        workspaceDir: resolveWorkspaceDir(api),
        scopeOptions,
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
