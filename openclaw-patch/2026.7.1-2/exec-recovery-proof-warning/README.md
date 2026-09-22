# exec-recovery-proof-warning

## 问题

OpenClaw `2026.7.1-2` 在 `resolveToolErrorWarningPolicy` 中把 `exec`/`bash` 当 **mutating** 工具处理：只要没有「错误正文 / 明确认失败」，就会合成 `isError` final（`⚠️ Exec failed…`），**即使本轮已有正常助手回答**。

钉钉侧表现：正文已出，卡片末尾再被 Exec failed 覆盖（grep 无匹配 exit 1 也会触发）。

上游意图（#103574 一类）：**exec-like + 已有用户可见回答 = 已恢复，不再告警**。

## 修复（等价小 patch）

在 mutating 分支之前插入：

```js
if (isExecLikeToolName(params.lastToolError.toolName)) {
  return { showWarning: !params.hasUserFacingReply, includeDetails };
}
```

并去掉其后对 exec-like 的死分支（`isExecLike && !includeDetails → showWarning:false`），避免逻辑分叉。

**不**升 OpenClaw 大版本；**不**改 connector 职责边界——本 patch 修 core 合成策略；钉钉通道另有「已有正文则跳过 isError final」的最小兜底。

## 应用

```bash
# 单独
OPENCLAW_ROOT=~/.nvm/versions/node/v24.15.0/lib/node_modules/openclaw \
  ./openclaw-patch/2026.7.1-2/exec-recovery-proof-warning/apply.sh

# 或本版本全部 patch
./openclaw-patch/apply-all.sh
```

应用后需重启 Gateway。

## 验证

```bash
node ./openclaw-patch/2026.7.1-2/exec-recovery-proof-warning/verify-exec-recovery-proof.mjs \
  "$OPENCLAW_ROOT"
```

期望：`payloads-*.js` 中 exec-like 分支出现在 mutating 之前，且 `showWarning: !params.hasUserFacingReply`。
