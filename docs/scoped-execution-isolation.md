# 脚本绕行：分析与部署方案

> 本文保留架构分析。2026-11-05 WSL 已部署后续 runtime tools 和常驻隔离配置；当前操作以[WSL 配置](scoped-runtime-wsl.md)为准，当前结果以[验收报告](scoped-live-e2e-2026-11-04.md)为准。下文“候选／待实施”描述的是设计阶段状态。

核对日期：2026-11-05。适用基线为实际验收的 OpenClaw 2026.10.9 + 回移 `887774ae`，Connector 为 `c46ecf1`。在线官方文档用于核对信任边界，具体字段以安装版本 CLI/schema 复核。

## 结论与职责

**解决已复现的脚本绕行，必须限制执行代码拥有的 OS 权限。** 不能只过滤 rm、Python 等命令名，也不能仅靠模型听从提示词。Connector 继续负责可信用户／群到 scoped 数据的授权，OpenClaw／部署层负责脚本、文件、网络和凭据权限。两层并存，公共知识仍可按需只读挂载。

现场复核：WSL 默认及 main sandbox 未配置（实际 off），全局 tools.profile=full，main 只 deny 原生 skill_workshop，blockAutomaticMedia 未设置。获准 shell 与 Gateway 使用相同 UID，文件权限600无法阻止同 UID 读数据库。隐藏路径、只 deny 原生 Workshop 工具、给 shell 加过滤器均不构成私人存储的 OS 边界。把整个 Gateway 装进一个共享 Docker 也不能隔开容器内部不同用户的权限。

