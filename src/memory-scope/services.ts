import path from "node:path"
import { ScopeAdmissions } from "./admission.ts"
import type { CaptureScopeSessionLease, ScopeSessionFacts } from "./session-lease.ts"

/** One instance per loaded connector. Memory, Workshop and runtime tools share admission. */
export type ScopeServices = Readonly<{
  admissions: ScopeAdmissions
  /** Plugin-owned; never model-selected. Host filesystem exposure is operator-owned. */
  storageRoot: string
  /** Revalidates scoped feature enablement and configured account authority. */
  assertCurrent: () => void
  stop: () => void
}>

export function createScopeServices(options: { stateDir: string; assertCurrent: () => void;
  captureSessionLease: CaptureScopeSessionLease }): ScopeServices {
  if (!path.isAbsolute(options.stateDir) || typeof options.assertCurrent !== "function") {
    throw new Error("Trusted host state directory and runtime policy guard required")
  }
  options.assertCurrent()
  if (typeof options.captureSessionLease !== "function") throw new Error("Host session lease support required")
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
    stop() { stopped = true; admissions.stop() },
  })
}
