/** @deprecated Not registered in register.ts (Phase 1 uses soft constraints). Kept for tests / optional Phase 2. */
import { GUARDED_TOOL_NAMES } from "./constants.ts"
import {
  extractToolPath,
  isPathAllowedForScope,
  resolveWithinWorkspace,
  rewriteMemoryWritePath,
  toWorkspaceRelativePath,
} from "./paths.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"
import type { DingtalkMemoryScope } from "./types.ts"

export type ToolGuardResult =
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "rewrite"; params: Record<string, unknown>; reason: string }

function resolveScopeFromContext(ctx: {
  sessionKey?: string
  workspaceDir?: string
}): { scope: DingtalkMemoryScope; workspaceDir: string } | null {
  const scope = parseDingtalkMemoryScope(ctx.sessionKey)
  const workspaceDir = ctx.workspaceDir?.trim()
  if (!scope || !workspaceDir) return null
  return { scope, workspaceDir }
}

export function evaluateMemoryToolCall(params: {
  toolName: string
  toolParams: Record<string, unknown>
  sessionKey?: string
  workspaceDir?: string
}): ToolGuardResult {
  if (!GUARDED_TOOL_NAMES.has(params.toolName)) {
    return { action: "allow" }
  }

  const resolved = resolveScopeFromContext({
    sessionKey: params.sessionKey,
    workspaceDir: params.workspaceDir,
  })
  if (!resolved) return { action: "allow" }

  const { scope, workspaceDir } = resolved
  const rawPath = extractToolPath(params.toolParams)
  if (!rawPath) return { action: "allow" }

  const absPath = resolveWithinWorkspace(workspaceDir, rawPath)
  if (!absPath) {
    return {
      action: "block",
      reason: `memory-scope: 路径必须在 workspace 内 (${scope.scopeDir}/)`,
    }
  }

  const relPath = toWorkspaceRelativePath(workspaceDir, absPath)
  if (!relPath) return { action: "allow" }

  if (params.toolName === "write" || params.toolName === "edit") {
    const rewritten = rewriteMemoryWritePath(scope, relPath)
    if (rewritten !== relPath) {
      const nextParams = { ...params.toolParams, path: rewritten }
      return {
        action: "rewrite",
        params: nextParams,
        reason: `memory-scope: 重定向 memory 写入到 ${rewritten}`,
      }
    }
  }

  if (!isPathAllowedForScope(scope, relPath)) {
    return {
      action: "block",
      reason: `memory-scope: 禁止访问 scope 外的 memory 路径 (${relPath})，当前 scope 为 ${scope.scopeDir}/`,
    }
  }

  return { action: "allow" }
}
