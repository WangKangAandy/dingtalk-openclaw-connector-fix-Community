# exec-recovery-proof-warning

## 问题

OpenClaw `2026.7.1-2` 在 `resolveToolErrorWarningPolicy` 中把 `exec`/`bash` 当 **mutating** 工具处理：只要没有「错误正文 / 明确认失败」，就会合成 `isError` final（`⚠️ Exec failed…`），**即使本轮已有正常助手回答**。

钉钉侧表现：正文已出，卡片末尾再被 Exec failed 覆盖（grep 无匹配 exit 1 也会触发）。

上游意图（#103574 一类）：**exec-like + 已有用户可见回答 = 已恢复，不再告警**。

## 上游是否已修？何时可卸本 patch

| OpenClaw 版本 | 本机/发布状态 | 是否还要打本 patch |
|---------------|---------------|-------------------|
| **`2026.7.1-2`（当前生产）** | `resolveToolErrorWarningPolicy` 仍先走 mutating，`exec` 不看 `hasUserFacingReply` | **要** |
| **上游 `main`（及之后合入 #103574 / agents payload 策略的提交）** | exec-like 以「有用户可见回答 = recovery proof」抑制 stale warning | **不要**（或升级后 `verify` 已通过即视为已内置） |
| **介于二者之间的正式 release** | 以 `verify-exec-recovery-proof.mjs` 为准，不要凭版本号猜 | verify 失败再打；通过则卸/跳过 |

说明：相关后续 PR（如 messaging-tool 投递也算「已有回复」）曾出现「已在 main、**尚未进某个 release tag**」的情况。因此：

- 本目录 **只绑定 `2026.7.1-2`**（`apply.sh` 会校版本）。
- **升级 OpenClaw 后不要盲目再打**；先跑 verify，已内置则删除本 patch 目录或跳过 apply。
- 钉钉 channel「已有正文则跳过 isError final」是通道兜底，与 core 是否已修正交，升级后仍可保留。

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
# 只打本 patch（推荐）
OPENCLAW_ROOT=~/.nvm/versions/node/v24.15.0/lib/node_modules/openclaw \
  ./openclaw-patch/2026.7.1-2/exec-recovery-proof-warning/apply.sh

# 慎用：会跑本版本目录下全部 apply.sh
# ./openclaw-patch/apply-all.sh
```

应用后需重启 Gateway。

## 验证

```bash
node ./openclaw-patch/2026.7.1-2/exec-recovery-proof-warning/verify-exec-recovery-proof.mjs \
  "$OPENCLAW_ROOT"
```

期望：`payloads-*.js` 中 exec-like 分支出现在 mutating 之前，且 `showWarning: !params.hasUserFacingReply`。
