import { createOrgEventListener } from "./dispatcher.ts";
import { defaultStateDir } from "./template.ts";
import type { OrgEventClient, OrgEventLog, OrgEventLookupName, OrgEventSend } from "./types.ts";

export function attachOrgEvents(opts: {
  client: OrgEventClient;
  accountId: string;
  stateDir?: string;
  send: OrgEventSend;
  lookupName?: OrgEventLookupName;
  log?: OrgEventLog;
}): void {
  if (typeof opts.client.registerAllEventListener !== "function") {
    opts.log?.warn?.("[org-events] client has no registerAllEventListener; listener not attached");
    return;
  }

  opts.client.registerAllEventListener(
    createOrgEventListener({
      accountId: opts.accountId,
      stateDir: opts.stateDir ?? defaultStateDir(),
      send: opts.send,
      lookupName: opts.lookupName,
      log: opts.log,
    }),
  );
  opts.log?.warn?.("[org-events] listening: user_add_org");
}
