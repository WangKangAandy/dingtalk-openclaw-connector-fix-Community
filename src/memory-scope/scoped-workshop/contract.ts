import { z } from "zod"

export const TOOL_NAME = "scoped_skill_workshop"
export const MAX_SKILLS = 64
export const MAX_SKILL_BYTES = 40_000
export const MAX_BUNDLE_BYTES = 128_000
export const HISTORY_LIMIT = 10

export const skillName = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(64)
export const skillDraft = z.object({
  name: skillName,
  description: z.string().trim().min(1).max(160).refine(s => !/[\r\n]/.test(s)),
  body: z.string().trim().min(1),
  files: z.record(z.string(), z.string()).default({}),
}).strict()
export type SkillDraft = z.infer<typeof skillDraft>

export const reviewDecision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("nothing") }).strict(),
  z.object({ action: z.literal("save"), skill: skillDraft }).strict(),
  z.object({ action: z.literal("archive"), name: skillName }).strict(),
])

export function validateDraft(input: unknown): SkillDraft {
  const draft = skillDraft.parse(input)
  const entries = Object.entries(draft.files)
  if (entries.length > 16) throw new Error("At most 16 supporting files per skill")
  for (const [file, content] of entries) {
    if (!/^(references|templates|scripts|assets)\/[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(file)
      || file.split("/").some(p => !p || p === "." || p === ".." || p.endsWith("."))
      || Buffer.byteLength(content) > 32_000) throw new Error("Invalid supporting file")
  }
  const markdown = renderSkill(draft)
  if (Buffer.byteLength(markdown) > MAX_SKILL_BYTES
    || Buffer.byteLength(markdown) + entries.reduce((n, [, s]) => n + Buffer.byteLength(s), 0) > MAX_BUNDLE_BYTES) {
    throw new Error("Skill size limit exceeded")
  }
  // Do not persist common credential forms even when a model ignores review instructions.
  const all = markdown + entries.map(([, s]) => s).join("\n")
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{24,})\b/.test(all)) {
    throw new Error("Credential-like content cannot be learned")
  }
  return draft
}

export function renderSkill(draft: SkillDraft): string {
  return `---\nname: ${draft.name}\ndescription: ${JSON.stringify(draft.description)}\n---\n\n${draft.body}\n`
}
