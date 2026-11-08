import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"
import { resolveAgentDir } from "openclaw/plugin-sdk/agent-scope-runtime"
import { createScopeServices } from "./services.ts"
import { createHostSessionAuthority } from "./host-session.ts"
import { assertInboundAccess, admitInboundScope, isolatedSessionKey, type ScopeAccountPolicy } from "./inbound.ts"
import type { AdmissionOptions, InboundScope } from "./admission.ts"
import { assertBuiltinScopeRuntime } from "./runtime-policy.ts"
import { runtimeToolsEnabled, scopeAuthorityConfig, scopeEnabled, scopePolicyIssues } from "./scope-policy.js"

// Historical internal names; scoped memory is not an OS sandbox.
export const hardScopeEnabled = scopeEnabled

export function createHardScopeRuntime(api: OpenClawPluginApi) {
  if (typeof api.runtime.config.current !== "function") throw new Error("Current host configuration support required")
  // During reload construction current() can still describe the retiring
  // generation. Validate the candidate snapshot at registration; execution must
  // always revalidate against the adopted live configuration.
  let registering = true
  const read = () => registering ? api.config : api.runtime.config.current()
  // The pinned main runtime names this capability allowPromptModification;
  // its published SDK declaration can lag the runtime schema.
  const hooks = read().plugins?.entries?.[api.id ?? "dingtalk-connector"]?.hooks as
    | { allowConversationAccess?: boolean; allowPromptModification?: boolean }
    | undefined
  if (read().hooks?.internal?.enabled === false || hooks?.allowConversationAccess !== true || hooks.allowPromptModification === false) {
    throw new Error("Trusted DingTalk admission requires internal bootstrap hooks and connector conversation/prompt hook permission; run scope check")
  }
  const fingerprint = (cfg: unknown) => createHash("sha256").update(JSON.stringify(scopeAuthorityConfig(cfg))).digest("hex")
  const baseline = fingerprint(read())
  const services = createScopeServices({ stateDir: api.runtime.state.resolveStateDir(),
    ...createHostSessionAuthority(api.runtime.agent.session, () => read().session?.store),
    assertCurrent() {
      if ((!hardScopeEnabled(read()) && !runtimeToolsEnabled(read())) || fingerprint(read()) !== baseline) {
        throw new Error("DingTalk authority configuration changed; reload required")
      }
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
    admit(input: InboundScope, policy: () => ScopeAccountPolicy, options: AdmissionOptions = {}) {
      const guard = () => {
        services.assertCurrent()
        const scoped = hardScopeEnabled(read(), input.agentId)
        if (scoped) {
          if (options.routedSessionKey !== undefined) throw new Error("Scoped memory owns its isolated session key")
          assertAgent(input)
        } else if (!runtimeToolsEnabled(read())) {
          throw new Error("Scoped memory is not enabled for this Agent")
        } else if (!options.routedSessionKey) {
          throw new Error("Trusted runtime tool admission requires the channel session key")
        }
        assertInboundAccess(input, policy(), scoped)
      }
      guard()
      return admitInboundScope(services, input, guard, options)
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
