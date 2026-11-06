import { scopedWorkshopSelected } from "../scope-policy.js"
type LearnCommand = { kind: "reply" | "prompt"; text: string }
/** Keep native /learn intact. The replacement Workshop owns its semantics. */
export function resolveScopedLearnCommand(text: string, config: unknown, _agentId?: string): LearnCommand | null {
  if (!/^\/learn(?:\s|$)/i.test(text.trim())) return null
  if (scopedWorkshopSelected(config)) return null
  return { kind: "reply", text: "当前未启用独立的 scoped Workshop 插件，未执行学习或修改技能。请安装并启用 dingtalk-scoped-workshop，同时禁用原生 skill-workshop；Connector 不会另起复盘或回退到全局学习。" }
}
