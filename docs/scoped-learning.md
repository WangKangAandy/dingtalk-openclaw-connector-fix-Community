# Scoped 自学习：实现、边界与验收

状态：Draft，存在合并阻塞项。实际消息 handler → 真实 Gateway/Docker → 前台工具 → 空闲自动复盘的七场景、完整记忆 CRUD、默认运行时自动压缩均通过。但自定义普通 CLI provider 可通过宿主现有公开检查并在宿主执行，不能宣称硬隔离完成。配置显式指定 `openclaw` 也未关闭该路径；正在确认宿主所需的完整执行路由检查。线上钉钉投递与更广泛模型质量分开验收，不能把本地协议 fixture 当作线上投递。证据层级见 [验证记录](scoped-learning-validation.md)。本任务不部署生产环境。

## 方案选择

前台使用 `scoped_skill_workshop`；后台使用公开 `api.runtime.agent.runEmbeddedAgent`。事实和偏好归 memory，经过验证的可复用流程归 Workshop。两者共用 [scope 授权契约](hard-memory-scope-contract.md)，不再从 sessionKey、模型参数或清洗过的路径猜测身份。

对 OpenClaw 2026.10.9 的原结论需要纠正：`subagent.run` 不支持 `disableTools + toolsAlsoAllow`，不代表所有公开 API 都不能运行受限工具。`runEmbeddedAgent` 提供 `toolsAllow`、`toolExecutionAllow`、`sessionPersistence: "detached"` 和 `toolBindings`；真实安装包已运行 scoped list/save，并拒绝越权调用。无需修改上游安装目录。

这仍不是原生 warm-fork。注册工具不会自动加入核心 experience-review 调度；本实现自己计数和调度，并传入有界证据与技能索引。没有声称复用完整原会话前缀、命中 prompt cache，或学习质量与原生相等。无工具 JSON 提议也不天然比工具调用差；本次改动的价值是按需读取技能、执行时校验权限与 revision、根据工具回执确认保存。最终文本不会写盘，旧 JSON 提交路径已删除。