官方以一个 Gateway 对应一个可信操作边界；对彼此不信任／有敌对行为的用户，应拆分 Gateway、OS 用户或主机。单 Gateway 下的工具沙箱是收窄权限的手段，不能直接声称为完整的敌对租户隔离。[官方信任模型](https://docs.openclaw.ai/gateway/security/trust-model)

## 需要同时处理的路径

| 路径 | 证据 | 处理措施 |
|---|---|---|
| 普通 shell 直接读私有 state、删共享文件 | 真实两用户脚本已复现 | sandbox.mode=all、scope=session、workspaceAccess=none；exec.host=sandbox；不挂载私人 state |
| 共享 sandbox workspace | 核对版本 resolveSandboxScope 默认 agent | 显式 scope=session；仅开启 sandbox 而保留 agent/shared 不满足不同聊天任务目录隔离 |
| 公共知识及公共安装 skills | 只读挂载已经实测；宿主支持只读技能镜像 | 只开放审核后的公共目录；不挂整份 home、.openclaw、会话历史、plugin-state、所有人凭据。自学习成果通过 scoped view 访问 |
| 启动上下文注入 | Gateway 会读取启动规则后提供给模型，独立于容器文件可见性 | AGENTS/SOUL/IDENTITY 等共享规则只能放公共内容；不把秘密写进公共规则后指望 sandbox 隐藏。scoped USER/MEMORY 过滤不能代替资料分类 |
| host/node/elevated 绕行 | sandbox 内 gateway／elevated 实际请求已拒绝 | 固定 exec.host=sandbox，关闭 main.tools.elevated；不向普通会话暴露 nodes、gateway 或能修改策略的工具 |
| read/write/edit 等文件工具 | 官方原生工具使用 sandbox 文件桥 | 与 exec 使用同一隔离域；部署时补测路径穿越、符号链接及跨会话任务目录。workspaceOnly 不是 shell 的权限控制 |
| sessions_history/search/send、子Agent | 官方默认跨会话访问面较宽 | 只开放所需工具；先不开放跨会话／子Agent入口。纵深设置 tools.sessions.visibility=self、tools.agentToAgent.enabled=false，说明全局影响 |
| 模型路径转成附件发送 | Connector media/file.ts、chunk-upload.ts 存在宿主读文件路径 | 未接入受信的会话授权文件导出之前，独立设 blockAutomaticMedia=true；不要把模型给的路径当授权 |
| DWS 登录态与身份选择 | dws-official-auth.ts 向模型提示 requester profile | 提示 --profile 不等于凭据隔离；不得把多人 .dws/keyring 挂给共享执行环境 |
| 网络、浏览器、额外插件 | 尚未完成全部出口验收 | 先 network=none，逐项开放所需出口；审查插件是否在宿主执行，不推断其自动受工具沙箱限制 |

Gateway 自身不进入工具沙箱。elevated、宿主插件读文件等需要各自控制；工具“是否允许”与“在哪里执行”是两项策略。[官方执行范围](https://docs.openclaw.ai/gateway/sandboxing/what-gets-sandboxed)、[沙箱／工具策略／提权](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)

## 适合当前机器人的方案

### 保留脚本能力：会话级沙箱及明确工具范围

面向同一组织共享机器人的建议是：每个聊天独立工具沙箱，公共知识目录 ro，scoped memory／Workshop 仍在 Gateway 通过已绑定授权访问数据库。私人数据库不以普通目录方式开放给模型。两人同群共享的是群范围，私人会话与群会话对应不同 session scope。

目标工具范围限定为 exec、process、read、ls、write、edit、apply_patch、scoped_memory、skill_workshop、session_status、dingtalk_dws、dingtalk_send_file；`skill_workshop` 只在官方插件关闭且独立 scoped 替代插件启用时允许。其余宿主插件及跨会话能力逐项审核后增加。

镜像预装必要 Python／库和CLI，固定版本或 digest；不在运行时借 elevated、host exec 或全局目录挂载补装。Gateway 负责模型请求和钉钉 Stream，所以 sandbox network=none 不会直接断掉模型回复；它会影响脚本网络与DWS业务，后者需要受控出口。

DWS 由 Connector 的受控工具绑定当前入站发言人，在独立的凭据目录中调用 DWS；群内请求取当前发言人的登录态，不把全群凭据挂入脚本容器。此前 WSL 旧 host 的双人验证已覆盖通讯录读取；本次最新 main 的真实复测仍在进行。

正常附件由 Connector 的会话绑定文件工具读取当前工作区内经宿主授权的文件，再经钉钉发送；不能为此开放任意宿主路径。此前 WSL 旧 host 已验证文本／PNG 和越界路径拒绝，本次最新 main 仍待复测。

### 如果不需要任意脚本

使用更窄的工具 allow，仅开放 scoped 工具和受信知识查询。只 deny exec 不够，原生 read、插件及自动媒体出口仍须审查。这减少能力，不能冒充已交付完整脚本功能。

### 如果用户之间必须形成强敌对隔离

拆分信任域：独立 OS 用户／实例／Gateway，或者另建可信多租户工具及凭据代理。私聊域与群共享域需要真实身份路由。仅改 sessionKey、同一 UID 下分目录或共享一个容器都不足以完成该目标。此项属于平台架构工作，不应通过 Connector 偷改所有宿主策略来掩盖。

## 已准备并校验的配置候选

在现有 WSL 执行 `openclaw config patch --stdin --dry-run`：**退出码0，保存配置的前后哈希一致，未应用**。候选包括会话沙箱、明确工具 allow、固定 exec 到 sandbox、关闭提权、收窄会话可见性和关闭自动附件。

远端文件：`/home/andy/openclaw-e2e-20261104/isolation-research-1105/candidate.patch.json`。本地交付目录有同内容的 `isolation-candidate.patch.json`。这是合并候选，不是生产完成态：

- image 是现有 shell 测试镜像的固定 digest，尚未配齐 Python／DWS 业务依赖。
- 建议知识源为 workspace/knowledge，现场该目录尚不存在，须先确认公共内容并创建。
- tools.sessions 和 tools.agentToAgent 为全局设置，blockAutomaticMedia 为渠道级设置；可能影响同 Gateway 的其他业务。
- 该版本全局 binds 和 Agent binds 会合并；给 Agent 配空数组不能假设清除了全局挂载。本次现场全局 binds 为空。
- main 的 allow 会缩小当前 full 工具能力；现有其他插件功能需要逐项复验。

## 发布与验收顺序

1. 在部署配置源落实 sandbox／工具策略／公共挂载／媒体策略；Connector 的 scope setup 继续只做明确声明的 scoped 配置。
2. 构建实际依赖镜像，分离可写任务目录和公共只读资料；不挂 Docker socket、全局 state、多用户 keyring；确定网络和凭据出口。
3. 重启 Gateway、重建受影响 sandbox，核对有效工具策略和 Docker mount，而不只读配置文件。
4. 两用户私聊及群聊复验 memory／自学习／新会话／重启，普通脚本业务也必须成功。
5. 重测跨范围文件读、公共删除、host/node/elevated、符号链接／路径穿越、跨会话工具、附件宿主路径和DWS跨身份；必须取得代码或内核拒绝证据。
6. 正常知识读取、授权附件和DWS业务完成后，才能把持久部署标为通过。

目前已完成根因定位、真实脚本正反对照及候选 schema 验证；**常驻加固与完整业务回归仍待实施**。这是真正剩余的交付项，不属于应从最终报告删除的已修复历史。

## 代码核对位置

- 安装宿主对应源码：`src/agents/sandbox/config-contract.ts`（默认scope）、`config.ts`（mode、bind合并、network）、`src/config/zod-schema.agent-runtime.ts`（Agent工具、sessions、exec/elevated schema）。
- Connector：`src/memory-scope/workshop-api.ts`（可信 scope 数据服务）；独立插件：`plugins/scoped-workshop/`（学习工具与原生 fork 适配）；附件出口：`src/services/media/authorized-outbound.ts` 和宿主授权 reader。
- 上述文件分析证明配置／调用边界，不替代尚未运行的完整出口测试。
