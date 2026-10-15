import path from "node:path";
import { deliveryKey, DeliveryStore } from "./idempotency.ts";
import { parseOrgEventFrame } from "./parse.ts";
import { noteOrgEvent } from "./receipt.ts";
import {
  ensureOnboardingContent,
  loadOnboardingTemplate,
  ONBOARDING_TITLE,
  onboardingDir,
  readOnboardingEnabled,
  renderOnboardingTemplate,
} from "./template.ts";
import type { OrgEventLog, OrgEventLookupName, OrgEventMessage, OrgEventSend } from "./types.ts";

export type DispatchContext = {
  accountId: string;
  stateDir: string;
  send: OrgEventSend;
  lookupName?: OrgEventLookupName;
  log?: OrgEventLog;
  store?: DeliveryStore;
};

export function createOrgEventListener(ctx: DispatchContext) {
  const store =
    ctx.store ??
    new DeliveryStore(path.join(ctx.stateDir, `${ctx.accountId}.json`));

  return (message: OrgEventMessage): { status: string } => {
    const frame = parseOrgEventFrame(message);
    if (!frame) {
      noteOrgEvent(
        ctx.stateDir,
        {
          action: "unparsed",
          eventType: message.headers?.eventType,
          eventId: message.headers?.eventId,
          headerKeys: message.headers ? Object.keys(message.headers) : [],
        },
        ctx.log,
      );
      return { status: "SUCCESS" };
    }
    if (frame.eventType !== "user_add_org") {
      noteOrgEvent(
        ctx.stateDir,
        { action: "ignore", eventType: frame.eventType, eventId: frame.eventId, userIds: frame.userIds },
        ctx.log,
      );
      return { status: "SUCCESS" };
    }
    noteOrgEvent(
      ctx.stateDir,
      { action: "handle", eventType: frame.eventType, eventId: frame.eventId, userIds: frame.userIds },
      ctx.log,
    );
    void handleFrame(ctx, store, frame).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log?.error?.(`[org-events] handler failed: ${msg}`);
      noteOrgEvent(
        ctx.stateDir,
        { action: "error", eventType: frame.eventType, eventId: frame.eventId, userIds: frame.userIds },
        ctx.log,
      );
    });
    return { status: "SUCCESS" };
  };
}

async function resolveDisplayName(
  ctx: DispatchContext,
  frame: { userIds: string[]; name?: string },
  userId: string,
): Promise<string | undefined> {
  if (ctx.lookupName) {
    try {
      const lookedUp = (await ctx.lookupName(userId))?.trim();
      if (lookedUp) return lookedUp;
    } catch (err) {
      ctx.log?.warn?.(
        `[org-events] name lookup failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return frame.userIds.length === 1 ? frame.name : undefined;
}

async function handleFrame(
  ctx: DispatchContext,
  store: DeliveryStore,
  frame: ReturnType<typeof parseOrgEventFrame> & object,
): Promise<void> {
  if (frame.eventType !== "user_add_org") return;

  const dir = onboardingDir(ctx.stateDir);
  ensureOnboardingContent(dir);
  if (!readOnboardingEnabled(dir)) {
    noteOrgEvent(
      ctx.stateDir,
      { action: "disabled", eventType: frame.eventType, eventId: frame.eventId, userIds: frame.userIds },
      ctx.log,
    );
    return;
  }
  if (frame.userIds.length === 0) {
    noteOrgEvent(
      ctx.stateDir,
      { action: "no-user", eventType: frame.eventType, eventId: frame.eventId },
      ctx.log,
    );
    return;
  }

  const markdown = loadOnboardingTemplate(dir);

  for (const userId of frame.userIds) {
    const key = deliveryKey(frame.eventType, frame.eventId, userId);
    if (!store.claim(key)) {
      noteOrgEvent(
        ctx.stateDir,
        { action: "duplicate", eventType: frame.eventType, eventId: frame.eventId, userIds: [userId] },
        ctx.log,
      );
      continue;
    }
    try {
      const name = await resolveDisplayName(ctx, frame, userId);
      const content = renderOnboardingTemplate(markdown, { name });
      await ctx.send({ userId, content, title: ONBOARDING_TITLE });
      store.commit(key);
      noteOrgEvent(
        ctx.stateDir,
        { action: "sent", eventType: frame.eventType, eventId: frame.eventId, userIds: [userId] },
        ctx.log,
      );
    } catch (err) {
      store.abort(key);
      throw err;
    }
  }
}
