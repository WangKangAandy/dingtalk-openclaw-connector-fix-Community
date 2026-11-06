# DWS exec 身份绑定

本实现为钉钉会话中的普通 `dws` 调用选择官方账号，防止误用当前宿主默认 profile。它不是任意 shell 命令或共享凭据目录的安全沙箱。

## 数据链

可信入站 `senderStaffId` 与 `chatbotCorpId`（或已配置的机器人企业绑定）进入 `ChannelContext.sender`；`resolve_exec_env` 从本轮宿主上下文生成 `DWS_PROFILE=corpId:senderStaffId`、对应 sender/corp 字段和绑定标记。缺失、加密或不合法身份不生成有效绑定。插件不读取 profiles.json，不修改进程全局环境，不从会话名称或正文推导身份。

`before_tool_call` 在本轮钉钉 exec 中选择已安装的 shim。POSIX 使用命令级 PATH；Windows PowerShell 使用本次 shell 内的 dws 函数调用 Node shim，真实 CLI 必须为官方可执行文件 `dws.exe`。其他渠道不被插件改写。

shim 与插件共享一份参数实现：业务命令移除所有调用方 profile 选项后插入唯一精确 profile；首次 `auth login` 移除 profile 选项，支持全局 `-f` / `--format` 等合法位置。缺少完整本轮绑定时退出 78。交互式运维命令不被继承环境重新绑定。

## 支持边界

- 执行端必须具备 Node、shim 及相邻的 `dws-profile-args.mjs`、官方 dws 和获授权的用户 profile。安装 shim 不是安装官方 dws；CLI 与官方技能由部署流程另行安装和验证。
- 此补丁验证网关本机 POSIX / Windows PowerShell 的直接 `dws` 调用。容器、sandbox、远程节点没有自动部署 shim 或授权配置；不可宣称开箱即用，不可通过暴露宿主共享凭据目录或切到宿主 exec 绕过策略。
- 绝对路径调用另一份 dws、内层重新设置 PATH 的 shell、自定义脚本或篡改环境不在 shim 防护范围。需要不可绕过的多租户权限边界时，应由受控工具/宿主凭据隔离实现，而不是扩大命令字符串匹配。
- 子任务、后台任务必须由宿主明确传播可信来源。没有本轮来源时不能沿用最近用户身份。
- 登录与主体确认的唯一操作说明在 `skills/dingtalk-channel-rules/SKILL.md`。

## 验证

`node --experimental-strip-types --test tests/dws-exec-identity/shim.test.mjs` 验证安装后的真实 shim、可执行文件 argv、含空格路径、PowerShell/POSIX shell、首次登录和缺身份拒绝。Windows 使用系统 .NET Framework C# 编译器生成无网络的假 CLI；Linux 使用 Node 脚本。测试不会登录钉钉，也不会访问真实用户授权。

`vitest run tests/dws-exec-identity/dws-exec-identity.test.ts tests/utils/dws-official-auth.test.ts` 覆盖重复 profile、各类 flag 位置、其他渠道、缺企业、身份冲突及并发请求。

这些检查不能替代目标 OpenClaw 版本的真实入站 → exec 集成验证；原 PR 的 scoped-learning Gateway CI 也不是该链的专项证明。
