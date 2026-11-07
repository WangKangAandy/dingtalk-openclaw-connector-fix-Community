# 真实双人、双群与沙箱验收

更新：2026-11-07。验收对象是按人／群隔离的记忆和 **Workshop 自学习成果**，不包括面向所有用户安装的普通 skills。标准是私聊按人隔离、同群共享、私聊与群聊及不同群互相隔离。

当前 WSL 运行 OpenClaw main `dad4fc1a`，加未合入的 [#191205](https://github.com/openclaw/openclaw/pull/191205) 沙箱事实投影和 `/learn` 沙箱兼容补丁；Connector 与独立 Workshop 代码均为 `5f203f656c25c6d6435f0696473f6b7c3a630de1`。Gateway 已重启，钉钉 Stream 已连接，替代 Workshop 已加载，官方 `skill-workshop` 已禁用。实机配置 SHA-256 为 `c14de116db8c0845fc91349b0873aa9e745c9b84e347317cca2751e0461d7472`；[配置文档](scoped-runtime-wsl.md)与其逐项核对。

## 结果

| 场景 | 结果 | 后台依据 |
|---|---|---|
| 私聊记忆按人隔离 | 通过 | 王康与管佳慧的真实入站 userId 进入不同 namespace；同名键读写互不影响；首次无 revision 的新键 `put` 成功，旧键无 revision 覆盖被 CAS 拒绝，原值未变 |
| 同群共享、私聊／群聊和跨群隔离 | 通过 | 两人分别 @ 小呆，群记忆由另一成员读回；私聊读不到群值。第二临时群写同名键后原群值不变；临时群测试后已解散 |
| 前台自学习工具与 `/learn` | 通过 | `skill_workshop` 的 create/view/restore 在真实私聊和群聊调用并核对版本、actor 与 namespace；沙箱里的 `/learn` ipaddress、decimal 正反例及 undo 实际生效 |
| 私聊后台自主学习阳性 | 通过 | 管佳慧私聊的 Python 断言流程触发原生 `runForkedTurn`，日志 `settled=true changes=1`；落盘 `exec-python-assertion-checks` 的 actor 为本人、sessionId 为本人私聊；王康私聊和测试群 view 均返回 null |
| 群聊后台自主学习阳性 | 通过 | 管佳慧在测试群两次运行 CSV 往返断言，原生 fork `settled=true changes=1`；`python-csv-roundtrip-verify` 落在群 namespace，王康在同群 view 到 revision `a773354d-005d-496c-aa08-803e1e4b4e4b`，管佳慧私聊 view 为 null |
| Gateway 重启后的学习成果 | 通过 | 保存后重启 Gateway，Stream 重新连接；私人和群技能 head 文件哈希前后相同，管佳慧私聊及王康群聊再次调用 view，revision 分别仍为 `f2835056-1ce0-44fc-be57-0e534d2c374f`、`a773354d-005d-496c-aa08-803e1e4b4e4b` |
| 用户明确要求“不学习” | 通过本轮私聊及群聊样本 | 私聊 12 条、复测 6 条与群聊 Fraction 样本均触发真正的原生复盘，`settled=true changes=0`，相应技能目录没有新增版本；并非仅凭机器人回复判断 |
| 自学习正文忠实于工具证据 | 通过已核样本 | 私聊技能写明第一次 `exec` 被宿主预检拒绝、改为直接 `python3` 后两次 `exitCode=0`；群技能的源码、两次 nested exec 结果及保存正文一致。CSV 字段经 Python 求值含真实换行码点 10，保存示例也相同 |
| 伪造身份／跨范围版本 | 通过负例 | 伪造 userId、scope 和借用别的范围 revision 被工具层拒绝，存储哈希不变；宿主绑定真实发言人，模型不能选另一个 profile |
| 引用正文跨私聊隔离 | 通过双人同名标题与本人引用对照 | 基线旧全局 `title:` 回退曾把 A 私聊回复的无敏感 canary 注入 B 引用自己的同名消息。修复后 A 的 Q9 回复只入带账号、机器人、会话和目标的缓存；B 首次模型输入只含自己的标题 JSON，未见 A canary。A 引用自己收到的 Q9 机器人消息时首次输入仍有真实两行正文。两项模型均无其它工具补救；旧全局缓存文件未迁移，测试后 WSL 恢复原配置，持久部署仍以仓库发布流程为准 |
| DWS 私聊及同群身份 | 通过已测操作 | 王康、管佳慧的独立 WSL 登录态各自 `corp_id/user_id/token_valid` 核对；两人私聊及同群 `dingtalk_dws contact +me` 返回各自身份，群主身份未覆盖发言人 |
| 自然语言 DWS 查询 | 通过当前样本 | 旧版首次按遗留提示试宿主 `exec dws` 和 `profile list`，失败后才经 `dingtalk_dws` 查到 B 日程；移除旧提示后，明天日程请求首次直接调用 `dingtalk_dws`，profile 属 B 且退出码 0 |
| DWS 明确请求的写业务 | 通过本人待办样本 | 按用户决定移除 Connector 额外 Host 审核卡。B 私聊明确要求创建临时本人待办，后台仅一次 `dingtalk_dws todo +remind ... --yes`，固定 B profile、退出码 0、返回 taskId；B 的独立 DWS 登录态按该 ID 回读到同一标题。测试后按精确 ID 删除，同账号详情报不存在／无权限，完整搜索 `count=0`；A 私聊未收到审核卡 |
| DWS／附件独立于 memoryScope | 通过实机对照 | 暂设 `memoryScope=false`、`runtimeTools=true`，保留 `sandbox=all`；B 私聊 DWS 返回本人 profile/userId 且退出码 0，A 群聊 DWS 返回本人身份，B 私聊沙箱文件通过 `dingtalk_send_file` 投递。普通会话仍走原有路由；模型尝试 `profile list` 和显式 `--profile` 均被工具层拒绝。随后恢复原配置并核对 Stream、scope check、私聊记忆与群技能读回 |
| 同一 DWS 工具跨 Agent 执行模式 | 通过只读对照 | 在上述 `memoryScope=false`、`runtimeTools=true` 的沙箱模式已核对 B 的真实 profile/userId。再短时设 `sandbox=off`、`exec.host=gateway`，B 私聊的实际 Code Mode 首次调用仍是 `dingtalk_dws({args:["contact","+me"]})`；nested tool 退出码 0、profile 和 stdout userId 均属 B，未出现 A。测试后恢复原配置 SHA-256、Gateway 与 watchdog。此项不表示宿主 shell 具有文件隔离 |
| DWS 本地操作过滤的参数顺序 | 通过回归 | 对 `drive download`、`drive --yes download`、`drive --format json --yes sync`、`download-version`、`mail message export`、`mail attachment download` 及 `+download` 位置做拒绝测试；消息正文 `download` 仍保留。此前只扫描第一个 flag 前的子命令，已在 `6087a29` 按产品级命令路径修复 |
| 正常文本、PNG 与群附件 | 通过已测发送链路 | 沙箱生成后由 `dingtalk_send_file(workspaceRelativePath)` 上传；私聊 PNG 从接收方下载并与源文件 SHA-256 一致，群文本文件收到平台回执；旧 `path` 参数的现存会话兼容调用也成功 |
| 自动媒体 reader 与显式文件授权 | 通过已测边界 | 普通媒体回调即使持有宿主 reader，在 `blockAutomaticMedia=true` 时被代码边界拒绝；显式文件工具的授权只在调用期间有效，延迟回调被拒。WSL 显式附件复测由 `dingtalk_send_file` 实际返回 `delivered:true` |
| 沙箱、只读公共挂载与脚本绕行 | 通过已测边界 | 实际 Docker 只有独立 workspace、只读 skills/knowledge，`network=none`；公共文件可读不可写，宿主配置不可见；`host:"gateway"`、`elevated:true`、符号链接文件外发均被拒绝 |
| [#191205](https://github.com/openclaw/openclaw/pull/191205) 沙箱事实 | 通过本轮固定版本对照 | parent/head 回归及 Gateway/Docker 对照覆盖沙箱开启和关闭，当前实机在 `mode=all` 下使用该补丁；它仍是未合入上游的部署依赖 |

判断依据是入站身份、Code Mode 的实际 toolCall 参数、nested-tool 结果及退出码、原生复盘日志、存储版本和接收文件哈希。被测试的第二用户私人技能只出现在 `v1-99913e...`；群技能只出现在 `v1-2f6c6e...`。后台保存由 Workshop fork 调用，Connector 只授予可信范围与存储能力。

## 交付边界

- **首次工具调用并非全程无错。** 私聊阳性任务第一次使用 `python3 ...; echo EXIT=$?`，被 OpenClaw Code Mode 预检正确拒绝；模型随后直接调用 `python3 <file>` 两次成功。根因是模型构造了不符合宿主预检的复合命令，Connector 没有执行该命令，也没有把失败当成验证成功。保存的技能记录了这一修正。其他已记录的首次附件参数错误同属模型调用准确率，当前 canonical `workspaceRelativePath` 和旧 `path` 兼容均已验证。
- 沙箱保护依赖上述 OpenClaw 配置与镜像，不是 Connector 文件 ACL。曾在 `sandbox=off` 对人为测试数据库证明同 UID 的 shell 可绕过插件存储边界；当前部署的容器对照阻断了该路径。没有递归删除真实公共 Workshop，也没有向第二用户发送数据库正文。
- DWS 验证覆盖双人 `contact +me`、日历只读查询、一次本人待办创建/回读/清理和受控附件发送，不能外推到所有产品或写操作。Connector 不加第二道 Host 审核；OpenClaw 是否执行写操作仍取决于用户需求、当前工具策略及该发言人的 DWS 权限，`--yes` 本身不是业务成功证明。文本附件确认平台投递，PNG 另做下载哈希核对；不把文本回执写成下载哈希证明。
- 模型生成的学习内容仍需逐样本核对，不能从这些样本推出未来内容的形式正确性。固定 main 仍依赖两项未上游合入的宿主补丁；PR19 保持 Draft，直到独立评审与发布依赖处理完成。

最近一次固定 main Gateway、测试与文件矩阵的 [CI 运行](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/actions/runs/42348856049) 均通过；后续提交仍以 PR 页面的对应检查为准。夹具用合成钉钉入口和确定性模型；上述双人／群聊结论来自 WSL 真实运行，二者不混为一项证据。原始测试请求、回执和本地后台核验结果保存在 `C:/Users/andy.wang/Desktop/repo/wsl-openclaw-e2e-20261104/native-e2e-1107/`；跨执行模式的脱敏后台证据为 `audit-pr19-host-tool-1107.json`，不公开个人会话原文。
