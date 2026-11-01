# 按会话范围学习可复用技能

## 结论与适用边界

同一可信团队共用一个钉钉 agent，且希望复用现有 memory-scope 时，采用 **scoped 前台工具 + 无工具后台复盘 + 插件校验提交**。事实和偏好继续写当前范围的 MEMORY；可复用操作流程生成真正的 `SKILL.md` 及配套文件。没有修改 OpenClaw 安装目录或上游 Workshop 的路径。

这不是敌对租户的安全沙箱。需要抵御拥有 exec/read 等通用工具的用户时，应拆分 Gateway/运行身份及文件权限；仅拆 session 或注入提示词不够。群会话是否共享学习成果沿用 `groupSessionScope`：`group` 共享群范围，`group_sender` 按群内发送者分开。相同 workspace 下不同钉钉账号另行分区。

## 本轮调研依据

- 读取远程设备 790442262 的 `C:\Users\andy\.cursor\plans\scoped_self-learning_research_d146a4bf.plan.md`。
- 远程 connector checkout：`ffd8359ecb58c1357941a8ced2be51fec61822d8`；运行中的 OpenClaw 安装包版本：`2026.10.9`。
- 实施基线为社区仓库 `main` 的 `b1d393f2d210f2ad55c603137c117c0c7b910b29`，不夹带对方反馈卡片和 WSL 工作区的其它变更。
- 直接检查了 OpenClaw 2026.10.9 安装包中的 `server-plugins-CmWlaULD.mjs`、`server-plugin-runtime-client-CjNl2Aeh.mjs` 和 `config-contracts-DzLaG7FV.d.ts`，并用同版本 npm 包编译验证接口。

