import path from "node:path"

import { READ_GUARDED_TOOL_NAMES } from "./constants.ts"
import { extractToolPath, isMemoryTreeRelPath, toWorkspaceRelativePath } from "./paths.ts"
import {
  isMemoryPathAllowed,
  isTrustedExternalReadPath,
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
  externalReadRoots?: readonly string[]
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
  const workspaceDir = params.workspaceDir?.trim()
  let candidatePath = rawPath
  if (path.isAbsolute(rawPath)) {
    if (!workspaceDir) return block("trusted workspace context is unavailable")
    const relativePath = toWorkspaceRelativePath(workspaceDir, rawPath)
    if (!relativePath) {
      if (params.toolName === "read" && isTrustedExternalReadPath(rawPath, params.externalReadRoots ? [...params.externalReadRoots] : undefined)) return { action: "allow" }
      return block("absolute path is outside the trusted workspace")
    }
    candidatePath = relativePath
  }

  const normalized = normalizeMemoryHitPath(candidatePath)
  if (normalized.kind === "invalid") return block(normalized.reason)
  const lexicalPathIsMemory = isMemoryTreeRelPath(normalized.path)
  if (lexicalPathIsMemory && !isMemoryPathAllowed(normalized.path, classification.scope)) {
    return block(
      `path ${normalized.path} is outside the current scope ${classification.scope.scopeDir}`,
    )
  }

  if (!workspaceDir) return block("trusted workspace context is unavailable")
  const verified = verifyPathInsideWorkspace(workspaceDir, normalized.path)
  if (verified.ok === false) return block(verified.reason)
  if (!isMemoryPathAllowed(verified.relativePath, classification.scope)) {
    return block(
      `path ${normalized.path} resolves outside the current scope ${classification.scope.scopeDir}`,
    )
  }
  return { action: "allow" }
}
