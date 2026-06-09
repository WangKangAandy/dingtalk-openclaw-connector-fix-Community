/** Workspace-relative paths for topic issue handbooks (under memory/). */
export const TOPIC_ISSUE_FILES = {
  dingtalk: "memory/dingtalk-issue.md",
  musaStack: "memory/musa-stack-issue.md",
  openclaw: "memory/openclaw-issue.md",
} as const

export const TOPIC_ISSUE_FORMAT_HINT =
  "现象 → 原因 → 解法 → 日期（解法暂缺标「待补充」）"
