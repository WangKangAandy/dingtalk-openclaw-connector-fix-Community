import path from "node:path"

import { ROOT_MEMORY_FILENAME } from "./constants.ts"
import {
  ensureScopedMemoryFile,
  readRootMemoryBootstrapEntry,
  readScopedMemoryBootstrapEntry,
} from "./paths.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"
import type { AgentBootstrapHookContext } from "./types.ts"

function isAgentBootstrapContext(context: Record<string, unknown>): context is AgentBootstrapHookContext {
  return typeof context.workspaceDir === "string" && Array.isArray(context.bootstrapFiles)
}

export function applyScopedBootstrapFiles(context: AgentBootstrapHookContext): void {
  const scope = parseDingtalkMemoryScope(context.sessionKey)
  if (!scope) return

  const workspaceDir = path.resolve(context.workspaceDir)
  const rootMemoryPath = path.join(workspaceDir, ROOT_MEMORY_FILENAME)
  const scopedMemoryPath = path.resolve(workspaceDir, scope.memoryFile)

  ensureScopedMemoryFile(workspaceDir, scope)

  const kept = context.bootstrapFiles.filter((file) => {
    const filePath = path.resolve(file.path)
    return filePath !== scopedMemoryPath
  })

  const hasRoot = kept.some((file) => path.resolve(file.path) === rootMemoryPath)
  const withRoot = hasRoot ? kept : [...kept, readRootMemoryBootstrapEntry(workspaceDir)]

  context.bootstrapFiles = [...withRoot, readScopedMemoryBootstrapEntry(workspaceDir, scope)]
}

export function handleMemoryScopeBootstrapEvent(event: {
  type: string
  action: string
  context: Record<string, unknown>
}): void {
  if (event.type !== "agent" || event.action !== "bootstrap") return
  if (!isAgentBootstrapContext(event.context)) return
  applyScopedBootstrapFiles(event.context)
}
