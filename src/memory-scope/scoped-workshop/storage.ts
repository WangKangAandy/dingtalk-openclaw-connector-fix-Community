import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { z } from "zod"
import { HISTORY_LIMIT, MAX_SKILLS, renderSkill, skillName, validateDraft, type SkillDraft } from "./contract.ts"
import { assertScopeGrant, type ScopeGrant, type ScopeOperation } from "../authority.ts"

// Load the real Node builtin; Vite 5 strips the mandatory node: prefix from newer builtins.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite")

const revisionId = z.string().uuid()
const attributionSchema = z.object({ actorId: z.string().min(1), sessionId: z.string().min(1), at: z.number().finite() }).strict()
const manifestSchema = z.object({
  current: revisionId.nullable(),
  history: z.array(revisionId.nullable()).max(HISTORY_LIMIT),
  touchedAt: z.number().finite(),
  lastMutation: attributionSchema.optional(),
}).strict()
type Manifest = z.infer<typeof manifestSchema>
export type SkillView = { name: string; revision: string; skill: SkillDraft; path: string }

/** Only this store selects paths; callers and models never provide an absolute path or a scope. */
export class WorkshopStore {
  readonly root: string
  private locked = false
  constructor(storageRoot: string, private grant: ScopeGrant) {
    assertScopeGrant(grant, "workshop.read")
    if (!path.isAbsolute(storageRoot)) throw new Error("Private workshop root must be absolute")
    this.root = path.join(path.resolve(storageRoot), "workshop", grant.namespace)
    this.checkPath(path.parse(this.root).root, this.root)
  }

  private attribution() { return { actorId: this.grant.actorId, sessionId: this.grant.sessionId, at: Date.now() } }

  /** SQLite supplies a process-wide OS lock, not rollback for the immutable bundle files.
   * All readers and writers participate so compaction cannot remove an active read.
   * A killed writer releases the lock; unreferenced bundles are reclaimed by compact(). */
  transaction<T>(effect: () => T extends PromiseLike<unknown> ? never : T): T {
    assertScopeGrant(this.grant, "workshop.read")
    const invoke = () => {
      if (effect.constructor.name === "AsyncFunction") throw new Error("Workshop transactions must be synchronous")
      const result = effect()
      if (result && typeof (result as { then?: unknown }).then === "function") {
        throw new Error("Workshop transactions must not return a promise")
      }
      return result
    }
    if (this.locked) return invoke()
    const file = `${this.root}.lock.sqlite`
    for (const suffix of ["", "-journal", "-wal", "-shm"]) this.checkPath(path.parse(file).root, file + suffix)
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    try { fs.closeSync(fs.openSync(file, "wx", 0o600)) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    const db = new DatabaseSync(file)
    try {
      db.exec("PRAGMA busy_timeout=1000; BEGIN IMMEDIATE")
      assertScopeGrant(this.grant, "workshop.read")
      this.locked = true
      try {
        const result = invoke()
        assertScopeGrant(this.grant, "workshop.read")
        db.exec("COMMIT")
        return result
      } catch (error) { db.exec("ROLLBACK"); throw error }
      finally { this.locked = false }
    } finally { db.close() }
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { current: null, history: [], touchedAt: 0 }
      throw error // Never replace an unreadable manifest with an empty one.
    }
  }

