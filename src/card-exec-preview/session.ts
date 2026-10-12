/** Per-reply lifecycle gates for exec preview writes (not an Agent state machine). */

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
