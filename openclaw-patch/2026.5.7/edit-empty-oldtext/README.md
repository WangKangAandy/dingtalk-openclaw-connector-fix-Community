# Patch：edit 空 oldText 误报 → 明确校验错误

> **Patch ID**：`edit-empty-oldtext`  
> **版本**：OpenClaw `2026.5.7`  
> **总纲**：[openclaw-patch/README.md](../../README.md)

---

## 1. 问题

Agent 调用 `edit` 且 `edits[].oldText` 为空（本应使用 `write` 新建文件）时，OpenClaw upstream 通过 `hasValidEditReplacements` validator 失败后，统一误报：

```text
Missing required parameter: edits
```

模型无法区分「参数缺失」与「参数无效」，容易反复重试同一错误调用。

---

## 2. 修复

在 `openclaw-tools-0ftkmYS3.js` 新增 `assertEditToolParams`，于 `assertRequiredParams` 内对 `toolName === "edit"` 先行校验：

| 场景 | 修复后错误信息 |
|------|----------------|
| `edits` 缺失 | `Missing required parameter: edits`（保持不变） |
| `edits` 非数组 / 空数组 | `Invalid edit parameter: edits ...` |
| `edits[i].oldText` 为空 | `Invalid edit parameter: edits[i].oldText must not be empty. Use write for new files...` |
| `newText` 非字符串 | `Invalid edit parameter: edits[i].newText must be a string...` |

`edits` 组 validator 在 edit 工具路径上被跳过，避免二次模糊报错。

---

## 3. 改动文件

| 文件 | 说明 |
|------|------|
| `dist/openclaw-tools-0ftkmYS3.js` | `assertEditToolParams` + `assertRequiredParams` 分支 |

---

## 4. 应用

```bash
OPENCLAW_ROOT=~/.nvm/versions/node/v24.14.1/lib/node_modules/openclaw \
  ./openclaw-patch/2026.5.7/edit-empty-oldtext/apply.sh

# 或批量
./openclaw-patch/apply-all.sh
systemctl --user restart openclaw-gateway
```

验证（已 patch 的 dist）：

```bash
grep -n assertEditToolParams \
  ~/.nvm/versions/node/v24.14.1/lib/node_modules/openclaw/dist/openclaw-tools-0ftkmYS3.js

# 迁移等价性：hook 逻辑 vs dist patch（8 个用例）
node openclaw-patch/2026.5.7/edit-empty-oldtext/verify-equivalence.mjs
```

---

## 5. 历史

此前通过 connector `before_tool_call` hook（`edit-param-guard`）实现；已迁移为本 dist patch，职责统一归入 `openclaw-patch/`。
