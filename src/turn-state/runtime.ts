import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import path from "node:path";
import { TurnStore, type TurnIdentity, type ExecutionState } from "./store.ts";

type TurnContext = { store: TurnStore; key: string; uncertain: boolean };
const current = new AsyncLocalStorage<TurnContext>();
let singleton: TurnStore | undefined;
let factory = () => new TurnStore(path.join(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw"), "dingtalk-connector", "turns-v1.sqlite"));
/** Tests replace storage only; protocol and state transitions remain real. */
export function setTurnStoreFactoryForTest(next?: () => TurnStore) {
  singleton?.close(); singleton = undefined;
  factory = next ?? (() => new TurnStore(path.join(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw"), "dingtalk-connector", "turns-v1.sqlite")));
}
export function markTurnExecution(state: ExecutionState): void {
  const context = current.getStore();
  if (context) context.store.execution(context.key, state);
}
export function markTurnUncertain(): void { const context = current.getStore(); if (context) context.uncertain = true; }
export async function runTrackedTurn(identity: TurnIdentity, run: () => Promise<void>): Promise<"handled" | "duplicate"> {
  const store = singleton ??= factory();
  const claim = store.claim(identity);
  if (!claim.claimed) return "duplicate";
  const context: TurnContext = { store, key: claim.key, uncertain: false };
  try {
    await current.run(context, run);
    store.finish(claim.key, context.uncertain);
    return "handled";
  } catch (error) {
    // Execution may have caused effects before throwing. Never rerun based on
    // this receipt; do not replace the original error if sealing also failed.
    try { store.finish(claim.key, true); } catch { /* An unclosed record is review-required. */ }
    throw error;
  }
}

/** Used at the actual transport boundary, not around a swallowed-error caller. */
export async function recordDelivery<T>(kind: "text" | "card" | "placeholder" | "media" | "error_notice", send: () => Promise<T>,
  confirm: (result: T) => boolean): Promise<T> {
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
