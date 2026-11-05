import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"
import { createRequire } from "node:module"

// These broad public SDK entrypoints load model/provider registries. Load them
// only for hard-scope admission, not for every ordinary connector message import.
// The supported Node 24.22.1 host provides synchronous require(esm).
const require = createRequire(import.meta.url)

type Config = OpenClawPluginApi["config"]
type Session = ReturnType<OpenClawPluginApi["runtime"]["agent"]["session"]["getSessionEntry"]>

/** Hard scope admits the builtin runner only, including configured fallback routes.
 * Checking the configured ladder even while a session pins a model is deliberate:
 * unlocking that session must not expose an unchecked execution surface.
 */
export function assertBuiltinScopeRuntime(config: Config, agentId: string, sessionKey: string, session: Session) {
  const { resolveAgentConfig, resolveDefaultModelForAgent, buildModelAliasIndex, resolveModelRefFromString, findNormalizedProviderValue } =
    require("openclaw/plugin-sdk/agent-runtime") as typeof import("openclaw/plugin-sdk/agent-runtime")
  const { resolveSessionModelRef } = require("openclaw/plugin-sdk/model-session-runtime") as typeof import("openclaw/plugin-sdk/model-session-runtime")
  const { resolveEffectiveAgentRuntime } = require("openclaw/plugin-sdk/command-auth-native") as typeof import("openclaw/plugin-sdk/command-auth-native")
  const agent = resolveAgentConfig(config, agentId)
  if (agent?.runtime?.type === "acp" || session?.acp) throw new Error("Hard scope requires the builtin OpenClaw runner; ACP sessions are unsupported")
  const primary = resolveDefaultModelForAgent({ cfg: config, agentId })
  const selected = resolveSessionModelRef(config, session, agentId)
  const aliases = buildModelAliasIndex({ cfg: config, agentId, defaultProvider: primary.provider })
  // An agent-owned primary starts its own ladder (including an empty one).
  // A fallback-only agent model overrides defaults without replacing the primary.
  const owned = agent?.model
  const model = owned && (typeof owned === "string" || owned.primary || Array.isArray(owned.fallbacks))
    ? owned : config.agents?.defaults?.model
  const fallbacks = typeof model === "object" ? model.fallbacks ?? [] : []
  const candidates = [selected, primary, ...fallbacks.map(raw => {
    const resolved = resolveModelRefFromString({ cfg: config, agentId, raw, defaultProvider: primary.provider, aliasIndex: aliases })
    if (!resolved) throw new Error(`Hard scope cannot resolve configured fallback ${raw}`)
    return resolved.ref
  })]
  const unique = [...new Map(candidates.map(ref => [JSON.stringify(ref), ref])).values()]
  for (const ref of unique) {
    const provider = findNormalizedProviderValue(config.models?.providers, ref.provider)
    const model = provider?.models?.find(item => item.id === ref.model)
    // Check both configured policy and the latest session override. Neither a
    // temporary safe override nor a model lock authorizes an unsafe base route.
    for (const sessionEntry of [undefined, session]) {
      const runtime = resolveEffectiveAgentRuntime({ cfg: config, agentScope: { kind: "prepared", agentId }, sessionKey,
        provider: ref.provider, modelId: ref.model, modelApi: model?.api ?? provider?.api,
        modelBaseUrl: provider?.baseUrl, sessionEntry, mode: "execution" })
      if (runtime !== "openclaw") throw new Error(`Hard scope requires builtin OpenClaw runtime for ${ref.provider}/${ref.model}; resolved ${runtime}`)
    }
  }
  return unique
}
