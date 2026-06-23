import type { DingtalkMemoryScope } from "./types.ts"
import { SESSION_MEMORY_PATHS_HEADING } from "./memory-rules-shared.ts"

export function buildMemoryScopePrompt(scope: DingtalkMemoryScope): string {
  const scopeLabel = scope.chatType === "direct" ? "Current user" : "Current group"
  return [
    `## ${SESSION_MEMORY_PATHS_HEADING}`,
    `- ${scopeLabel} scope: \`${scope.scopeDir}/\``,
    `- Scoped MEMORY: \`${scope.memoryFile}\``,
    `- Daily notes: \`${scope.scopeDir}/YYYY-MM-DD.md\``,
    "",
  ].join("\n")
}
