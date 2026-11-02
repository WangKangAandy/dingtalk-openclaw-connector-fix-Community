import { AsyncLocalStorage } from 'node:async_hooks';

// Model-authored paths are not host file-read capabilities. The custom card
// dispatcher currently receives no host-authorized sandbox media reader.
// Keep the denial on asynchronous continuations even after a config reload.
const turns = new AsyncLocalStorage<boolean>();
let hardScope = false;
export const BLOCKED_MEDIA_NOTICE = '附件未发送：硬隔离模式下，回复中的路径不能授权读取宿主文件。';

export function configureOutboundMediaPolicy(enabled: boolean): void { hardScope = enabled; }
export function withOutboundMediaPolicy<T>(restricted: boolean, run: () => T): T {
  return turns.run(restricted || turns.getStore() === true, run);
}
export function automaticMediaBlocked(): boolean { return hardScope || turns.getStore() === true; }
/** Host callbacks can run outside the async chain which constructed them. */
export function bindOutboundMediaCallbacks<T extends object>(callbacks: T, restricted: boolean): T {
  return Object.fromEntries(Object.entries(callbacks).map(([key, value]) => [key,
    typeof value === 'function' ? function (this: unknown, ...args: unknown[]) {
      return withOutboundMediaPolicy(restricted, () => value.apply(this, args));
    } : value,
  ])) as T;
}
export function assertAutomaticMediaReadAllowed(restricted = false): void {
  if (restricted || automaticMediaBlocked()) throw new Error(BLOCKED_MEDIA_NOTICE);
}
export function blockedMediaText(text: string): string {
  return text.includes(BLOCKED_MEDIA_NOTICE) ? text : `${text}\n\n${BLOCKED_MEDIA_NOTICE}`;
}
