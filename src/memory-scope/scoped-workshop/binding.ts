import { parseDingtalkMemoryScope } from "../session-scope.ts"
import { WorkshopStore } from "./storage.ts"

export type LearningContext = {
  sessionKey?: string; sessionId?: string; workspaceDir?: string; agentId?: string;
  accountId?: string; agentAccountId?: string; sandboxed?: boolean; trigger?: string;
}

export function workshopBinding(ctx: LearningContext): { key: string; store: WorkshopStore } | null {
  if (ctx.sandboxed || !ctx.sessionKey || !ctx.workspaceDir) return null
  if (/:(subagent|cron|heartbeat|hook):/.test(ctx.sessionKey)) return null
  if (ctx.trigger && /cron|heartbeat|hook|subagent/.test(ctx.trigger)) return null
  const scope = parseDingtalkMemoryScope(ctx.sessionKey)
  if (!scope) return null
  const parts = ctx.sessionKey.toLowerCase().split(":")
  const keyAccount = parts[3] === "direct" || parts[3] === "group" ? "default" : parts[3]
  const account = ctx.agentAccountId || ctx.accountId || keyAccount
  const store = new WorkshopStore(ctx.workspaceDir, scope.scopeDir, `${account}\0${scope.chatType}\0${scope.peerId}`)
  return { key: `${store.root}\0${ctx.sessionKey}\0${ctx.sessionId ?? ""}`, store }
}
