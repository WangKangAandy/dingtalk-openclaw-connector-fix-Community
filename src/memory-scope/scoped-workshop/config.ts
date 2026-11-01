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

export function requireGlobalWorkshopOff(config: unknown): void {
  const mode = (config as { skills?: { workshop?: { autonomous?: { mode?: string } } } })?.skills?.workshop?.autonomous?.mode
  if (mode !== "off") throw new Error("Scoped learning requires skills.workshop.autonomous.mode=off")
}
