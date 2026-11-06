# Agent 文档与规则治理

## 来源与加载

| 内容 | 维护入口 | 加载方式 |
| --- | --- | --- |
| DWS 登录、身份与路由 | skills/dingtalk-channel-rules/SKILL.md | 按技能目录路径读取正文；非自动常驻正文 |
| 渠道信任、sandbox 文件边界 | guidance/dingtalk/dws-openclaw.md | 官方 agent-guidance；登录流程只指向上项 |
| 当前请求身份 | 入站可信 ChannelContext 与 resolve_exec_env | 结构化宿主字段；提示文字不能生成权限 |
| 偏好与学习 | scoped_memory / scoped_skill_workshop | 运行时授权；不把共享 MEMORY 当工具回退 |
| 排障步骤 | skills/dingtalk-troubleshoot/SKILL.md | 按需读取；复用渠道规则的授权前提 |
| 历史设计 | docs/DWS_AUTH_ARCHITECTURE.md | 维护者档案，不是当前操作步骤 |

OpenClaw 的技能目录只保证提供名称、描述与位置，不保证正文常驻。顶层 `alwaysActive` 不是已核验的加载契约。去重依靠明确加载指针和来源边界，不能只删除说明后假定模型已看到另一份正文。

## 升级与合入顺序

- #20 提供 exec shim；#21 基于 #20；#22 基于 #21。文档不能先宣称 #20 已部署，也不能把三者混成一个独立可部署补丁。
- `guidance setup` 默认保留已有规则。升级先比对已安装可编辑规则、保留本地定制，再人工合并；仅经确认需要替换时使用 `--overwrite-rules`。重复 setup 不证明旧规则已更新。
- 检查目标 Agent 技能可见性、读取路径与插件策略；不要靠设置 `metadata.always` 强行绕过技能资格筛选。
- `dws` 来自官方 dingtalk-workspace-cli；安装 profile shim 与检查版本不等于已安装 CLI 或官方产品技能。不要执行历史 `scripts/install-community-dws.js` 来满足新规则。
- 维护者说明不能放入 live AGENTS，也不能将整个 docs 目录交给 agent-guidance。具体 workspace 发布归部署仓唯一引擎负责。

## 验证边界

本地 guidance 测试覆盖新装、默认保留、显式覆盖、官方 reload 失败，不等于线上部署。DWS shim 的专项测试见 [exec 身份绑定](dws-exec-identity.md)。真实入站/Gateway 与沙箱验证必须固定 OpenClaw 版本并单独报告；共享凭据与任意 shell 访问不是此文档或 shim 能提供的安全隔离。