核查依据：固定 npm 包 `openclaw@2026.10.9` 的公开类型、公开 runtime wrapper 和测试设备实际 Gateway。上游参考：[自学习](https://docs.openclaw.ai/tools/self-learning)、[信任模型](https://docs.openclaw.ai/gateway/security/trust-model)。滚动文档不能代替指定版本的实测。

## 身份与运行边界

| 场景 | 持久 namespace |
| --- | --- |
| 私聊 | tenant + connector account + agent + 原始 sender ID |
| 群聊 | tenant + connector account + agent + 原始 conversation ID；群成员共享 |

ID 保留大小写。namespace 为完整身份元组的 SHA-256；路由进入宿主之前同样区分原始身份，避免宿主小写归一化先合并 transcript。群内 sender 作为行为来源，不再把一个群拆成每人一份 Workshop。

唯一 `ScopeServices` 实例由 connector 可信入口持有；前台通过宿主 `toolBindings` 获取调用级 child grant，后台通过可信 hook 上下文获取源 grant，再经 `withSourceWork` 获得任务级 child grant。WeakMap 验真，复制或 JSON 序列化 grant 不授予权限。缺少服务、身份、会话能力或当前授权时拒绝，不能退回旧目录写入。

存储位于宿主私有 `stateDir/plugin-state/dingtalk-connector/scopes-v1/workshop/<namespace>`，不再放进 agent workspace。所有读、列举、写、归档和撤销检查 grant。工具只返回 skill 内容和 revision，不向模型暴露私有宿主路径。不自动导入或合并旧目录。

**私有目录自身不是安全沙箱。** 前台若仍能通过 unrestricted exec/read/native memory/session/其它插件访问宿主数据，scope 工具不能保证硬隔离。共享服务的运行策略门、bootstrap/transcript/index 隔离必须一起验证；不能仅凭目录哈希宣称多租户安全。

当前入口与工具执行检查使用公开模型/运行时 resolver，检查当前会话及 agent 配置的主备模型，拒绝 ACP、非 builtin harness 和宿主判定的订阅 CLI 路由。配置备选即使被当前会话锁暂时停用，也必须满足同一约束；不会复制宿主私有 fallback 状态机。普通 CLI 路由不在订阅 CLI 判定接口的完整覆盖范围内，`undefined` 不代表安全。该缺口仍阻塞硬隔离验收，不能用名称黑名单、伪造宿主会话 owner 或仅写部署提醒代替修复。

## 后台与取消

- 完成的 `model_call_ended` 累计迭代，成功的 `agent_end` 达阈值后等待空闲，插件内串行复盘。
- 定时器安装和每次后台回调都经公开 `api.lifecycle.runInBackgroundContext`，脱离已结束前台的 request/admission 上下文，同时保留插件实例资源；异步工作返回宿主管理。缺少该能力时不启动自动复盘，不退回裸定时器。`onDispose` 和 Gateway stop 都释放定时器、取消任务。此生命周期契约见固定安装包 `docs/plugins/sdk-runtime.md` 的 Instance-bound background context；仅设置 detached session 不能替代它。
- `toolsAllow` 收窄工具面，`toolExecutionAllow` 限制执行；宿主可能保留 `tool_search/tool_describe/tool_call` 控制工具，但其目录只含 scoped 工具。不能把这说成协议上只出现一个 schema。
- detached run 不向用户回复，禁用 message 和 trajectory；opaque review token 仅匹配当前活跃 run、agent、session key 和 session ID。后台 hook 不递归调度自己。
- 后台先 list/view，最多一次 save 或 archive；更新须先 view 同一 revision。状态跨工具工厂重建共享。禁止后台 restore；前台仍能 undo。
- 新入站、前台活动或修改、reset/end、配置撤销、停机和任务结束使旧授权失效。宿主 `runWithWorkAdmission` 提供 reset/delete 的取消信号；独立 session lease 在最终操作检查最新 session ID、lifecycle revision 和策略。
- 不保留前台 `assertInvocationCurrent` 或已释放的 `memoryAudience` 来冒充后台 lease。它们的生命周期与后台不同。
- 存储 stamp 检查能检测其它会话修改及创建后撤销；检查和最终操作位于同一跨进程锁内。
- 失败不自动重试，冷却 15 分钟。已经成功的工具保存不会因后续模型失败而被伪称未发生；通知仍保留，保存可 undo。
- 独立 60 秒总时限先撤销 review token，再通知宿主取消，并释放串行复盘队列。宿主的单次 timeout 可能被内部重试延长，不能独自承担这个边界；迟到结果没有写权限。不能保证不响应取消的底层网络请求立即终止。

实测并核对官方契约：新建原生会话可没有 lifecycleRevision；reset 保留 sessionId、生成新的 revision。lease 将 undefined 视为精确的初始代际值，绝非通配符；undefined→UUID、UUID→undefined、UUID 变化、删除都会撤销，空串/null/错误类型拒绝。无须先 reset 或插件私写宿主库；首次会话已由本地 channel 入站 fixture 验证，实际钉钉投递独立验收。

## 证据与存储

复盘最多取最近 64 条 user/assistant/toolResult/tool 文本，单条截断到 4,000 字符，总预算低于 32 KB；保留工具名称、失败标记并显式标记截断。常见 token/Bearer 形式会遮盖，但不声称通用敏感信息检测完整。失败工具回执优先于 assistant 的无依据成功表述；缺失/截断不构成成功证据。

prompt 只放技能名称、description 和 revision。完整 bundle 通过 view 按需获取，避免已有几个大技能就超过旧的 128 KB 整包 prompt 阈值而静默不复盘。

`save` 替换完整 bundle。正文上限 40 KB，至多 16 个配套文件，bundle 128 KB，每 scope 至多 64 个技能名。支持 references/templates/scripts/assets 文本；后台不执行其中内容。

```text
<private-state>/scopes-v1/workshop/
  <namespace>.lock.sqlite
  <namespace>/<skill-name>/
    head.json
    versions/<revision-uuid>/
      SKILL.md
      skill.json
      attribution.json
      references/...
```

SQLite `BEGIN IMMEDIATE` 保护同 scope 的读、CAS、bundle 写入、head 替换和回收全过程。不同进程共享同一锁，冲突超时/旧 revision 拒绝；原子 rename 本身不等于 CAS。保存先写不可变版本，再切换 head，保留 10 步 undo。崩溃留下的未引用 bundle 不会被加载，后续 compact 回收；SQLite 事务不能回滚外部文件，也不宣称已完成断电耐久性验证。

事务回调仅允许同步执行；异步函数在执行前拒绝，返回 Promise 的调用同样拒绝。版本记录可信 grant 的 actor/session/time，head 记录最近一次保存、归档或撤销的操作者；模型不能指定这些字段，工具输出也不包含审计身份。目录/文件使用私有权限。这是有限版本归属记录，不是不可篡改的完整审计日志。

30 天未显式 view 的技能可在成功复盘后归档。Learned 和归档通知合并，在该 scope 下一前台回合提示；不重用过期 webhook。通知仅在进程内，重启可能丢通知，但技能与 undo 持久化。

## 使用与配置

要求 OpenClaw 2026.10.9 与其支持的 Node（`>=24.22.1 <25 || >=26.12.1`）。功能默认关，全局 `skills.workshop.autonomous.mode` 必须为 `off`；scopedLearning `enabled: false` 全关，`mode: "off"` 只停后台。共享硬隔离服务还必须通过运行环境检查，单独打开配置不代表可用。

钉钉入口在访问检查后将 `/learn`、`/learn <重点>`、`/learn list`、`/learn view <名字>`、`/learn undo <名字>` 转成 scoped 工具请求。上游保留 learn 命令，插件不能覆盖注册它，因此做入站适配。仍依赖模型调用工具；只能按成功工具回执确认完成。`/learn help` 显示用法。

## 可复现验证

```sh
npm test
npm run test:scope-authority
npx tsc -p tsconfig.scoped-learning.json --noEmit
npm run build
node --test tests/memory-scope/scoped-workshop-package.test.mjs
# Linux/WSL，真实 Gateway + 本地确定性模型协议 fixture，独立临时 state/config/ports
python3 tests/memory-scope/host-probe/run.py --openclaw /path/to/openclaw
# 可选付费模型验证；密钥通过环境变量 DEEPSEEK_API_KEY 提供，不写入命令参数
python3 tests/memory-scope/host-probe/run.py --openclaw /path/to/openclaw --real-model
# 同一个真实 Gateway 内：可信身份适配、前台工具、空闲调度和后台写入；本地模型协议 fixture
python3 tests/memory-scope/learning-ingress-probe/run.py --openclaw /path/to/openclaw
# 实际 handler + dispatcher/card；仅替换平台 HTTP，不连接真实 Stream
node tests/memory-scope/ingress-probe/build.mjs "$PWD/handler-bundle.mjs"
python3 tests/memory-scope/learning-ingress-probe/run.py --openclaw /path/to/openclaw --handler
```

| 验证层 | 当前证据与限制 |
| --- | --- |
| 单测/模块集成 | scope 身份、伪造/撤销、调度、工具回执、一次修改、CAS/undo；宿主/模型部分为 fixture |
| 多进程真实文件与 SQLite | 竞争创建/更新只有一个成功；崩溃后锁释放，orphan 回收；已通过 Windows Node24 |
| 真实 SDK 打包 | dist 加载和无可信服务时拒绝；不是生产模型验收 |
| 真实 Gateway 执行器 | OpenClaw2026.10.9 下 5 次越权尝试被拒绝，合法 list/save 成功；无越权文件 |
| 真实宿主生命周期 | public work admission 被 reset/delete 中断；reset 后相同 sessionId 不同 revision；delete 后 latest read 不存在 |
| 真实模型小样本 | 成功 CSV 流程保存；失败、提示注入、个人偏好、未验证建议不保存。写入决策与正文证据支持程度分开检查；不证明质量等价或普遍可靠 |
| 实际 handler 至自动复盘 | 七个场景：首次私聊学习、另一用户和大小写不同用户隔离、群内学习与另一成员读取、另一群隔离、`/new` 后读原记忆与技能并继续复盘；真实 Docker 前台校验、RPC 返回后复盘、私有目录保存；provider 请求无外部 scope 哨兵，实际 dispatcher/card 到本地 HTTP adapter |
| 真实轮换与执行覆盖 | 实际 handler 九场景包括真实 idle 事件后的记忆读取；工具创建后通过 public sessions.patch 设置 execHost=gateway，最终执行门拒绝；daily 有本地生命周期回归，未运行跨日时钟测试 |
| 未完成验收 | 物理会话换代式 compaction 继续核实；线上钉钉投递、更广泛真实模型质量另验，不承诺原生 warm-fork 或缓存等价 |

host-probe 使用测试自有 grant 和专用 RPC，只证明受限 runner 与宿主生命周期能力，不证明生产入站鉴权。默认使用本地模型协议 fixture；只有显式 `--real-model` 才调用外部模型，输入为测试案例。CSV 正例先执行真实文件解析/校验，再将结果提供给复盘。证据目录与结果由脚本输出。模型可能先产生错误工具参数并根据回执修正，不能把最终写入成功理解为每次调用均正确。初轮发现过未经验证的泛化内容，已加强证据约束；提示词不能代替后续内容质量评估。CI 的 fork 审批状态与本地测试分开报告。
