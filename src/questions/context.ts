import { AsyncLocalStorage } from 'node:async_hooks';
import type { DingtalkConfig } from '../types/index.ts';
export const QUESTION_BINDING = 'dingtalk.questions.v1';

export type DingtalkQuestionScope = {
  accountId: string;
  conversationId: string;
  senderId: string;
  sessionKey?: string;
};

export type DingtalkQuestionContext = DingtalkQuestionScope & {
  agentId: string;
  sessionKey: string;
  bindingToken?: string;
  /** 由原始可信路由计算的宿主策略会话别名；不能来自工具参数或卡片回调。 */
  trustedToolSessionKeys?: readonly string[];
  /** 新入站消息到达后，旧生成不能再创建可用表单。 */
  isCurrent?: () => boolean;
  /** Fork hard scope validates the opaque Host token and captures only source liveness. */
  captureSourceGuard?: (toolContext: any) => () => void;
  assertSendCurrent?: () => void;
  isDirect: boolean;
  config: DingtalkConfig;
  /** 仅触发当前运行中止；不能等待包含本工具的派发任务结束。 */
  stopCurrentGeneration: () => void | boolean | Promise<void | boolean>;
  /** 使用保存的原始路由继续会话，不接受回调指定目标。 */
  resume: (answer: string, questionId: string) => Promise<void>;
  log?: { warn?: (message: string) => void };
};

const storage = new AsyncLocalStorage<DingtalkQuestionContext>();
const active = new Set<DingtalkQuestionContext>();

export async function withDingtalkQuestionContext<T>(
  context: DingtalkQuestionContext,
  callback: () => Promise<T>,
): Promise<T> {
  active.add(context);
  try {
    return await storage.run(context, callback);
  } finally {
    active.delete(context);
  }
}

export function captureQuestionContext(): DingtalkQuestionContext | undefined {
  return storage.getStore();
}

function matches(context: DingtalkQuestionContext, toolContext: any): boolean {
  if(context.bindingToken && toolContext.toolBindings?.[QUESTION_BINDING] !== context.bindingToken)return false;
  const trustedIdentity = toolContext.messageChannel === 'dingtalk-connector'
    && toolContext.agentAccountId === context.accountId
    && toolContext.requesterSenderId === context.senderId;
  const matchesSession = !toolContext.sessionKey || toolContext.sessionKey === context.sessionKey
    || (context.isDirect && trustedIdentity && context.trustedToolSessionKeys?.includes(toolContext.sessionKey) === true);
  return matchesSession
    && (!toolContext.agentId || toolContext.agentId === context.agentId)
    && (!toolContext.messageChannel || toolContext.messageChannel === 'dingtalk-connector')
    && (!toolContext.agentAccountId || toolContext.agentAccountId === context.accountId)
    && (!toolContext.requesterSenderId || toolContext.requesterSenderId === context.senderId);
}

/** 宿主可能缓存工具；旧工具不能复用已经结束的会话上下文。 */
export function resolveQuestionContext(
  toolContext: any,
  captured?: DingtalkQuestionContext,
): DingtalkQuestionContext | undefined {
  const checked = (context: DingtalkQuestionContext) => {
    try {
      const assertCurrent = context.captureSourceGuard?.(toolContext);
      if (!assertCurrent) return context;
      return { ...context, isCurrent: () => {
        try { assertCurrent(); return context.isCurrent?.() !== false; } catch { return false; }
      }, resume: async (answer: string, questionId: string) => {
        assertCurrent(); await context.resume(answer, questionId);
      } };
    } catch { return undefined; }
  };
  const current = storage.getStore();
  if (current && active.has(current) && matches(current, toolContext)) return checked(current);
  if (captured && active.has(captured) && matches(captured, toolContext)) return checked(captured);
  // 跨异步边界时只接受宿主提供的完整身份；出现歧义时拒绝发送。
  if (!toolContext.sessionKey || !toolContext.requesterSenderId
    || !toolContext.agentAccountId || toolContext.messageChannel !== 'dingtalk-connector') return undefined;
  const candidates = [...active].filter((item) => matches(item, toolContext));
  return candidates.length === 1 ? checked(candidates[0]) : undefined;
}
