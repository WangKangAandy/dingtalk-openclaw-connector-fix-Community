# Channel 能力适配：交付审查与验证边界

本次基于 fork main `caef3c2e600deedc1a8daf9025328562ed5ad99f`。交付前重新查询 GitHub：fork main、DWS main `c631e4fb`、官方 connector main `88df00ee` 均未变化。没有合并另在评审中的 #19–#22，也没有部署生产 connector。

## 从研究到实现

| 要求 | 实现与证据 | 结论边界 |
|---|---|---|
| 核实 DWS 是否取代 OpenClaw connector | 两份研究报告、稳定版 CLI 隔离 dry-run、固定提交源码链接 | 数字员工路径不支持 OpenClaw；dev 路径仍委托 connector；未推断未公开路线图 |
| 消息上下文正确性 | 作用域引用缓存、精确 ID、chatRecord 有界解析；quote-scope、inbound-context 和真实消息入口测试 | 不读取旧全局标题缓存；无权威媒体 locator 时标缺失 |
| 公开工具进度 | Host 公开事件、ID 关联、终态保护、共享卡片写链；card-exec-preview / card-update 测试 | 不投影命令参数、工具结果或内部推理；未确认结束不标成功 |
| 执行/投递分离与反馈 | SQLite 回执、真实 HTTP 边界记录、只读管理员 RPC、可选原消息状态反馈 | 不承诺跨系统 exactly-once；未知不自动重跑；Host 独立后台发送不借用旧回合归属 |
| Host 控制与作用域保留 | 移除插件 FIFO；stop/btw；公开 adoption 生命周期；hard-scope 延后替换 | Host 控制模型和工具；取消不回滚既有副作用 |
| 原生问题表单 | v2 工具声明和 manifest；不透明 run 绑定；当前权限、路由和新回执续聊 | 仅原发起人；表单不授予执行审批；重启后旧卡失效 |
| 原生执行审批 | `approval.native` 生命周期、明确 reviewer、真实 SDK 审批运行器及 canonical RPC 参数测试 | 默认关闭；不冒充支持 Host 工具级 plugin reviewer 策略；批准不等于执行成功 |
| 连接生命周期 | 旧 socket close/SYSTEM/pong 隔离、重连期间 abort、并发处理保活计数 | 本地生命周期测试，不等于全部真实网络故障验收 |

## 已执行验证

- Windows / Node 24.22.1 / 独立安装的 OpenClaw 2026.10.9：580 项默认回归、38 项引导/配置测试、构建、scoped-learning 与 hard-memory 严格类型检查通过。1 项文件符号链接用例受 Windows 权限限制跳过。全项目类型诊断仍存在：原始基线 47 项，适配分支 37 项，无新增；没有宣称全仓类型检查全绿。
- 使用真实最低 SDK 的 `/btw` 前台租约/发送策略测试，以及审批 handler、投递规划、视图、决定/过期生命周期和 RPC 参数测试。钉钉网络和 Gateway 决定响应是夹具。
- 构建包直接加载真实 SDK，验证 v2 问题工具、审批 capability、`operator.admin` 回执核查，以及无可信服务时不注册 scoped learning。独立 CLI/schema dry-run 成功，临时配置内容未被改变。
- `test:scope-authority` 47 项通过，包含源授权替换、重置、工具生命期与 SQLite 跨进程并发。原有组织事件、媒体限制、学习和引导测试仍在默认集合中。
- 对端 Ubuntu WSL / Node 24.22.1：只在新建 `/tmp` 目录验证当前 `TurnStore` / `inspectTurns`。跨进程相同消息拒绝再次认领，unknown 保留，账号/机器人隔离，关闭回合拒绝新发送，只读核查隐藏 owner，数据库模式 0600，符号链接拒绝。传入源码 SHA-256 与本地完全一致。没有安装依赖、修改对端配置或重启服务。
- 可重复的跨进程账本测试在 `tests/turn-state/platform.test.mjs`，已加入既有 Ubuntu/Windows CI 矩阵。Windows 无符号链接权限的断言由 Linux 实测补充，不能把权限跳过说成 Windows 已验证。

## 最终审查修正

审查发现并修复了外层 handler 提前返回导致账本早闭、Host 延后回合过早收口、新入站早撤销前一个 hard-scope 授权、v2 问题工具注册/manifest 缺口、同会话并发问题上下文绑定、以及活跃卡片吞掉 Host 出站消息并返回伪成功等接线问题。对应回归针对实际入口、真实 SDK 或实际传输包装层，而非仅检查实现细节。

## 尚未验证与后续验收

没有真实发送钉钉消息、启动真实审批命令或迁移生产状态。真实客户端模板渲染、机器人权限、生产压力和线上 Gateway 决定执行需要在独立测试机器人上验收。这些是上线验收边界，不是本次代码适配已验证的内容。

长答案的机器人 API 分批协议、跨进程机器人连接所有权及逐发送者限流没有直接照搬 DWS；研究证据不足以将不同平台主体/宿主机制视为等价实现。本 PR 不宣称 DWS 全功能对等。
