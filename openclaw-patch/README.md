# OpenClaw Patch 总纲

本目录归档 **小摩同学** 针对 OpenClaw upstream 问题的 workaround 文档与 **dist patch**。

**原则：OpenClaw core bug → 一律 dist patch；connector 只负责钉钉集成。**

| 归属 | 目录 | 示例 |
|------|------|------|
| OpenClaw upstream bug | `openclaw-patch/<version>/<patch-id>/` | empty-synthesis、edit 校验 |
| 钉钉通道 / DWS / 消息格式 | connector 源码 `src/` | stream、AI Card、memory-scope |

不在 connector 中用 hook 替代 OpenClaw core 修复——避免「只有加载 dingtalk-connector 才生效」、避免职责混淆。

---

## 当前生产环境

| 项 | 值 |
|----|-----|
| OpenClaw | `2026.5.7` |
| 安装路径 | `~/.nvm/versions/node/v24.14.1/lib/node_modules/openclaw/` |
| Gateway | `systemctl --user openclaw-gateway` |
| 配置 | `~/.openclaw/openclaw.json` |
| Fallback | `minimax-m3` → `gpt-5.4`（已移除 glm-5.1） |

---

## dist patch 清单

| ID | 版本 | 问题 | 状态 | 文档 |
|----|------|------|------|------|
| `empty-synthesis-after-tool-loop` | 2026.5.7 | tool 后 final synthesis 完全空，fallback 不触发 | **v2 已应用** | [详细说明](./2026.5.7/empty-synthesis-after-tool-loop/README.md) |
| `edit-empty-oldtext` | 2026.5.7 | edit 空 `oldText` 误报 `Missing required parameter: edits` | **已应用** | [详细说明](./2026.5.7/edit-empty-oldtext/README.md) |

---

## 目录结构

```
openclaw-patch/
├── README.md                 ← 本总纲
├── apply-all.sh              ← 应用当前 OpenClaw 版本下全部 patch
└── 2026.5.7/
    ├── empty-synthesis-after-tool-loop/
    │   ├── README.md
    │   ├── patch.diff
    │   └── apply.sh
    └── edit-empty-oldtext/
        ├── README.md
        ├── patch.diff
        └── apply.sh
```

---

## 快速操作

```bash
# 应用全部 patch（按 2026.5.7/*/apply.sh 自动发现）
./openclaw-patch/apply-all.sh
systemctl --user restart openclaw-gateway

# 指定 OpenClaw 路径（npm root -g 非 nvm 时）
OPENCLAW_ROOT=/path/to/openclaw ./openclaw-patch/apply-all.sh
```

---

## 升级 OpenClaw 后

1. `npm i -g openclaw@<version>`
2. 检查 `openclaw-patch/<version>/` 是否有对应 patch
3. `./openclaw-patch/apply-all.sh`
4. 重启 gateway

Patch 绑定编译产物文件名（如 `openclaw-tools-0ftkmYS3.js`），大版本升级需复核 hunk。

---

## 设计原则

### 职责

- **OpenClaw bug**：改 `node_modules/openclaw/dist/`，文档与 `patch.diff` 放本目录
- **Connector 域**：钉钉 API、鉴权、消息投递、memory-scope 等，不改全局 OpenClaw

### Patch 编写（v2 起）

- **收窄触发条件**，避免误 fallback / 误拦截
- **复用** OpenClaw 已有函数与错误类型（如 `parameterValidationError`）
- **不新增**独立模块或日志子系统（除非 upstream 结构要求）

---

## 问题归属速查

| 现象 | 层级 | 本目录 |
|------|------|--------|
| 重复回复 2～4 次 | OpenClaw 6.x transport | ❌（5.7 规避） |
| tool 后 final 完全空 | OpenClaw incomplete/fallback 盲区 | ✅ `empty-synthesis-after-tool-loop` |
| 半截 narration 无结论 | 模型/runtime | ❌（v2 未覆盖） |
| 钉钉 connector 截断 | connector | ❌ |
| edit 空 oldText 误报 | OpenClaw upstream 校验 | ✅ `edit-empty-oldtext` |
