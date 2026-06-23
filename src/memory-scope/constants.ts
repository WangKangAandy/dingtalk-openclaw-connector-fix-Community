/** DingTalk channel id used in OpenClaw session keys. */
export const DINGTALK_CHANNEL_ID = "dingtalk-connector"

export const ROOT_MEMORY_FILENAME = "MEMORY.md"
export const AGENTS_FILENAME = "AGENTS.md"

export const ROOT_MEMORY_RULES_BEGIN_MARKER = "<!-- dingtalk-memory-scope:rules -->"
export const ROOT_MEMORY_RULES_END_MARKER = "<!-- /dingtalk-memory-scope:rules -->"

export const AGENTS_SESSION_STARTUP_BEGIN_MARKER = "<!-- dingtalk-memory-scope:session-startup-memory -->"
export const AGENTS_SESSION_STARTUP_END_MARKER = "<!-- /dingtalk-memory-scope:session-startup-memory -->"

export const AGENTS_MEMORY_BEGIN_MARKER = "<!-- dingtalk-memory-scope:agents-memory -->"
export const AGENTS_MEMORY_END_MARKER = "<!-- /dingtalk-memory-scope:agents-memory -->"

export const AGENTS_HEARTBEAT_PROACTIVE_BEGIN_MARKER = "<!-- dingtalk-memory-scope:heartbeat-proactive-work -->"
export const AGENTS_HEARTBEAT_PROACTIVE_END_MARKER = "<!-- /dingtalk-memory-scope:heartbeat-proactive-work -->"

export const AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_BEGIN_MARKER =
  "<!-- dingtalk-memory-scope:heartbeat-memory-maintenance -->"
export const AGENTS_HEARTBEAT_MEMORY_MAINTENANCE_END_MARKER =
  "<!-- /dingtalk-memory-scope:heartbeat-memory-maintenance -->"

/** Relative workspace prefix for per-user long-term memory. */
export const USERS_MEMORY_PREFIX = "memory/users"

/** Relative workspace prefix for per-group long-term memory. */
export const GROUPS_MEMORY_PREFIX = "memory/groups"

export const LOG_PREFIX = "[dingtalk-connector][memory-scope]"

export const GUARDED_TOOL_NAMES = new Set(["read", "write", "edit", "memory_get"])

/** Global daily note pattern written by OpenClaw compaction flush. */
export const GLOBAL_DAILY_MEMORY_PATTERN = /^memory\/(\d{4}-\d{2}-\d{2})\.md$/
