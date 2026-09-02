# Agent Tool Result Session Context Patch

这是针对 OpenClaw `2026.7.1-2` 的版本绑定补丁。补丁把 Agent 已经持有的可信
`agentId`、`sessionId`、`sessionKey` 和 `runId` 透传到 OpenClaw
`AgentToolResultMiddleware` 上下文中，不改变工具执行流程和结果构造逻辑。

必须先在临时副本中应用：

```bash
./apply.sh /tmp/openclaw-2026.7.1-2
```

脚本会检查安装包版本和 bundle 唯一锚点，创建并列的
`.dingtalk-memory-scope.bak` 备份，以幂等方式应用补丁，执行 `node --check`，
并验证两个并发上下文。脚本不会重启 Gateway。

回滚时，将记录的每个 `.dingtalk-memory-scope.bak` 文件恢复为原文件名；重启前
先运行 verifier，确认补丁锚点已经消失。

## 为什么 Memory 隔离需要这个补丁

connector 的 Memory 隔离需要根据可信 DingTalk `sessionKey` 得到当前用户或群组
的 scope。OpenClaw 的结果 middleware 在 `memory_search` 完成后才执行，因此必须
收到与本次 Agent turn 相同的 session 上下文。受影响的 OpenClaw runtime 默认没有
把这组上下文传给 middleware runner。本补丁透传 Agent attempt 已经持有的权威字段：

| 字段 | 在隔离中的用途 |
|---|---|
| `agentId` | 标识 OpenClaw agent，不从工具参数推断用户身份 |
| `sessionId` | 标识具体的会话执行实例 |
| `sessionKey` | 作为 connector DingTalk scope classifier 的主要输入 |
| `runId` | 将 middleware 执行关联到当前 Agent run |

补丁只负责传递这些字段，不实现路径权限策略、不修改 Memory 索引、不重写搜索
查询，也不直接过滤结果。实际隔离策略仍由 connector 的 `src/memory-scope/`
负责。

## Memory 端到端链路

```text
DingTalk message
  -> trusted OpenClaw sessionKey
  -> agent attempt context
  -> patched AgentToolResultMiddleware context
  -> connector scope classifier
  -> memory_search result filter
  -> model-visible result
```

## 启用 Memory 隔离

Memory 隔离由 connector 配置显式开启，默认关闭。请在实际运行的
`~/.openclaw/openclaw.json` 中设置：

```json
{
  "channels": {
    "dingtalk-connector": {
      "memoryScope": {
        "enabled": true,
        "syncRootMemoryRules": true,
        "syncAgentsMemoryRules": true
      }
    }
  }
}
```

也可以使用命令写入并重启：

```bash
openclaw config set channels.dingtalk-connector.memoryScope.enabled true --strict-json
openclaw gateway restart
```

仅启用插件或 DingTalk channel 不等于启用隔离；重启后的日志必须出现
`[dingtalk-connector][memory-scope] registered (enabled=true, ...)`，才表示运行时
拦截已开启。

### 保存与 bootstrap

connector 根据可信 session 将记忆映射到以下 workspace-relative 路径之一：

- 私聊：`memory/users/<senderId>/`；
- 群聊：`memory/groups/<conversationId>/`；
- `group_sender` 模式：`memory/groups/<conversationId>/users/<senderId>/`。

scope 下没有 `MEMORY.md` 时，connector 会创建最小 scope 文件。bootstrap 时同时
注入公共根 `MEMORY.md`（规则/架构）和当前 scope 的 `MEMORY.md`。文件创建和
写入不由本补丁负责；当前 `write`/`edit` 行为仍由 connector 规则和路径约定控制。

在每轮模型开始思考前，connector 的 `before_prompt_build` 还会根据同一个可信
scope 动态补充一段边界提醒：只允许访问公共 Memory 和当前会话 scope，禁止通过
`exec`、`bash`、`glob` 或其他 shell 命令读取、枚举或披露其他用户/群组的私有文件。
这段内容是最后一层行为提示，不是文件系统权限；它不能替代下面的 Tool Guard，
也不能单独阻止任意 shell 访问。

### `memory_search`

搜索保持全局行为，继续使用 OpenClaw 原有的 corpus、排序、retry 和候选选择逻辑。
搜索返回后，connector middleware 会：

1. 解析本补丁透传的可信 `sessionKey`；
2. 保留公共 Memory 和当前用户/群组 scope；
3. 删除其他用户/群组私有路径以及不允许的 group-sender 子树；
4. 校验规范化路径和 workspace 内的真实路径；
5. 同步重建 `result.details` 与 `result.content[0].text` 中的 JSON。

如果 session 上下文、结果结构、workspace 路径或 middleware 注册状态不可信，
connector 返回 fail-closed 的空结果/安全错误，不返回未过滤的搜索结果。

### `memory_get` / `memory_read` / `read`

这些工具的授权不由本补丁完成。connector 通过 `before_tool_call` 注册的 Tool Guard
在执行前检查：

- 直接 Memory 读取只接受缺省 corpus 或 `corpus=memory`；
- 公共 Memory 和当前 scope 允许读取；
- 其他私有 scope、workspace 外路径、路径遍历、非法路径和 symlink realpath 逃逸均阻止；
- 已确认位于 workspace 内的非 Memory 文件保持正常 read 行为。

本补丁仍是整体设计的一部分：它确保搜索结果过滤器和 Tool Guard 使用同一个可信
session 身份；`before_prompt_build` 的动态边界提示也使用该 scope。三者职责不同：
提示词负责提醒，搜索在检索完成后过滤，直接读取在执行前阻断。

## 本补丁不覆盖的范围

这个版本绑定补丁不会隔离 `exec`、`bash`、`glob`、MCP、自定义插件或宿主进程的
任意 shell/文件系统访问。它也不提供查询前的路径过滤，不能保证全局 Top-N 候选
被其他 scope 占满时当前 scope 的结果一定不会漏召回。这些属于 connector Memory
设计中的独立控制项和已知限制。

## 验证要求

verifier 必须证明两个并发 middleware 调用分别收到不同的 `agentId`、`sessionId`、
`sessionKey` 和 `runId`，且上下文没有串用。安装后还要检查：

```bash
openclaw --version
openclaw gateway status
openclaw plugins list
```

Gateway 日志应包含 connector 注册消息，且没有 middleware 注册 diagnostic。补丁
必须应用到运行中 Gateway 实际选择的 OpenClaw `2026.7.1-2` dist；版本不匹配或
锚点缺失必须作为硬失败处理，不能只告警后继续。
