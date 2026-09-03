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
    "- 任何涉及文件读取的任务，先确认目标是否位于当前 scope；无法确认时停止并报告，不要猜测路径。",
    "- 禁止通过 exec、bash、glob、cat、find、grep、sha256sum 或其他 shell 命令读取、枚举或披露其他用户/群组的私有文件。",
    "- exec 被允许用于其他任务时，也不得把它当作 memory 工具被拦截后的替代入口。",
    "- 受控 memory 工具返回 deny 或 scope 边界错误时，立即停止，不得改用 shell、MCP 或其他插件绕过。",
    "- 如任务需要核实其他用户文件，只报告必要的文件元数据，不读取或复述笔记内容。",
    "",
  ].join("\n")
}
