# 常见问题 / Troubleshooting

---

## 机器人不回复

**症状**：机器人不回复消息

**解决方案**：
1. 检查插件状态：`openclaw plugins list`
2. 检查网关状态：`openclaw gateway status`
3. 查看日志：`openclaw logs --follow`
4. 确认应用已在钉钉开放平台发布

---

## 配置字段不合法（additional properties）

**症状**：

```
Problem:
  - channels.dingtalk-connector: invalid config: must NOT have additional properties
```

**原因**：配置文件中包含已废弃或已重命名的字段，连接器不再识别。

**解决方案**：打开 `openclaw.config.yaml`，删除 `channels.dingtalk-connector` 下不再支持的字段。已知需要删除的旧字段：

| 旧字段 | 说明 |
|--------|------|
| `gatewayPassword` | 早期版本字段，已废弃 |
| `gatewayToken` | 早期版本字段，已废弃 |
| `dmHistoryLimit` | v0.8.9 移除（未实现） |

错误信息会指出具体的字段名，删除后重启即可。

---

## HTTP 401 错误

**症状**：错误信息显示 "401 Unauthorized"

**解决方案**：升级到最新版本。

---

## Stream 连接 400 错误

**症状**：日志显示 "Request failed with status code 400"

**常见原因**：

| 原因 | 解决方案 |
|------|----------|
| 应用未发布 | 前往钉钉开放平台 → 版本管理 → 发布 |
| 凭证错误 | 检查 `clientId`/`clientSecret` 是否有拼写错误或多余空格 |
| 非 Stream 模式 | 确认机器人配置为 Stream 模式（不是 Webhook） |
| IP 白名单限制 | 检查应用是否设置了 IP 白名单 |

