import { delegateScope, assertScopeCurrent, type ScopeGrant } from "./authority.ts"
import type { ScopeHostContext, ScopeHookContext } from "./admission.ts"
import type { ScopeServices } from "./services.ts"
import { WorkshopStore } from "./scoped-workshop/storage.ts"
import { WORKSHOP_OPERATIONS } from "./scoped-workshop/binding.ts"
import { renderSkill, type SkillDraft } from "./scoped-workshop/contract.ts"
type ForkContext = { runId?: string; agentId?: string; inputProvenance?: { kind?: string; sourceTool?: string; sourceSessionKey?: string } }
type Published = { services: ScopeServices; admittedForks: Map<string, ScopeGrant>; instance?: {
  admittedFork: (ctx: ForkContext) => { agentId: string; sessionKey: string } | undefined
  forInvocation: (ctx: ScopeHostContext) => ReturnType<typeof lease>
  forCompletedTurn: (ctx: ScopeHookContext) => ReturnType<typeof lease>
} }
const scopeBridgeSymbol = Symbol.for("@dingtalk-real-ai/connector-scoped-workshop-bridge/v1")
const registry = globalThis as unknown as Record<symbol, Published | undefined>
/** Registration owns the publication; an imported copy never starts a second scope service. */
export function publishScopedWorkshopAccess(services: ScopeServices): () => void {
  const old = registry[scopeBridgeSymbol]
  if (old && old.services !== services) old.services.stop()
  const published: Published = { services, admittedForks: new Map() }
  // These functions capture the registering module's WeakMap and store classes.
  // A second loader copy only invokes them; it never interprets a foreign grant.
  published.instance = Object.freeze({
    admittedFork: ctx => admittedInInstance(ctx, published),
    forInvocation: ctx => lease(services.admissions.toolGrant(ctx, WORKSHOP_OPERATIONS), published),
    forCompletedTurn: ctx => lease(services.admissions.sourceGrant(ctx, WORKSHOP_OPERATIONS, services.assertCurrent), published),
  })
  registry[scopeBridgeSymbol] = published
  return () => { if (registry[scopeBridgeSymbol] === published) delete registry[scopeBridgeSymbol] }
}
function current(): Published {
  const result = registry[scopeBridgeSymbol]
  if (!result) throw new Error("Scoped memory is unavailable; no unscoped fallback")
  result.services.assertCurrent()
  return result
}

/** A host-stamped fork must also possess a current source lease delegated by the feature owner. */
export function admittedWorkshopFork(ctx: { runId?: string; agentId?: string; inputProvenance?: { kind?: string; sourceTool?: string; sourceSessionKey?: string } }) {
  return current().instance!.admittedFork(ctx)
}
function admittedInInstance(ctx: ForkContext, published: Published) {
  const grant = ctx.runId && published.admittedForks.get(ctx.runId)
  if (!grant) return undefined
  assertScopeCurrent(grant)
  if (ctx.agentId !== grant.identity.agentId || ctx.inputProvenance?.kind !== "internal_system"
    || ctx.inputProvenance.sourceTool !== "session_fork" || ctx.inputProvenance.sourceSessionKey !== grant.sessionKey) {
    throw new Error("Workshop fork does not match delegated source")
  }
  return { agentId: grant.identity.agentId, sessionKey: grant.sessionKey }
}

/** Public, in-process data capability. No model-selected scope or filesystem path. */
function lease(grant: ScopeGrant, published: Published) {
  const services = published.services
  const assertCurrent = () => { if (current() !== published) throw new Error("Scoped service generation changed"); assertScopeCurrent(grant) }
  return Object.freeze({
    source: Object.freeze({ agentId: grant.identity.agentId, sessionKey: grant.sessionKey, sessionId: grant.sessionId }),
    assertCurrent,
    async withFork<T>(runId: string, run: () => Promise<T>): Promise<T> {
      assertCurrent()
      if (!runId || published.admittedForks.has(runId) || published.admittedForks.size >= 32) throw new Error("Invalid or duplicate Workshop fork")
      published.admittedForks.set(runId, grant)
      try { return await run() } finally { published.admittedForks.delete(runId) }
    },
    open(assertInvocationCurrent: () => void) {
      assertCurrent(); assertInvocationCurrent()
      const child = delegateScope(grant, WORKSHOP_OPERATIONS, assertInvocationCurrent)
      const store = new WorkshopStore(services.storageRoot, child)
      const view = (name: string) => {
        const value = store.view(name)
        return value ? { name: value.name, revision: value.revision, skill: value.skill, content: renderSkill(value.skill) } : null
      }
      return Object.freeze({
        list: () => store.list().map(v => ({ name: v.name, revision: v.revision, description: v.skill.description })),
        view,
        stamp: () => store.stamp(),
        save: (draft: SkillDraft, revision: string | null) => { const v = store.save(draft, revision); return { name: v.name, revision: v.revision } },
        archive: (name: string, revision: string) => store.archive(name, revision),
        restore: (name: string) => { const v = store.restore(name); return { name, revision: v?.revision ?? null } },
      })
    },
  })
}

export const scopedWorkshopAccess = Object.freeze({
  apiVersion: 1 as const,
  forInvocation(ctx: ScopeHostContext) { return current().instance!.forInvocation(ctx) },
  forCompletedTurn(ctx: ScopeHookContext) { return current().instance!.forCompletedTurn(ctx) },
})
