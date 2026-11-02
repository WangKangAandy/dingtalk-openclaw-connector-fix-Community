import { z } from "zod"
import { TOOL_NAME, skillDraft, skillName } from "./contract.ts"
import type { WorkshopStore } from "./storage.ts"

export const toolInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("view"), name: skillName }).strict(),
  z.object({ action: z.literal("save"), skill: skillDraft, expectedRevision: z.string().uuid().nullable() }).strict(),
  z.object({ action: z.literal("archive"), name: skillName, expectedRevision: z.string().uuid() }).strict(),
  z.object({ action: z.literal("restore"), name: skillName }).strict(),
])

// Function-calling providers require an object at the root, not a union of objects.
const { $schema: _schema, ...parameters } = z.toJSONSchema(z.object({
  action: z.enum(["list", "view", "save", "archive", "restore"]),
  name: skillName.optional(),
  skill: skillDraft.optional(),
  expectedRevision: z.string().uuid().nullable().optional(),
}).strict())

/** Foreground writes and background commits share one validated storage contract. */
export function workshopTool(store: WorkshopStore, assertCurrent: () => void, onMutation: (name: string) => void) {
  return {
    name: TOOL_NAME,
    label: "Scoped learned skills",
    description: "List/view/save/archive/restore reusable procedures for the current DingTalk memory scope. Save requires a viewed revision (null for new). Facts belong in scoped MEMORY. Never store credentials. Restore undoes the last change, including creation/archive. Supporting files are included in skill.files; save replaces the complete bundle.",
    parameters: parameters as any,
    async execute(_id: string, raw: unknown) {
      assertCurrent()
      const input = toolInput.parse(raw)
      let result: unknown
      switch (input.action) {
        case "list": result = store.list().map(({ name, revision, skill }) => ({ name, revision, description: skill.description })); break
        case "view": result = store.view(input.name, true); break
        case "save": result = store.save(input.skill, input.expectedRevision); onMutation(input.skill.name); break
        case "archive": store.archive(input.name, input.expectedRevision); result = { archived: input.name }; onMutation(input.name); break
        case "restore": result = store.restore(input.name); onMutation(input.name); break
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result }
    },
  }
}
