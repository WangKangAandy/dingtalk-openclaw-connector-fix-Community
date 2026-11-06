import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"
import { resolveAgentDir } from "openclaw/plugin-sdk/agent-scope-runtime"
import { createScopeServices } from "./services.ts"
import { createHostSessionAuthority } from "./host-session.ts"
import { assertInboundAccess, admitInboundScope, isolatedSessionKey, type ScopeAccountPolicy } from "./inbound.ts"
import type { InboundScope } from "./admission.ts"
import { assertBuiltinScopeRuntime } from "./runtime-policy.ts"
import { scopeAuthorityConfig, scopeEnabled, scopePolicyIssues } from "./scope-policy.js"

// Historical internal names; scoped memory is not an OS sandbox.
export const hardScopeEnabled = scopeEnabled

export function createHardScopeRuntime(api: OpenClawPluginApi) {
  if (typeof api.runtime.config.current !== "function") throw new Error("Current host configuration support required")
  // During reload construction current() can still describe the retiring
  // generation. Validate the candidate snapshot at registration; execution must
  // always revalidate against the adopted live configuration.
  let registering = true
  const read = () => registering ? api.config : api.runtime.config.current()
  const hooks = read().plugins?.entries?.[api.id ?? "dingtalk-connector"]?.hooks
  if (read().hooks?.internal?.enabled === false || hooks?.allowConversationAccess !== true || hooks.allowPromptModification === false) {
    throw new Error("Scoped memory requires internal bootstrap hooks and connector conversation/prompt hook permission; run scope check")
  }
  const fingerprint = (cfg: unknown) => createHash("sha256").update(JSON.stringify(scopeAuthorityConfig(cfg))).digest("hex")
  const baseline = fingerprint(read())
  const services = createScopeServices({ stateDir: api.runtime.state.resolveStateDir(),
    ...createHostSessionAuthority(api.runtime.agent.session, () => read().session?.store),
    assertCurrent() {
      if (!hardScopeEnabled(read()) || fingerprint(read()) !== baseline) throw new Error("Scope authority configuration changed; reload required")
    },
  })
  function assertExecution(input: { agentId?: string; sessionKey?: string }) {
    services.assertCurrent()
    if (!input.agentId || !input.sessionKey) throw new Error("Scoped memory requires host agent/session context")
    const config = structuredClone(read()) as OpenClawPluginApi["config"]
    if (!hardScopeEnabled(config, input.agentId)) throw new Error("Scoped memory is not enabled for this Agent")
    const issues = scopePolicyIssues(config, input.agentId)
    if (issues.length) throw new Error(`Scoped memory setup incomplete: ${issues.join("; ")}`)
    const host = api.runtime.agent.session
    const entry = host.getSessionEntry({ agentId: input.agentId, sessionKey: input.sessionKey,
      storePath: host.resolveStorePath(config.session?.store, { agentId: input.agentId }), readConsistency: "latest" })
    // Builtin bindings/lifecycle are supported. Shell and mount policy remain host-owned.
    assertBuiltinScopeRuntime(config, input.agentId, input.sessionKey, entry)
    const legacy = path.join(resolveAgentDir(config, input.agentId), "workshop-skills")
    if (fs.existsSync(legacy) && fs.readdirSync(legacy).length) {
      throw new Error("Existing Agent-wide learned skills require explicit migration or public classification before scoped learning; run scope check")
    }
  }
  function assertAgent(input: InboundScope) { assertExecution({ agentId: input.agentId, sessionKey: isolatedSessionKey(input) }) }
  registering = false
  return Object.freeze({ services, assertAgent, assertExecution,
    admit(input: InboundScope, policy: () => ScopeAccountPolicy) {
      const guard = () => { assertAgent(input); assertInboundAccess(input, policy()) }
      guard()
      return admitInboundScope(services, input, guard)
    },
  })
}
export type HardScopeRuntime = ReturnType<typeof createHardScopeRuntime>
let runtime: HardScopeRuntime | undefined
export function setHardScopeRuntime(next: HardScopeRuntime | undefined): void { runtime?.services.stop(); runtime = next }
export function getHardScopeRuntime(): HardScopeRuntime {
  if (!runtime) throw new Error("Scoped memory is unavailable; no unscoped fallback")
  return runtime
}
