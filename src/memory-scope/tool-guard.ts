import path from "node:path"

import { READ_GUARDED_TOOL_NAMES } from "./constants.ts"
import { extractToolPath, isMemoryTreeRelPath } from "./paths.ts"
import {
  isMemoryPathAllowed,
  normalizeMemoryHitPath,
  verifyPathInsideWorkspace,
} from "./path-classifier.ts"
import { classifyDingtalkSession } from "./session-scope.ts"
import type { DingtalkSessionScopeOptions } from "./types.ts"

export type ToolGuardResult =
  | { action: "allow" }
  | { action: "block"; reason: string }

function block(reason: string): ToolGuardResult {
  return { action: "block", reason: `memory-scope: ${reason}` }
}

export function evaluateMemoryToolCall(params: {
  toolName: string
  toolParams: Record<string, unknown>
  sessionKey?: string
  workspaceDir?: string
  scopeOptions?: DingtalkSessionScopeOptions
}): ToolGuardResult {
  if (!READ_GUARDED_TOOL_NAMES.has(params.toolName)) return { action: "allow" }

  const classification = classifyDingtalkSession(params.sessionKey, params.scopeOptions)
  if (classification.kind === "non_dingtalk") return { action: "allow" }
  if (classification.kind === "malformed_dingtalk") {
    return block(`invalid DingTalk session context (${classification.reason})`)
  }

  if (params.toolName === "memory_get" || params.toolName === "memory_read") {
    const corpus = params.toolParams.corpus
    if (corpus !== undefined && corpus !== "memory") {
      return block(`direct memory reads only allow corpus=memory (received ${String(corpus)})`)
    }
  }

  const rawPath = extractToolPath(params.toolParams)
  if (!rawPath) return block("direct read is missing a path")
  if (path.isAbsolute(rawPath)) return block("absolute paths are not accepted")

  const normalized = normalizeMemoryHitPath(rawPath)
  if (normalized.kind === "invalid") return block(normalized.reason)
  if (params.toolName === "read" && !isMemoryTreeRelPath(normalized.path)) {
    return { action: "allow" }
  }
  if (!isMemoryPathAllowed(normalized.path, classification.scope)) {
    return block(
      `path ${normalized.path} is outside the current scope ${classification.scope.scopeDir}`,
    )
  }
  const workspaceDir = params.workspaceDir?.trim()
  if (!workspaceDir) return block("trusted workspace context is unavailable")
  const verified = verifyPathInsideWorkspace(workspaceDir, normalized.path)
  if (verified.ok === false) return block(verified.reason)
  return { action: "allow" }
}
