import fs from "node:fs";
import path from "node:path";
import type { OrgEventFrame, OrgEventLog, OrgEventMessage } from "./types.ts";

export const RECEIVED_LOG = "received.jsonl";

export type OrgEventReceipt = {
  action: "unparsed" | "ignore" | "received" | "disabled" | "sent" | "duplicate" | "no-user" | "error";
  eventType?: string;
  eventId?: string;
  userIds?: string[];
  /** userId → 姓名。查不到就省略，不挡发送。 */
  names?: Record<string, string>;
  /** 失败原因；仅 action=error 时写入，便于控制台日志页对齐 gateway。 */
  error?: string;
  headerKeys?: string[];
  test?: true;
};

type ReceiptCtx = {
  stateDir: string;
  log?: OrgEventLog;
};

/** 未进 handleFrame 的帧才记：解析失败，或其它企业事件类型。入职发送只记终态。 */
export function noteArrival(
  ctx: ReceiptCtx,
  message: OrgEventMessage,
  frame: OrgEventFrame | null,
): void {
  if (!frame) {
    record(ctx, {
      action: "unparsed",
      eventType: message.headers?.eventType,
      eventId: message.headers?.eventId,
      headerKeys: message.headers ? Object.keys(message.headers) : [],
      ...(message.test === true ? { test: true } : {}),
    });
    return;
  }
  record(ctx, {
    action: "ignore",
    eventType: frame.eventType,
    eventId: frame.eventId,
    userIds: frame.userIds,
    ...(frame.test === true ? { test: true } : {}),
  });
}

export function note(
  ctx: ReceiptCtx,
  action: OrgEventReceipt["action"],
  frame: OrgEventFrame,
  userId?: string,
  names?: Record<string, string>,
  error?: string,
): void {
  const ids = userId ? [userId] : frame.userIds;
  const kept = names
    ? Object.fromEntries(ids.map((id) => [id, names[id]]).filter((entry): entry is [string, string] => Boolean(entry[1])))
    : undefined;
  const err = error?.trim();
  record(ctx, {
    action,
    eventType: frame.eventType,
    eventId: frame.eventId,
    userIds: ids,
    ...(kept && Object.keys(kept).length > 0 ? { names: kept } : {}),
    ...(action === "error" && err ? { error: err } : {}),
    ...(frame.test === true ? { test: true } : {}),
  });
}

function record(ctx: ReceiptCtx, entry: OrgEventReceipt): void {
  const type = entry.eventType?.trim() || "(none)";
  const id = entry.eventId?.trim() || "-";
  const users = entry.userIds?.length ?? 0;
  const detail = entry.error ? ` error=${entry.error}` : "";
  const msg = `[org-events] ${entry.action} type=${type} id=${id} users=${users}${detail}`;
  if (entry.action === "error") {
    ctx.log?.error?.(msg);
  } else if (entry.action === "unparsed" || entry.action === "no-user") {
    ctx.log?.warn?.(msg);
  } else {
    ctx.log?.info?.(msg);
  }
  try {
    fs.mkdirSync(ctx.stateDir, { recursive: true });
    fs.appendFileSync(
      path.join(ctx.stateDir, RECEIVED_LOG),
      `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // Receipt must not break delivery.
  }
}
