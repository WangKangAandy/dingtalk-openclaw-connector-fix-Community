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

// Function-calling providers require an object at the root. State the exact
// action shapes in discovery as well as field descriptions: the flat transport
// schema must not imply that every optional field is valid for every action.
const ACTION_SHAPES = 'Exact inputs: list={action:"list"}; view={action:"view",name}; save={action:"save",skill:{name,description,body,files},expectedRevision}; archive={action:"archive",name,expectedRevision}; restore={action:"restore",name}. For save, put the name only inside skill.name; never send top-level name. No extra fields are accepted.'
const { $schema: _schema, ...parameters } = z.toJSONSchema(z.object({
  action: z.enum(["list", "view", "save", "archive", "restore"]).describe(ACTION_SHAPES),
  name: skillName.describe('Required only for view, archive and restore. Omit for list and save; save uses skill.name.').optional(),
  skill: skillDraft.describe('Required only for save; includes the skill name. Omit for all other actions.').optional(),
  expectedRevision: z.string().uuid().nullable().describe('Required for save (null for a new skill, current view revision for an update) and archive (current revision). Omit for list, view and restore.').optional(),
}).strict())

/** Foreground writes and background commits share one validated storage contract. */
export type ReviewToolState = { viewed: Map<string, string>; changed: boolean }
export function workshopTool(store: WorkshopStore, assertCurrent: () => void, onMutation: (name: string) => void,
  review?: ReviewToolState) {
  return {
    name: TOOL_NAME,
    label: "Scoped learned skills",
    description: "List/view/save/archive/restore reusable procedures for the current DingTalk memory scope. " + ACTION_SHAPES + " Save requires a viewed revision (null for new). Facts belong in scoped MEMORY. Never store credentials. Restore undoes the last change, including creation/archive; success returns restored:true with the resulting revision and skill (both null when creation was undone). Supporting files are included in skill.files; save replaces the complete bundle.",
    parameters: parameters as any,
    async execute(_id: string, raw: unknown) {
      assertCurrent()
      const parsed = toolInput.safeParse(raw)
      if (!parsed.success) {
        throw new Error('Invalid scoped_skill_workshop arguments; no storage operation was executed. ' + ACTION_SHAPES)
      }
      const input = parsed.data
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
          result = { name: input.name, restored: true, revision: saved?.revision ?? null, skill: saved?.skill ?? null }
          onMutation(input.name); break
        }
      }
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result }
      })
    },
  }
}
