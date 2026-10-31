/** Workspace-relative paths for topic issue handbooks (under memory/). */
export const TOPIC_ISSUE_FILES = {
  dingtalk: "memory/dingtalk-issue.md",
  musaStack: "memory/musa-stack-issue.md",
  openclaw: "memory/openclaw-issue.md",
} as const

export const TOPIC_ISSUE_FORMAT_HINT =
  "现象 → 原因 → 修复 → 日期（修复未知则标「待定」）"
