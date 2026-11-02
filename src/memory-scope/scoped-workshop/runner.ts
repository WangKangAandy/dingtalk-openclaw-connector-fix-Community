import { randomUUID } from "node:crypto"
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core"
import { TOOL_NAME } from "./contract.ts"
import { learningConfig, requireGlobalWorkshopOff } from "./config.ts"
import { REVIEW_SYSTEM } from "./review.ts"
import { workshopTool, type ReviewToolState } from "./tool.ts"
import type { ReviewExecution } from "./scheduler.ts"

type Params = Parameters<OpenClawPluginApi["runtime"]["agent"]["runEmbeddedAgent"]>[0]
export type ReviewSource = Pick<Params, "agentId" | "sessionId" | "sessionKey" | "workspaceDir" | "provider" | "model">
const BINDING = "dingtalkScopedReview"

/** Only live, in-process runs can resolve this binding. Model arguments cannot mint it. */
export class ScopedReviewRunner {
  private active = new Map<string, ReviewExecution & { toolState: ReviewToolState }>()
  constructor(private api: OpenClawPluginApi) {}
  owns(runId?: string): boolean { return !!runId && this.active.has(runId) }

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
      requireGlobalWorkshopOff(config)
      if (this.active.get(token) !== execution) throw new Error("Review binding expired")
      execution.assertCurrent()
    }, execution.onMutation, execution.toolState)
  }

  async run(execution: ReviewExecution): Promise<void> {
    execution.assertCurrent()
    const runId = randomUUID()
    this.active.set(runId, { ...execution, toolState: { viewed: new Map(), changed: false } })
    try {
      const source = execution.task.source
      const result = await this.api.runtime.agent.runEmbeddedAgent({
        ...source, runId, config: this.api.config, cwd: source.workspaceDir,
        prompt: execution.prompt, extraSystemPrompt: REVIEW_SYSTEM,
        timeoutMs: 60_000, abortSignal: execution.signal, trigger: "manual",
        sessionPersistence: "detached",
        toolsAllow: [TOOL_NAME], toolExecutionAllow: [TOOL_NAME],
        toolBindings: { [BINDING]: runId }, disableMessageTool: true,
        codeModeOverride: false, disableTrajectory: true,
        suppressLiveStreamOutput: true, agentHarnessRuntimeOverride: "openclaw",
      })
      if (result.meta.aborted || result.meta.error || result.meta.failureSignal) throw new Error("Restricted review did not complete")
      // Text is never a write command. Only validated scoped tool calls have effects.
    } finally { this.active.delete(runId) }
  }
}

