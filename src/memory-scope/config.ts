import type { MemoryScopeConfig } from "./types.ts"

export function resolveMemoryScopeConfig(cfg: unknown): MemoryScopeConfig {
  const channels = (cfg as { channels?: Record<string, unknown> } | undefined)?.channels
  const dingtalk = channels?.["dingtalk-connector"] as {
    memoryScope?: { enabled?: boolean; syncRootMemoryRules?: boolean }
  } | undefined
  const enabled = dingtalk?.memoryScope?.enabled
  const syncRootMemoryRules = dingtalk?.memoryScope?.syncRootMemoryRules
  return {
    enabled: enabled !== false,
    syncRootMemoryRules: syncRootMemoryRules !== false,
  }
}
