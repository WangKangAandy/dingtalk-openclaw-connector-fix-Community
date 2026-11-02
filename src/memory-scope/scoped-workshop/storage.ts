import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import { HISTORY_LIMIT, MAX_SKILLS, renderSkill, skillName, validateDraft, type SkillDraft } from "./contract.ts"

const revisionId = z.string().uuid()
const manifestSchema = z.object({
  current: revisionId.nullable(),
  history: z.array(revisionId.nullable()).max(HISTORY_LIMIT),
  touchedAt: z.number().finite(),
}).strict()
type Manifest = z.infer<typeof manifestSchema>
export type SkillView = { name: string; revision: string; skill: SkillDraft; path: string }

/** Only this store selects paths; callers and models never provide an absolute path or a scope. */
export class WorkshopStore {
  readonly root: string
  constructor(workspace: string, scopeDir: string, accountId = "default") {
    const base = fs.realpathSync(workspace)
    if (path.isAbsolute(scopeDir) || scopeDir.split(/[\\/]/).some(s => !s || s === "." || s === "..")) {
      throw new Error("Invalid memory scope")
    }
    // Accounts sharing a workspace must not share one sender's learned procedures.
    const account = createHash("sha256").update(accountId).digest("hex").slice(0, 24)
    this.root = path.join(base, scopeDir, "workshop-skills", account)
    this.checkPath(base, this.root)
  }

  private checkPath(base: string, target: string): void {
    const relative = path.relative(base, target)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path escapes scope")
    let current = base
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part)
      try {
        const stat = fs.lstatSync(current)
        if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) {
          throw new Error("Linked or special workshop paths are not supported")
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  }

  private file(name: string, suffix: string): string {
    skillName.parse(name)
    const result = path.join(this.root, name, suffix)
    // Recheck every operation, including the root, after construction.
    this.checkPath(path.parse(this.root).root, result)
    return result
  }

  private readManifest(name: string): Manifest {
    const file = this.file(name, "head.json")
    try { return manifestSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { current: null, history: [], touchedAt: Date.now() }
      throw error // Never replace an unreadable manifest with an empty one.
    }
  }

  private writeManifest(name: string, manifest: Manifest): void {
    const target = this.file(name, "head.json")
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const temp = this.file(name, `${randomUUID()}.tmp`)
    fs.writeFileSync(temp, JSON.stringify(manifest), { encoding: "utf8", flag: "wx" })
    try { fs.renameSync(temp, target) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }

  view(name: string, touch = false): SkillView | null {
    const head = this.readManifest(name)
    if (!head.current) return null
    const skill = validateDraft(JSON.parse(fs.readFileSync(this.file(name, `versions/${head.current}/skill.json`), "utf8")))
    if (skill.name !== name) throw new Error("Skill identity mismatch")
    if (touch) this.writeManifest(name, { ...head, touchedAt: Date.now() })
    return { name, revision: head.current, skill, path: this.file(name, `versions/${head.current}/SKILL.md`) }
  }

  list(): SkillView[] {
    this.checkPath(path.parse(this.root).root, this.root)
    if (!fs.existsSync(this.root)) return []
    const names = fs.readdirSync(this.root)
    if (names.length > MAX_SKILLS) throw new Error("Workshop skill limit exceeded")
    return names.map(name => this.view(name)).filter((v): v is SkillView => v !== null)
  }

  /** Includes archived heads, so create-then-undo cannot look like an unchanged empty store. */
  stamp(): string {
    this.checkPath(path.parse(this.root).root, this.root)
    const names = fs.existsSync(this.root) ? fs.readdirSync(this.root).sort() : []
    if (names.length > MAX_SKILLS) throw new Error("Workshop skill limit exceeded")
    return createHash("sha256").update(JSON.stringify(names.map(name => [name, this.readManifest(name)]))).digest("hex")
  }

  /** Reclaim only immutable revisions outside the undo window; reject links before deleting. */
  compact(name: string): void {
    const head = this.readManifest(name)
    const keep = new Set([head.current, ...head.history].filter(Boolean))
    const versions = this.file(name, "versions")
    if (!fs.existsSync(versions)) return
    const validateTree = (directory: string): void => {
      this.checkPath(path.parse(this.root).root, directory)
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name)
        this.checkPath(path.parse(this.root).root, target)
        if (entry.isDirectory()) validateTree(target)
      }
    }
    for (const id of fs.readdirSync(versions)) {
      revisionId.parse(id)
      if (keep.has(id)) continue
      const directory = this.file(name, `versions/${id}`)
      validateTree(directory)
      fs.rmSync(directory, { recursive: true })
    }
  }

  archiveUnused(now = Date.now()): string[] {
    const archived: string[] = []
    for (const item of this.list()) {
      if (this.readManifest(item.name).touchedAt > now - 30 * 24 * 60 * 60_000) continue
      this.archive(item.name, item.revision); archived.push(item.name)
    }
    return archived
  }

  save(input: unknown, expected: string | null): SkillView {
    const draft = validateDraft(input)
    const head = this.readManifest(draft.name)
    if (head.current !== expected) throw new Error("Skill changed; view it again before saving")
    this.compact(draft.name)
    if (!fs.existsSync(this.file(draft.name, "")) && fs.existsSync(this.root)
      && fs.readdirSync(this.root).length >= MAX_SKILLS) throw new Error("Workshop skill limit exceeded")
    const id = randomUUID()
    const revision = this.file(draft.name, `versions/${id}`)
    fs.mkdirSync(revision, { recursive: true })
    const files = { ...draft.files, "SKILL.md": renderSkill(draft), "skill.json": JSON.stringify(draft) }
    for (const [name, content] of Object.entries(files)) {
      const file = this.file(draft.name, `versions/${id}/${name}`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content, { encoding: "utf8", flag: "wx" })
    }
    // Readers see the complete previous revision until the single atomic pointer update.
    this.writeManifest(draft.name, { current: id, history: [head.current, ...head.history].slice(0, HISTORY_LIMIT), touchedAt: Date.now() })
    return this.view(draft.name)!
  }

  archive(name: string, expected: string): void {
    const head = this.readManifest(name)
    if (!head.current || head.current !== expected) throw new Error("Skill changed; view it again")
    this.writeManifest(name, { ...head, current: null, history: [head.current, ...head.history].slice(0, HISTORY_LIMIT) })
  }

  restore(name: string): SkillView | null {
    const head = this.readManifest(name)
    if (!head.history.length) throw new Error("No previous version")
    const [current, ...history] = head.history
    if (current) {
      validateDraft(JSON.parse(fs.readFileSync(this.file(name, `versions/${current}/skill.json`), "utf8")))
    }
    this.writeManifest(name, { current, history, touchedAt: Date.now() })
    return this.view(name)
  }
}
