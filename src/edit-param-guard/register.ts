import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

import { LOG_PREFIX } from "./constants.ts"
import { evaluateEditToolCall } from "./validate.ts"

/**
 * Workaround for OpenClaw edit param validation bug (empty oldText → misleading
 * "Missing required parameter: edits"). Runs before upstream assertRequiredParams.
 *
 * Independent of memory-scope; applies to all agent edit tool calls while this
 * plugin is loaded. Disable with DINGTALK_EDIT_PARAM_GUARD=0.
 */
export function registerEditParamGuard(api: OpenClawPluginApi): void {
  if (typeof api.on !== "function") {
    api.logger?.warn?.(`${LOG_PREFIX} plugin hooks unavailable; edit param guard disabled`)
    return
  }

  if (process.env.DINGTALK_EDIT_PARAM_GUARD === "0") {
    api.logger?.info?.(`${LOG_PREFIX} disabled via DINGTALK_EDIT_PARAM_GUARD=0`)
    return
  }

  api.on(
    "before_tool_call",
    async (event) => {
      const decision = evaluateEditToolCall(
        event.toolName,
        (event.params ?? {}) as Record<string, unknown>,
      )
      if (decision.action === "block") {
        return { block: true, blockReason: decision.reason }
      }
    },
    { priority: 50 },
  )

  api.logger?.info?.(`${LOG_PREFIX} registered (upstream edit param workaround)`)
}
