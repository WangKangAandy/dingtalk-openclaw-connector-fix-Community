import path from "node:path";
import { deliveryKey, DeliveryStore } from "./idempotency.ts";
import { parseOrgEventFrame } from "./parse.ts";
import { loadTemplate, renderOnboardingTemplate } from "./template.ts";
import type {
  OrgEventLog,
  OrgEventMessage,
  OrgEventSend,
  ResolvedOrgEventsConfig,
} from "./types.ts";

export type DispatchContext = {
  accountId: string;
  config: ResolvedOrgEventsConfig;
  send: OrgEventSend;
  log?: OrgEventLog;
  store?: DeliveryStore;
};

export function createOrgEventListener(ctx: DispatchContext) {
  const store =
    ctx.store ??
    new DeliveryStore(path.join(ctx.config.stateDir, `${ctx.accountId}.json`));

  return (message: OrgEventMessage): { status: string } => {
    const frame = parseOrgEventFrame(message);
    if (frame) {
      void handleFrame(ctx, store, frame).catch((err: unknown) => {
        ctx.log?.error?.(`[org-events] handler failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return { status: "SUCCESS" };
  };
}

async function handleFrame(
  ctx: DispatchContext,
  store: DeliveryStore,
  frame: ReturnType<typeof parseOrgEventFrame> & object,
): Promise<void> {
  const rule = ctx.config.events[frame.eventType];
  if (!rule?.enabled) return;
  if (rule.handler !== "onboarding") {
    ctx.log?.warn?.(`[org-events] no handler for ${frame.eventType}: ${rule.handler}`);
    return;
  }
  if (frame.userIds.length === 0) {
    ctx.log?.warn?.(`[org-events] ${frame.eventType} has no userId`);
    return;
  }

  const templatePath = rule.templatePath || ctx.config.templatePath;
  const markdown = loadTemplate(templatePath);

  for (const userId of frame.userIds) {
    const key = deliveryKey(frame.eventType, frame.eventId, userId);
    if (!store.claim(key)) {
      ctx.log?.info?.(`[org-events] skip duplicate ${key}`);
      continue;
    }
    try {
      const content = renderOnboardingTemplate(markdown, { name: frame.name, userId });
      await ctx.send({ userId, content, title: rule.title });
      store.commit(key);
      ctx.log?.info?.(`[org-events] sent ${frame.eventType} to ${userId}`);
    } catch (err) {
      store.abort(key);
      throw err;
    }
  }
}
