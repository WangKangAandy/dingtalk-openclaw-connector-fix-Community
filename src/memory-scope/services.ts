import path from "node:path"
import { ScopeAdmissions } from "./admission.ts"
import { assertScopeCurrent, bindScopeLifetime, revokeScope, type ScopeGrant } from "./authority.ts"
import type { CaptureScopeSessionLease, ScopeSessionFacts } from "./session-lease.ts"

export type RunScopeWork = <T>(facts: ScopeSessionFacts, signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>) => Promise<T>

/** One instance per loaded connector. Memory and Workshop must receive this same object. */
export type ScopeServices = Readonly<{
  admissions: ScopeAdmissions
  /** Host-owned, outside every agent workspace/sandbox mount. Not an agent-selectable path. */
  storageRoot: string
  /** Revalidates hard-mode enablement, tool/sandbox policy and configured account authority. */
  assertCurrent: () => void
  /** Caller must use workGrant inside run; it expires on cancellation and callback completion. */
  withSourceWork: <T>(grant: ScopeGrant, signal: AbortSignal | undefined,
    run: (workGrant: ScopeGrant, signal: AbortSignal) => Promise<T>) => Promise<T>
  stop: () => void
}>

export function createScopeServices(options: { stateDir: string; assertCurrent: () => void;
  captureSessionLease: CaptureScopeSessionLease; runScopeWork: RunScopeWork }): ScopeServices {
  if (!path.isAbsolute(options.stateDir) || typeof options.assertCurrent !== "function") {
    throw new Error("Trusted host state directory and runtime policy guard required")
  }
  options.assertCurrent()
  if (typeof options.captureSessionLease !== "function") throw new Error("Host session lease support required")
  if (typeof options.runScopeWork !== "function") throw new Error("Host work admission support required")
  const admissions = new ScopeAdmissions({ captureSessionLease: options.captureSessionLease })
  let stopped = false
  function assertCurrent() {
    if (stopped) throw new Error("Scoped services stopped")
    options.assertCurrent()
  }
  return Object.freeze({
    admissions,
    storageRoot: path.join(path.resolve(options.stateDir), "plugin-state", "dingtalk-connector", "scopes-v1"),
    assertCurrent,
    async withSourceWork<T>(grant: ScopeGrant, signal: AbortSignal | undefined,
      run: (workGrant: ScopeGrant, signal: AbortSignal) => Promise<T>): Promise<T> {
      assertCurrent()
      assertScopeCurrent(grant)
      signal?.throwIfAborted()
      const facts = Object.freeze({ agentId: grant.identity.agentId, sessionKey: grant.sessionKey, sessionId: grant.sessionId })
      return options.runScopeWork(facts, signal, async hostSignal => {
        const combined = signal ? AbortSignal.any([signal, hostSignal]) : hostSignal
        const workGrant = bindScopeLifetime(grant, () => { assertCurrent(); combined.throwIfAborted() })
        try {
          const result = await run(workGrant, combined)
          assertScopeCurrent(workGrant)
          return result
        } finally { revokeScope(workGrant) }
      })
    },
    stop() { stopped = true; admissions.stop() },
  })
}
