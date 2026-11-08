import type { GetReplyOptions } from 'openclaw/plugin-sdk/reply-runtime';

/** A Host-deferred followup may outlive the initial dispatch Promise. Keep the
 * connector receipt/output context alive until the public ownership cycle ends. */
export function createHostTurnLifecycle(abortSignal: AbortSignal, onAdopted?: () => void) {
  let deferred = false;
  let settled = false;
  let resolve!: () => void;
  const completion = new Promise<void>(done => { resolve = done; });
  const lifecycle: NonNullable<GetReplyOptions['turnAdoptionLifecycle']> = {
    admission: 'exclusive', abortSignal,
    onAdopted() { onAdopted?.(); },
    onDeferred() { deferred = true; return true; },
    onSettled() { settled = true; resolve(); },
  };
  return {
    lifecycle,
    pending: () => deferred && !settled,
    wasDeferred: () => deferred,
    wait: async () => { if (deferred) await completion; },
  };
}
