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
export type ReviewToolState = { viewed: Map<string, string>; changed: boolean }
export function workshopTool(store: WorkshopStore, assertCurrent: () => void, onMutation: (name: string) => void,
  review?: ReviewToolState) {
  return {
    name: TOOL_NAME,
    label: "Scoped learned skills",
    description: "List/view/save/archive/restore reusable procedures for the current DingTalk memory scope. Save requires a viewed revision (null for new). Facts belong in scoped MEMORY. Never store credentials. Restore undoes the last change, including creation/archive. Supporting files are included in skill.files; save replaces the complete bundle.",
    parameters: parameters as any,
    async execute(_id: string, raw: unknown) {
      assertCurrent()
      const input = toolInput.parse(raw)
      if (review && input.action === "restore") throw new Error("Background reviews cannot undo user changes")
      if (review && (input.action === "save" || input.action === "archive")) {
        if (review.changed) throw new Error("A review may change only one skill")
        const name = input.action === "save" ? input.skill.name : input.name
        if (input.expectedRevision !== null && review.viewed.get(name) !== input.expectedRevision) {
          throw new Error("View the current skill before changing it")
        }
      }
      return store.transaction(() => {
        // Repeat after acquiring the cross-process lock: authority/stamp may have expired while waiting.
        assertCurrent()
        let result: unknown
        switch (input.action) {
        case "list": result = store.list().map(({ name, revision, skill }) => ({ name, revision, description: skill.description })); break
        case "view": {
          const view = store.view(input.name, !review)
          if (view) review?.viewed.set(input.name, view.revision)
          result = view ? { name: view.name, revision: view.revision, skill: view.skill } : null; break
        }
        case "save": {
          const saved = store.save(input.skill, input.expectedRevision)
          result = { name: saved.name, revision: saved.revision, skill: saved.skill }
          if (review) review.changed = true
          onMutation(input.skill.name); break
        }
        case "archive": store.archive(input.name, input.expectedRevision); if (review) review.changed = true; result = { archived: input.name }; onMutation(input.name); break
        case "restore": {
          const saved = store.restore(input.name)
          result = saved ? { name: saved.name, revision: saved.revision, skill: saved.skill } : null
          onMutation(input.name); break
        }
      }
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result }
      })
    },
  }
}
