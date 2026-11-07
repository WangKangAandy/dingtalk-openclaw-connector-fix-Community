import { AsyncLocalStorage } from "node:async_hooks";
import { TurnStore, type TurnIdentity, type ExecutionState } from "./store.ts";
import { turnLedgerPath } from "./inspect.ts";

export type TurnSnapshot = NonNullable<ReturnType<TurnStore["snapshot"]>>;
export type TurnObserver = {
  changed: (snapshot: TurnSnapshot, terminal: boolean, persist: (desired: string, applied: string | undefined, outcome: "pending" | "accepted" | "failed" | "unknown") => void) => void;
  drain?: () => Promise<void>;
};
type TurnContext = { store: TurnStore; key: string; uncertain: boolean; observer?: TurnObserver };
const current = new AsyncLocalStorage<TurnContext | undefined>();
const deliveryPurpose = new AsyncLocalStorage<"error_notice" | "placeholder" | undefined>();
/** Host background outbound has its own durable identity. An inherited async
 * frame is not evidence that it belongs to the original connector inbound. */
export function withoutTrackedTurn<T>(run: () => Promise<T>): Promise<T> {
  return current.run(undefined, () => deliveryPurpose.run(undefined, run));
}
export function withDeliveryPurpose<T>(purpose: "error_notice" | "placeholder", run: () => Promise<T>): Promise<T> {
  return deliveryPurpose.run(purpose, run);
}
let singleton: TurnStore | undefined;
let factory = () => new TurnStore(turnLedgerPath());
/** Tests replace storage only; protocol and state transitions remain real. */
export function setTurnStoreFactoryForTest(next?: () => TurnStore) {
  singleton?.close(); singleton = undefined;
  factory = next ?? (() => new TurnStore(turnLedgerPath()));
}
function observe(context: TurnContext, terminal = false) {
  if (!context.observer) return;
  try {
    const snapshot = context.store.snapshot(context.key);
    if (snapshot) context.observer.changed(snapshot, terminal,
      (desired, applied, outcome) => context.store.feedback(context.key, desired, applied, outcome));
  } catch { /* Feedback cannot change execution, delivery, or trigger a replay. */ }
}
export function hasTurnFeedback(): boolean { return Boolean(current.getStore()?.observer); }
export function markTurnExecution(state: ExecutionState): void {
  const context = current.getStore();
  if (context) { context.store.execution(context.key, state); observe(context); }
}
export function markTurnUncertain(): void { const context = current.getStore(); if (context) context.uncertain = true; }
export async function runTrackedTurn(identity: TurnIdentity, run: () => Promise<void>, options: { observer?: TurnObserver; onReceipt?: (key: string) => void } = {}): Promise<"handled" | "duplicate"> {
  const store = singleton ??= factory();
  const claim = store.claim(identity);
  try { options.onReceipt?.(claim.key); } catch { /* Logging cannot veto a durable claim. */ }
  if (!claim.claimed) return "duplicate";
  const context: TurnContext = { store, key: claim.key, uncertain: false, observer: options.observer };
  try {
    await current.run(context, run);
    store.finish(claim.key, context.uncertain);
    return "handled";
  } catch (error) {
    // Execution may have caused effects before throwing. Never rerun based on
    // this receipt; do not replace the original error if sealing also failed.
    try { store.finish(claim.key, true); } catch { /* An unclosed record is review-required. */ }
    throw error;
  } finally {
    observe(context, true);
    try { await context.observer?.drain?.(); } catch { /* Diagnostic projection only. */ }
  }
}

/** Used at the actual transport boundary, not around a swallowed-error caller. */
export async function recordDelivery<T>(kind: "text" | "card" | "placeholder" | "media" | "error_notice", send: () => Promise<T>,
  confirm: (result: T) => boolean): Promise<T> {
  kind = deliveryPurpose.getStore() ?? kind;
  const context = current.getStore();
  if (context?.uncertain) throw Object.assign(new Error("Previous DingTalk turn outcome requires review; automatic delivery stopped"), { deliveryUnknown: true });
  let sequence: number | undefined;
  try { sequence = context?.store.beginDelivery(context.key, kind); }
  catch (error) {
    if (context) context.uncertain = true;
    throw Object.assign(new Error("Cannot record DingTalk delivery admission; request was not sent", { cause: error }), { deliveryUnknown: true });
  }
  try {
    const result = await send();
    const accepted = confirm(result);
    if (!accepted) {
      throw Object.assign(new Error("DingTalk delivery result is unconfirmed"), { deliveryUnknown: true });
    }
    if (context) context.store.delivery(context.key, sequence!, "accepted");
    return result;
  } catch (error: any) {
    if (context) {
      const definiteRejection = error?.deliveryRejected === true
        || [400, 401, 403, 404, 405, 413, 422, 429].includes(error?.response?.status);
      context.uncertain ||= !definiteRejection;
      try { context.store.delivery(context.key, sequence!, definiteRejection ? "failed" : "unknown"); }
      catch { context.uncertain = true; }
    }
    if (context?.uncertain && !error?.deliveryUnknown) {
      throw Object.assign(new Error("DingTalk turn delivery is unconfirmed; operator review required", { cause: error }), { deliveryUnknown: true });
    }
    throw error;
  }
}
