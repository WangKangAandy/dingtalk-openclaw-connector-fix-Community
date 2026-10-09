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
