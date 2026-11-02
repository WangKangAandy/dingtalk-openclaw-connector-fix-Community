import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"
import { resolveAgentDir } from "openclaw/plugin-sdk/agent-scope-runtime"
import { createScopeServices } from "./services.ts"
import { createHostSessionAuthority } from "./host-session.ts"
import { assertInboundAccess, admitInboundScope, isolatedSessionKey, type ScopeAccountPolicy } from "./inbound.ts"
import type { InboundScope } from "./admission.ts"

export function hardScopeEnabled(config: unknown): boolean {
  return (config as { channels?: Record<string, { memoryScope?: { enabled?: boolean } }> })
    ?.channels?.["dingtalk-connector"]?.memoryScope?.enabled === true
}
function requirePolicy(config: OpenClawPluginApi["config"], agentId: string) {
  const defaults = config.agents?.defaults, agent = config.agents?.entries?.[agentId]
  if (config.plugins?.slots?.memory !== "none") throw new Error("Hard scope requires plugins.slots.memory=none; native memory hooks are not scoped")
  if ((agent?.memory?.search?.enabled ?? config.memory?.search?.enabled) !== false) throw new Error("Hard scope requires native memory.search.enabled=false")
  if (defaults?.compaction?.memoryFlush?.enabled !== false) throw new Error("Hard scope requires native compaction.memoryFlush.enabled=false")
  if (config.skills?.workshop?.autonomous?.mode !== "off") throw new Error("Hard scope requires global workshop autonomous mode=off")
  if (!defaults?.skipOptionalBootstrapFiles?.includes("USER.md")) throw new Error("Hard scope requires skipOptionalBootstrapFiles to include USER.md")
  for (const owner of [defaults, agent]) {
    if (owner?.sandbox?.docker?.binds?.length || owner?.sandbox?.browser?.binds?.length) {
      throw new Error("Hard scope does not admit additional host filesystem mounts")
    }
  }
}

export function createHardScopeRuntime(api: OpenClawPluginApi) {
  if (typeof api.runtime.config.current !== "function") throw new Error("Current host configuration support required")
  const read = () => api.runtime.config.current()
  const hooks = read().plugins?.entries?.[api.id ?? "dingtalk-connector"]?.hooks
  if (read().hooks?.internal?.enabled === false || hooks?.allowConversationAccess !== true || hooks.allowPromptInjection === false) {
    throw new Error("Hard scope requires internal bootstrap hooks and connector conversation/prompt hook permission")
  }
  const fingerprint = (cfg: unknown) => createHash("sha256").update(JSON.stringify(cfg)).digest("hex")
  const baseline = fingerprint(read())
  const services = createScopeServices({ stateDir: api.runtime.state.resolveStateDir(),
    ...createHostSessionAuthority(api.runtime.agent.session, () => read().session?.store),
    assertCurrent() {
      if (!hardScopeEnabled(read()) || fingerprint(read()) !== baseline) throw new Error("Hard scope configuration changed; reload required")
    },
  })
  // A refusal-only gate for native tools. Host hook facts do not mint a scope.
  function assertExecution(input: { agentId?: string; sessionKey?: string }) {
    services.assertCurrent()
    if (!input.agentId || !input.sessionKey) throw new Error("Hard scope execution requires host agent/session context")
    // The SDK resolver accepts mutable config; clone the readonly host snapshot.
    const config = structuredClone(read()) as OpenClawPluginApi["config"]
    requirePolicy(config, input.agentId)
    // The public sandbox resolver loads the host session entry itself, including
    // execution/model overrides. Do not pass unsupported internal parameters.
    const authority = api.runtime.sandbox.resolveWorkspaceAuthority({ config, agentId: input.agentId,
      sessionKey: input.sessionKey, confinedToolNames: ["scoped_memory", "scoped_skill_workshop"],
      requiredToolNames: ["scoped_memory"],
    })
    if (!authority.sandboxed || authority.workspaceAccess !== "none" || authority.confinementError) {
      throw new Error(`Hard scope requires an exclusive confined sandbox without host workspace access: ${authority.confinementError ?? "unsafe sandbox"}`)
    }
    const legacy = path.join(resolveAgentDir(config, input.agentId), "workshop-skills")
    if (fs.existsSync(legacy) && fs.readdirSync(legacy).length) throw new Error("Unscoped learned skills must be removed from this agent's automatic discovery before hard scope is enabled")
    const userFile = path.join(api.runtime.agent.resolveAgentWorkspaceDir(config, input.agentId), "USER.md")
    try {
      const stat = fs.lstatSync(userFile)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== 0) {
        throw new Error("Unscoped USER.md must be removed from the shared workspace before hard scope is enabled")
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  function assertAgent(input: InboundScope) { assertExecution({ agentId: input.agentId, sessionKey: isolatedSessionKey(input) }) }
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
  if (!runtime) throw new Error("Hard memory scope is unavailable; no legacy fallback")
  return runtime
}
