import fs from "node:fs";
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
  configFile?: string;
  templatePath?: string;
  stateDir?: string;
  events?: Record<string, RawRule>;
};

function envFlag(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  const raw = env[name];
  if (raw === undefined || raw === "") return undefined;
  if (raw === "1" || raw.toLowerCase() === "true") return true;
  if (raw === "0" || raw.toLowerCase() === "false") return false;
  return undefined;
}

function normalizeRule(raw: RawRule | undefined, fallbackEnabled: boolean): OrgEventRule | null {
  const handler = raw?.handler?.trim() || "onboarding";
  return {
    enabled: raw?.enabled ?? fallbackEnabled,
    handler,
    title: raw?.title?.trim() || DEFAULT_TITLE,
    templatePath: raw?.templatePath?.trim() || undefined,
  };
}

function readConfigFile(configFile: string | undefined): Record<string, RawRule> {
  if (!configFile?.trim()) return {};
  const raw = fs.readFileSync(configFile, "utf8");
  const parsed = JSON.parse(raw) as { events?: Record<string, RawRule> };
  return parsed.events ?? {};
}

export function resolveOrgEventsConfig(
  channelConfig: { orgEvents?: RawOrgEvents } | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOrgEventsConfig {
  const orgEvents = channelConfig?.orgEvents;
  const fileEvents = readConfigFile(orgEvents?.configFile);
  const inlineEvents = orgEvents?.events ?? {};
  const merged: Record<string, RawRule> = { ...fileEvents, ...inlineEvents };

  let enabled = orgEvents?.enabled ?? false;
  const master = envFlag(env, "DINGTALK_ORG_EVENTS_ENABLED");
  if (master !== undefined) enabled = master;

  if (Object.keys(merged).length === 0) {
    merged.user_add_org = { handler: "onboarding", title: DEFAULT_TITLE, enabled: true };
  }

  const events: Record<string, OrgEventRule> = {};
  for (const [eventType, rule] of Object.entries(merged)) {
    const normalized = normalizeRule(rule, true);
    if (!normalized) continue;
    const specific = envFlag(env, `DINGTALK_ORG_EVENT_${eventType.toUpperCase()}`);
    if (specific !== undefined) normalized.enabled = specific;
    events[eventType] = normalized;
  }

  const templatePath = env.DINGTALK_ONBOARDING_TEMPLATE?.trim() || orgEvents?.templatePath?.trim() || undefined;
  const stateDir =
    orgEvents?.stateDir?.trim() ||
    path.join(os.homedir(), ".openclaw", "dingtalk-org-events");

  return { enabled, templatePath, stateDir, events };
}
