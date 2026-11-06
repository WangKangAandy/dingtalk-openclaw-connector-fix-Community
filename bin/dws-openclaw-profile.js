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
import { bindDwsArgvForExec } from "./dws-profile-args.mjs";
function asString(value) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }

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
  const names = process.platform === "win32" ? ["dws.exe"] : ["dws"];
  const fromPath = pathEntries.flatMap((dir) => names.map((name) => path.join(dir, name)));
  const candidates = [
    fromEnv,
    ...fromPath,
    path.join(os.homedir(), ".local", "bin", "dws"),
    LEGACY_REAL,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    if (process.platform === "win32" && !candidate.toLowerCase().endsWith(".exe")) continue;
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
