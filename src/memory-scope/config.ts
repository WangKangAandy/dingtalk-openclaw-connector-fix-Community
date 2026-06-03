import type { MemoryScopeConfig } from "./types.ts"

export function resolveMemoryScopeConfig(cfg: unknown): MemoryScopeConfig {
  const channels = (cfg as { channels?: Record<string, unknown> } | undefined)?.channels
  const dingtalk = channels?.["dingtalk-connector"] as { memoryScope?: { enabled?: boolean } } | undefined
  const enabled = dingtalk?.memoryScope?.enabled
  return { enabled: enabled !== false }
}
