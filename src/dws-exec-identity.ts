/**
 * Bind this inbound sender onto this OpenClaw exec child.
 *
 * Official dws (≥1.0.64) uses `--profile corpId:userId` per invocation and
 * `currentProfile` when that flag is missing. Mutating gateway `process.env`
 * races under concurrent DMs/groups. OpenClaw's `resolve_exec_env` /
 * `before_tool_call` run per tool call with that turn's ctx.
 */

const DWS_TOKEN = /(?:^|[\\/\s])dws(?:\.exe)?(?=\s|$)/i;
const PROFILE_FLAG = /--profile(?:\s+|=)(\S+)/;
const ENCRYPTED_SENDER = /^\$:/;

export type DwsExecIdentity = {
  senderId: string;
  corpId?: string;
  profile: string;
};

export type BeforeToolCallEvent = {
  toolName?: string;
  params?: Record<string, unknown>;
};

export type BeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
};

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function basename(token: string): string {
  const parts = token.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? token;
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

export function commandInvokesDws(command?: string, commandArgv?: unknown): boolean {
  if (Array.isArray(commandArgv) && commandArgv.length > 0) {
    const exe = String(commandArgv[0] ?? "");
    if (/^dws(?:\.exe)?$/i.test(basename(exe))) return true;
  }
  if (typeof command === "string" && DWS_TOKEN.test(command)) return true;
  return false;
}

function dwsTokenIndex(argv: string[]): number {
  return argv.findIndex((token) => /^dws(?:\.exe)?$/i.test(basename(token)));
}

export function injectDwsProfileCommand(command: string, profile: string): string {
  if (PROFILE_FLAG.test(command)) {
    return command.replace(PROFILE_FLAG, `--profile ${profile}`);
  }
  return command.replace(/(\S*?dws(?:\.exe)?)(\s|$)/i, `$1 --profile ${profile}$2`);
}

export function injectDwsProfileArgv(argv: string[], profile: string): string[] {
  const next = [...argv];
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
  const exeIdx = dwsTokenIndex(next);
  if (exeIdx < 0) return next;
  next.splice(exeIdx + 1, 0, "--profile", profile);
  return next;
}

function isExecTool(toolName: unknown): boolean {
  const name = String(toolName ?? "").toLowerCase();
  return name === "exec" || name === "bash";
}

export function handleBeforeToolCall(
  event: BeforeToolCallEvent,
  ctx: unknown,
): BeforeToolCallResult | undefined {
  if (!isExecTool(event.toolName)) return undefined;
  const params = event.params ?? {};
  const command = asString(params.command);
  const commandArgv = Array.isArray(params.commandArgv)
    ? params.commandArgv.map((item) => String(item))
    : undefined;
  if (!commandInvokesDws(command, commandArgv)) return undefined;

  const identity = readDwsExecIdentity(ctx);
  if (!identity) {
    return {
      block: true,
      blockReason:
        "dws exec blocked: missing inbound senderStaffId. Cannot fall back to dws currentProfile.",
    };
  }

  const next: Record<string, unknown> = { ...params };
  if (commandArgv) next.commandArgv = injectDwsProfileArgv(commandArgv, identity.profile);
  if (command) next.command = injectDwsProfileCommand(command, identity.profile);
  return { params: next };
}

export function handleResolveExecEnv(
  _event: unknown,
  ctx: unknown,
): Record<string, string> {
  const identity = readDwsExecIdentity(ctx);
  if (!identity) return {};
  const env: Record<string, string> = {
    DWS_AUTH_IDENTITY: identity.senderId,
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
    "before_tool_call",
    ((event: BeforeToolCallEvent, ctx: unknown) => handleBeforeToolCall(event, ctx)) as never,
    { priority: 40 },
  );
  api.on(
    "resolve_exec_env",
    ((_event: unknown, ctx: unknown) => handleResolveExecEnv(_event, ctx)) as never,
    { priority: 40 },
  );
}
