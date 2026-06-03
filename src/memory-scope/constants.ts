/** DingTalk channel id used in OpenClaw session keys. */
export const DINGTALK_CHANNEL_ID = "dingtalk-connector"

export const ROOT_MEMORY_FILENAME = "MEMORY.md"

/** Relative workspace prefix for per-user long-term memory. */
export const USERS_MEMORY_PREFIX = "memory/users"

/** Relative workspace prefix for per-group long-term memory. */
export const GROUPS_MEMORY_PREFIX = "memory/groups"

export const LOG_PREFIX = "[dingtalk-connector][memory-scope]"

export const GUARDED_TOOL_NAMES = new Set(["read", "write", "edit", "memory_get"])

/** Global daily note pattern written by OpenClaw compaction flush. */
export const GLOBAL_DAILY_MEMORY_PATTERN = /^memory\/(\d{4}-\d{2}-\d{2})\.md$/
