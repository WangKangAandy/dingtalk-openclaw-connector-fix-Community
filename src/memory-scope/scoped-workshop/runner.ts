import { randomUUID } from "node:crypto"
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core"
import { TOOL_NAME } from "./contract.ts"
import { learningConfig, requireNativeWorkshopExcluded } from "./config.ts"
import { REVIEW_SYSTEM } from "./review.ts"
import { workshopTool, type ReviewToolState } from "./tool.ts"
import type { ReviewExecution } from "./scheduler.ts"

type Params = Parameters<OpenClawPluginApi["runtime"]["agent"]["runEmbeddedAgent"]>[0]
export type ReviewSource = Pick<Params, "agentId" | "sessionId" | "sessionKey" | "workspaceDir" | "provider" | "model">
const BINDING = "dingtalkScopedReview"

// Revoke effects and release our queue even if a provider does not settle on abort.
// The host still receives abortSignal; this does not claim to forcibly kill its network request.
function untilAborted<T>(signal: AbortSignal, start: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Scoped review cancelled"))
    if (signal.aborted) { abort(); return }
    signal.addEventListener("abort", abort, { once: true })
    Promise.resolve().then(() => { signal.throwIfAborted(); return start() }).then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
}

/** Only live, in-process runs can resolve this binding. Model arguments cannot mint it. */
export class ScopedReviewRunner {
  private active = new Map<string, ReviewExecution & { toolState: ReviewToolState }>()
  private owned = new Set<string>()
  constructor(private api: OpenClawPluginApi) {}
  owns(runId?: string): boolean { return !!runId && this.owned.has(runId) }

  tool(ctx: OpenClawPluginToolContext<2>) {
    const token = ctx.toolBindings?.[BINDING]
    if (typeof token !== "string") return undefined
    const execution = this.active.get(token)
    if (!execution || ctx.sessionKey !== execution.task.source.sessionKey
      || ctx.sessionId !== execution.task.source.sessionId || ctx.agentId !== execution.task.source.agentId) return null
    return workshopTool(execution.task.store, () => {
      ctx.assertInvocationCurrent()
      const config = ctx.getRuntimeConfig?.() ?? this.api.config
      const learning = learningConfig(config)
      if (!learning.enabled || learning.mode !== "auto") throw new Error("Scoped review disabled")
      requireNativeWorkshopExcluded(config, execution.task.source.agentId)
      if (this.active.get(token) !== execution) throw new Error("Review binding expired")
      execution.assertCurrent()
    }, execution.onMutation, execution.toolState)
  }

  async run(execution: ReviewExecution): Promise<void> {
    execution.assertCurrent()
    if (this.owned.size >= 4) throw new Error("Too many unsettled scoped host runs")
    const runId = randomUUID()
    // The host's timeoutMs can apply per attempt; retries must not extend our grant lifetime.
    const deadline = new AbortController()
    const timer = setTimeout(() => {
      this.active.delete(runId)
      deadline.abort(new Error("Scoped review deadline exceeded"))
    }, 60_000)
    timer.unref?.()
    const combined = AbortSignal.any([execution.signal, deadline.signal])
    const bounded = { ...execution, signal: combined,
      assertCurrent() { combined.throwIfAborted(); execution.assertCurrent() },
      toolState: { viewed: new Map<string, string>(), changed: false } }
    this.active.set(runId, bounded)
    try {
      const source = execution.task.source
      const result = await untilAborted(combined, async () => {
        this.owned.add(runId)
        try { return await this.api.runtime.agent.runEmbeddedAgent({
        ...source, runId, config: this.api.config, cwd: source.workspaceDir,
        prompt: execution.prompt, extraSystemPrompt: REVIEW_SYSTEM,
        timeoutMs: 60_000, abortSignal: combined, retryConnectionErrors: false, trigger: "manual",
        sessionPersistence: "detached",
        toolsAllow: [TOOL_NAME], toolExecutionAllow: [TOOL_NAME],
        toolBindings: { [BINDING]: runId }, disableMessageTool: true,
        codeModeOverride: false, disableTrajectory: true,
        suppressLiveStreamOutput: true, agentHarnessRuntimeOverride: "openclaw",
        }) } finally { this.owned.delete(runId) }
      })
      bounded.assertCurrent()
      if (result.meta.aborted || result.meta.error || result.meta.failureSignal) throw new Error("Restricted review did not complete")
      // Text is never a write command. Only validated scoped tool calls have effects.
    } finally { clearTimeout(timer); this.active.delete(runId) }
  }
}