  private writeManifest(name: string, manifest: Manifest, operation: ScopeOperation = "workshop.write"): void {
    const target = this.file(name, "head.json")
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
    const temp = this.file(name, `${randomUUID()}.tmp`)
    fs.writeFileSync(temp, JSON.stringify(manifest), { encoding: "utf8", flag: "wx", mode: 0o600 })
    try { assertScopeGrant(this.grant, operation); fs.renameSync(temp, target) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }

  view(name: string, touch = false): SkillView | null {
    if (!this.locked) return this.transaction(() => this.view(name, touch))
    assertScopeGrant(this.grant, "workshop.read")
    const head = this.readManifest(name)
    if (!head.current) return null
    const skill = validateDraft(JSON.parse(fs.readFileSync(this.file(name, `versions/${head.current}/skill.json`), "utf8")))
    if (skill.name !== name) throw new Error("Skill identity mismatch")
    if (touch) this.writeManifest(name, { ...head, touchedAt: Date.now() }, "workshop.read")
    return { name, revision: head.current, skill, path: this.file(name, `versions/${head.current}/SKILL.md`) }
  }

  list(): SkillView[] {
    if (!this.locked) return this.transaction(() => this.list())
    assertScopeGrant(this.grant, "workshop.list")
    this.checkPath(path.parse(this.root).root, this.root)
    if (!fs.existsSync(this.root)) return []
    const names = fs.readdirSync(this.root)
    if (names.length > MAX_SKILLS) throw new Error("Workshop skill limit exceeded")
    return names.map(name => this.view(name)).filter((v): v is SkillView => v !== null)
  }

  /** Includes archived heads, so create-then-undo cannot look like an unchanged empty store. */
  stamp(): string {
    if (!this.locked) return this.transaction(() => this.stamp())
    assertScopeGrant(this.grant, "workshop.read")
    this.checkPath(path.parse(this.root).root, this.root)
    const names = fs.existsSync(this.root) ? fs.readdirSync(this.root).sort() : []
    if (names.length > MAX_SKILLS) throw new Error("Workshop skill limit exceeded")
    return createHash("sha256").update(JSON.stringify(names.map(name => [name, this.readManifest(name)]))).digest("hex")
  }

  /** Reclaim only immutable revisions outside the undo window; reject links before deleting. */
  compact(name: string): void {
    if (!this.locked) return this.transaction(() => this.compact(name))
    assertScopeGrant(this.grant, "workshop.write")
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
      assertScopeGrant(this.grant, "workshop.write")
      fs.rmSync(directory, { recursive: true })
    }
  }

  save(input: unknown, expected: string | null): SkillView {
    if (!this.locked) return this.transaction(() => this.save(input, expected))
    assertScopeGrant(this.grant, "workshop.write")
    const draft = validateDraft(input)
    const head = this.readManifest(draft.name)
    if (head.current !== expected) throw new Error("Skill changed; view it again before saving")
    this.compact(draft.name)
    if (!fs.existsSync(this.file(draft.name, "")) && fs.existsSync(this.root)
      && fs.readdirSync(this.root).length >= MAX_SKILLS) throw new Error("Workshop skill limit exceeded")
    const id = randomUUID()
    const revision = this.file(draft.name, `versions/${id}`)
    fs.mkdirSync(revision, { recursive: true, mode: 0o700 })
    const attribution = this.attribution()
    const files = { ...draft.files, "SKILL.md": renderSkill(draft), "skill.json": JSON.stringify(draft), "attribution.json": JSON.stringify(attribution) }
    for (const [name, content] of Object.entries(files)) {
      const file = this.file(draft.name, `versions/${id}/${name}`)
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
      fs.writeFileSync(file, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
    }
    // Readers see the complete previous revision until the single atomic pointer update.
    this.writeManifest(draft.name, { current: id, history: [head.current, ...head.history].slice(0, HISTORY_LIMIT), touchedAt: attribution.at, lastMutation: attribution })
    return this.view(draft.name)!
  }

  archive(name: string, expected: string): void {
    if (!this.locked) return this.transaction(() => this.archive(name, expected))
    assertScopeGrant(this.grant, "workshop.delete")
    const head = this.readManifest(name)
    if (!head.current || head.current !== expected) throw new Error("Skill changed; view it again")
    this.writeManifest(name, { ...head, current: null, history: [head.current, ...head.history].slice(0, HISTORY_LIMIT), lastMutation: this.attribution() }, "workshop.delete")
  }

  restore(name: string): SkillView | null {
    if (!this.locked) return this.transaction(() => this.restore(name))
    assertScopeGrant(this.grant, "workshop.write")
    const head = this.readManifest(name)
    if (!head.history.length) throw new Error("No previous version")
    const [current, ...history] = head.history
    if (current) {
      validateDraft(JSON.parse(fs.readFileSync(this.file(name, `versions/${current}/skill.json`), "utf8")))
    }
    this.writeManifest(name, { current, history, touchedAt: Date.now(), lastMutation: this.attribution() })
    return this.view(name)
  }
}
