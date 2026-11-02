import type { WorkshopStore } from "./storage.ts"
import { reviewEvidence, reviewPrompt } from "./review.ts"
import type { LearningConfig } from "./config.ts"
import type { ReviewSource } from "./runner.ts"

type State = { iterations: number; generation: number; mutated: boolean; timer?: ReturnType<typeof setTimeout>; abort?: AbortController }
export type ReviewTask = { key: string; source: ReviewSource; store: WorkshopStore; messages: unknown[]; config: LearningConfig; assertCurrent: () => void;
  withWork: (signal: AbortSignal, run: (store: WorkshopStore, combined: AbortSignal) => Promise<void>) => Promise<void> }
export type ReviewExecution = { task: ReviewTask; prompt: string; signal: AbortSignal; assertCurrent: () => void; onMutation: (name: string) => void }

/** Bounded scheduling; the tool's final synchronous effect shares the cancellation/store guard. */
export class ReviewScheduler {
  private states = new Map<string, State>()
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  private cooldownUntil = 0
  readonly notices = new Map<string, string>()
  constructor(private run: (execution: ReviewExecution) => Promise<void>, private warn: (message: string) => void) {}

  private state(key: string): State {
    let state = this.states.get(key)
    if (!state) {
      if (this.states.size >= 128) this.forget(this.states.keys().next().value!)
      state = { iterations: 0, generation: 0, mutated: false }; this.states.set(key, state)
    }
    return state
  }
  activity(key: string): void {
    const state = this.state(key)
    clearTimeout(state.timer); state.abort?.abort(); state.generation++; state.mutated = false
  }
  iteration(key: string): void { const state = this.state(key); if (!state.mutated) state.iterations++ }
  mutation(key: string): void { this.activity(key); const state = this.state(key); state.iterations = 0; state.mutated = true }
  forget(key: string): void {
    const state = this.states.get(key)
    clearTimeout(state?.timer); state?.abort?.abort()
    if (state) state.generation++
    this.states.delete(key)
  }
  end(task: ReviewTask, success: boolean): void {
    const state = this.state(task.key)
    if (!success) { state.iterations = 0; return }
    if (this.stopped || task.config.mode !== "auto" || state.mutated || state.iterations < task.config.reviewAfterIterations) return
    state.iterations = 0
    const generation = state.generation
    const evidence = reviewEvidence(task.messages)
    if (!evidence) { this.warn("Scoped review skipped: no usable evidence"); return }
    clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      this.queue = this.queue.then(async () => {
        if (this.stopped || generation !== state.generation || this.states.get(task.key) !== state || Date.now() < this.cooldownUntil) return
        const abort = new AbortController(); state.abort = abort
        const notices: string[] = []
        try {
          task.assertCurrent()
          await task.withWork(abort.signal, async (store, combined) => {
            let stamp = store.stamp()
            const assertCurrent = () => {
              combined.throwIfAborted()
              if (this.stopped || state.generation !== generation || this.states.get(task.key) !== state) throw new Error("Review expired")
              task.assertCurrent()
              if (store.stamp() !== stamp) throw new Error("Workshop changed during review")
            }
            await this.run({ task: { ...task, store }, prompt: reviewPrompt(evidence, store.list()), signal: combined, assertCurrent,
              onMutation: name => {
                notices.push(`Learned: ${name}. To undo, use scoped_skill_workshop restore with name ${name}.`)
                stamp = store.stamp()
              },
            })
            store.transaction(() => {
              assertCurrent()
              const archived = store.archiveUnused()
              if (archived.length) notices.push(`Archived unused learned skills: ${archived.join(", ")}. Restore any by name with scoped_skill_workshop.`)
              for (const skill of store.list()) store.compact(skill.name)
            })
          })
        } catch (error) {
          if (!abort.signal.aborted) {
            this.cooldownUntil = Date.now() + 15 * 60_000
            this.warn(`Scoped learning review failed: ${error instanceof Error ? error.name : "unknown error"}`)
          }
        } finally {
          // A completed tool write remains undoable even if the later model request fails.
          if (notices.length) {
            if (!this.notices.has(task.store.root) && this.notices.size >= 128) this.notices.delete(this.notices.keys().next().value!)
            this.notices.set(task.store.root, notices.join("\n"))
          }
          if (state.abort === abort) state.abort = undefined
        }
      }).catch(() => { this.warn("Scoped review queue failed") })
    }, task.config.reviewIdleMs)
    state.timer.unref?.()
  }
  stop(): void { this.stopped = true; for (const key of this.states.keys()) this.forget(key); this.notices.clear() }
}
