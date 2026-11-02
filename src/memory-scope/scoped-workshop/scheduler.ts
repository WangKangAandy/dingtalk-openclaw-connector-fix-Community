import type { WorkshopStore } from "./storage.ts"
import { commitReview, REVIEW_SYSTEM, reviewEvidence, reviewPrompt } from "./review.ts"
import type { LearningConfig } from "./config.ts"

type Completion = (input: { agentId: string; message: string; extraSystemPrompt: string; timeoutMs: number; signal: AbortSignal }) => Promise<{ text: string }>
type State = { iterations: number; generation: number; mutated: boolean; timer?: ReturnType<typeof setTimeout>; abort?: AbortController }
export type ReviewTask = { key: string; agentId: string; store: WorkshopStore; messages: unknown[]; config: LearningConfig; assertCurrent: () => void }

/** Bounded, process-local scheduling; all disk mutations go through WorkshopStore. */
export class ReviewScheduler {
  private states = new Map<string, State>()
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  private cooldownUntil = 0
  readonly notices = new Map<string, string>()
  constructor(private complete: Completion, private warn: (message: string) => void) {}

  private state(key: string): State {
    let state = this.states.get(key)
    if (!state) {
      if (this.states.size >= 128) this.forget(this.states.keys().next().value!)
      state = { iterations: 0, generation: 0, mutated: false }
      this.states.set(key, state)
    }
    return state
  }

  activity(key: string): void {
    const state = this.state(key)
    clearTimeout(state.timer); state.abort?.abort(); state.generation++
    state.mutated = false
  }

  iteration(key: string): void {
    const state = this.state(key)
    if (!state.mutated) state.iterations++
  }

  mutation(key: string): void {
    this.activity(key)
    const state = this.state(key)
    state.iterations = 0; state.mutated = true
  }

  forget(key: string): void {
    const state = this.states.get(key)
    clearTimeout(state?.timer); state?.abort?.abort()
    if (state) state.generation++
    this.states.delete(key)
  }

  end(task: ReviewTask, success: boolean): void {
    const state = this.state(task.key)
    if (!success) { state.iterations = 0; return }
    if (this.stopped || task.config.mode !== "auto" || state.mutated
      || state.iterations < task.config.reviewAfterIterations) return
    state.iterations = 0
    const generation = state.generation
    const evidence = reviewEvidence(task.messages)
    if (!evidence) return
    clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      this.queue = this.queue.then(async () => {
        if (this.stopped || generation !== state.generation || this.states.get(task.key) !== state
          || Date.now() < this.cooldownUntil) return
        const abort = new AbortController(); state.abort = abort
        const notices: string[] = []
        try {
          task.assertCurrent()
          const stamp = task.store.stamp()
          const before = task.store.list()
          const prompt = reviewPrompt(evidence, before)
          if (!prompt) return
          const result = await this.complete({ agentId: task.agentId, message: prompt,
            extraSystemPrompt: REVIEW_SYSTEM, timeoutMs: 30_000, signal: abort.signal })
          if (abort.signal.aborted || generation !== state.generation || this.stopped) return
          task.assertCurrent()
          if (task.store.stamp() !== stamp) return
          const name = commitReview(task.store, before, result.text)
          if (name) {
            notices.push(`Learned: ${name}. To undo, use scoped_skill_workshop restore with name ${name}.`)
          }
          const archived = task.store.archiveUnused()
          if (archived.length) notices.push(`Archived unused learned skills: ${archived.join(", ")}. Restore any by name with scoped_skill_workshop.`)
          for (const skill of task.store.list()) task.store.compact(skill.name)
        } catch (error) {
          if (!abort.signal.aborted) {
            // Failed background work never retries automatically or writes partial results.
            this.cooldownUntil = Date.now() + 15 * 60_000
            this.warn(`Scoped learning review skipped: ${error instanceof Error ? error.name : "error"}`)
          }
        } finally {
          // Keep every completed change in this review, even if later maintenance fails.
          if (notices.length) {
            if (!this.notices.has(task.store.root) && this.notices.size >= 128) this.notices.delete(this.notices.keys().next().value!)
            this.notices.set(task.store.root, notices.join("\n"))
          }
          if (state.abort === abort) state.abort = undefined
        }
      }).catch(() => { /* Keep the queue usable after an unexpected failure. */ })
    }, task.config.reviewIdleMs)
    state.timer.unref?.()
  }

  stop(): void {
    this.stopped = true
    for (const key of this.states.keys()) this.forget(key)
    this.notices.clear()
  }
}
