# 当前 WSL 配置：私人记忆、群共享、DWS 与附件

2026-11-05 核对。适用环境：OpenClaw 2026.10.9 + PR191205 回移 `887774ae`；Connector 已包含 PR18，并安装本分支的 runtime tools（运行代码 `a0b888e`）。**只有已合入的 PR18 还不包含下面的 DWS／附件工具。** 模型、机器人密钥及服务启动配置沿用已有安装，不用下面片段覆盖整个文件。

## 配置

这是当前 WSL 的实际配置片段，路径中的 `andy` 对应本机用户。私聊 memory／自学习按人隔离；同群共享群 memory／自学习，但 DWS 始终使用本条消息真实发言人的账号。公开安装 skills 不属于私人自学习成果。

```json5
{
  channels: {
    "dingtalk-connector": {
      enabled: true,
      // clientId、clientSecret 沿用第 1 节已有值；不把密钥放进示例或 Git。
      memoryScope: {
        enabled: true,
        agents: ["main"],
        scopedLearning: { enabled: true } // /learn 与后台复盘，成果属于当前私聊或群。
      },
      // 关闭旧的任意宿主路径媒体出口；正常图片/文件改走 dingtalk_send_file。
      blockAutomaticMedia: true
      // 本版本默认 groupSessionScope="group"、sharedMemoryAcrossConversations=false。
    }
  },
  agents: {
    defaults: {
      compaction: { memoryFlush: { enabled: false } } // 全 Gateway：关闭原生共享记忆 flush。
    },
    entries: {
      main: {
        sandbox: {
          mode: "all",       // 普通脚本一直在容器中执行。
          scope: "session", // 两个私聊、私聊与群聊使用不同任务目录；同群共享任务目录。
          workspaceAccess: "none", // 不挂整份宿主 workspace；容器 /workspace 仍可写。
          docker: {
            // 本机已构建的 Python 3 标准库 + 常用 shell 工具镜像；不是 registry digest。
            image: "sha256:8cdce89c0dfb2c30192f2fb6378044efc46157d26b32f295b4d30dc24fe9d4d0",
            readOnlyRoot: true,
            network: "none", // 普通脚本无网络；DWS 业务在单独的受控容器联网。
            capDrop: ["ALL"],
            env: { HOME: "/workspace" },
            // 唯一额外公共目录。不要把 home、.openclaw、plugin-state、DWS 凭据挂进来。
            binds: ["/home/andy/.openclaw/workspace/knowledge:/knowledge:ro"]
          }
        },
        tools: {
          // allow 和 alsoAllow 不能并用；应用到已有配置前须删除同层旧 alsoAllow。
          allow: ["exec", "process", "read", "ls", "write", "edit", "apply_patch",
            "scoped_memory", "scoped_skill_workshop", "session_status", "dingtalk_dws", "dingtalk_send_file"],
          deny: ["skill_workshop"], // 保留 scoped 自学习，禁用原生全局 Workshop 写入口。
          exec: { host: "sandbox" },
          elevated: { enabled: false },
          sandbox: {
            tools: {
              // 插件工具也必须进入沙箱工具允许表；仅在外层 allow 写入不够。
              allow: ["exec", "process", "read", "ls", "write", "edit", "apply_patch",
                "scoped_memory", "scoped_skill_workshop", "session_status", "dingtalk_dws", "dingtalk_send_file"]
            }
          }
        }
      }
    }
  },
  plugins: {
    slots: { memory: "none" }, // 全 Gateway：关闭原生 memory provider，使用 scoped_memory。
    entries: {
      "dingtalk-connector": {
        enabled: true,
        hooks: { allowConversationAccess: true, allowPromptInjection: true },
        config: {
          runtimeTools: {
            enabled: true,
            // 含 DWS v1.0.66 二进制的独立镜像；不含任何人的登录态。
            dwsImage: "sha256:f5042b173a6fda90e1c5340db5da5c955f93762b0cbc9ca0c46d9f779a28418e",
            // 每人独立目录；一次调用只挂当前发言人的目录，模型不能指定 profile。
            dwsStateRoot: "/home/andy/.openclaw/dws-users"
          }
        }
      }
    }
  },
  hooks: { internal: { entries: { "session-memory": { enabled: false } } } },
  tools: {
    sessions: { visibility: "self" }, // 全 Gateway 的纵深配置；不开放跨会话工具。
    agentToAgent: { enabled: false }
  }
}
```

## 应用与使用

1. 安装上述版本；两个镜像已在当前 WSL 构建。重建时使用本机 `/home/andy/openclaw-deployment-20261105/image/Dockerfile` 和 `dws-image/Dockerfile`，后者构建目录内放官方 Linux `dws` 二进制。重建后以 `docker image inspect --format '{{.Id}}' 镜像名` 返回值更新对应 image。不要把别人的机器上的 image ID 当成可下载地址。
2. `dingtalk-connector scope setup --agents main --learning` 先看计划；确认全 Gateway 原生记忆变更后加 `--apply --accept-global-memory-changes`。这一步配置 scoped 功能；**不自动配置沙箱、公共挂载、DWS 镜像或个人登录**。合并上面的片段，保留本机既有密钥／模型设置，再重启 `openclaw-gateway.service`，执行 `dingtalk-connector scope check --agents main`。
3. 每个人在 WSL 的独立 DWS 目录完成一次授权，不复制 Windows 的共享凭据包。目录名是 `SHA256(JSON.stringify([corpId,userId]))`。管理员在 DWS 镜像中仅挂这个目录到 `/home/dws`，用 `auth login --device --no-browser --profile <corpId>` 生成链接；本人选择对应组织。随后在同一目录执行 `auth status --profile <corpId>:<userId> --format json`，必须核对真实 `user_id`、`corp_id` 和 `token_valid`。群聊不创建共享 DWS 登录态。
4. 公共资料放入 `knowledge/`；公共规则中的链接写成 `/knowledge/产品说明.md`。链接本身不自动加载内容。普通文件／计算在 `/workspace`；发送时 `dingtalk_send_file` 的 `path` 使用 `报告.txt` 这样的**相对路径**。文件最高 20 MiB、图片最高 10 MiB，收件会话由宿主绑定，禁止路径穿越和符号链接。

DWS 业务使用 `dingtalk_dws`，传 CLI 参数数组，例如 `["contact","+me"]`；查看登录态用 `["auth","status"]`。它返回真实 `stdout`、`stderr`、`exitCode`；不能把退出码当业务成功。身份切换、管理／任意 API 入口、本地文件导入导出不开放；附件使用上面的文件工具。写业务仍遵守用户授权及 DWS 的确认要求。普通脚本不能直接联网或读取个人凭据。

实际测试覆盖、未通过项目和限制集中在[验收报告](scoped-live-e2e-2026-11-04.md)。这份配置不承诺安装所有 Python 第三方包或系统命令，也不把已测试的 DWS 通讯录调用外推为所有产品操作都通过。
