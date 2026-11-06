#!/usr/bin/env node
/**
 * DINGTALK_CONNECTOR_DWS_PROFILE_SHIM
 *
 * PATH stand-in at ~/.openclaw/bin/dws. OpenClaw exec children inherit
 * DWS_PROFILE; this shim adds `--profile` on business invocations. `auth login`
 * is passed through without --profile so a first-time official profile can be
 * created. Interactive shells without OPENCLAW_SHELL=exec pass through.
 *
 * Keep argv/env rules aligned with src/dws-exec-identity.ts bindDwsArgvForExec.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MARKER = "DINGTALK_CONNECTOR_DWS_PROFILE_SHIM";
const LEGACY_REAL = path.join(os.homedir(), ".local/lib/dingtalk-connector/dws");
const MISSING_SENDER =
  "dws exec blocked: missing inbound senderStaffId. Cannot fall back to dws currentProfile.";
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

function asString(v) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function injectDwsProfileIntoArgs(args, profile) {
  const next = [...args];
  const profileIdx = next.findIndex((token) => token === "--profile");
  if (profileIdx >= 0) {
    if (profileIdx + 1 < next.length && !String(next[profileIdx + 1]).startsWith("-")) {
      next[profileIdx + 1] = profile;
    } else {
      next.splice(profileIdx + 1, 0, profile);
    }
    return next;
  }
  const equalsIdx = next.findIndex((token) => String(token).startsWith("--profile="));
  if (equalsIdx >= 0) {
    next[equalsIdx] = `--profile=${profile}`;
    return next;
  }
  return ["--profile", profile, ...next];
}

function profileFromChannelContext(raw, fallbackCorp) {
  const text = asString(raw);
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    const sender = parsed && typeof parsed === "object" ? parsed.sender : undefined;
    const id = asString(sender?.id);
    if (!id || /^\$:/.test(id)) return undefined;
    const corp = asString(sender?.corpId) || fallbackCorp;
    return corp ? `${corp}:${id}` : id;
  } catch {
    return undefined;
  }
}

function readDwsProfileFromExecEnv(env) {
  const fromEnv = asString(env.DWS_PROFILE);
  if (fromEnv) return fromEnv;
  const sender = asString(env.OPENCLAW_DINGTALK_SENDER_ID);
  const corp = asString(env.OPENCLAW_DINGTALK_CORP_ID);
  if (sender && !/^\$:/.test(sender)) return corp ? `${corp}:${sender}` : sender;
  return profileFromChannelContext(env.OPENCLAW_CHANNEL_CONTEXT, corp);
}

function argsAreAuthLogin(args) {
  let i = 0;
  while (i < args.length) {
    const token = String(args[i]);
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

function bindDwsArgvForExec(args, env) {
  const profile = readDwsProfileFromExecEnv(env);
  if (argsAreAuthLogin(args)) {
    if (profile || env.OPENCLAW_SHELL !== "exec") return { argv: args };
    return { error: MISSING_SENDER };
  }
  if (profile) return { argv: injectDwsProfileIntoArgs(args, profile) };
  if (env.OPENCLAW_SHELL === "exec") return { error: MISSING_SENDER };
  return { argv: args };
}

function isShim(filePath) {
  try {
    const head = fs.readFileSync(filePath, { encoding: "utf8" }).slice(0, 400);
    return head.includes(MARKER);
  } catch {
    return false;
  }
}

function resolveRealDws() {
  const selfDir = path.resolve(path.dirname(process.argv[1] || ""));
  const fromEnv = asString(process.env.DWS_BIN);
  const pathEntries = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const names = process.platform === "win32" ? ["dws.cmd", "dws.exe", "dws"] : ["dws"];
  const fromPath = pathEntries.flatMap((dir) => names.map((name) => path.join(dir, name)));
  const candidates = [
    fromEnv,
    ...fromPath,
    path.join(os.homedir(), ".local", "bin", "dws"),
    LEGACY_REAL,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (path.resolve(path.dirname(candidate)) === selfDir) continue;
    if (isShim(candidate)) continue;
    return candidate;
  }
  console.error(
    "dws profile shim: official dws binary missing. Install dingtalk-workspace-cli and/or set DWS_BIN.",
  );
  process.exit(78);
}

const bound = bindDwsArgvForExec(process.argv.slice(2), process.env);
if (bound.error) {
  console.error(bound.error);
  process.exit(78);
}

const child = spawn(resolveRealDws(), bound.argv, { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  console.error(`dws profile shim: failed to spawn real dws: ${err.message}`);
  process.exit(127);
});
