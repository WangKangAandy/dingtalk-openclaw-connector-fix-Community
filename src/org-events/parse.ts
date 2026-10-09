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

/** Pull staff ids from the common user_add_org payload shapes. */
export function parseUserAddOrg(data: unknown): { userIds: string[]; name?: string } {
  const root = readObject(data) ?? {};
  const nestedRaw = root.bizData ?? root.biz_data ?? root.data;
  let nested = readObject(nestedRaw);
  if (typeof nestedRaw === "string") {
    try {
      nested = readObject(JSON.parse(nestedRaw));
    } catch {
      nested = undefined;
    }
  }
  const sources = [root, nested].filter(Boolean) as Record<string, unknown>[];
  const userIds: string[] = [];
  let name: string | undefined;
  for (const source of sources) {
    for (const key of ["UserId", "userId", "userIds", "staffId", "userid"]) {
      for (const id of asUserIds(source[key])) {
        if (!userIds.includes(id)) userIds.push(id);
      }
    }
    if (!name) {
      const candidate = source.name ?? source.userName ?? source.Name;
      if (typeof candidate === "string" && candidate.trim()) name = candidate.trim();
    }
  }
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
  return {
    eventType,
    eventId: message.headers?.eventId?.trim() || undefined,
    userIds: parsed.userIds,
    name: parsed.name,
  };
}
