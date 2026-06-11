# Patch：Tool Loop 后空 Final Synthesis → Fallback（v2 收窄版）

> **Patch ID**：`empty-synthesis-after-tool-loop`  
> **版本**：OpenClaw `2026.5.7`  
> **总纲**：[openclaw-patch/README.md](../../README.md)

---

## 1. 问题

多轮 tool 成功后，最后一轮 assistant 返回 `content:[]`、`output:0`、`stopReason:stop`。  
OpenClaw 因「已有 block partial / tool 已执行」跳过 fallback，用户只看到半截过程文字。

---

## 2. v2 相对 v1 的收窄（不新增模块）

| 改动 | 目的 |
|------|------|
| 复用 `hasCommittedMessagingToolDeliveryEvidence(attempt)` | messaging 已送达时不判 incomplete / 不 empty retry |
| 复用 `hasMessagingToolDeliveryEvidence(result)` | fallback 分类器同样豁免 |
| `stopReason` 必须 **严格等于** `"stop"` | 避免 error/toolUse/缺失 时误触发 |
| `lastCallUsage.output` 必须 **严格等于** `0` | 不再回退到整 run 累计 `usage.output`，避免漏判/误判 |
| 最后一轮仍有 toolCall → 不触发 | 与原有 `toolUse` 终端语义一致 |
| `extractAssistantVisibleText` 非空 → 不触发 | 不误杀短回复（「好了」等） |

**刻意不做（避免引入新问题）：**

- 半截 narration 检测
- transcript strip / synthesis-only fallback
- 新日志子系统或 metadata 字段

---

## 3. 触发条件（实现）

### Run 内（`selection-BeP8qtCb.js`）

```javascript
isEmptyFinalSynthesisAfterToolLoopAttempt(attempt):
  !hasCommittedMessagingToolDeliveryEvidence(attempt)
  && toolMetas.length > 0
  && lastAssistant.stopReason === 'stop'
  && !lastAssistantHasToolCalls(lastAssistant)
  && extractAssistantVisibleText(lastAssistant) 为空
  && lastAssistant.usage.output === 0
```

挂钩：

- `resolveIncompleteTurnPayloadText` — 在 `payloadCount > 0` 时仍可为 incomplete
- `isEmptyResponseAssistantTurn` — 允许 empty response retry（若 `shouldSkipPlanningOnlyRetry` 未挡）

### Fallback（`result-fallback-classifier-CrVa7J1V.js`）

```javascript
isEmptyFinalSynthesisAfterToolLoopResult(result):
  !hasMessagingToolDeliveryEvidence(result)
  && toolSummary.calls > 0
  && finalAssistantVisibleText 为空
  && stopReason === 'stop'
  && lastCallUsage.output === 0
```

在 block/tool 豁免 **之前** 返回 `incomplete_result`，触发 `gpt-5.4` fallback。

---

## 4. 仍存在的限制

| 场景 | v2 行为 |
|------|---------|
| 最后一轮有半截 text（output>0） | **不触发** |
| fallback 整 run 重跑 | 仍可能发生重复 tool（OpenClaw 原有行为） |
| 空 assistant turn 写入 session | 仍落盘（未 strip） |
| `lastCallUsage` 缺失 | **不触发** fallback（宁可漏判） |

---

## 5. 部署

```bash
./openclaw-patch/2026.5.7/empty-synthesis-after-tool-loop/apply.sh
# 或
./openclaw-patch/apply-all.sh
systemctl --user restart openclaw-gateway
```

验证：

```bash
grep -c isEmptyFinalSynthesisAfterToolLoop \
  "$(npm root -g)/openclaw/dist/selection-BeP8qtCb.js" \
  "$(npm root -g)/openclaw/dist/result-fallback-classifier-CrVa7J1V.js"
# 期望：3 和 2
```

日志关键字：`empty response detected`、`incomplete_result`、`candidate_succeeded ... gpt-5.4`

---

## 6. 修改文件

| 文件 | 说明 |
|------|------|
| `dist/selection-BeP8qtCb.js` | incomplete / empty retry |
| `dist/result-fallback-classifier-CrVa7J1V.js` | fallback 分类 |
| `patch.diff` | 可重复应用 |
| `apply.sh` | 应用脚本 |
