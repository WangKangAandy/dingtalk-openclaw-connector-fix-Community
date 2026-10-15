import path from "node:path";
import { deliveryKey, DeliveryStore } from "./idempotency.ts";
import { parseOrgEventFrame } from "./parse.ts";
import { note, noteArrival } from "./receipt.ts";
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
    if (!frame || frame.eventType !== "user_add_org") {
      noteArrival(ctx, message, frame);
      return { status: "SUCCESS" };
    }
    void handleFrame(ctx, store, frame).catch((err: unknown) => {
      ctx.log?.error?.(`[org-events] handler failed: ${err instanceof Error ? err.message : String(err)}`);
      note(ctx, "error", frame);
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
    note(ctx, "disabled", frame);
    return;
  }
  if (frame.userIds.length === 0) {
    note(ctx, "no-user", frame);
    return;
  }

  const markdown = loadOnboardingTemplate(dir);
  let sent = false;
  for (const userId of frame.userIds) {
    const key = deliveryKey(frame.eventType, frame.eventId, userId);
    if (!store.claim(key)) {
      note(ctx, "duplicate", frame, userId);
      continue;
    }
    try {
      const name = await resolveDisplayName(ctx, frame, userId);
      const content = renderOnboardingTemplate(markdown, { name });
      await ctx.send({ userId, content, title: ONBOARDING_TITLE });
      store.commit(key);
      sent = true;
    } catch (err) {
      store.abort(key);
      throw err;
    }
  }
  if (sent) note(ctx, "sent", frame);
}
