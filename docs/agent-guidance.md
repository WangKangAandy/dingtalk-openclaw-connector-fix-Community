# OpenClaw 钉钉规则

connector 提供 `guidance/dingtalk/*.md` 模板和 `guidance setup` 命令；官方 **agent-guidance** 负责加载、校验和注入。外部目录第一层所有 `.md` 都是规则，不需要清单，也不区分包内规则与自建规则。备份、笔记若不应加载，请放到目录外。

## 一次完成配置和 reload

在 Gateway 所在环境，用其运行账号，从本 fork 的安装目录执行（不要用同名官方 npm 包代替）：

```sh
node /path/to/connector/bin/dingtalk-connector.js guidance setup \
  --directory /home/operator/.openclaw/rules/dingtalk \
  --agents main,dingtalk-work
```

- `--directory`：实际绝对路径，位于 connector 安装目录及 Agent 可写工作区之外，由管理员维护；自定义状态目录时自行选择路径。
- `--agents`：已有的真实 Agent ID，多个用逗号分隔。首配必须指定，后续省略即可沿用已有配置。
- 需要 OpenClaw 包含官方 agent-guidance，并支持 `config patch --stdin`、`plugins inspect`、`plugins reload --wait --json`。最低 peerDependency 不保证这些能力存在。
- 使用当前环境的 OpenClaw CLI 和配置，包括 `OPENCLAW_CONFIG_PATH`。Gateway 必须正在运行，才能完成 reload。Windows 支持 PATH 中的 npm OpenClaw 安装，通过 Node 运行其入口，不经过 cmd.exe。

setup 依次提供模板、发现目录中的 Markdown、通过官方 CLI 配置插件、等待 reload 回执。它显式启用 agent-guidance（包括此前单独 disable 的插件）及其必需的两个 hook 权限，在已有非空 `plugins.allow` 中补入插件名。其他插件配置不被整块读回覆盖；全局禁用/deny 不会被绕过。官方内置插件缺失时提示检查 OpenClaw 安装版本，不另装同名第三方插件。

这是显式管理命令，不在 npm postinstall 中自动执行；安装包无法可靠判断目标 Agent。它也不写 AGENTS.md，不新增运行时 prompt hook 或文件 watcher。

## 文件处理

| 情况 | 默认行为 |
| --- | --- |
| 外部目录/模板文件不存在 | 创建 |
| 同名文件已存在，无论内容是否相同 | 跳过并提示 `exists (skipped)`，不比较、不合并 |
| 用户自行新增 `.md` | 加入规则列表 |
| 新版包新增 `.md` | 自动提供模板并加入，无须改代码 |
| 新版包删除某模板 | 保留外部旧文件，仍作为目录中的规则加载 |
| 用户删除外部自建 `.md` | 下次 setup 移除其配置引用 |

主动用包内模板替换同名文件：

```sh
node /path/to/connector/bin/dingtalk-connector.js guidance setup --overwrite-rules
```

只替换包中仍提供的同名模板；不删除用户自建文件，不改变 Agent 范围。文件不做自动备份，需要保留时先自行移到规则目录外。链接和非普通文件不能作为模板覆盖目标。

## 日常维护

- 修改已有规则内容：执行 `openclaw plugins reload agent-guidance --wait --json`，无需重装 connector。
- 新增/删除文件，或升级后补充模板：再次执行 `guidance setup`，可省略目录和 Agent；自动刷新列表并 reload。删除包内同名模板后再次 setup 会重新补齐。
- 只扫描第一层 `.md`，不递归。保留现存文件的 prepend/append 位置和顺序，去掉重复和已删除的引用；新文件按文件名排序追加。语义冲突由文档维护者处理。
- 同一配置的所有文件都给同一组 Agent。`dingtalk/` 是规则目录边界，不是渠道隔离机制。共享 Agent 的其他渠道也能看到规则，所以模板明确限定钉钉来源。
- 已有 agent-guidance 使用其他目录或另一组 Agent 时，setup 停止，保留原配置；先由管理员明确调整。`--overwrite-rules` 不代表授权接管另一套插件配置。

## 错误与边界

数量、大小、编码、内容及加载限制全部交给官方配置校验/插件加载器，connector 不复制这些检查。配置或 reload 报错时命令返回非零并显示官方错误；收到官方完成回执才报告 reload 成功。

官方 bundled 插件刷新注册成功后，也可能返回 `restartRequired: true`，提示更新进程共享的插件代码需要重启。这不等于规则加载失败：agent-guidance 在注册时读取外部规则。setup 保留官方警告并明确提示，不因此报失败，也不自动重启 Gateway。读取配置/inspect 最长等待 30 秒，配置 patch 2 分钟，reload 11 分钟（覆盖官方 `--wait` 的十分钟排空预算）。

步骤不是跨文件和 Gateway 的事务：失败前可能已提供文件或保存配置，命令不自动回滚或重试。修复后再执行 setup。官方提示需重启时按其提示操作；不要把“配置已保存”当作“规则已生效”。只读/Nix 管理的配置应改其配置源并重新发布，setup 不绕过只读策略。避免与其他管理员同时修改同一规则组或插件允许列表。

规则内容覆盖 DWS 能力选择、请求者账号、认证与权限、OAuth/机器人凭据、下载与文件交付。它是使用指导，不是强制安全边界，也不修复旧 connector 的执行身份绑定；当前 main 的身份运行时与官方 DWS 的兼容性需要单独验收。不要把凭据写进规则。

本功能不修改现有 channel Skill；旧 DWS 说明与 Skill 加载方式的核对在 [Issue #12](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/issues/12) 单独处理。

参考：[官方 Agent Guidance](https://docs.openclaw.ai/plugins/agent-guidance)、[配置 CLI](https://docs.openclaw.ai/cli/config)、[插件 reload](https://docs.openclaw.ai/cli/plugins/uninstall-and-update#reload)。
