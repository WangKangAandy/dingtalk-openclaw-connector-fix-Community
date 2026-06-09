import type { DingtalkMemoryScope } from "./types.ts"

export function buildMemoryScopePrompt(scope: DingtalkMemoryScope): string {
  const scopeLabel = scope.chatType === "direct" ? "当前用户" : "当前群聊"
  return [
    "## 本 session 记忆路径",
    `- ${scopeLabel} scope：\`${scope.scopeDir}/\``,
    `- 专属 MEMORY：\`${scope.memoryFile}\``,
    `- 每日笔记：\`${scope.scopeDir}/YYYY-MM-DD.md\``,
    "",
  ].join("\n")
}
