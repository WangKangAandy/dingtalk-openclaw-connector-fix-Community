import type {
  AgentToolResultMiddleware,
  AgentToolResultMiddlewareContext,
  AgentToolResultMiddlewareEvent,
} from "openclaw/plugin-sdk/agent-harness"

import { buildSafeMemorySearchResult, filterMemorySearchToolResult } from "./search-result-filter.ts"
import { classifyDingtalkSession } from "./session-scope.ts"
import type { DingtalkSessionScopeOptions } from "./types.ts"

export type MemoryResultMiddlewareOptions = DingtalkSessionScopeOptions & {
  workspaceDir?: string
}

export function createMemorySearchResultMiddleware(
  options: () => MemoryResultMiddlewareOptions,
): AgentToolResultMiddleware {
  return (
    event: AgentToolResultMiddlewareEvent,
    ctx: AgentToolResultMiddlewareContext,
  ) => {
    if (event.toolName !== "memory_search") return
    if (!ctx.sessionKey?.trim()) {
      return { result: buildSafeMemorySearchResult(event.result, "trusted sessionKey is unavailable") }
    }
    const resolvedOptions = options()
    const classification = classifyDingtalkSession(ctx.sessionKey, resolvedOptions)
    if (classification.kind === "non_dingtalk") return
    if (classification.kind === "malformed_dingtalk") {
      return { result: buildSafeMemorySearchResult(event.result, classification.reason) }
    }
    try {
      return {
        result: filterMemorySearchToolResult(
          event.result,
          classification.scope,
          resolvedOptions.workspaceDir,
        ),
      }
    } catch (error) {
      return { result: buildSafeMemorySearchResult(event.result, String(error)) }
    }
  }
}