参考上游：[自学习](https://docs.openclaw.ai/tools/self-learning)、[技能及可见范围](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/tools/skills.md)、[插件运行时源码](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/gateway/server-plugins.ts)、[信任模型](https://docs.openclaw.ai/gateway/security/trust-model)。具体接口以安装包为准，不能把最新网页与旧版本 SDK 混用。

原计划方向正确，但有几处必须更正：

| 原计划 | 核查结果与决定 |
| --- | --- |
| `disableTools: true` 配合 `toolsAlsoAllow` 仅允许 scoped 工具 | 2026.10.9 明确抛错，二者不能共用；单独 `toolsAlsoAllow` 是增加工具，不是缩减到单一工具。改用原生 `subagent.complete`，该接口执行无工具的隔离推理，支持超时与取消。 |
| `agent_end` 累计模型 iterations | 该事件没有 iteration 字段；`llm_output` 在 embedded runner 也可能是一整个 attempt 的汇总。使用 `model_call_ended` 的 completed 事件计数，成功的 `agent_end` 才安排复盘；不把累计 transcript 的 assistant 条数反复相加。 |
| 后台通过新会话 Map 绑定 scope | 无工具 completion 不创建学习 agent 会话；目标 store 来自主机会话上下文，模型只返回结构化建议，不接受 scope/path/recipient。 |
| 写技能后立即覆盖原文件 | 完整 bundle 先写到新版本目录，再原子切换 `head.json`；读者不会看到半份技能，旧版本支持撤销。 |
| 隔离只复用目录字符串 | 加入账号与原始 scope 身份摘要，避免账号复用和路径清洗碰撞；校验目录、链接、名称及文件大小。 |
| Memory 隔离 PR #47277 仍 OPEN | 本轮查询时为 CLOSED，且没有合入；不能作为即将可用的依赖。见 [PR #47277](https://github.com/openclaw/openclaw/pull/47277)。 |
| 完全等同官方学习 | 不能这样宣称。过程学习、自动复盘、隔离加载、撤销实现了；warm-fork、Control UI、draft/propose、diet 和原生 `/learn` 不在本实现中。 |

其它方案的取舍：一人一 agent 能直接复用原生 Workshop，但需要相应路由、独立 workspace 和 agent 运维；仅写 scoped MEMORY 无法形成可复用技能；修改上游 Workshop 内部路径会绑定私有实现。这里选择插件方案，是为了保留当前共享 agent 的部署方式，同时把模型推理与文件修改的权限分开。

## 启用

要求 OpenClaw **2026.10.9 或更高版本**，并满足该版本的 Node 要求。默认不启用 scoped learning，也不会自动改全局设置。

在现有配置中合并：

```json5
{
  skills: { workshop: { autonomous: { mode: "off" } } },
  plugins: {
    entries: {
      "dingtalk-connector": {
        hooks: { allowConversationAccess: true, allowPromptInjection: true }
      }
    }
  },
  channels: {
    "dingtalk-connector": {
      memoryScope: {
        enabled: true,
        scopedLearning: {
          enabled: true,
          mode: "auto",
          reviewAfterIterations: 10,
          reviewIdleMs: 30000
        }
      }
    }
  }
}
```

还需让现有工具策略允许 `scoped_skill_workshop`。插件在主机完成工具策略过滤后才注入技能目录；工具被禁用时不安排复盘。钉钉作用域内的全局 `skill_workshop` 会被拦截。`mode: "off"` 停止后台复盘，保留前台显式学习；`enabled: false` 关闭整个功能。

`autonomous.mode=off` 不会隐藏之前已经存在的原生 agent Workshop 技能。这些原生技能仍遵循上游的可见范围，管理员应在启用前检查、按需要归档；本插件不会自动删除或迁移它们。

## 使用与落盘

可以要求 agent「把刚验证成功的操作方法保存为当前范围的技能」，或「查看已经学到的技能」。工具提供 `list`、`view`、`save`、`archive`、`restore`。

`save` 一次提交完整 bundle，`files` 内支持 references/templates/scripts/assets；通过下一次 save 添加、替换或删除配套文件，无需复制上游全部工具动作。更新必须带上 view 返回的 revision，新建使用 null。`restore` 撤销最近一次修改，支持撤销创建及归档。

```text
<workspace>/<memory-scope>/workshop-skills/<account-and-scope-digest>/
  <skill-name>/
    head.json
    versions/<revision-id>/
      SKILL.md
      skill.json
      references/...
```

`skill.json` 是该不可变版本的完整 bundle；`SKILL.md` 是同一版本生成的标准技能文件。请通过工具修改，不要直接编辑版本目录。只有 head 指向的版本出现在当前 scope 的技能清单里。支持 10 步 undo，旧版本在后续写入/复盘时回收；中断留下的未引用版本不会被加载。

后台仅接受一项 `save`、`archive` 或 `nothing`，不执行技能中的脚本。单技能正文 40 KB，最多 16 个配套文本文件、bundle 128 KB、每 scope 最多 64 个技能名。输入只取最近至多 64 条 user/assistant 文本并限制为 32 KB，不复制原始工具结果。支持文件可在前台维护，后台更新也必须保留需要的文件。

## 后台生命周期与实际差异

- 计数到阈值后等待该会话空闲；插件内复盘串行。新一轮前台活动、前台技能修改、会话 reset/end、关闭功能或 Gateway 停止会取消或使旧任务失效。
- 提交前再次检查会话身份、配置和整个 store 的快照；其它会话的修改、创建后撤销也会使旧建议失效。
- 复盘失败不写文件、不自动重试，并冷却 15 分钟；Gateway 重启会清空计数和待运行任务，已保存的技能及 undo 保留。
- 复盘后，30 天未通过 view 使用的技能会被归档，可恢复。不是每天另起定时器扫描所有用户目录。
- 自动变更通知在同一 scope 的下一次前台提示中提供，让 agent 告知 Learned/归档及 restore 方法；不在后台重用过期 webhook 或猜测消息收件人。通知队列是进程内的，重启可能丢通知，但不会丢技能。
- 使用该 agent 配置的模型；不是保留前台 warm-fork，也不是保证逐请求使用相同 provider。官方 Control UI、原生 `/learn`、propose/draft、diet 均未接管。无需为此 patch 上游。

## 验证

`npm test` 包含存储边界与真实 hooks→调度→存储→提示加载→undo 的集成测试，仅模型 completion 被替换为可控结果；没有把 mock 测试当成真实模型学习质量验收。

重点覆盖用户/账号/群内发送者隔离、链接与路径逃逸、坏 manifest 保护、版本恢复及回收、迟到结果、其它会话修改、策略禁用、session reset、配置关闭和 Gateway 停止。线上效果还需在隔离测试账号中以真实模型和真实会话进行验收；本 PR 不部署、重启或修改现网配置。

2026-11-02 本地验证：`npm test` 的 339 项 Vitest 测试通过（含本功能 27 项），guidance 20 项通过、1 项因 Windows 文件符号链接权限跳过；严格 scoped TypeScript 检查、标准 build、真实 SDK 加载打包入口并注册/写入工具的 1 项 package 冒烟通过。全仓类型检查仍有基线问题：同一依赖环境下 main 为 48 项，本分支 47 项，差异仅为修复 memory-scope 的过期 SDK 导入。新增 Windows/Linux CI 使用 Node 24.22.1；本地没有启动真实 Gateway 或调用生产模型。
