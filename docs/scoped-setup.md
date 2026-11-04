# 按用户／群隔离记忆与自学习：启用和维护

本功能属于钉钉 Connector：它把记忆与学习成果绑定到可信入站身份。它不管理 OpenClaw 的沙箱、文件挂载、普通工具、模型凭据或公共知识库。

实现与运行边界见 [scoped-learning](scoped-learning.md)，数据授权见 [scope 契约](hard-memory-scope-contract.md)，测试范围见 [验证记录](scoped-learning-validation.md)。

## 功能与归属

| 功能 | Connector 自动完成的行为 | 不会做的事 |
|---|---|---|
| 私聊记忆 | 用企业、connector account、Agent、原始 sender ID 固定 namespace；CRUD、字面检索、revision 更新均验权 | 不从消息正文、昵称或模型传入 userId 授权；不共享给另一用户 |
| 群聊记忆 | 用企业、account、Agent、原始 conversation ID 固定 namespace；同群成员共享 | 不把群内容自动归入成员的私人记忆；不支持本模式下的 `group_sender` |
| 显式学习 | `/learn`、list、view、undo 转成当前 scope 工具请求；成功回执才算保存 | 不写全局 Workshop，不因最终回复说“已保存”而写盘 |
| 后台学习 | 继承源 scope、会话生命周期及取消；独立运行只开放 scoped Workshop；手动保存抑制重复复盘 | 不获得普通会话的 exec、挂载或其他插件工具，不向用户自动外发 |
| 使用已学技能 | 当前 scope 的名称／描述索引进入上下文，正文通过 scoped view 按需读取 | 不是自动执行 bundle 中的脚本，不保证模型每次正确采用建议 |
| 启动上下文 | 对适用钉钉会话过滤未分区的 USER、MEMORY 和 memory 路径，保留公共规则 | 不删除原文件，不阻止管理员通过其他宿主工具显式开放这些文件 |

数据保存在 OpenClaw state 下的 `plugin-state/dingtalk-connector/scopes-v1`，与共享 workspace 分开。不要把这里加入公共挂载。授权检查保护插件接口；同一宿主进程权限、任意 exec、恶意插件或管理员错误开放私有目录，不由 Connector 提供 OS 隔离。互不信任的执行环境由 OpenClaw／部署层隔离。

## 显式启用

安装／升级、启动插件和接收消息都**不会自动写宿主配置**。在 Gateway 安装环境使用其支持的 Node 版本，先配置好钉钉账号和 Agent 路由，再运行：

```sh
# 只检查现有配置；不符合时退出码非零
dingtalk-connector scope check --agents main

# 只打印变更计划，并调用官方 CLI dry-run 校验；不保存、不 reload
dingtalk-connector scope setup --agents main --learning

# 显式应用；若已有配置满足全局条件，不需要全局授权参数
dingtalk-connector scope setup --agents main --learning --apply

# 仅在已理解并接受下表三项 Gateway 全局影响后使用
dingtalk-connector scope setup --agents main --learning --apply --accept-global-memory-changes
```

`--learning` 同时启用 scoped 学习；省略时保留已有学习开关，新安装默认不启用。`--agents` 是本次启用的完整 Agent 集合，不自动创建 Agent 或改路由；后续可省略并复用已保存的集合。手工配置未设置 `memoryScope.agents` 时沿用全部钉钉 Agent；向导要求明确选择，避免误扩范围。

## 向导具体改什么

| 配置／动作 | 作用与影响范围 | 应用规则 |
|---|---|---|
| `channels.dingtalk-connector.memoryScope.enabled/agents` | 启用选中 Agent 的钉钉 scoped 功能 | `--apply` 后设置 |
| `memoryScope.scopedLearning.enabled` | 显式／后台 scoped 学习开关 | 仅传 `--learning` 时设 true；保留已有调度参数 |
| Connector 的 `allowConversationAccess`、`allowPromptInjection` | 允许绑定真实会话、过滤和提供上下文 | 缺省值可补齐；管理员显式 false、全局禁用或 deny 时停止，不绕过 |
| 选中 Agent 的 `tools.deny` 增加 `skill_workshop` | 隐藏原生全局学习工具，也使其原生后台调度失去可用性；同一 Agent 的其他渠道也受此项影响 | 合并已有 deny；不修改普通工具 allow/profile，不替管理员提升 scoped 工具权限 |
| `plugins.slots.memory: "none"` | **Gateway 全局**停止原生 memory provider；其他 Agent／渠道的原生记忆也受影响 | 有变化时必须显式 `--accept-global-memory-changes` |
| `agents.defaults.compaction.memoryFlush.enabled: false` | **Gateway 全局**停止原生压缩前持久记忆写入；普通上下文压缩仍保留 | 有变化时必须显式 `--accept-global-memory-changes` |
| `hooks.internal.entries.session-memory.enabled: false` | **Gateway 全局**停止 `/new`、reset、idle/daily 轮换时把会话复制到共享 workspace/memory；独立于 memory 插槽与 flush | 有变化时必须显式 `--accept-global-memory-changes`；不关闭其他 internal hooks |
| 官方 `config patch --stdin`、connector reload | 小范围合并配置，再等待 reload 回执 | 不整份重写配置，不自动重启 Gateway |

