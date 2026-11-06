import { AICardStatus, updateAICardParams, type AICardInstance } from "../services/messaging/card.ts";
import type { DingtalkConfig } from "../types/index.ts";
import { PublicProgress, type PublicProgressEvent, type ProgressOutcome } from "./progress.ts";
import type { CardExecPreviewLog, ResolvedCardExecPreviewConfig } from "./types.ts";

const THROTTLE_MS = 1500;
export type CardExecPreviewController = {
  onCardReady: (card: AICardInstance) => void;
  prepareContentStream: (card: AICardInstance | null | undefined) => void;
  markClosed: (outcome?: ProgressOutcome) => Promise<void>;
  onToolStart: (payload: PublicProgressEvent) => void;
  onItemEvent: (payload: PublicProgressEvent) => void;
  onApprovalEvent: (payload: PublicProgressEvent) => void;
  onPlanUpdate: (payload: unknown) => void;
  onCommandOutput: (payload: PublicProgressEvent) => void;
};
export type CreateCardExecPreviewControllerOpts = {
  config: ResolvedCardExecPreviewConfig;
  getCard: () => AICardInstance | null | undefined;
  dingtalkConfig: DingtalkConfig;
  log?: CardExecPreviewLog;
};

export function createCardExecPreviewController(opts: CreateCardExecPreviewControllerOpts): CardExecPreviewController {
  const model = new PublicProgress();
  let closed = false;
  let contentStarted = false;
  let executingSent = false;
  let dirty = false;
  let lastPush = -Infinity;
  let lastSnapshot = JSON.stringify(["", ""]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let closing: Promise<void> | undefined;
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };

  const flush = (force = false, card = opts.getCard()): Promise<void> => {
    if (!card || !dirty) return pending;
    const delay = Math.max(0, THROTTLE_MS - (Date.now() - lastPush));
    if (!force && delay > 0) {
      if (timer === undefined) {
        timer = setTimeout(() => { timer = undefined; if (!closed) void flush(); }, delay);
        timer.unref?.();
      }
      return pending;
    }
    clearTimer(); dirty = false; lastPush = Date.now();
    const params: Record<string, string> = {};
    if (opts.config.processVar) params[opts.config.processVar] = model.text();
    if (opts.config.summaryVar) params[opts.config.summaryVar] = model.summary();
    const includeExecuting = !closed && !contentStarted && !executingSent;
    executingSent ||= includeExecuting;
    // updateAICardParams synchronously appends to the shared per-card write
    // chain. No detached local queue can enqueue stale progress after final.
    pending = updateAICardParams(card, { params, ...(includeExecuting ? { flowStatus: AICardStatus.EXECUTING } : {}) },
      opts.dingtalkConfig, opts.log).catch(() => {
        // Progress is best effort, but never silently mark the business send
        // successful or retry a model turn because this projection failed.
        dirty = true;
        opts.log?.debug?.("[card-exec-preview] public progress update failed");
      });
    return pending;
  };
  const change = (run: () => void) => {
    if (closed) return;
    run();
    const snapshot = JSON.stringify([model.text(), model.summary()]);
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot; dirty = true; void flush();
  };
  return {
    onCardReady(card) { if (!closed) void flush(true, card); },
    prepareContentStream(card) {
      if (closed || !card) return;
      contentStarted = true;
      void flush(true, card);
    },
    markClosed(outcome = "ended") {
      if (closing) return closing;
      closed = true; clearTimer(); model.finish(outcome);
      // Flush the final state even if its update was inside the throttle window.
      dirty = Boolean(model.text()) || dirty;
      closing = flush(true);
      return closing;
    },
    onToolStart: p => change(() => model.tool(p)),
    onItemEvent: p => change(() => model.item(p)),
    onApprovalEvent: p => change(() => model.approval(p)),
    onPlanUpdate: p => { if (p) change(() => model.plan()); },
    onCommandOutput: p => change(() => model.command(p)),
  };
}
