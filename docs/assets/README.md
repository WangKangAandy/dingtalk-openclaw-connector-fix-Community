# 原生问题表单

`dingtalk-ask-user-card-template.json` 来自 soimy/openclaw-channel-dingtalk 的固定提交 `8a73a59fd8513a89e5f2219adaec61c7c4ceab9a`，通过官方 connector `88df00ee594072e9941ef3f71da90a37f3291ad3` 原样引入。MIT 版权和许可见 [第三方声明](../../THIRD_PARTY_NOTICES.md)。

默认公共模板 ID 为 `c2a6355b-9724-4f7e-9653-d33fcb3311bb.schema`。应用需要卡片创建、投放、更新权限与 Stream 卡片回调；模板可用性取决于钉钉平台授权。本文件也可导入自己的模板，并配置 `questionCardTemplateId`。

模板变量：`question_id`、`question_title`、`question_desc`、`card_status`、`form_btn_text`、`selected_text`、`selected_values`、`form`。提交通过 `cardPrivateData.actionIds[0]` 标识问题，`cardPrivateData.params.form` 携带字段值。操作人只认平台事件信封里的 `userId`。

工具 `dingtalk_ask_user_question` 只向当前会话发起人提问；不接受回调指定目标。问题默认 5 分钟过期，`questionTimeoutMs` 可设 10000–1800000。新消息、停止、权限/会话失效使旧问题不能续聊。重启不恢复问题执行，旧卡视为过期。每个进程最多 256 个待答问题。

回答续聊使用当时最新的配置，重新检查账号、权限、agent 与 SessionKey，并创建独立回执。硬作用域还校验 Host 的不透明准入绑定与会话生命期；旧工具调用结束不会把它变成新的执行能力。表单只收集用户输入，不授予额外工具执行权限。

测试验证了表单 JSON、状态机、真实消息入口与回执接线；没有声称验证了真实钉钉客户端的视觉渲染。
