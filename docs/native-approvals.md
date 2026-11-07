# 钉钉原生审批

本适配器接收 OpenClaw 的 exec、plugin、system-agent 待审批请求，向显式配置的审批人私聊投递审批卡。它只向 Host 提交审批决定，不执行命令、不模拟用户消息、不调用模型续聊。

在对应 channel 或 account 配置中启用：

```json
{
  "nativeApprovals": {
    "enabled": true,
    "approvers": ["审批人的钉钉员工ID"]
  }
}
```

默认关闭。审批人名单独立于普通聊天的 `allowFrom`，必须为 1–20 个精确员工 ID；不允许通配符，也不自动采用请求发起人、部署者或当前 DWS Profile。可以通过 `cardTemplateId` 指定自有模板；默认复用仓库内的原生 Form 模板，需要应用具有对应卡片权限。

## 决定与身份

- 只接收 Host 明确标注源 channel 为 `dingtalk-connector`、源 account 为当前机器人的请求；不根据 SessionKey 或审批 ID 的前缀猜来源/种类。
- 审批卡只由原卡指定的审批人操作。点击者只认平台事件信封的 `userId`，不信任表单里的身份、审批 ID、种类或目标。
- 点击时重新读取当前配置，校验账号启用、机器人身份、审批人名单、模板/策略指纹、有效期及原卡 action ID。异步准备结束、调用 Gateway 前再校验一次。
- 按 Host 展示动作与请求显式 `allowedDecisions` 的交集提供按钮。命令/参数、警告、scope 与详细说明完整展示；超过本地 24000 字符预算时不展示截断内容和批准按钮，应使用 OpenClaw 审批界面。
- 通过最低 Host 2026.10.9 的公开 `approval.resolve` 接口提交明确的 owner kind、account 和平台 reviewer。没有旧版 kind 推断或 exec/plugin 方法兜底。
- Host 是一次性决定的权威。多个审批人同时点击时本地只提交一项在途决定；最终采用 Host 返回的已记录状态，即使它与本次点击不同。批准不代表操作执行成功。
- 表单的“取消”只关闭该卡，不等于拒绝请求；要拒绝应选择“拒绝”并提交。结果未知时停止继续提交，在 OpenClaw 核查，不能通过再跑一次模型修复。

## 连接与恢复

Stream 连接成功后注册 Host `approval.native` 上下文，断开/停止时立即使旧卡失效。重连由 Host 重放仍待审批的请求并生成新卡；旧卡无法复用新上下文。Host 持有待审批请求的持久性，connector 不另建执行授权库。

同一连接代次、同一请求和同一审批人的卡片最多尝试投递一次，投递未知也不自动重发。每个进程最多保留 512 个活跃控制项，每个账号上下文最多 512 个尚未过期的投递尝试。卡片或状态更新失败不会改变 Host 审批结果。重启后旧按钮失效；新卡来源必须是 Host 的待审批重放。

本适配器仅向配置审批人的私聊投递。OpenClaw 的其它审批转发配置仍由 Host 管理，不据此宣称其它通道也只发私聊。

## 支持边界与验证

当前目标 Host 提供异步 native-runtime/handler 和上下文注册接口；适配器使用异步 helper，不保留即将移除的同步兼容入口。若 Host 配置了 `approvals.plugin.dingtalk-connector` 工具级 reviewer 策略，本版本不声明支持该策略，也不会接管这类 plugin 审批或允许从钉钉决定；继续使用 Host 的其它授权入口。exec 与 system-agent 不受这一 plugin 专有条件影响。

测试使用真实最低 Host SDK 构建审批运行器、投递计划、视图和最终状态，并模拟钉钉网络及 Gateway 决定响应；另验证实际 SDK 生成的 canonical RPC 参数。覆盖身份伪造、跨账号、竞争点击、配置撤销、过期竞态、投递未知、结果未知及断线重连上下文。未宣称验证了真实钉钉客户端渲染或线上审批执行。
