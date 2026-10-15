import fs from "node:fs";
import path from "node:path";
import type { OrgEventLog } from "./types.ts";

export const RECEIVED_LOG = "received.jsonl";

export type OrgEventReceipt = {
  action: "unparsed" | "ignore" | "handle" | "disabled" | "sent" | "duplicate" | "no-user" | "error";
  eventType?: string;
  eventId?: string;
  userIds?: string[];
  headerKeys?: string[];
};

/** Always-on breadcrumb: journal warn + append-only file. Must not throw. */
export function noteOrgEvent(stateDir: string, entry: OrgEventReceipt, log?: OrgEventLog): void {
  const type = entry.eventType?.trim() || "(none)";
  const id = entry.eventId?.trim() || "-";
  const users = entry.userIds?.length ?? 0;
  log?.warn?.(`[org-events] ${entry.action} type=${type} id=${id} users=${users}`);
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(
      path.join(stateDir, RECEIVED_LOG),
      `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // Receipt must not break delivery.
  }
}
