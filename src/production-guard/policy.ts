import { extractToolPath } from "../memory-scope/paths.ts"
import { classifyDingtalkSession } from "../memory-scope/session-scope.ts"
import { commandMentionsProduction, isProductionTarget, resolveConfiguredRoots, resolveToolTarget } from "./paths.ts"
import type { ProductionGuardDecision, ProductionWriteGuardConfig } from "./types.ts"
import type { DingtalkSessionScopeOptions } from "../memory-scope/types.ts"

const FILE_MUTATION_TOOLS = new Set(["write", "edit", "apply_patch"])
const COMMAND_TOOLS = new Set(["exec", "process", "bash", "musa_exec", "musa_docker", "musa_sync"])
const EXTERNAL_MUTATION_RE = /(?:^|[-_.])(create|delete|deploy|modify|move|remove|send|sync|update|upload|write)(?:$|[-_.])/i
const READ_ONLY_COMMAND_RE = /^(?:cat|command\s+-v|date|du|echo|false|file|find|git\s+(?:diff|log|status|show)|grep|head|hostname|id|less|ls|printenv|printf|pwd|readlink|realpath|rg|sed\s+-n|stat|tail|true|uname|wc|which|whoami)(?:\s|$)/
const DWS_COMMAND_RE = /^dws(?:\s|$)/
const SHELL_MUTATION_RE = /[;&|<>`$]/

function commandValue(params: Record<string, unknown>): string | null {
  for (const key of ["command", "cmd", "script", "rawCommand"]) {
    if (typeof params[key] === "string" && params[key].trim()) return params[key].trim()
  }
  return null
}

export function evaluateProductionWrite(params: {
  toolName: string
  toolParams: Record<string, unknown>
  sessionKey?: string
  workspaceDir?: string
  config: ProductionWriteGuardConfig
  scopeOptions?: DingtalkSessionScopeOptions
}): ProductionGuardDecision {
  if (!params.config.enabled) return { action: "allow" }
  const classification = classifyDingtalkSession(params.sessionKey, params.scopeOptions)
  if (classification.kind === "non_dingtalk") return { action: "allow" }
  if (classification.kind === "malformed_dingtalk") {
    return { action: "block", reason: `production-write-guard: invalid DingTalk session context (${classification.reason})` }
  }

  const roots = resolveConfiguredRoots(params.workspaceDir, params.config.paths)
  if (!roots.length) {
    return { action: "block", reason: "production-write-guard: no production paths are safely configured" }
  }

  const toolName = params.toolName.toLowerCase()
  const rawPath = extractToolPath(params.toolParams)
  if (FILE_MUTATION_TOOLS.has(toolName)) {
    if (!rawPath) return { action: "block", reason: `production-write-guard: ${toolName} target path is unavailable` }
    const target = resolveToolTarget(params.workspaceDir, rawPath)
    if (!target) return { action: "block", reason: "production-write-guard: target path cannot be resolved safely" }
    return isProductionTarget(target, roots)
      ? { action: "block", reason: "production-write-guard: DingTalk cannot modify production paths" }
      : { action: "allow" }
  }

  const command = commandValue(params.toolParams)
  if (COMMAND_TOOLS.has(toolName)) {
    if (command && DWS_COMMAND_RE.test(command) && !SHELL_MUTATION_RE.test(command)) {
      return { action: "allow" }
    }
    if (command && READ_ONLY_COMMAND_RE.test(command) && !SHELL_MUTATION_RE.test(command)) {
      return { action: "allow" }
    }
    if (command && commandMentionsProduction(command, roots, params.workspaceDir)) {
      return { action: "block", reason: "production-write-guard: command targets a production path" }
    }
    return !params.config.blockUnknownMutationTools
      ? { action: "allow" }
      : { action: "block", reason: `production-write-guard: ${toolName} is not a verified read-only command` }
  }

  if (EXTERNAL_MUTATION_RE.test(toolName) && params.config.blockUnknownMutationTools) {
    return { action: "block", reason: `production-write-guard: unclassified mutation tool ${params.toolName} is blocked` }
  }
  return { action: "allow" }
}
