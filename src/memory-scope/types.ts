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

export type MemoryScopeConfig = {
  enabled: boolean
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
