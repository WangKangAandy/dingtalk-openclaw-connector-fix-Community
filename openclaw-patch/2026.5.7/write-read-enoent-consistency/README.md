# Patch: write 后立即 read 偶发 ENOENT

> **Patch ID**: `write-read-enoent-consistency`  
> **版本**: OpenClaw `2026.5.7`  
> **总纲**: [openclaw-patch/README.md](../../README.md)

---

## 1. 问题

机器人在写入工作区文件后，紧接着读取同一路径时可能误报 `ENOENT`。用户侧看到的表现是：

- write 工具返回成功；
- 后续 read 校验说文件不存在；
- 回复里解释为工具侧可见性或 flush 时序问题。

这属于 OpenClaw core/tooling 的一致性问题，不放到 DingTalk connector `src/`。

---

## 2. 修复

在 `dist/openclaw-tools-0ftkmYS3.js` 中增加 `verifyWriteReadableAfterWrite`：

- retry schedule: `0, 20, 50, 100, 200 ms`;
- sandbox 分支使用同一个 `bridge.stat` / `bridge.readFile`;
- host `workspaceOnly=true` 分支使用 `readFileWithinRoot`;
- host 非 workspace-only 分支使用与 `writeHostFile` 一致的展开和解析路径；
- write/edit/memory flush append 都要等到同一读视图读回内容匹配后才返回成功。

如果 bounded retry 后仍不可读或读回内容不匹配，写入工具失败并返回清晰错误，而不是先报成功。

---

## 3. 改动文件

| 文件 | 说明 |
|------|------|
| `dist/openclaw-tools-0ftkmYS3.js` | 写入后同视图 read-back 校验 |

覆盖函数：

- `createSandboxWriteOperations`
- `createSandboxEditOperations`
- `createHostWriteOperations`
- `createHostEditOperations`
- `appendMemoryFlushContent`
- `wrapEditToolWithRecovery`

---

## 4. 应用

```bash
OPENCLAW_ROOT=/home/mccxadmin/.nvm/versions/node/v24.14.1/lib/node_modules/openclaw \
  bash openclaw-patch/2026.5.7/write-read-enoent-consistency/apply.sh

# 或批量
./openclaw-patch/apply-all.sh
systemctl --user restart openclaw-gateway
```

验证：

```bash
OPENCLAW_ROOT=/home/mccxadmin/.nvm/versions/node/v24.14.1/lib/node_modules/openclaw \
  node openclaw-patch/2026.5.7/write-read-enoent-consistency/verify-write-read-consistency.mjs
```

---

## 5. 验证覆盖

`verify-write-read-consistency.mjs` 覆盖：

- host workspace-only write -> immediate read；
- host workspace-only edit -> immediate read；
- memory flush append 的换行行为；
- sandbox write 延迟可见；
- sandbox edit 延迟可见；
- sandbox 永久不可见失败；
- sandbox 永久 stale read-back 失败。
