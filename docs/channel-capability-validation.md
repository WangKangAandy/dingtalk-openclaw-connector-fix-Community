# Channel 能力适配：交付审查与验证边界

原 PR23 基于旧 fork main `caef3c2e600deedc1a8daf9025328562ed5ad99f`；本审查组合分支已合入 PR19 当前代码，按固定 OpenClaw main `dad4fc1a` 和真实 WSL 双人会话重新验收。生产部署仍须按仓库发布流程单独进行。

## 从研究到实现

| 要求 | 实现与证据 | 结论边界 |
|---|---|---|
| 核实 DWS 是否取代 OpenClaw connector | 两份研究报告、稳定版 CLI 隔离 dry-run、固定提交源码链接 | 数字员工路径不支持 OpenClaw；dev 路径仍委托 connector；未推断未公开路线图 |
| 消息上下文正确性 | 作用域引用缓存、精确 ID、chatRecord 有界解析；quote-scope、inbound-context 和真实消息入口测试 | 不读取旧全局标题缓存；无权威媒体 locator 时标缺失 |
| 公开工具进度 | Host 公开事件、ID 关联、终态保护、共享卡片写链；card-exec-preview / card-update 测试 | 不投影命令参数、工具结果或内部推理；未确认结束不标成功 |
| 执行/投递分离与反馈 | SQLite 回执、真实 HTTP 边界记录、只读管理员 RPC、可选原消息状态反馈 | 不承诺跨系统 exactly-once；未知不自动重跑；Host 独立后台发送不借用旧回合归属 |
| Host 控制与作用域保留 | 移除插件 FIFO；stop/btw；公开 adoption 生命周期；hard-scope 延后替换 | Host 控制模型和工具；取消不回滚既有副作用 |
| 原生问题表单 | v2 工具声明和 manifest；不透明 run 绑定；当前权限、路由和新回执续聊 | 仅原发起人；表单不授予执行审批；重启后旧卡失效 |
| 连接生命周期 | 旧 socket close/SYSTEM/pong 隔离、重连期间 abort、并发处理保活计数 | 本地生命周期测试，不等于全部真实网络故障验收 |

## 已执行验证

- Windows/Ubuntu 的默认回归、两套严格 TypeScript、构建和真实 SDK 包加载通过；[固定 main Gateway CI](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/actions/runs/42372851554) 覆盖组合分支的原生 fork 与沙箱模式。后续删去额外审批模块后的 head 仍以其对应 CI 为准，不沿用旧 head 的绿灯。
- `/stop`、`/btw`、合并转发和引用隔离均做了真实 WSL 前后对照。`/btw` 原 PR23 少了 Host `CommandSource:"text"`，审查分支补上后，120 秒主任务运行期间先发出旁路答案。引用隔离已抽入 PR19 并通过双人同名标题及本人引用对照。
- 构建包直接加载真实 SDK，验证 v2 问题工具、`operator.admin` 回执核查，以及无可信服务时不注册 scoped learning。Connector 不再注册额外审批 capability；用户明确要求的 DWS 写操作由 PR19 受控工具直接调用官方 CLI。
- `test:scope-authority` 47 项通过，包含源授权替换、重置、工具生命期与 SQLite 跨进程并发。原有组织事件、媒体限制、学习和引导测试仍在默认集合中。
- 对端 Ubuntu WSL / Node 24.22.1：在临时目录验证 `TurnStore` / `inspectTurns` 的跨进程去重、unknown 保留、身份隔离、关闭回合拒绝新发送、只读核查及符号链接拒绝。真实机器人测试使用固定提交的独立候选目录短时切换 Gateway，结束后恢复原配置 SHA-256 与插件路径；这不等于生产已部署候选。
- 可重复的跨进程账本测试在 `tests/turn-state/platform.test.mjs`，已加入既有 Ubuntu/Windows CI 矩阵。Windows 无符号链接权限的断言由 Linux 实测补充，不能把权限跳过说成 Windows 已验证。

## 最终审查修正

审查发现并修复了外层 handler 提前返回导致账本早闭、Host 延后回合过早收口、新入站早撤销前一个 hard-scope 授权、v2 问题工具注册/manifest 缺口、同会话并发问题上下文绑定、以及活跃卡片吞掉 Host 出站消息并返回伪成功等接线问题。对应回归针对实际入口、真实 SDK 或实际传输包装层，而非仅检查实现细节。

## 尚未验证与后续验收

真实钉钉消息已覆盖两名授权用户、现有测试群、停止、旁路和合并转发。进度卡片过程变量的客户端可见性、原生问题表单往返、平台重投同一业务消息、断线重连及生产负载尚未验收，不能用当前单元测试或模拟回执替代。额外 Host 审核卡按用户决定从 Connector 候选中移除。

长答案的机器人 API 分批协议、跨进程机器人连接所有权及逐发送者限流没有直接照搬 DWS；研究证据不足以将不同平台主体/宿主机制视为等价实现。本 PR 不宣称 DWS 全功能对等。
