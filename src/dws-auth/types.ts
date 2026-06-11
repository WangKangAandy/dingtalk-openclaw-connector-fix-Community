import type { DingtalkConfig } from "../types/index.ts";

export type DwsAuthLog = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export type NotifyContext = {
  senderId: string;
  accountId?: string;
  config: DingtalkConfig;
  isDirect: boolean;
  conversationId: string;
  log?: DwsAuthLog;
};

export type EnsureDwsAuthParams = NotifyContext & {
  userMessage?: string;
};

export type EnsureDwsAuthResult = {
  enterAgent: boolean;
  status: "ready" | "pending" | "cliDenied";
};

export type DwsAuthErrorKind =
  | "not_authenticated"
  | "token_expired"
  | "identity_mismatch"
  | null;
