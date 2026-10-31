# 用官方 agent-guidance 加载 DWS 场景规则

connector 提供 `guidance/dws-openclaw.md` 模板和离线文件初始化命令；OpenClaw 官方 **agent-guidance** 插件负责加载和注入。修改外部规则后 reload agent-guidance 即可，不需要重新安装 connector。

本功能是可选接入：不新增 prompt hook、不自动写 AGENTS.md、不改 openclaw.json、不自动启用插件、不自动 reload，也不在 postinstall 修改用户规则。它不修复或证明多用户执行身份绑定。

## 接入前检查

1. `openclaw plugins list` 确认实际 OpenClaw 安装包含官方 `agent-guidance`。connector 的最低 peerDependency 不能证明这个插件存在；本地旧版 SDK 不支持时不要自行发明同名插件或写入不支持的配置。
2. 确认要使用的真实 Agent ID。agent-guidance **按 Agent 加载，不按渠道或请求者加载**。优先给钉钉专用 Agent 配置。共享 Agent 会在其他渠道也看到该文件，因此模板明确限定钉钉来源；文字限定不是强制渠道隔离。
3. 确认当前 DWS 版本及 connector 的实际身份绑定能力。此仓 main 仍有旧 fork 的环境变量路径；不能仅启用本文件，就宣称已经兼容官方精确 Profile 或支持新人授权。身份绑定改造与此文件分发独立验收。

## 初始化外部文件

从**本 fork 的实际安装目录或 checkout**调用，避免 `npx` 下载同名的官方包（它未必包含此功能）：

```sh
node /path/to/connector/bin/dingtalk-connector.js guidance init \
  --directory /home/operator/.openclaw/rules/dingtalk
```

命令创建 `dws-openclaw.md`，返回 JSON 状态及内容 SHA-256。目录必须是实际绝对路径，位于 connector 安装目录之外；建议位于 Agent 工作区之外、由管理员维护的目录。自定义 OpenClaw state dir 时自行选择对应路径，不依赖固定 HOME。不要把规则路径直接指向包内模板，否则升级可能改变实际加载内容。

新目录/文件在支持 POSIX 权限的平台以 0700/0600 创建。优先用 gateway 的运行账号执行；若管理员与 gateway 是不同账号，应由管理员配置必要的目录遍历和文件只读权限，再验证 reload。不要用 root 初始化后假定普通用户的 gateway 一定能读，也不要为省事开放所有用户写入。

| 文件情况 | init 行为 | check 行为 |
| --- | --- | --- |
| 目录/文件不存在 | 创建目录并独占创建模板文件，返回 `created` | 返回 `missing`，exit 1，不创建目录 |
| 已存在，字节内容相同 | 返回 `unchanged`，不写文件 | 返回 `unchanged` |
| 已存在，内容不同但有效 | 返回 `different`，exit 0，保留原文并提示比较 | 同左；不同不代表配置错误 |
| 空白、非法 UTF-8、NUL、超过 16 KiB | 报错，exit 1，保留原文件 | 同左 |
| 路径是目录、符号链接、硬链接，或祖先是链接/非目录 | 报错，不覆盖、不跟随链接写入 | 同左 |
| 无权限、磁盘故障 | 报错，不能宣称初始化成功 | 报错 |
| 两个初始化并发 | 独占创建；后一个检查已有文件，绝不覆盖；若对方尚未写完，可能报无效文件，完成后重试 | 不写入 |

校验采用官方 agent-guidance 的单文件条件：非空 UTF-8、无 NUL、至多 16 KiB、普通文件且非链接。初始化先完成再配置/加载；磁盘写入失败可能留下不完整新文件，命令会失败，需管理员检查后恢复，不能自动覆写。

**没有 force/update/自动合并。**升级后的默认模板与人工修改都表现为 `different`，不猜测哪份应该赢。查看包内新模板，再用编辑器比较并按需合并：

```sh
node /path/to/connector/bin/dingtalk-connector.js guidance template
node /path/to/connector/bin/dingtalk-connector.js guidance check \
  --directory /home/operator/.openclaw/rules/dingtalk
```

