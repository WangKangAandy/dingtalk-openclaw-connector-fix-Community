import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

import { listDingtalkAccountIds } from "../config/accounts.ts"
import { classifyDingtalkSession } from "../memory-scope/session-scope.ts"
import { resolveProductionWriteGuardConfig } from "./config.ts"
import { evaluateProductionWrite } from "./policy.ts"
import { buildProductionWriteGuardPrompt, PRODUCTION_WRITE_BLOCK_MESSAGE } from "./prompt.ts"
import type { DingtalkSessionScopeOptions } from "../memory-scope/types.ts"

const REGISTERED_APIS = new WeakSet<object>()

function resolveWorkspaceDir(api: OpenClawPluginApi): string | undefined {
  return api.config.agents?.defaults?.workspace?.trim() || undefined
}

function resolveScopeOptions(api: OpenClawPluginApi): DingtalkSessionScopeOptions {
  return { accountIds: listDingtalkAccountIds(api.config), requireAccountForDirect: true }
}

export function registerProductionWriteGuard(api: OpenClawPluginApi): void {
  if (REGISTERED_APIS.has(api)) return
  REGISTERED_APIS.add(api)
  if (typeof api.on !== "function") return

  api.on("before_prompt_build", async (_event, ctx) => {
    const config = resolveProductionWriteGuardConfig(api.config)
    if (!config.enabled) return
    if (classifyDingtalkSession(ctx.sessionKey, resolveScopeOptions(api)).kind !== "valid") return
    return { prependSystemContext: buildProductionWriteGuardPrompt() }
  }, { priority: 50 })

  api.on("before_tool_call", async (event, ctx) => {
    const config = resolveProductionWriteGuardConfig(api.config)
    if (!config.enabled) return
    const classification = classifyDingtalkSession(ctx.sessionKey, resolveScopeOptions(api))
    if (classification.kind === "non_dingtalk") return
    const decision = evaluateProductionWrite({
      toolName: event.toolName,
      toolParams: event.params,
      sessionKey: ctx.sessionKey,
      workspaceDir: resolveWorkspaceDir(api),
      config,
      scopeOptions: resolveScopeOptions(api),
    })
    if (decision.action === "block") {
      api.logger?.warn?.(`[dingtalk-connector][production-write-guard] blocked tool=${event.toolName} reason=${decision.reason}`)
      return { block: true, blockReason: PRODUCTION_WRITE_BLOCK_MESSAGE }
    }
  }, { priority: 110 })
  api.logger?.info?.(`[dingtalk-connector][production-write-guard] registered (enabled=${resolveProductionWriteGuardConfig(api.config).enabled})`)
}
