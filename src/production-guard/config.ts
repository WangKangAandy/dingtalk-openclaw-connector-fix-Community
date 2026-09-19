import type { ProductionWriteGuardConfig } from "./types.ts"

export function resolveProductionWriteGuardConfig(cfg: unknown): ProductionWriteGuardConfig {
  const channels = (cfg as { channels?: Record<string, unknown> } | undefined)?.channels
  const dingtalk = channels?.["dingtalk-connector"] as {
    productionWriteGuard?: {
      enabled?: boolean
      paths?: string[]
      blockUnknownMutationTools?: boolean
    }
  } | undefined
  const configured = dingtalk?.productionWriteGuard
  return {
    enabled: configured?.enabled === true,
    paths: (configured?.paths ?? []).map((entry) => entry.trim()).filter(Boolean),
    blockUnknownMutationTools: configured?.blockUnknownMutationTools !== false,
  }
}
