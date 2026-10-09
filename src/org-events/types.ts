export type OrgEventRule = {
  enabled: boolean;
  handler: string;
  title: string;
  templatePath?: string;
};

export type ResolvedOrgEventsConfig = {
  enabled: boolean;
  templatePath?: string;
  stateDir: string;
  events: Record<string, OrgEventRule>;
};

export type OrgEventFrame = {
  eventType: string;
  eventId?: string;
  userIds: string[];
  name?: string;
};

export type OrgEventClient = {
  config?: {
    subscriptions?: Array<{ type: string; topic: string }>;
  };
  registerAllEventListener?: (onEvent: (msg: OrgEventMessage) => { status: string }) => unknown;
};

export type OrgEventMessage = {
  headers?: {
    eventType?: string;
    eventId?: string;
  };
  data?: string;
};

export type OrgEventSend = (params: {
  userId: string;
  content: string;
  title: string;
}) => Promise<void>;

export type OrgEventLookupName = (userId: string) => Promise<string | undefined>;

export type OrgEventLog = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};
