import { captureScopeSessionLease, type ScopeSessionEntry, type ScopeSessionFacts } from "./session-lease.ts"
import type { RunScopeWork } from "./services.ts"

/** Narrow structural view of the public OpenClaw runtime.agent.session contract. */
export type ScopeSessionHost = {
  resolveStorePath: (store?: string, options?: { agentId?: string }) => string
  getSessionEntry: (params: { agentId: string; sessionKey: string; storePath: string; readConsistency: "latest" }) => ScopeSessionEntry | undefined
  runWithWorkAdmission: <T>(params: { storePath: string; sessionKey: string; signal?: AbortSignal },
    run: (signal: AbortSignal) => Promise<T>) => Promise<T>
}

/** Host-owned agent configuration resolves store paths, never model input or key parsing. */
export function createHostSessionAuthority(host: ScopeSessionHost, readConfiguredStore: () => string | undefined) {
  for (const method of ["resolveStorePath", "getSessionEntry", "runWithWorkAdmission"] as const) {
    if (typeof host?.[method] !== "function") throw new Error(`Host session capability missing: ${method}`)
  }
  function capture(facts: ScopeSessionFacts) {
    const storePath = host.resolveStorePath(readConfiguredStore(), { agentId: facts.agentId })
    const lease = captureScopeSessionLease(facts, () => {
      if (host.resolveStorePath(readConfiguredStore(), { agentId: facts.agentId }) !== storePath) {
        throw new Error("Host session store configuration changed")
      }
      return host.getSessionEntry({ ...facts, storePath, readConsistency: "latest" })
    })
    return { storePath, lease }
  }
  const runScopeWork: RunScopeWork = async (facts, signal, run) => {
    const { storePath, lease } = capture(facts)
    return host.runWithWorkAdmission({ storePath, sessionKey: facts.sessionKey, signal }, async combined => {
      combined.throwIfAborted()
      lease()
      const result = await run(combined)
      combined.throwIfAborted()
      lease()
      return result
    })
  }
  return Object.freeze({ captureSessionLease: (facts: ScopeSessionFacts) => capture(facts).lease, runScopeWork })
}
