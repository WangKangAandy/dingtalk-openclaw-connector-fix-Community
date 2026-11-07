# 真实双人、双群与沙箱验收

更新：2026-11-07。验收对象是按人／群隔离的记忆和 **Workshop 自学习成果**，不包括面向所有用户安装的普通 skills。标准是私聊按人隔离、同群共享、私聊与群聊及不同群互相隔离。

当前 WSL 运行 OpenClaw main `dad4fc1a`，加未合入的 [#191205](https://github.com/openclaw/openclaw/pull/191205) 沙箱事实投影和 `/learn` 沙箱兼容补丁；Connector 与独立 Workshop 代码均为 `89a4a4cd5dcac08086851f02617a842ce332ad1c`。Gateway 已重启，钉钉 Stream 已连接，替代 Workshop 已加载，官方 `skill-workshop` 已禁用。实机配置 SHA-256 为 `acb14e6b981ce4375414741117049236a37e895acb5854f118022825860a7092`；[配置文档](scoped-runtime-wsl.md)与其逐项核对。

## 结果

| 场景 | 结果 | 后台依据 |
|---|---|---|
| 私聊记忆按人隔离 | 通过 | 王康与管佳慧的真实入站 userId 进入不同 namespace；同名键读写互不影响；首次无 revision 的新键 `put` 成功，旧键无 revision 覆盖被 CAS 拒绝，原值未变 |
| 同群共享、私聊／群聊和跨群隔离 | 通过 | 两人分别 @ 小呆，群记忆由另一成员读回；私聊读不到群值。第二临时群写同名键后原群值不变；临时群测试后已解散 |
| 前台自学习工具与 `/learn` | 通过 | `skill_workshop` 的 create/view/restore 在真实私聊和群聊调用并核对版本、actor 与 namespace；沙箱里的 `/learn` ipaddress、decimal 正反例及 undo 实际生效 |
| 私聊后台自主学习阳性 | 通过 | 管佳慧私聊的 Python 断言流程触发原生 `runForkedTurn`，日志 `settled=true changes=1`；落盘 `exec-python-assertion-checks` 的 actor 为本人、sessionId 为本人私聊；王康私聊和测试群 view 均返回 null |
| 群聊后台自主学习阳性 | 通过 | 管佳慧在测试群两次运行 CSV 往返断言，原生 fork `settled=true changes=1`；`python-csv-roundtrip-verify` 落在群 namespace，王康在同群 view 到 revision `a773354d-005d-496c-aa08-803e1e4b4e4b`，管佳慧私聊 view 为 null |
| 用户明确要求“不学习” | 通过本轮私聊及群聊样本 | 私聊 12 条、复测 6 条与群聊 Fraction 样本均触发真正的原生复盘，`settled=true changes=0`，相应技能目录没有新增版本；并非仅凭机器人回复判断 |
| 自学习正文忠实于工具证据 | 通过已核样本 | 私聊技能写明第一次 `exec` 被宿主预检拒绝、改为直接 `python3` 后两次 `exitCode=0`；群技能的源码、两次 nested exec 结果及保存正文一致。CSV 字段经 Python 求值含真实换行码点 10，保存示例也相同 |
| 伪造身份／跨范围版本 | 通过负例 | 伪造 userId、scope 和借用别的范围 revision 被工具层拒绝，存储哈希不变；宿主绑定真实发言人，模型不能选另一个 profile |
| DWS 私聊及同群身份 | 通过已测操作 | 王康、管佳慧的独立 WSL 登录态各自 `corp_id/user_id/token_valid` 核对；两人私聊及同群 `dingtalk_dws contact +me` 返回各自身份，群主身份未覆盖发言人 |
| 正常文本、PNG 与群附件 | 通过已测发送链路 | 沙箱生成后由 `dingtalk_send_file(workspaceRelativePath)` 上传；私聊 PNG 从接收方下载并与源文件 SHA-256 一致，群文本文件收到平台回执；旧 `path` 参数的现存会话兼容调用也成功 |
| 沙箱、只读公共挂载与脚本绕行 | 通过已测边界 | 实际 Docker 只有独立 workspace、只读 skills/knowledge，`network=none`；公共文件可读不可写，宿主配置不可见；`host:"gateway"`、`elevated:true`、符号链接文件外发均被拒绝 |
| [#191205](https://github.com/openclaw/openclaw/pull/191205) 沙箱事实 | 通过本轮固定版本对照 | parent/head 回归及 Gateway/Docker 对照覆盖沙箱开启和关闭，当前实机在 `mode=all` 下使用该补丁；它仍是未合入上游的部署依赖 |

判断依据是入站身份、Code Mode 的实际 toolCall 参数、nested-tool 结果及退出码、原生复盘日志、存储版本和接收文件哈希。被测试的第二用户私人技能只出现在 `v1-99913e...`；群技能只出现在 `v1-2f6c6e...`。后台保存由 Workshop fork 调用，Connector 只授予可信范围与存储能力。

## 交付边界

- **首次工具调用并非全程无错。** 私聊阳性任务第一次使用 `python3 ...; echo EXIT=$?`，被 OpenClaw Code Mode 预检正确拒绝；模型随后直接调用 `python3 <file>` 两次成功。根因是模型构造了不符合宿主预检的复合命令，Connector 没有执行该命令，也没有把失败当成验证成功。保存的技能记录了这一修正。其他已记录的首次附件参数错误同属模型调用准确率，当前 canonical `workspaceRelativePath` 和旧 `path` 兼容均已验证。
- 沙箱保护依赖上述 OpenClaw 配置与镜像，不是 Connector 文件 ACL。曾在 `sandbox=off` 对人为测试数据库证明同 UID 的 shell 可绕过插件存储边界；当前部署的容器对照阻断了该路径。没有递归删除真实公共 Workshop，也没有向第二用户发送数据库正文。
- DWS 验证覆盖双人 `contact +me` 和受控附件发送，不能外推到所有 DWS 产品或写操作。文本附件确认平台投递，PNG 另做下载哈希核对；不把文本回执写成下载哈希证明。
- 模型生成的学习内容仍需逐样本核对，不能从这些样本推出未来内容的形式正确性。固定 main 仍依赖两项未上游合入的宿主补丁；PR19 保持 Draft，直到独立评审与发布依赖处理完成。

当前 PR19 [CI 运行](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/actions/runs/42321164544) 及文件矩阵的 7 个 job 均通过，包含固定 main 的 Gateway 夹具。夹具用合成钉钉入口和确定性模型；上述双人／群聊结论来自 WSL 真实运行，二者不混为一项证据。原始测试请求、回执和本地后台核验结果保存在 `C:/Users/andy.wang/Desktop/repo/wsl-openclaw-e2e-20261104/native-e2e-1107/`，不公开个人会话原文。
