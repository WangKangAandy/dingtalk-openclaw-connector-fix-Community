import {
  AICardStatus,
  drainCardWrites,
  updateAICardParams,
  type AICardInstance,
} from "../services/messaging/card.ts";
import type { DingtalkConfig } from "../types/index.ts";
import {
  appendProcessLine,
  formatItemEventLine,
  formatPlanUpdateLine,
  formatReasoningText,
  formatToolStartLine,
} from "./format.ts";
import {
  canWriteFlowExecuting,
  canWriteProcessText,
  createCardExecPreviewSession,
  markContentStarted,
  markTerminal,
  type CardExecPreviewSession,
} from "./session.ts";
import type { CardExecPreviewLog, ResolvedCardExecPreviewConfig } from "./types.ts";

const PROCESS_THROTTLE_MS = 1500;
const REASONING_THROTTLE_MS = 800;

export type CardExecPreviewController = {
  session: CardExecPreviewSession;
  /** Sync gate before first streamAICard; drains in-flight process PUTs (A1+A2). */
  prepareContentStream: (card: AICardInstance | null | undefined) => Promise<void>;
  markClosed: () => void;
  onToolStart: (payload: { name?: string; phase?: string }) => void;
  onItemEvent: (payload: {
    title?: string;
    name?: string;
    phase?: string;
    status?: string;
    summary?: string;
    progressText?: string;
  }) => void;
  onPlanUpdate: (payload: {
    title?: string;
    explanation?: string;
    phase?: string;
    steps?: string[];
  }) => void;
  onReasoningStream: (payload: { text?: string }) => void;
  pushProcessLine: (line: string) => void;
};

export type CreateCardExecPreviewControllerOpts = {
  config: ResolvedCardExecPreviewConfig;
  getCard: () => AICardInstance | null | undefined;
  dingtalkConfig: DingtalkConfig;
  log?: CardExecPreviewLog;
};

export function createCardExecPreviewController(
  opts: CreateCardExecPreviewControllerOpts,
): CardExecPreviewController {
  const session = createCardExecPreviewSession();
  const { config, getCard, dingtalkConfig, log } = opts;

  const flushProcess = (force = false) => {
    if (!config.processVar) return;
    if (!canWriteProcessText(session)) return;
    const card = getCard();
    if (!card) return;
    const now = Date.now();
    if (!force && now - session.lastProcessPushAt < PROCESS_THROTTLE_MS) return;
    session.lastProcessPushAt = now;
    const params: Record<string, string> = {
      [config.processVar]: session.processText,
    };
    const includeExecuting = canWriteFlowExecuting(session) && !session.executingSent;
    if (includeExecuting) {
      session.executingSent = true;
      if (session.phase === "idle") session.phase = "executing";
    }
    void updateAICardParams(
      card,
      {
        ...(includeExecuting ? { flowStatus: AICardStatus.EXECUTING } : {}),
        params,
      },
      dingtalkConfig,
      log,
    ).catch((err: unknown) => {
      log?.debug?.(
        `[card-exec-preview] process push failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };

  const flushReasoning = (force = false) => {
    if (!config.reasoningVar) return;
    if (!canWriteProcessText(session)) return;
    const card = getCard();
    if (!card) return;
    const now = Date.now();
    if (!force && now - session.lastReasoningPushAt < REASONING_THROTTLE_MS) return;
    session.lastReasoningPushAt = now;
    const params: Record<string, string> = {
      [config.reasoningVar]: session.reasoningText,
    };
    const includeExecuting = canWriteFlowExecuting(session) && !session.executingSent;
    if (includeExecuting) {
      session.executingSent = true;
      if (session.phase === "idle") session.phase = "executing";
    }
    void updateAICardParams(
      card,
      {
        ...(includeExecuting ? { flowStatus: AICardStatus.EXECUTING } : {}),
        params,
      },
      dingtalkConfig,
      log,
    ).catch((err: unknown) => {
      log?.debug?.(
        `[card-exec-preview] reasoning push failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };

  const pushProcessLine = (line: string) => {
    if (!config.processVar) return;
    if (!canWriteProcessText(session)) return;
    const next = appendProcessLine(session.processText, line);
    if (next === session.processText) return;
    session.processText = next;
    flushProcess();
  };

  return {
    session,
    async prepareContentStream(card) {
      // A1: sync before any await
      markContentStarted(session);
      if (!card?.cardInstanceId) return;
      // A2: wait for in-flight process PUTs that may still carry flowStatus=4
      try {
        await drainCardWrites(card.cardInstanceId);
      } catch {
        /* ignore */
      }
    },
    markClosed() {
      markTerminal(session);
    },
    onToolStart(payload) {
      try {
        const line = formatToolStartLine(payload);
        if (line) pushProcessLine(line);
      } catch (err) {
        log?.debug?.(
          `[card-exec-preview] onToolStart ignored: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    onItemEvent(payload) {
      try {
        const line = formatItemEventLine(payload);
        if (line) pushProcessLine(line);
      } catch (err) {
        log?.debug?.(
          `[card-exec-preview] onItemEvent ignored: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    onPlanUpdate(payload) {
      try {
        const line = formatPlanUpdateLine(payload);
        if (line) pushProcessLine(line);
      } catch (err) {
        log?.debug?.(
          `[card-exec-preview] onPlanUpdate ignored: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    onReasoningStream(payload) {
      try {
        if (!config.reasoningVar) return;
        if (!canWriteProcessText(session)) return;
        const text = formatReasoningText(payload.text || "");
        if (!text || text === session.reasoningText) return;
        session.reasoningText = text;
        flushReasoning();
      } catch (err) {
        log?.debug?.(
          `[card-exec-preview] onReasoningStream ignored: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    pushProcessLine,
  };
}
