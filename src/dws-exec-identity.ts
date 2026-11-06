/**
 * Bind this inbound sender onto this OpenClaw exec child.
 *
 * Official dws uses `--profile corpId:userId` and falls back to
 * `currentProfile` when the flag is missing. Mutating gateway `process.env`
 * races under concurrent DMs/groups.
 *
 * OpenClaw 2026.7.1-2 explicitly denies plugin PATH (`filterPluginExecEnv`).
 * Identity is DWS_PROFILE on this child; the shim is reached by command-level
 * PATH prepend (same channel as wrapPosixCommandWithPathPrepend). `auth login`
 * is not injected — unknown exact profiles fail with `profile not found`.
 *
 * Keep argv/env rules aligned with bin/dws-openclaw-profile.js.
 */
import os from "node:os";
import path from "node:path";

const ENCRYPTED_SENDER = /^\$:/;

export type DwsExecIdentity = {
  senderId: string;
  corpId?: string;
  profile: string;
};

export type ExecEnv = Record<string, string | undefined>;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function isBindableSenderId(id: string | undefined): id is string {
  if (!id?.trim()) return false;
  return !ENCRYPTED_SENDER.test(id.trim());
}

export function buildDwsProfile(senderId: string, corpId?: string): string {
  const sender = senderId.trim();
  const corp = corpId?.trim();
  return corp ? `${corp}:${sender}` : sender;
}

const FLAGS_WITH_VALUE = new Set([
  "--profile",
  "--format",
  "--timeout",
  "--jq",
  "--output",
  "--fields",
  "--client-id",
  "--client-secret",
  "--token",
]);

/** True when this dws argv is `auth login` (flags before the subcommand ignored). */
export function argsAreAuthLogin(args: string[]): boolean {
  let i = 0;
  while (i < args.length) {
    const token = args[i]!;
    if (token === "--") {
      i += 1;
      break;
    }
    if (token.startsWith("--")) {
      if (token.includes("=")) {
        i += 1;
        continue;
      }
      i += FLAGS_WITH_VALUE.has(token) ? 2 : 1;
      continue;
    }
    break;
  }
  return args[i] === "auth" && args[i + 1] === "login";
}

const DWS_SHIM_MARKER = "DINGTALK_CONNECTOR_DWS_PROFILE_SHIM";
export const DWS_SHIM_NOT_ON_PATH_ERROR =
  "dws exec blocked: command -v dws is not the profile shim. Cannot fall back to dws currentProfile.";

export function dwsShimDir(): string {
  return path.join(os.homedir(), ".openclaw", "bin");
}

function posixSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Command-level prepend so login RC files cannot hide ~/.openclaw/bin/dws. */
export function prefixExecCommandWithDwsShim(command: string): string {
  if (!/\bdws\b/.test(command) || command.includes("OPENCLAW_DWS_SHIM_DIR=")) return command;
  const dir = posixSingleQuote(dwsShimDir());
  const marker = posixSingleQuote(DWS_SHIM_MARKER);
  const err = posixSingleQuote(DWS_SHIM_NOT_ON_PATH_ERROR);
  return (
    `export OPENCLAW_DWS_SHIM_DIR=1; export PATH=${dir}\${PATH:+:$PATH}; ` +
    `_dws_resolved=$(command -v dws 2>/dev/null || true); ` +
    `if [ -z "$_dws_resolved" ] || ! grep -q ${marker} "$_dws_resolved" 2>/dev/null; then ` +
    `echo ${err} >&2; exit 78; fi\n${command}`
  );
}

export function handleBeforeToolCall(
  event: unknown,
  _ctx: unknown,
): { params: { command: string } } | undefined {
  const e = asRecord(event);
  if (asString(e?.toolName) !== "exec") return undefined;
  const params = asRecord(e?.params);
  const command = typeof params?.command === "string" ? params.command : undefined;
  if (!command) return undefined;
  const next = prefixExecCommandWithDwsShim(command);
  if (next === command) return undefined;
  return { params: { command: next } };
}

export function readDwsExecIdentity(ctx: unknown): DwsExecIdentity | undefined {
  const c = asRecord(ctx);
  const requester = asRecord(c?.requester);
  const channel = asRecord(c?.channel) ?? asRecord(c?.channelContext);
  const senderObj = asRecord(channel?.sender);
  const senderId =
    asString(c?.requesterSenderId) ??
    asString(requester?.senderId) ??
    asString(c?.senderId) ??
    asString(senderObj?.id);
  if (!isBindableSenderId(senderId)) return undefined;
  const corpId =
    asString(senderObj?.corpId) ??
    asString(c?.botChatbotCorpId) ??
    asString(c?.BotChatbotCorpId);
  return { senderId, corpId, profile: buildDwsProfile(senderId, corpId) };
}

