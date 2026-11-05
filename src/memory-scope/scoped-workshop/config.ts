import { z } from "zod"

export const scopedLearningSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["auto", "off"]).default("auto"),
  reviewAfterIterations: z.number().int().min(1).max(100).default(10),
  reviewIdleMs: z.number().int().min(1000).max(300_000).default(30_000),
}).strict()
export type LearningConfig = z.infer<typeof scopedLearningSchema>

export function learningConfig(config: unknown): LearningConfig {
  const cfg = config as { channels?: Record<string, { memoryScope?: { enabled?: boolean; scopedLearning?: unknown } }>; skills?: { workshop?: { autonomous?: { mode?: string } } } }
  const memory = cfg?.channels?.["dingtalk-connector"]?.memoryScope
  const result = scopedLearningSchema.parse(memory?.scopedLearning ?? {})
  // Do not silently change global configuration owned by the operator.
  return { ...result, enabled: result.enabled && memory?.enabled !== false }
}

export function requireNativeWorkshopExcluded(config: unknown, agentId?: string): void {
  const cfg = config as { tools?: { deny?: string[] }; agents?: { entries?: Record<string, { tools?: { deny?: string[] } }> } }
  if (![...(cfg.tools?.deny ?? []), ...(agentId ? cfg.agents?.entries?.[agentId]?.tools?.deny ?? [] : [])].includes("skill_workshop")) {
    throw new Error("Scoped learning requires skill_workshop to be denied for the target Agent; run scope setup")
  }
}
