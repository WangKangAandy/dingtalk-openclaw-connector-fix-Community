export type DingtalkChatType = "direct" | "group"

export type DingtalkMemoryScope = {
  channel: "dingtalk-connector"
  chatType: DingtalkChatType
  peerId: string
  /** Relative path from workspace root, no trailing slash. e.g. memory/users/605725474 */
  scopeDir: string
  /** Relative path to scoped MEMORY.md */
  memoryFile: string
  sessionKey: string
}

export type DingtalkSessionClassification =
  | { kind: "non_dingtalk" }
  | { kind: "malformed_dingtalk"; reason: string }
  | { kind: "valid"; scope: DingtalkMemoryScope }

export type DingtalkSessionScopeOptions = {
  /** Trusted account ids from the effective connector config. */
  accountIds?: readonly string[]
  /** Trusted effective group session mode. Defaults to the connector's safe group mode. */
  groupSessionScope?: "group" | "group_sender"
  /** Require the per-account direct-session shape used by the production isolation config. */
  requireAccountForDirect?: boolean
  /** Fail closed when effective connector/session settings cannot provide isolated scopes. */
  configurationError?: string
  /** Fail only group sessions when their effective account config is ambiguous. */
  groupConfigurationError?: string
}

export type MemoryScopeConfig = {
  enabled: boolean
  syncRootMemoryRules: boolean
  syncAgentsMemoryRules: boolean
}

export type AgentBootstrapFile = {
  name: string
  path: string
  content?: string
  missing?: boolean
}

export type AgentBootstrapHookContext = {
  workspaceDir: string
  bootstrapFiles: AgentBootstrapFile[]
  sessionKey?: string
  sessionId?: string
  agentId?: string
}
