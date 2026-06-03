import type { DingtalkMemoryScope } from "./types.ts"

export function buildMemoryScopePrompt(scope: DingtalkMemoryScope): string {
  const scopeLabel = scope.chatType === "direct" ? "当前用户" : "当前群聊"
  return [
    "## DingTalk 记忆范围（memory-scope）",
    "",
    `- ${scopeLabel}的长期记忆目录：\`${scope.scopeDir}/\``,
    `- 长期记忆文件：\`${scope.memoryFile}\``,
    `- 每日笔记写入：\`${scope.scopeDir}/YYYY-MM-DD.md\``,
    "",
    "规则：",
    "1. 只读写上述目录内的 memory 文件；不要读取 workspace 根目录的 `MEMORY.md` 或其他用户/群目录。",
    "2. 用户说「记住这个」时，写入当前 scope 的 daily 或 MEMORY 文件，不要写入全局 memory。",
    "3. `memory_search` 在 Phase 1 仍可能检索到其他 scope 的片段；优先使用 bootstrap 注入的 MEMORY 与 scope 内 `read`/`memory_get`。",
    "",
  ].join("\n")
}
