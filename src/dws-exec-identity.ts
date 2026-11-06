/**
 * Bind trusted DingTalk channel context to one exec child, never gateway process.env.
 * The shared argv helper pins direct dws commands to an exact official profile.
 * This is a routing guard, not isolation against arbitrary shell code or filesystem access.
 */
import os from "node:os";
import path from "node:path";

import { buildDwsProfile, isBindableSenderId } from "../bin/dws-profile-args.mjs";
export { argsAreAuthLogin, bindDwsArgvForExec, buildDwsProfile, injectDwsProfileIntoArgs,
  isBindableSenderId, isOpenClawExecShell, readDwsProfileFromExecEnv,
  DWS_MISSING_SENDER_ERROR } from "../bin/dws-profile-args.mjs";

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
export function prefixExecCommandWithDwsShim(command: string, platform = process.platform): string {
  if (!/\bdws\b/.test(command)) return command;
  if (platform === "win32") {
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const shim = quote(path.join(dwsShimDir(), "dws"));
    const prefix = `if (!(Test-Path -LiteralPath ${shim} -PathType Leaf) -or ` +
      `!(Select-String -LiteralPath ${shim} -SimpleMatch '${DWS_SHIM_MARKER}' -Quiet)) { ` +
      `Write-Error ${quote(DWS_SHIM_NOT_ON_PATH_ERROR)}; exit 78 }; ` +
      `function dws { & ${quote(process.execPath)} ${shim} @args };\n`;
    return command.startsWith(prefix) ? command : prefix + command;
  }
  const dir = posixSingleQuote(dwsShimDir());
  const marker = posixSingleQuote(DWS_SHIM_MARKER);
  const err = posixSingleQuote(DWS_SHIM_NOT_ON_PATH_ERROR);
  const prefix = (
    `export OPENCLAW_DWS_SHIM_DIR=1; export PATH=${dir}\${PATH:+:$PATH}; ` +
    `_dws_resolved=$(command -v dws 2>/dev/null || true); ` +
    `if [ -z "$_dws_resolved" ] || ! grep -q ${marker} "$_dws_resolved" 2>/dev/null; then ` +
    `echo ${err} >&2; exit 78; fi\n`
  );
  return command.startsWith(prefix) ? command : prefix + command;
}

export function handleBeforeToolCall(
  event: unknown,
  _ctx: unknown,
): { params: { command: string } } | undefined {
  const e = asRecord(event);
  if (!isDingtalkExecContext(_ctx)) return undefined;
  if (asString(e?.toolName) !== "exec") return undefined;
  const params = asRecord(e?.params);
  const command = typeof params?.command === "string" ? params.command : undefined;
  if (!command) return undefined;
  const next = prefixExecCommandWithDwsShim(command);
  if (next === command) return undefined;
  return { params: { command: next } };
}

export function isDingtalkExecContext(ctx: unknown): boolean {
  const c = asRecord(ctx);
  const provider = asString(c?.messageProvider) ?? asString(c?.channel) ?? asString(asRecord(c?.requester)?.channel);
  // channelId on resolve_exec_env is the conversation ID, not a provider name.
  return provider ? provider === "dingtalk-connector" : c?.channelId === "dingtalk-connector";
}

export function readDwsExecIdentity(ctx: unknown): DwsExecIdentity | undefined {
  const c = asRecord(ctx);
  if (!isDingtalkExecContext(c)) return undefined;
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
  if (!isBindableSenderId(corpId)) return undefined;
  if (asString(senderObj?.id) && asString(senderObj?.id) !== senderId) return undefined;
  return { senderId, corpId, profile: buildDwsProfile(senderId, corpId) };
}

export function handleResolveExecEnv(
  _event: unknown,
  ctx: unknown,
): Record<string, string> {
  const identity = readDwsExecIdentity(ctx);
  if (!isDingtalkExecContext(ctx)) return {};
  if (!identity) return { DWS_PROFILE: "", OPENCLAW_DINGTALK_SENDER_ID: "",
    OPENCLAW_DINGTALK_CORP_ID: "", OPENCLAW_DINGTALK_BOUND: "0" };
  const env: Record<string, string> = {
    OPENCLAW_DINGTALK_BOUND: "1",
    DWS_PROFILE: identity.profile,
    OPENCLAW_DINGTALK_SENDER_ID: identity.senderId,
  };
  if (identity.corpId) env.OPENCLAW_DINGTALK_CORP_ID = identity.corpId;
  return env;
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
