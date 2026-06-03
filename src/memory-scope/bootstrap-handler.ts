import path from "node:path"

import { ROOT_MEMORY_FILENAME } from "./constants.ts"
import { readScopedMemoryBootstrapEntry } from "./paths.ts"
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

  const kept = context.bootstrapFiles.filter((file) => {
    if (file.name !== ROOT_MEMORY_FILENAME) return true
    const filePath = path.resolve(file.path)
    if (filePath === rootMemoryPath) return false
    if (filePath === scopedMemoryPath) return false
    return true
  })

  context.bootstrapFiles = [...kept, readScopedMemoryBootstrapEntry(workspaceDir, scope)]
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
