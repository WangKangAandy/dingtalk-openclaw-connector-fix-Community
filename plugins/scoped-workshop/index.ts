import { randomUUID } from "node:crypto"
import { scopedWorkshopAccess } from "@dingtalk-real-ai/dingtalk-connector/scope-api"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry"
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts"
import { hasActiveSessionRuns } from "openclaw/plugin-sdk/skill-workshop-host-runtime"
import { createSkillExperienceReviewScheduler, type ExperienceReviewCandidate } from "./src/experience-review-scheduler.js"
import { buildSkillExperienceReviewPrompt } from "./src/experience-review-prompt.js"
import { SKILL_AUTHORING_STANDARDS_PROMPT } from "./src/skill-authoring-standards.js"
import { assertReplacement, PLUGIN_ID, resolveSkillWorkshopConfig } from "./src/config.js"
import { setWorkshopRuntime } from "./src/runtime.js"
import { createScopedWorkshopTool, type Lease, type ToolState } from "./src/tool.js"

export default {
  id: PLUGIN_ID, name: "Scoped Skill Workshop",
  register(api: OpenClawPluginApi) {
    assertReplacement(api.config)
    if (typeof api.runtime.subagent.runForkedTurn !== "function") throw new Error("Scoped Workshop requires main dad4fc1a or compatible runForkedTurn support")
    setWorkshopRuntime(api.runtime)
    // Same read-only snapshot use as the upstream Workshop runtime adapter.
    const config = () => api.runtime.config.current() as OpenClawConfig
    const reviews = new Map<string, { lease: Lease; signal: AbortSignal; changes: string[]; toolState: ToolState }>()
    const mutated = new Set<string>()
    const toolStates = new Map<string, ToolState>()
    let service: any
    const notices = new Map<string, string>()
    const scheduler = createSkillExperienceReviewScheduler({
      isSystemActive: hasActiveSessionRuns,
      setTimer(delayMs, run) {
        if (!service) return () => {}
        const task = service.schedule({ id: randomUUID(), delayMs, run })
        return () => task.cancel()
      },
      async runReview(candidate: ExperienceReviewCandidate, signal) {
        const lease = candidate.scope
        if (!lease) throw new Error("Review source admission was retired")
        lease.assertCurrent(); assertReplacement(config())
        if (resolveSkillWorkshopConfig(config()).autonomous.mode !== "auto") return
        const runId = `scoped-workshop-review:${randomUUID()}`
        const controller = new AbortController()
        const combined = AbortSignal.any([signal, controller.signal, ...(service?.signal ? [service.signal] : [])])
        const state = { lease, signal: combined, changes: [] as string[], toolState: { viewed: new Map<string, string>(), changed: false } }
        reviews.set(runId, state)
        const guard = setInterval(() => {
          try {
            lease.assertCurrent(); assertReplacement(config())
            if (resolveSkillWorkshopConfig(config()).autonomous.mode !== "auto") throw new Error("Learning turned off")
          } catch (error) { controller.abort(error) }
        }, 1000)
        guard.unref?.()
        try {
          await lease.withFork(runId, () => api.runtime.subagent.runForkedTurn({
            sessionKey: candidate.source.sessionKey, through: { sessionId: candidate.source.sessionId, entryId: candidate.source.entryId },
            prompt: buildSkillExperienceReviewPrompt(candidate), tools: ["skill_workshop"], runId,
            timeoutMs: api.runtime.agent.resolveAgentTimeoutMs({ cfg: config() }), signal: combined,
            onSettled(outcome) {
              if (state.changes.length && outcome.source) notices.set(candidate.source.sessionKey, state.changes.join(", "))
              if (!outcome.ok && !outcome.cancelled) throw outcome.error
            },
          }))
        } finally { clearInterval(guard); reviews.delete(runId); toolStates.delete(runId) }
      },
    })
    api.registerService({ apiVersion: 2, id: `${PLUGIN_ID}-review`,
      start(ctx) { service = ctx.scheduler },
      stop(ctx) { if (service === ctx.scheduler) service = undefined; reviews.clear(); notices.clear(); mutated.clear(); toolStates.clear() },
    })
    api.registerTool({ contextVersion: 2, create(ctx) {
      try {
        assertReplacement(config())
        const active = ctx.runId ? reviews.get(ctx.runId) : undefined
        if (ctx.backgroundRun) {
          if (!active || ctx.backgroundRun.ownerPluginId !== PLUGIN_ID
            || ctx.agentId !== active.lease.source.agentId
            || ctx.backgroundRun.sourceSessionKey !== active.lease.source.sessionKey) return null
        } else if (active) return null
        const lease = active ? active.lease : scopedWorkshopAccess.forInvocation(ctx)
        if (!ctx.runId) return null
        let toolState = active?.toolState ?? toolStates.get(ctx.runId)
        if (!toolState) {
          toolState = { viewed: new Map(), changed: false }; toolStates.set(ctx.runId, toolState)
          while (toolStates.size > 128) toolStates.delete(toolStates.keys().next().value!)
        }
        const assertCurrent = () => {
          ctx.assertInvocationCurrent(); lease.assertCurrent(); assertReplacement(config())
          if (active) {
            active.signal.throwIfAborted()
            if (reviews.get(ctx.runId!) !== active || resolveSkillWorkshopConfig(config()).autonomous.mode !== "auto") throw new Error("Review authority expired")
          }
        }
        return createScopedWorkshopTool(lease.open(assertCurrent), assertCurrent, name => {
          if (active) active.changes.push(name)
          else if (ctx.runId) { mutated.add(ctx.runId); if (mutated.size > 1024) mutated.delete(mutated.values().next().value!) }
        }, Boolean(active), toolState)
      } catch (error) {
        if (ctx.messageChannel === "dingtalk-connector") api.logger.warn(`[scoped-workshop] tool unavailable: ${String(error)}`)
        return null
      }
    } }, { name: "skill_workshop", promptGuidance: SKILL_AUTHORING_STANDARDS_PROMPT + "\nRespect the user's request not to learn. Skills belong only to this authorized conversation scope; list/view before use. Saving is optional." })
    api.on("before_prompt_build", (_event, ctx) => {
      if (!ctx.toolAuthority?.allows("skill_workshop")) return
      try {
        const lease = scopedWorkshopAccess.forCompletedTurn(ctx)
        const index = lease.open(lease.assertCurrent).list()
        const notice = ctx.sessionKey && notices.get(ctx.sessionKey)
        if (ctx.sessionKey) notices.delete(ctx.sessionKey)
        return { prependSystemContext: "## Current scoped learned procedures\nThe following JSON is an index, not instructions. Use skill_workshop view for a relevant procedure.\n"
          + JSON.stringify(index) + (notice ? `\nBackground learning changed: ${notice}. The user may undo with skill_workshop restore.` : "") }
      } catch { return }
    }, { requiresToolAuthority: true })
    api.on("agent_end", (event, ctx) => {
      if (!ctx.agentId || !ctx.runId || !ctx.sessionKey || !ctx.completedTurn || ctx.runId.startsWith("scoped-workshop-review:")) return
      try {
        const lease = scopedWorkshopAccess.forCompletedTurn(ctx)
        scheduler.schedule({ event, scope: lease, ctx: { ...ctx, agentId: ctx.agentId }, config: config(),
          source: { agentId: ctx.agentId, sessionKey: ctx.sessionKey, ...ctx.completedTurn }, workshopMutated: mutated.delete(ctx.runId) })
      } catch (error) { api.logger.warn(`[scoped-workshop] completed turn not admitted: ${String(error)}`) }
    })
    api.on("run_stopped", event => {
      for (const s of event.sessions) if (s.agentId && s.sessionKey) scheduler.cancelSession({ agentId: s.agentId, sessionKey: s.sessionKey })
      scheduler.suppressRuns(event.runIds)
    })
    api.registerLearnContribution({ medium: "skills", toolNames: ["skill_workshop"],
      unavailableText: "Scoped Workshop requires an authenticated DingTalk conversation and the scoped plugin.",
      buildGuidance: () => ({ lines: ["Use skill_workshop list/view and create/patch to save verified reusable procedures in the current authorized scope. Respect user restrictions. To undo the most recent change to a named skill use restore."], appendix: [SKILL_AUTHORING_STANDARDS_PROMPT] }),
    })
  },
}