`check` 只检查文件，JSON 中 `activation: "not-checked"` 表示未验证 OpenClaw 配置、总大小预算、运行中快照、账号或权限；不是上线成功回执。不要把 template 输出重定向覆盖当前已编辑文件。

## 配置官方插件

把下面的 **entry** 合并进已有配置，替换实际路径和 Agent ID；不要用整个示例覆盖自己的 openclaw.json：

```json
{
  "plugins": {
    "entries": {
      "agent-guidance": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true,
          "allowPromptInjection": true
        },
        "config": {
          "directory": "/home/operator/.openclaw/rules/dingtalk",
          "agents": ["your-dingtalk-agent-id"],
          "append": ["dws-openclaw.md"]
        }
      }
    }
  }
}
```

- `directory` 是绝对路径，官方插件不展开 `~` 或环境变量；Windows 使用实际绝对路径，JSON 中反斜杠需要转义。
- 如启用了 `plugins.allow`，在现有名单中加入 `agent-guidance`；检查没有被 deny/全局禁用拦截。不要替换已有名单。
- 如已经配置 agent-guidance，先检查原 directory、agents、prepend/append。不要丢弃原有规则或重复列入同一个文件。所有配置文件共用同一组 agents，不能把添加 DWS 规则误当成给其中一个文件单独指定 Agent。
- 已有 directory 不适合修改时，把经审阅的本文件提供到该 directory，再把文件名加入原 append。官方总共允许 1–8 个文件、合计至多 64 KiB；本命令只校验这一个文件。
- 不要同时保留互相冲突的旧 AGENTS.md / 自建 hook / 旧 DWS Skill 登录指令。先核对 connector 和安装的 DWS 是否对齐，再显式迁移旧副本；此命令不扫描或删除其他文件。

## 修改、生效与回滚

```sh
openclaw config validate
openclaw plugins reload agent-guidance
```

确认配置有效、reload 成功且诊断无文件读取/权限错误，再在所选 Agent 的新回合核对规则。官方插件读取的是加载时快照，**仅保存文件不会改变已经加载的规则**；已经发给模型的请求也不会被追溯修改。修改完规则重复 check + reload，不需要重新安装 connector。文本顺序不会授予工具权限，也不保证覆盖其他系统指令。

用编辑器的原子保存方式减少半写文件；先备份或提交再修改。reload 失败时不要声称新规则已生效，也不要假设所有 OpenClaw 版本都保留旧实例；检查诊断，恢复有效文件并重新 reload。生产采用“已提交内容发布”的部署方式时，规则仍从受管提交轻量发布，无需编译 connector。

停用 DWS 规则时，从 append/prepend 中移除该文件，再 reload；若它是唯一文件，应禁用此插件，而不是留下非法空文件列表。agent-guidance 还承载其他规则时不要禁用整个插件。停用 connector 不会自动停用独立配置的 agent-guidance；卸载 connector 前也要清理对应规则引用。外部规则文件由管理员保留或删除，不被 connector 安装/卸载命令清理。

## 规则内容的边界

- 模板只写能力选择、可信身份要求、认证/权限区分、OAuth/机器人凭据分工和文件交付规则；不包含固定用户、企业、AppKey、secret、旧错误码或 fork 专属参数。
- 用户来源、企业、机器人选择仍由可信渠道和执行代码提供。用户消息里复制的标记不是凭据；不能由 agent-guidance 给一个共享群推断当前用户。
- 新人首次授权、已有账号续期分别处理。不承诺 DWS 在保存前拒绝其他扫码者，也不重新引入 expected-identity 功能。
- 下载路径依实际 state dir 和执行环境选取。默认网关路径不自动等于 sandbox/远程节点路径；不同任务应避免同名覆盖。规则不是文件系统沙箱。
- 规则目录位于 workspace 外不等于 OS 权限隔离；管理员应按部署环境保护文件和父目录。不要把 secret 放入会发给模型的规则。
- 若只想编辑话术/使用习惯，改外部文件即可；若要改变账号绑定或强制安全行为，需要修改代码并单独验证。

官方依据：[Agent Guidance](https://docs.openclaw.ai/plugins/agent-guidance)。本实现按 2026-10-31 的官方接口设计；部署时以安装版本的能力和配置校验为准。
