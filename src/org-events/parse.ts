import type { OrgEventFrame, OrgEventMessage } from "./types.ts";

function asUserIds(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Official user_add_org data is `{ userId: string[] }`. HTTP callbacks use `UserId`. */
export function parseUserAddOrg(data: unknown): { userIds: string[]; name?: string } {
  const source = readObject(data) ?? {};
  const userIds: string[] = [];
  for (const key of ["UserId", "userId", "userIds"]) {
    for (const id of asUserIds(source[key])) {
      if (!userIds.includes(id)) userIds.push(id);
    }
  }
  const candidate = source.name ?? source.userName ?? source.Name;
  const name = typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
  return { userIds, name };
}

export function parseOrgEventFrame(message: OrgEventMessage): OrgEventFrame | null {
  const eventType = message.headers?.eventType?.trim();
  if (!eventType) return null;
  let data: unknown = {};
  if (typeof message.data === "string" && message.data.trim()) {
    try {
      data = JSON.parse(message.data);
    } catch {
      data = {};
    }
  }
  const parsed = eventType === "user_add_org" ? parseUserAddOrg(data) : { userIds: [] as string[] };
  const dataTest = readObject(data)?.test === true;
  return {
    eventType,
    eventId: message.headers?.eventId?.trim() || undefined,
    userIds: parsed.userIds,
    name: parsed.name,
    ...(message.test === true || dataTest ? { test: true } : {}),
  };
}
