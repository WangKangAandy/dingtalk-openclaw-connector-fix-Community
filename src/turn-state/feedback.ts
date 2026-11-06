import type { TurnObserver, TurnSnapshot } from "./runtime.ts";

export type FeedbackState = "processing" | "submitted" | "failed" | "review" | "cancelled" | "ended";
export const feedbackLabels: Record<FeedbackState, string> = {
  processing: "处理中", submitted: "回复已提交", failed: "处理或投递失败",
  review: "结果待核查", cancelled: "已取消", ended: "处理已结束",
};
export function feedbackState(snapshot: TurnSnapshot, terminal: boolean): FeedbackState | undefined {
  // Access denial and parsing failure are not an admitted model turn.
  if (snapshot.execution === "not_started") return undefined;
  if (!terminal) return "processing";
  if (snapshot.reviewRequired || snapshot.delivery === "unknown") return "review";
  if (snapshot.execution === "cancelled") return "cancelled";
  if (snapshot.execution === "failed" || ["failed", "partial"].includes(snapshot.delivery)) return "failed";
  return snapshot.delivery === "accepted" ? "submitted" : "ended";
}
type Persist = Parameters<TurnObserver["changed"]>[2];
export type FeedbackTransport = (operation: "add" | "remove", label: string, signal: AbortSignal) => Promise<void>;

/** Coalesced, bounded side projection. Never retries a model or business send. */
export function createTurnFeedback(transport: FeedbackTransport): TurnObserver {
  let desired: FeedbackState | undefined;
  let applied: FeedbackState | undefined;
  let persist: Persist | undefined;
  let terminalSeen = false;
  let blocked = false;
  let worker: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let outcome: "pending" | "accepted" | "failed" | "unknown" = "pending";
  const save = () => { if (desired && persist) persist(desired, applied, outcome); };
  const invoke = async (operation: "add" | "remove", state: FeedbackState) => {
    controller = new AbortController();
    const signal = controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        transport(operation, feedbackLabels[state], signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller?.abort(); reject(new Error("feedback-timeout")); }, 5000);
          timer.unref?.();
        }),
      ]);
      signal.throwIfAborted();
    } finally { if (timer) clearTimeout(timer); controller = undefined; }
  };
  const pump = async () => {
    try {
      while (desired && desired !== applied && !blocked) {
        outcome = "pending"; save(); // Persist desired before attempting a mutation.
        if (applied) { await invoke("remove", applied); applied = undefined; save(); }
        const next = desired; // Coalesce changes that arrived during removal.
        await invoke("add", next); applied = next; outcome = "accepted"; save();
      }
    } catch (error: any) {
      blocked = true; outcome = error?.feedbackRejected ? "failed" : "unknown";
      try { save(); } catch { /* Ledger unavailable; never continue mutations. */ }
    } finally { worker = undefined; }
  };
  return {
    changed(snapshot, terminal, record) {
      if (terminalSeen) return;
      terminalSeen = terminal;
      const state = feedbackState(snapshot, terminal);
      if (!state) return;
      desired = state; persist = record;
      if (blocked) { try { save(); } catch {} return; }
      // Promise scheduling avoids assigning an already-completed worker when
      // persistence fails synchronously before the first transport call.
      worker ??= Promise.resolve().then(pump);
    },
    async drain() {
      if (!worker) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([worker, new Promise<void>(resolve => {
          timer = setTimeout(() => { blocked = true; controller?.abort(); outcome = "unknown"; try { save(); } catch {} resolve(); }, 6000);
          timer.unref?.();
        })]);
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}
