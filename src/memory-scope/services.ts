import path from "node:path"
import { ScopeAdmissions } from "./admission.ts"

/** One instance per loaded connector. Memory and Workshop must receive this same object. */
export type ScopeServices = Readonly<{
  admissions: ScopeAdmissions
  /** Host-owned, outside every agent workspace/sandbox mount. Not an agent-selectable path. */
  storageRoot: string
  /** Revalidates hard-mode enablement, tool/sandbox policy and configured account authority. */
  assertCurrent: () => void
  stop: () => void
}>

export function createScopeServices(options: { stateDir: string; assertCurrent: () => void }): ScopeServices {
  if (!path.isAbsolute(options.stateDir) || typeof options.assertCurrent !== "function") {
    throw new Error("Trusted host state directory and runtime policy guard required")
  }
  options.assertCurrent()
  const admissions = new ScopeAdmissions()
  let stopped = false
  return Object.freeze({
    admissions,
    storageRoot: path.join(path.resolve(options.stateDir), "plugin-state", "dingtalk-connector", "scopes-v1"),
    assertCurrent() {
      if (stopped) throw new Error("Scoped services stopped")
      options.assertCurrent()
    },
    stop() { stopped = true; admissions.stop() },
  })
}