export function injectDwsProfileIntoArgs(args: string[], profile: string): string[] {
  const next = [...args];
  const profileIdx = next.findIndex((token) => token === "--profile");
  if (profileIdx >= 0) {
    if (profileIdx + 1 < next.length && !next[profileIdx + 1]!.startsWith("-")) {
      next[profileIdx + 1] = profile;
    } else {
      next.splice(profileIdx + 1, 0, profile);
    }
    return next;
  }
  const equalsIdx = next.findIndex((token) => token.startsWith("--profile="));
  if (equalsIdx >= 0) {
    next[equalsIdx] = `--profile=${profile}`;
    return next;
  }
  return ["--profile", profile, ...next];
}

export function handleResolveExecEnv(
  _event: unknown,
  ctx: unknown,
): Record<string, string> {
  const identity = readDwsExecIdentity(ctx);
  if (!identity) return {};
  const env: Record<string, string> = {
    DWS_PROFILE: identity.profile,
    OPENCLAW_DINGTALK_SENDER_ID: identity.senderId,
  };
  if (identity.corpId) env.OPENCLAW_DINGTALK_CORP_ID = identity.corpId;
  return env;
}

function parseChannelContext(raw: string | undefined): Record<string, unknown> | undefined {
  const text = asString(raw);
  if (!text) return undefined;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export function isOpenClawExecShell(env: ExecEnv): boolean {
  return env.OPENCLAW_SHELL === "exec";
}

export function readDwsProfileFromExecEnv(env: ExecEnv): string | undefined {
  const fromEnv = asString(env.DWS_PROFILE);
  if (fromEnv) return fromEnv;
  const sender = asString(env.OPENCLAW_DINGTALK_SENDER_ID);
  const corp = asString(env.OPENCLAW_DINGTALK_CORP_ID);
  if (isBindableSenderId(sender)) return buildDwsProfile(sender, corp);
  const channel = parseChannelContext(env.OPENCLAW_CHANNEL_CONTEXT);
  const senderObj = asRecord(channel?.sender);
  const id = asString(senderObj?.id);
  const corpId = asString(senderObj?.corpId) ?? corp;
  if (isBindableSenderId(id)) return buildDwsProfile(id, corpId);
  return undefined;
}

export const DWS_MISSING_SENDER_ERROR =
  "dws exec blocked: missing inbound senderStaffId. Cannot fall back to dws currentProfile.";

export function bindDwsArgvForExec(
  args: string[],
  env: ExecEnv,
): { argv: string[] } | { error: string } {
  const profile = readDwsProfileFromExecEnv(env);
  if (argsAreAuthLogin(args)) {
    if (profile || !isOpenClawExecShell(env)) return { argv: args };
    return { error: DWS_MISSING_SENDER_ERROR };
  }
  if (profile) return { argv: injectDwsProfileIntoArgs(args, profile) };
  if (isOpenClawExecShell(env)) return { error: DWS_MISSING_SENDER_ERROR };
  return { argv: args };
}

export function buildDingtalkChannelContext(params: {
  senderId?: string;
  corpId?: string;
  chatId?: string;
}): Record<string, unknown> | undefined {
  const senderId = asString(params.senderId);
  const chatId = asString(params.chatId);
  const corpId = asString(params.corpId);
  if (!senderId && !chatId) return undefined;
  return {
    ...(senderId
      ? { sender: { id: senderId, ...(corpId ? { corpId } : {}) } }
      : {}),
    ...(chatId ? { chat: { id: chatId } } : {}),
  };
}

type PluginApiWithHooks = {
  logger?: { warn?: (msg: string) => void; info?: (msg: string) => void };
  on?: (
    name: string,
    handler: (...args: never[]) => unknown,
    opts?: { priority?: number },
  ) => void;
};

export function registerDwsExecIdentity(api: PluginApiWithHooks): void {
  if (typeof api.on !== "function") {
    api.logger?.warn?.(
      "[dingtalk-connector] OpenClaw plugin API has no hook registrar; dws per-sender --profile will not be injected",
    );
    return;
  }
  api.on(
    "resolve_exec_env",
    ((_event: unknown, ctx: unknown) => handleResolveExecEnv(_event, ctx)) as never,
    { priority: 40 },
  );
  api.on(
    "before_tool_call",
    ((event: unknown, ctx: unknown) => handleBeforeToolCall(event, ctx)) as never,
    { priority: 40 },
  );
}
