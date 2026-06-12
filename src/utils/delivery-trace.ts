/**
 * 钉钉消息投递链路追踪日志。
 *
 * 目标：当用户侧出现「消息乱序 / 半截 / 重复」时，能从 openclaw 日志文件
 * 按 seq 还原完整投递时间线（不依赖 connector debug console 输出）。
 *
 * 日志格式固定前缀：[DingTalk][delivery-trace]，便于 grep。
 */

type RuntimeLog = {
  log?: (...args: unknown[]) => void;
};

export type DeliveryTraceState = {
  sessionClosed: boolean;
  hasCard: boolean;
  accumulatedTextLen: number;
  streamingEnabled: boolean;
  cardInstanceId?: string;
};

export type DeliveryTracer = {
  trace: (traceEvent: string, fields?: Record<string, unknown>) => void;
  reset: () => void;
};

export function previewText(text: string, n = 48): {
  textLen: number;
  textHead: string;
  textTail: string;
} {
  const normalized = text.replace(/\s+/g, " ").trim();
  return {
    textLen: text.length,
    textHead: normalized.slice(0, n),
    textTail: normalized.length > n ? normalized.slice(-n) : normalized,
  };
}

export function createDeliveryTracer(params: {
  runtime: RuntimeLog;
  conversationId: string;
  senderId: string;
  isDirect: boolean;
  getState: () => DeliveryTraceState;
}): DeliveryTracer {
  let seq = 0;
  let replyCycleId = "";

  const trace = (traceEvent: string, fields: Record<string, unknown> = {}) => {
    seq += 1;
    params.runtime.log?.(
      `[DingTalk][delivery-trace] ${JSON.stringify({
        event: "dingtalk_delivery_trace",
        seq,
        replyCycleId,
        ts: new Date().toISOString(),
        conversationId: params.conversationId,
        senderId: params.senderId,
        isDirect: params.isDirect,
        traceEvent,
        state: params.getState(),
        ...fields,
      })}`,
    );
  };

  const reset = () => {
    seq = 0;
    replyCycleId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    trace("reply_cycle_start");
  };

  return { trace, reset };
}
