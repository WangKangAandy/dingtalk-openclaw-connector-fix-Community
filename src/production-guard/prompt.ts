export const PRODUCTION_WRITE_BLOCK_MESSAGE =
  "该操作涉及对公司部门的知识库进行修改，钉钉机器人不允许直接执行。请通过知识管理后台或正式变更流程处理。"

/** User-visible DingTalk guidance; keep implementation paths and tool names out. */
export function buildProductionWriteGuardPrompt(): string {
  return [
    "### 公司部门的知识库变更边界",
    "- 公司部门的知识库仅允许读取，不允许通过钉钉对话直接修改、删除、重命名或发布。",
    "- 用户请求修改公司部门的知识库时，不要调用写入、执行或其他变更工具，也不要声称已经完成。",
    `- 统一回复：${PRODUCTION_WRITE_BLOCK_MESSAGE}`,
    "- 不要向用户披露内部文件路径、工具名称、session 或权限实现细节。",
    "",
  ].join("\n")
}
