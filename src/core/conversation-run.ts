import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type ConversationRun = {
  accountId: string;
  sessionKey: string;
  runId: string;
  controller: AbortController;
  closed: boolean;
};
const current = new AsyncLocalStorage<ConversationRun | undefined>();
const cleanup = new AsyncLocalStorage<boolean>();
const hostOutbound = new AsyncLocalStorage<AbortSignal | null>();
const active = new Set<ConversationRun>();
/** Local output handles only. OpenClaw owns queues, tools and child task cancellation. */
export async function withConversationRun<T>(scope: Pick<ConversationRun, 'accountId' | 'sessionKey'>,
  run: (handle: ConversationRun) => Promise<T>): Promise<T> {
  const handle = { ...scope, runId: randomUUID(), controller: new AbortController(), closed: false };
  active.add(handle);
  try { return await current.run(handle, () => run(handle)); }
  finally { handle.closed = true; active.delete(handle); }
}

export function abortConversationRuns(accountId: string, sessionKey: string): void {
  for (const run of active) {
    if (run.accountId === accountId && run.sessionKey === sessionKey) run.controller.abort();
  }
}

/** Called immediately before the existing transport sends; already-sent requests cannot be undone. */
export function assertConversationOutputActive(): void {
  hostOutbound.getStore()?.throwIfAborted();
  const run = current.getStore();
  if (run?.closed) throw new DOMException('Conversation run is closed', 'AbortError');
  if (!cleanup.getStore()) run?.controller.signal.throwIfAborted();
}
/** Public outbound calls may drain on a predecessor's async chain. Their Host
 * signal is authoritative; never inherit that predecessor's closed run handle. */
export function withHostOutbound<T>(signal: AbortSignal | undefined, send: () => Promise<T>): Promise<T> {
  signal?.throwIfAborted();
  return current.run(undefined, () => cleanup.run(false, () => hostOutbound.run(signal ?? null, send)));
}
/** Only the deterministic cancelled-card close may bypass the aborted output gate. */
export function withCancelledCardClose<T>(send: () => Promise<T>): Promise<T> { return cleanup.run(true, send); }

/** Host callbacks may be invoked outside the dispatcher's originating async chain. */
export function bindConversationCallbacks<T extends object>(callbacks: T): T {
  const restore = AsyncLocalStorage.snapshot();
  return Object.fromEntries(Object.entries(callbacks).map(([key, value]) => [key,
    typeof value === 'function' ? function(this: unknown, ...args: unknown[]) {
      return restore(() => value.apply(this, args));
    } : value,
  ])) as T;
}
