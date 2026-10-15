import fs from "node:fs";
import path from "node:path";
import type { OrgEventFrame, OrgEventLog, OrgEventMessage } from "./types.ts";

export const RECEIVED_LOG = "received.jsonl";

export type OrgEventReceipt = {
  action: "unparsed" | "ignore" | "received" | "disabled" | "sent" | "duplicate" | "no-user" | "error";
  eventType?: string;
  eventId?: string;
  userIds?: string[];
  headerKeys?: string[];
};

type ReceiptCtx = {
  stateDir: string;
  log?: OrgEventLog;
};

/** Stream 帧一进 listener 就记：有没有推到机器人、type 对不对。 */
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
    });
    return;
  }
  record(ctx, {
    action: frame.eventType === "user_add_org" ? "received" : "ignore",
    eventType: frame.eventType,
    eventId: frame.eventId,
    userIds: frame.userIds,
  });
}

/** handleFrame 原有日志点：级别仍按 info/warn/error，并追加 jsonl。 */
export function note(ctx: ReceiptCtx, action: OrgEventReceipt["action"], frame: OrgEventFrame, userId?: string): void {
  record(ctx, {
    action,
    eventType: frame.eventType,
    eventId: frame.eventId,
    userIds: userId ? [userId] : frame.userIds,
  });
}

/**
 * 正常到账是 info。本插件 logger.info 受 debug 开关控制，这里用 console.log
 * 保证 journal 看得到，不把正常路径抬成 warn。
 */
export function emitInfo(log: OrgEventLog | undefined, msg: string): void {
  log?.info?.(msg);
  console.log(msg);
}

function record(ctx: ReceiptCtx, entry: OrgEventReceipt): void {
  const type = entry.eventType?.trim() || "(none)";
  const id = entry.eventId?.trim() || "-";
  const users = entry.userIds?.length ?? 0;
  const msg = `[org-events] ${entry.action} type=${type} id=${id} users=${users}`;
  if (entry.action === "error") {
    ctx.log?.error?.(msg);
  } else if (entry.action === "unparsed" || entry.action === "no-user") {
    ctx.log?.warn?.(msg);
  } else {
    emitInfo(ctx.log, msg);
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
