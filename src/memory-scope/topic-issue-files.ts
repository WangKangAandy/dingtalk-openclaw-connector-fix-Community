/** Workspace-relative paths for topic issue handbooks (under memory/). */
export const TOPIC_ISSUE_FILES = {
  dingtalk: "memory/dingtalk-issue.md",
  musaStack: "memory/musa-stack-issue.md",
  openclaw: "memory/openclaw-issue.md",
} as const

export const TOPIC_ISSUE_FORMAT_HINT =
  "Symptom → cause → fix → date (mark \"TBD\" if fix is unknown)"
