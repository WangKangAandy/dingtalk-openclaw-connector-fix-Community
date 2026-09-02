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
    "### DingTalk Memory boundary",
    "- 只允许访问公共 Memory 和当前会话 scope。",
    "- 禁止通过 exec、bash、glob 或其他 shell 命令读取、枚举或披露其他用户/群组的私有文件。",
    "- 如任务需要核实其他用户文件，只报告必要的文件元数据，不读取或复述笔记内容。",
    "",
  ].join("\n")
}
