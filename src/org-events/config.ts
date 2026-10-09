import os from "node:os";
import path from "node:path";
import type { OrgEventRule, ResolvedOrgEventsConfig } from "./types.ts";

const DEFAULT_TITLE = "新人指引";

type RawRule = {
  enabled?: boolean;
  handler?: string;
  title?: string;
  templatePath?: string;
};

type RawOrgEvents = {
  enabled?: boolean;
  templatePath?: string;
  stateDir?: string;
  events?: Record<string, RawRule>;
};

function normalizeRule(raw: RawRule | undefined, fallbackEnabled: boolean): OrgEventRule {
  return {
    enabled: raw?.enabled ?? fallbackEnabled,
    handler: raw?.handler?.trim() || "onboarding",
    title: raw?.title?.trim() || DEFAULT_TITLE,
    templatePath: raw?.templatePath?.trim() || undefined,
  };
}

export function resolveOrgEventsConfig(
  channelConfig: { orgEvents?: RawOrgEvents } | undefined,
): ResolvedOrgEventsConfig {
  const orgEvents = channelConfig?.orgEvents;
  const merged: Record<string, RawRule> = { ...(orgEvents?.events ?? {}) };

  const enabled = orgEvents?.enabled ?? false;

  if (Object.keys(merged).length === 0) {
    merged.user_add_org = { handler: "onboarding", title: DEFAULT_TITLE, enabled: true };
  }

  const events: Record<string, OrgEventRule> = {};
  for (const [eventType, rule] of Object.entries(merged)) {
    events[eventType] = normalizeRule(rule, true);
  }

  const templatePath = orgEvents?.templatePath?.trim() || undefined;
  const stateDir =
    orgEvents?.stateDir?.trim() ||
    path.join(os.homedir(), ".openclaw", "dingtalk-org-events");

  return { enabled, templatePath, stateDir, events };
}
