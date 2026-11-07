import { z } from "zod"
import { parse } from "yaml"
import type { scopedWorkshopAccess } from "@dingtalk-real-ai/dingtalk-connector/scope-api"

export type Lease = ReturnType<typeof scopedWorkshopAccess.forCompletedTurn>
export type Store = ReturnType<Lease["open"]>
const input = z.object({
  action: z.enum(["list", "view", "create", "patch", "write_file", "remove_file", "archive", "restore"]),
  name: z.string().optional(), content: z.string().optional(), old_text: z.string().optional(), new_text: z.string().optional(),
  file_path: z.string().optional(), reason: z.string().optional(), absorbed_into: z.string().optional(),
}).strict()
const { $schema, ...parameters } = z.toJSONSchema(input)
function document(name: string, text: string, files: Record<string, string>) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  if (!match) throw new Error("content must be complete SKILL.md with YAML frontmatter")
  const meta = parse(match[1])
  if (meta?.name !== name || typeof meta.description !== "string") throw new Error("Frontmatter name/description required and name must match")
  return { name, description: meta.description, body: match[2].trim(), files }
}

export type ToolState = { viewed: Map<string, string>; changed: boolean }
export function createScopedWorkshopTool(store: Store, assertCurrent: () => void, onMutation: (name: string) => void, review = false,
  state: ToolState = { viewed: new Map(), changed: false }) {
  const viewed = state.viewed
  return {
    name: "skill_workshop", label: "Scoped learned skills", parameters,
    description: "Learned procedures for this authorized conversation scope. Private chats are per user; members share only their current group's skills. Actions: list; view name [file_path]; create name content (complete SKILL.md); patch name old_text new_text [file_path]; write_file name file_path content; remove_file name file_path; archive name reason; restore name (undo last change). View before modifying. No scope, user, host path or recipient arguments. Obey the user's learning restrictions; no save is required.",
    async execute(_id: string, raw: unknown) {
      assertCurrent()
      const args = input.parse(raw)
      if (args.action === "list") return result(store.list())
      const name = args.name
      if (!name) throw new Error("name is required")
      const old = store.view(name)
      if (args.action === "view") {
        if (old) viewed.set(name, old.revision)
        const file = args.file_path ?? "SKILL.md"
        return result(old ? { name, revision: old.revision, content: file === "SKILL.md" ? old.content : old.skill.files[file] ?? null, files: Object.keys(old.skill.files) } : null)
      }
      if (review && state.changed) throw new Error("A review may make at most one change")
      if (review && args.action === "restore") throw new Error("Background reviews cannot undo user changes")
      if (args.action !== "create" && args.action !== "restore" && (!old || viewed.get(name) !== old.revision)) throw new Error("View the current revision before modifying it")
      let value: unknown
      if (args.action === "restore") value = store.restore(name)
      else if (args.action === "archive") { store.archive(name, old!.revision); value = { name, archived: true } }
      else if (args.action === "create") {
        if (old) throw new Error("Skill already exists; view then patch it")
        if (args.content === undefined) throw new Error("content is required")
        value = store.save(document(name, args.content, {}), null)
      } else {
        const file = args.file_path ?? "SKILL.md"
        const files = { ...old!.skill.files }
        let text = file === "SKILL.md" ? old!.content : files[file]
        if (args.action === "patch") {
          if (!args.old_text || args.new_text === undefined || text === undefined || text.split(args.old_text).length !== 2) throw new Error("old_text must match exactly once")
          text = text.replace(args.old_text, () => args.new_text!)
        } else if (args.action === "write_file") {
          if (args.content === undefined) throw new Error("content is required")
          text = args.content
        } else {
          if (file === "SKILL.md" || !Object.hasOwn(files, file)) throw new Error("remove_file requires an existing supporting file")
          delete files[file]
        }
        if (file !== "SKILL.md" && args.action !== "remove_file") files[file] = text!
        const draft = file === "SKILL.md" ? document(name, text!, files) : { ...old!.skill, files }
        value = store.save(draft, old!.revision)
      }
      state.changed = true; onMutation(name)
      return result(value)
    },
  }
}
function result(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value } }
