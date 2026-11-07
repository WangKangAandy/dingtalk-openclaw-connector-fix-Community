# WSL 当前配置：私聊按人、同群共享的记忆与自学习

2026-11-07 实机核对。宿主为 OpenClaw main `dad4fc1a`，另含 [PR191205](https://github.com/openclaw/openclaw/pull/191205) 的沙箱事实投影和本分支的 `/learn` 沙箱兼容补丁；Connector 与独立 Workshop 均来自 `37da7b7d`。官方 `skill-workshop` 已禁用。此片段与 WSL 的 `openclaw.json` 对应；合并时保留现有模型、机器人密钥和服务设置。

```json5
{
  meta: { migrations: { skillWorkshopPlugin: true } }, // 告诉新版宿主按插件配置选择 Workshop。
  channels: {
    "dingtalk-connector": {
      enabled: true,
      // clientId、clientSecret 保留本机现有值，不写入文档。
      memoryScope: { enabled: true, agents: ["main"] },
      blockAutomaticMedia: true // 文件只能走受控 dingtalk_send_file。
    }
  },
  agents: {
    defaults: { compaction: { memoryFlush: { enabled: false } } }, // 关闭全局记忆 flush。
    entries: {
      main: {
        sandbox: {
          mode: "all", scope: "session", workspaceAccess: "none",
          docker: {
            image: "sha256:8cdce89c0dfb2c30192f2fb6378044efc46157d26b32f295b4d30dc24fe9d4d0",
            readOnlyRoot: true, network: "none", capDrop: ["ALL"],
            env: { HOME: "/workspace" },
            binds: ["/home/andy/.openclaw/workspace/knowledge:/knowledge:ro"] // 唯一额外挂载；不挂 home、plugin state 或 DWS 凭据。
          }
        },
        tools: {
          allow: ["exec", "process", "read", "ls", "write", "edit", "apply_patch", "scoped_memory", "skill_workshop", "session_status", "dingtalk_dws", "dingtalk_send_file"],
          deny: [], exec: { host: "sandbox" }, elevated: { enabled: false },
          sandbox: { tools: { allow: ["exec", "process", "read", "ls", "write", "edit", "apply_patch", "scoped_memory", "skill_workshop", "session_status", "dingtalk_dws", "dingtalk_send_file"] } }
        }
      }
    }
  },
  plugins: {
    load: { paths: [
      "/home/andy/openclaw-main-adaptation-1106/connector-37da7b7",
      "/home/andy/openclaw-main-adaptation-1106/scoped-workshop-37da7b7"
    ] },
    allow: ["deepseek", "dingtalk-connector", "dingtalk-scoped-workshop"],
    slots: { memory: "none" }, // 原生共享 memory 不参与。
    entries: {
      "skill-workshop": { enabled: false }, // 禁用官方按 Agent 存储的 Workshop。
      "dingtalk-connector": {
        enabled: true,
        hooks: { allowConversationAccess: true, allowPromptModification: true },
        config: { runtimeTools: {
          enabled: true,
          dwsImage: "sha256:f5042b173a6fda90e1c5340db5da5c955f93762b0cbc9ca0c46d9f779a28418e",
          dwsStateRoot: "/home/andy/.openclaw/dws-users" // 每人独立授权目录；调用只挂真实发言人目录。
        } }
      },
      "dingtalk-scoped-workshop": {
        enabled: true,
        hooks: { allowConversationAccess: true, allowPromptModification: true },
        config: { autonomous: { mode: "auto" } } // 原生复盘负责决定；模型可不保存。
      }
    }
  },
  hooks: { internal: { entries: { "session-memory": { enabled: false } } } },
  tools: {
    sandbox: { tools: { allow: ["exec", "process", "read", "ls", "write", "edit", "apply_patch", "scoped_memory", "skill_workshop", "session_status", "dingtalk_dws", "dingtalk_send_file"] } },
    sessions: { visibility: "self" }, agentToAgent: { enabled: false }
  }
}
```

每位使用者还须在 WSL 的独立 DWS 目录授权并核对 `corp_id`、`user_id`、`token_valid`；配置不会代替登录。普通文件写在沙箱 `/workspace`，发送时向 `dingtalk_send_file` 传相对路径 `workspaceRelativePath`。运行 `dingtalk-connector scope check --agents main`、`openclaw config validate --json`，然后重启 Gateway 核对 Stream 与插件状态。镜像 `sha256:` 是该 WSL 的本地 image ID，迁移机器须重新构建并更新。

验收范围与结果见[真实双人、双群报告](scoped-live-e2e-2026-11-04.md)。