为什么还有全局配置？2026.10.9 的 memory-core、memory flush、原生 session-memory hook 是三条独立路径；关闭搜索或 memory 插槽不能代替其余两项。真实 WSL 升级发现已有 session-memory hook 会在 `/new` 时复制会话，所以向导与运行准入必须单独检查它。如果其他渠道需要保留这些原生能力，不要接受全局变更；保留 scoped 功能关闭，等待可验证的局部隔离能力，或由管理员决定部署边界。向导不会偷偷另建 Gateway。

**涉及上述任一全局变更时**，setup 保存并核对配置后明确返回 `restart-required`，不再请求仅 connector 的 reload，也不宣称运行态已激活。管理员应重启整个 Gateway，再执行 check 和真实消息验证。真实 Stream 的停启会与配置文件监听触发的自动热加载竞争；只重载 connector 也不能证明其他 memory 插槽与 internal hooks 已生效。没有全局变化时，仍等待正式 connector reload 回执。

**全局自动学习开关保持不变。** `skills.workshop.autonomous.mode=off` 不是本版前提；通过目标 Agent 的工具排除防止该 Agent 的新会话进入原生学习。旧的后台任务应在启用前停止或等待结束；已有技能另按下一节处理。主线已迁移 Workshop 配置字段，本方案不写这个旧字段。

## 必须由管理员处理的事项

- **旧 learned skills**：非空 `workshop-skills` 会阻止启用。关闭自动学习不会停止已有成果被自动发现。管理员应先备份并按真实归属迁移，或把已审核的公共技能发布到正常公共 skill 目录；向导不移动、不删除、不猜归属。
- **旧 USER／MEMORY**：会报告已有文件，scoped prompt 不使用它们。是否允许其他文件工具读取、如何清理旧个人资料由管理员决定。`AGENTS.md`、SOUL、IDENTITY 等应只含公共指导。
- **工具允许列表**：向导只增加原生 Workshop deny。若配置限制了 `scoped_memory`／`scoped_skill_workshop`，须在目标 Agent／provider／sandbox 的有效策略中允许所需工具。显式 deny 不会被 setup 覆盖；实际运行验证不可省略。
- **宿主能力**：目前验证目标是固定 OpenClaw 2026.10.9 的 builtin runner、工具 context v2、可信 bindings、会话 lease 和后台 lifecycle。ACP／CLI 并未因为移除了 sandbox 检查就获得兼容保证。缺少能力拒绝相关 scoped 运行，不回退到全局存储。
- **部署仓／只读配置**：在部署配置源中应用计划并发布。向导不能绕过只读配置，也不应在生产保留脱离部署仓的补丁。

## 沙箱、挂载和附件

`sandbox.mode`、scope、`workspaceAccess`、`docker.binds`、exec/elevated 和公共文件权限全部仍归 OpenClaw。`none` 使用独立 workspace；`ro` 暴露共享 workspace 的只读视图；`rw` 允许改共享文件。只读不等于保密，文件共享也不等于插件存储 namespace 共享。只开放公共知识子目录通常比开放整个混有私人材料的 workspace 更合适，但这不是 Connector 的硬编码准入规则。

启动文件注入、初始化复制、目录挂载各自独立；Markdown 链接不会自动读取目标或授予权限。共享知识文件不是 scoped memory。管理员应使用 OpenClaw 工具策略和挂载实现所需文件访问。

OpenClaw 2026.10.9 默认 sandbox 工具列表不含这两个插件工具。启用沙箱后，管理员可在目标 Agent 的 `tools.sandbox.tools.alsoAllow` 增加 `["scoped_memory", "scoped_skill_workshop"]`；其他层的显式 deny 仍然生效。setup 不代替管理员提升工具权限。WSL 真机已验证 `none` + 公共目录只读 bind 下，公共文件读取成功、追加被只读文件系统拒绝，同时 scoped 记忆及学习可正常读写。

`memoryScope.enabled` 不再附带禁止附件。原有渠道媒体发送行为继续使用原有路径；**这不代表已新增安全的沙箱文件导出器**。若当前部署不允许自动读取／发送媒体，可独立配置 `channels.dingtalk-connector.blockAutomaticMedia: true`（多账号使用对应账号配置）。该开关同时禁止自动媒体投递，作用于延迟回调；不属于 setup 的改动，也不提供逐文件授权。需要严格导出权限的部署应保持禁止，直到接入宿主授权的文件读取能力。

## 检查与失败恢复

向导先检查插件策略、目标 Agent、旧数据和配置冲突，再调用官方 dry-run。应用前重新读取配置，检测已发生的并发变更。配置写入与 reload 不是跨步骤事务；不要与其他管理员同时改相同策略数组。失败可能已保存配置，先检查实际状态，不盲目重试或覆盖回滚。

reload 回执要求 `ok`、目标插件和明确的 `restartRequired`。需要重启时只提示，不自行重启。`scope check` 检查的是保存配置和已知冲突，**不是 live Stream、模型可调用工具或整个 Gateway 隔离的通过证明**。

完成后用两个测试用户验证记忆读写与 `/learn`、同群共享／跨群拒绝、`/new` 和重启后的归属；验证公共目录和普通工具保持预期，并观察其他 Agent／渠道接受过的全局变更。模型和钉钉平台 fixture 验收不能代替真实 Stream/OAuth/平台投递。
