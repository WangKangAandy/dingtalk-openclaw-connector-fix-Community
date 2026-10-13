import {
  AICardStatus,
  updateAICardParams,
  type AICardInstance,
} from "../services/messaging/card.ts";
import type { DingtalkConfig } from "../types/index.ts";
import {
  appendProcessLine,
  formatPlanUpdateLine,
  formatReasoningText,
  formatToolStartLine,
} from "./format.ts";
import type { CardExecPreviewLog, ResolvedCardExecPreviewConfig } from "./types.ts";

const PROCESS_THROTTLE_MS = 1500;
const REASONING_THROTTLE_MS = 800;

/** Per-reply lifecycle gates (not an Agent state machine). */
export type CardExecPreviewPhase = "idle" | "executing" | "contentStarted" | "terminal";

export type CardExecPreviewSession = {
  phase: CardExecPreviewPhase;
  processText: string;
  reasoningText: string;
  lastProcessPushAt: number;
  lastReasoningPushAt: number;
  executingSent: boolean;
};

export function createCardExecPreviewSession(): CardExecPreviewSession {
  return {
    phase: "idle",
    processText: "",
    reasoningText: "",
    lastProcessPushAt: 0,
    lastReasoningPushAt: 0,
    executingSent: false,
  };
}

export function markContentStarted(session: CardExecPreviewSession): void {
  if (session.phase === "terminal") return;
  session.phase = "contentStarted";
}

export function markTerminal(session: CardExecPreviewSession): void {
  session.phase = "terminal";
}

export function canWriteFlowExecuting(session: CardExecPreviewSession): boolean {
  return session.phase === "idle" || session.phase === "executing";
}

export function canWriteProcessText(session: CardExecPreviewSession): boolean {
  return session.phase !== "terminal";
}

export type CardExecPreviewController = {
  session: CardExecPreviewSession;
  /** First content write: stop flowStatus=4 and flush buffered process/reasoning. */
  prepareContentStream: (card: AICardInstance | null | undefined) => void;
  markClosed: () => void;
  onToolStart: (payload: { name?: string; phase?: string }) => void;
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

  const flushField = (
    kind: "process" | "reasoning",
    force = false,
    cardOverride?: AICardInstance | null,
  ) => {
    const varName = kind === "process" ? config.processVar : config.reasoningVar;
    if (!varName) return;
    if (!canWriteProcessText(session)) return;
    const card = cardOverride ?? getCard();
    if (!card) return;

    const now = Date.now();
    const lastAt = kind === "process" ? session.lastProcessPushAt : session.lastReasoningPushAt;
    const throttle = kind === "process" ? PROCESS_THROTTLE_MS : REASONING_THROTTLE_MS;
    if (!force && now - lastAt < throttle) return;
    if (kind === "process") session.lastProcessPushAt = now;
    else session.lastReasoningPushAt = now;

    const text = kind === "process" ? session.processText : session.reasoningText;
    const params: Record<string, string> = { [varName]: text };
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
        `[card-exec-preview] ${kind} push failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };

  const pushProcessLine = (line: string) => {
    if (!config.processVar) return;
    if (!canWriteProcessText(session)) return;
    const next = appendProcessLine(session.processText, line);
    if (next === session.processText) return;
    session.processText = next;
    flushField("process");
  };

  const safe = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      log?.debug?.(
        `[card-exec-preview] ${label} ignored: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return {
    session,
    prepareContentStream(card) {
      if (session.phase === "terminal") return;
      if (!card?.cardInstanceId) return;
      const alreadyStarted = session.phase === "contentStarted";
      markContentStarted(session);
      if (alreadyStarted) return;
      if (config.processVar && session.processText) flushField("process", true, card);
      if (config.reasoningVar && session.reasoningText) flushField("reasoning", true, card);
    },
    markClosed() {
      if (session.phase === "terminal") return;
      if (session.phase !== "contentStarted") markContentStarted(session);
      if (config.processVar && session.processText) flushField("process", true);
      if (config.reasoningVar && session.reasoningText) flushField("reasoning", true);
      markTerminal(session);
    },
    onToolStart(payload) {
      safe("onToolStart", () => {
        const line = formatToolStartLine(payload);
        if (line) pushProcessLine(line);
      });
    },
    onPlanUpdate(payload) {
      safe("onPlanUpdate", () => {
        const line = formatPlanUpdateLine(payload);
        if (line) pushProcessLine(line);
      });
    },
    onReasoningStream(payload) {
      safe("onReasoningStream", () => {
        if (!config.reasoningVar) return;
        if (!canWriteProcessText(session)) return;
        const text = formatReasoningText(payload.text || "");
        if (!text || text === session.reasoningText) return;
        session.reasoningText = text;
        flushField("reasoning");
      });
    },
    pushProcessLine,
  };
}
