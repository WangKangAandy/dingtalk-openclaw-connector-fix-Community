/** Shared by the plugin and the installed shim; this is routing, not a shell security boundary. */
export const DWS_MISSING_SENDER_ERROR =
  "dws exec blocked: missing trusted DingTalk corpId and senderStaffId. Cannot fall back to dws currentProfile.";

const valueFlags = new Set([
  "--profile", "--format", "--timeout", "--jq", "--output", "--fields",
  "--client-id", "--client-secret", "--token", "--mcp-url", "--pre-url", "-f",
]);

export function isBindableSenderId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.@-]*$/.test(value.trim());
}

export function buildDwsProfile(senderId, corpId) {
  if (!isBindableSenderId(senderId) || !isBindableSenderId(corpId)) {
    throw new Error(DWS_MISSING_SENDER_ERROR);
  }
  return `${corpId.trim()}:${senderId.trim()}`;
}

// Only remove options, never payload strings (e.g. --jq "--profile").
export function stripProfileArgs(args) {
  const next = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { next.push(...args.slice(i)); break; }
    if (arg === "--profile") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) i++;
      continue;
    }
    if (arg.startsWith("--profile=")) continue;
    next.push(arg);
    if (valueFlags.has(arg) && i + 1 < args.length) next.push(args[++i]);
  }
  return next;
}

export function argsAreAuthLogin(args) {
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") { i++; break; }
    if (!arg.startsWith("-")) break;
    if (arg.includes("=") || (arg.startsWith("-f") && arg.length > 2)) { i++; continue; }
    i += valueFlags.has(arg) ? 2 : 1;
  }
  if (args[i++] !== "auth") return false;
  // Cobra accepts persistent flags between command levels too.
  while (i < args.length && args[i].startsWith("-")) {
    const arg = args[i];
    if (arg === "--") { i++; break; }
    i += !arg.includes("=") && valueFlags.has(arg) ? 2 : 1;
  }
  return args[i] === "login";
}

export function injectDwsProfileIntoArgs(args, profile) {
  return ["--profile", profile, ...stripProfileArgs(args)];
}

export function isOpenClawExecShell(env) { return env.OPENCLAW_SHELL === "exec"; }

export function readDwsProfileFromExecEnv(env) {
  // resolve_exec_env supplies all three values per invocation. Never accept an inherited
  // DWS_PROFILE or a user-authored OPENCLAW_CHANNEL_CONTEXT as an identity fallback.
  if (env.OPENCLAW_DINGTALK_BOUND !== "1") return undefined;
  const sender = env.OPENCLAW_DINGTALK_SENDER_ID;
  const corp = env.OPENCLAW_DINGTALK_CORP_ID;
  if (!isBindableSenderId(sender) || !isBindableSenderId(corp)) return undefined;
  const profile = buildDwsProfile(sender, corp);
  return env.DWS_PROFILE === profile ? profile : undefined;
}

export function bindDwsArgvForExec(args, env) {
  // An interactive operator invocation is never silently rebound by inherited variables.
  if (!isOpenClawExecShell(env)) return { argv: args };
  const profile = readDwsProfileFromExecEnv(env);
  if (!profile) return { error: DWS_MISSING_SENDER_ERROR };
  return { argv: argsAreAuthLogin(args) ? stripProfileArgs(args) : injectDwsProfileIntoArgs(args, profile) };
}
