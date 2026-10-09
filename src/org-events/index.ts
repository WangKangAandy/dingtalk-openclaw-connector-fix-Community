import { resolveOrgEventsConfig } from "./config.ts";
import { createOrgEventListener } from "./dispatcher.ts";
import type { OrgEventClient, OrgEventLog, OrgEventLookupName, OrgEventSend } from "./types.ts";

export function attachOrgEvents(opts: {
  client: OrgEventClient;
  accountId: string;
  channelConfig?: { orgEvents?: unknown };
  send: OrgEventSend;
  lookupName?: OrgEventLookupName;
  log?: OrgEventLog;
}): { enabled: boolean } {
  const resolved = resolveOrgEventsConfig(opts.channelConfig as never);

  if (!resolved.enabled) {
    stripWildcardEvents(opts.client);
    opts.log?.info?.("[org-events] disabled");
    return { enabled: false };
  }

  if (typeof opts.client.registerAllEventListener !== "function") {
    opts.log?.warn?.("[org-events] client has no registerAllEventListener; listener not attached");
    return { enabled: false };
  }

  opts.client.registerAllEventListener(
    createOrgEventListener({
      accountId: opts.accountId,
      config: resolved,
      send: opts.send,
      lookupName: opts.lookupName,
      log: opts.log,
    }),
  );
  opts.log?.info?.(
    `[org-events] listening: ${Object.entries(resolved.events)
      .filter(([, rule]) => rule.enabled)
      .map(([name]) => name)
      .join(", ")}`,
  );
  return { enabled: true };
}

function stripWildcardEvents(client: OrgEventClient): void {
  const subscriptions = client.config?.subscriptions;
  if (!Array.isArray(subscriptions)) return;
  client.config!.subscriptions = subscriptions.filter(
    (item) => !(item?.type === "EVENT" && (item.topic === "*" || item.topic === "")),
  );
}