**验证步骤**：
1. 登录 [钉钉开放平台](https://open-dev.dingtalk.com/)，确认应用已发布、机器人已启用且为 Stream 模式
2. 修改任何配置后，必须点击 **保存** → **发布**

---

## 插件安装失败

**原因**：OpenClaw 版本与 connector 版本不兼容，或 npm 源不可达。

**解决方案**：
1. 确保 OpenClaw 版本 ≥ 2026.3.22：`openclaw -v`
2. 升级 OpenClaw：`npm install -g openclaw`
3. 国内网络使用 npm 镜像：
   ```bash
   npm config set registry https://registry.npmmirror.com
   ```

---

## macOS 安装报错 `Also not a valid hook pack`

**原因**：`openclaw.plugin.json` 缺失或格式错误。

**解决方案**：确认该文件存在且格式正确，检查 Node.js 版本是否满足要求，必要时重新安装 OpenClaw 主程序。

---

## Linux 安装报错 `package.json missing openclaw.hooks`

**原因**：安装路径不正确或文件权限不足。

**解决方案**：确认 `openclaw.plugin.json` 配置正确，检查当前用户对安装目录的读写权限。

---

## 国内网络安装（npm 镜像源）

如果执行 `openclaw plugins install` 卡在 `Installing plugin dependencies...` 或出现 `npm install failed`：

```bash
# 临时指定镜像源安装
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com openclaw plugins install @dingtalk-real-ai/dingtalk-connector

# 或设置全局镜像
npm config set registry https://registry.npmmirror.com
```

如果插件目录已存在但依赖不全：

```bash
cd ~/.openclaw/extensions/dingtalk-connector
rm -rf node_modules package-lock.json
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com npm install
```

---

## 模型 API 报错 / 限流 / 空回复

**症状**（钉钉侧常见）：

- `⚠️ All models are temporarily rate-limited. Please try again in a few minutes.`
- `⚠️ Something went wrong while processing your request.`
- 机器人只回复 `<|endoftext|>` 或中途无下文

**原因**：这类问题通常来自 **OpenClaw Gateway 的 LLM 上游**（主模型 API 500/429/超时），不是 dingtalk-connector 消息链路本身。若未配置 model fallback，主模型失败时不会自动切换备用模型。

**排查**：

1. 查看 Gateway 日志：`/tmp/openclaw/openclaw-YYYY-MM-DD.log`，搜索 `model_fallback`、`rate_limit`、`upstream error`。
2. 查看 session：`~/.openclaw/agents/main/sessions/*.jsonl`，确认 `errorMessage` 与 `model` 字段。
3. 确认 `~/.openclaw/openclaw.json` 中 `agents.defaults.model` 是否包含 `fallbacks` 数组。

**解决方案**：

在 `agents.defaults.model` 使用对象形式配置主模型 + 有序备用模型，例如：

```json
"model": {
  "primary": "mtcode/minimax-m3",
  "fallbacks": [
    "mthreads-wk-glm5-1/glm-5.1",
    "mtcode/gpt-5.4"
  ]
}
```

每个 fallback 模型必须在 `models.providers` 中完整注册。修改后执行 `openclaw gateway restart`。

**详细配置与变更记录**（MUSA-Claw 部署环境）见 autodeploy 仓库：

- `wangkang/autodeploy/docs/openclaw-model-config.md`

---

## DWS 未授权 / 反复收到 blocked 文案

**症状**：

- 用户发「你好」或业务请求，反复收到「CLI 未授权」类固定文案，无法正常使用
- `dws calendar` 等返回 `IDENTITY_NOT_AUTHENTICATED` / `not_authenticated`
- login exit 2 且 stderr 含 CLI 授权拒绝说明（如「不在 CLI 授权人员范围」）

**原因**：

1. 该 `senderId` 尚未完成 `dws auth login`，或 token 已过期
2. **历史残留**：Phase 1 曾在 `~/.openclaw/connector/denial/` 写入 DenialCache；若 Gateway 仍加载旧版 connector，可能反复拦截消息（fix22 已移除该逻辑）

**处理（Agent 工作流）**：

严格按 **dws skill** `references/dws-auth-workflow.md`：

1. `dws auth status --sender-id <DWS_AUTH_IDENTITY> --format json`
2. 未 `authenticated` → Agent exec `dws auth login --sender-id <DWS_AUTH_IDENTITY> --device`，将授权链接交付用户本人扫码（**勿** `exec timeout: 30`）
3. 用户扫码后 → 再 `auth status` 确认 → 执行业务 `dws`
4. 业务 API 返回 CLI 权限拒绝 → 按 dws skill `references/dws-auth-contract.md` 引导，勿猜测 CLI 名单
5. HTTP 403 / scope 不足 → 联系管理员开权限，勿反复 login

**运维清理（可选）**：

```bash
# 可手动删除历史 Phase 1 DenialCache
rm -f ~/.openclaw/connector/denial/*.json

# 确认 reply-dispatcher 未调用 handleDwsAuthCommandOutput（fix23+）
! grep -q handleDwsAuthCommandOutput ~/.openclaw/extensions/dingtalk-connector/src/reply-dispatcher.ts && echo OK
systemctl --user restart openclaw-gateway.service
```

**架构说明：** [docs/DWS_AUTH_ARCHITECTURE.md](./DWS_AUTH_ARCHITECTURE.md)

---

## edit 工具报错 `Missing required parameter: edits`

**症状**：

- Agent 调用 `edit` 初始化或修改文件时失败
- 错误为 `Missing required parameter: edits`，但 payload 里其实有 `edits: [{ oldText: "", newText: "..." }]`

**原因**：OpenClaw 上游 bug — 当 `edits[].oldText` 为空时，参数校验误报为缺少 `edits` 字段（应用 `write` 新建文件，不应使用空 `oldText` 的 `edit`）。

**修复（OpenClaw dist patch）**：

本问题归属 OpenClaw upstream，修复已迁入 [`openclaw-patch/2026.5.7/edit-empty-oldtext/`](../openclaw-patch/2026.5.7/edit-empty-oldtext/README.md)（不再使用 connector hook）。

应用 patch 后，空 `oldText` 会返回明确错误：

```text
Invalid edit parameter: edits[0].oldText must not be empty. Use write for new files or full-file initialization; edit only replaces existing text.
```

**验证**：

```bash
cd /path/to/dingtalk-connector
./openclaw-patch/apply-all.sh
systemctl --user restart openclaw-gateway
grep assertEditToolParams "$(npm root -g)/openclaw/dist/openclaw-tools-"*.js
```

> 历史上 v0.8.20-fix12 曾用 connector `edit-param-guard` hook；已移除，请改用 `openclaw-patch`。

---

## 支持

- **问题反馈**：[GitHub Issues](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues)
- **更新日志**：[CHANGELOG.md](../CHANGELOG.md)
