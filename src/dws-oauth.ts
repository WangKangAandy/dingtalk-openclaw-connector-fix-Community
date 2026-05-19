/**
 * Per-senderId dws OAuth: login subprocess management and auth error handling (P2).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { getDwsSpawnEnv } from "./channel.ts";
import { sendProactive } from "./services/messaging/index.ts";
import type { DingtalkConfig } from "./types/index.ts";

const LOGIN_REUSE_MS = 5 * 60 * 1000;
const LOGIN_MAX_MS = 10 * 60 * 1000;
const MISMATCH_COOLDOWN_MS = 2 * 60 * 1000;

type LoginSession = {
  pid: number;
  proc: ChildProcess;
  startedAt: number;
  verificationUrl: string;
  userCode?: string;
};

const loginSessions = new Map<string, LoginSession>();
const mismatchCooldownUntil = new Map<string, number>();

const AUTH_ERROR_CODES = new Set([
  "IDENTITY_NOT_AUTHENTICATED",
  "AUTH_TOKEN_EXPIRED",
  "USER_TOKEN_ILLEGAL",
]);

const URL_PATTERN = /https?:\/\/[^\s)\]"'<>]+/gi;
const USER_CODE_PATTERN = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/;

export type DwsAuthErrorKind =
  | "not_authenticated"
  | "token_expired"
  | "identity_mismatch"
  | null;

export function parseDwsAuthError(
  output: string | undefined,
  exitCode: number | null | undefined,
): DwsAuthErrorKind {
  if (!output) {
    return null;
  }
  const text = output;
  if (text.includes("IDENTITY_MISMATCH") || text.includes('"code":"IDENTITY_MISMATCH"')) {
    return "identity_mismatch";
  }
  try {
    const jsonMatch = text.match(/\{[^{}]*"code"\s*:\s*"[^"]+"[^{}]*\}/g);
    if (jsonMatch) {
      for (const chunk of jsonMatch) {
        try {
          const parsed = JSON.parse(chunk) as { code?: string };
          if (parsed.code === "IDENTITY_MISMATCH") {
            return "identity_mismatch";
          }
          if (parsed.code === "IDENTITY_NOT_AUTHENTICATED") {
            return "not_authenticated";
          }
          if (parsed.code && AUTH_ERROR_CODES.has(parsed.code)) {
            return parsed.code === "AUTH_TOKEN_EXPIRED" ? "token_expired" : "not_authenticated";
          }
        } catch {
          // ignore partial JSON
        }
      }
    }
  } catch {
    // ignore
  }
  if (text.includes("IDENTITY_NOT_AUTHENTICATED")) {
    return "not_authenticated";
  }
  if (text.includes("AUTH_TOKEN_EXPIRED") || text.includes("USER_TOKEN_ILLEGAL")) {
    return "token_expired";
  }
  // Transitional: dws human-readable not-authenticated hints (exit 5)
  if (
    exitCode === 5 &&
    (text.includes("is not authenticated") || text.includes("未登录") || text.includes("auth login"))
  ) {
    return "not_authenticated";
  }
  // Do not treat HTTP 403 / scope errors as auth login triggers
  if (/\b403\b/.test(text) && /forbidden|权限|scope/i.test(text)) {
    return null;
  }
  return null;
}

export function parseDeviceLoginOutput(output: string): {
  verificationUrl: string;
  userCode?: string;
} | null {
  const urls = output.match(URL_PATTERN) ?? [];
  const completeUrl = urls.find((u) => u.includes("user_code=") || u.length > 60);
  const verificationUrl = completeUrl ?? urls[0];
  if (!verificationUrl) {
    return null;
  }
  const userCodeMatch = output.match(USER_CODE_PATTERN);
  return {
    verificationUrl: verificationUrl.replace(/[.,;]+$/, ""),
    userCode: userCodeMatch?.[0],
  };
}

function sessionKey(senderId: string, accountId?: string): string {
  return `${accountId ?? "default"}:${senderId}`;
}

function clearLoginSession(key: string): void {
  const existing = loginSessions.get(key);
  if (!existing) {
    return;
  }
  loginSessions.delete(key);
  try {
    if (!existing.proc.killed) {
      existing.proc.kill("SIGTERM");
    }
  } catch {
    // ignore
  }
}

function spawnLoginProcess(
  senderId: string,
  accountId: string | undefined,
  onUrl: (session: LoginSession) => void,
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void },
): void {
  const key = sessionKey(senderId, accountId);
  const env = getDwsSpawnEnv(accountId, senderId);
  const proc = spawn("dws", ["auth", "login", "--sender-id", senderId, "--device"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  if (!proc.pid) {
    log?.warn?.(`[DingTalk][dws-oauth] failed to spawn login for senderId=${senderId}`);
    return;
  }

  let buffer = "";
  const session: LoginSession = {
    pid: proc.pid,
    proc,
    startedAt: Date.now(),
    verificationUrl: "",
  };
  loginSessions.set(key, session);

  const handleChunk = (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    if (session.verificationUrl) {
      return;
    }
    const parsed = parseDeviceLoginOutput(buffer);
    if (parsed?.verificationUrl) {
      session.verificationUrl = parsed.verificationUrl;
      session.userCode = parsed.userCode;
      onUrl(session);
    }
  };

  proc.stdout?.on("data", handleChunk);
  proc.stderr?.on("data", handleChunk);

  const watchdog = setTimeout(() => {
    if (loginSessions.get(key)?.pid === proc.pid) {
      log?.warn?.(`[DingTalk][dws-oauth] login timeout (10m), killing pid=${proc.pid}`);
      clearLoginSession(key);
    }
  }, LOGIN_MAX_MS);

  proc.on("exit", (code) => {
    clearTimeout(watchdog);
    if (loginSessions.get(key)?.pid === proc.pid) {
      loginSessions.delete(key);
    }
    if (code === 0) {
      log?.info?.(`[DingTalk][dws-oauth] login succeeded for senderId=${senderId}`);
    } else if (buffer.includes("IDENTITY_MISMATCH")) {
      mismatchCooldownUntil.set(key, Date.now() + MISMATCH_COOLDOWN_MS);
      log?.warn?.(`[DingTalk][dws-oauth] IDENTITY_MISMATCH for senderId=${senderId}`);
    } else if (code !== null && code !== 0) {
      log?.warn?.(`[DingTalk][dws-oauth] login exited code=${code} senderId=${senderId}`);
    }
  });
}

export async function ensureDwsLoginAndNotify(params: {
  senderId: string;
  accountId?: string;
  config: DingtalkConfig;
  isDirect: boolean;
  conversationId: string;
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}): Promise<void> {
  const { senderId, accountId, config, isDirect, conversationId, log } = params;
  const key = sessionKey(senderId, accountId);
  const now = Date.now();

  const mismatchUntil = mismatchCooldownUntil.get(key);
  if (mismatchUntil && now < mismatchUntil) {
    log?.info?.(`[DingTalk][dws-oauth] skip login spawn (mismatch cooldown) senderId=${senderId}`);
    return;
  }

  const existing = loginSessions.get(key);
  if (existing?.verificationUrl && now - existing.startedAt < LOGIN_REUSE_MS) {
    await pushAuthLinkMessage({
      config,
      isDirect,
      conversationId,
      senderId,
      verificationUrl: existing.verificationUrl,
      userCode: existing.userCode,
      log,
    });
    return;
  }

  if (existing && now - existing.startedAt >= LOGIN_MAX_MS) {
    clearLoginSession(key);
  } else if (existing && !existing.verificationUrl) {
    // Still waiting for URL from in-flight spawn
    return;
  } else if (existing) {
    // In progress with URL already sent recently
    return;
  }

  spawnLoginProcess(senderId, accountId, (session) => {
    void pushAuthLinkMessage({
      config,
      isDirect,
      conversationId,
      senderId,
      verificationUrl: session.verificationUrl,
      userCode: session.userCode,
      log,
    });
  }, log);
}

async function pushAuthLinkMessage(params: {
  config: DingtalkConfig;
  isDirect: boolean;
  conversationId: string;
  senderId: string;
  verificationUrl: string;
  userCode?: string;
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}): Promise<void> {
  const { config, isDirect, conversationId, senderId, verificationUrl, userCode, log } = params;
  const codeLine = userCode ? `\n授权码：\`${userCode}\`` : "";
  const text = [
    "需要您本人完成钉钉授权后才能继续操作。",
    codeLine,
    `\n请点击链接并用**本人**钉钉扫码（请勿转发给他人）：\n${verificationUrl}`,
    "\n授权完成后请重新发送您的请求。",
  ]
    .filter(Boolean)
    .join("");

  const target = isDirect
    ? { userId: senderId }
    : { openConversationId: conversationId };

  try {
    await sendProactive(config, target, text, {
      msgType: "markdown",
      title: "钉钉授权",
      useAICard: false,
      fallbackToNormal: true,
      atUserIds: isDirect ? undefined : [senderId],
      log,
    });
    log?.info?.(`[DingTalk][dws-oauth] pushed auth link to senderId=${senderId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.warn?.(`[DingTalk][dws-oauth] failed to push auth link: ${msg}`);
  }
}

export async function handleDwsAuthCommandOutput(params: {
  output?: string;
  exitCode?: number | null;
  phase?: string;
  senderId: string;
  accountId?: string;
  config: DingtalkConfig;
  isDirect: boolean;
  conversationId: string;
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}): Promise<void> {
  if (params.phase !== "end") {
    return;
  }
  const kind = parseDwsAuthError(params.output, params.exitCode ?? null);
  if (!kind) {
    return;
  }

  if (kind === "identity_mismatch") {
    const key = sessionKey(params.senderId, params.accountId);
    clearLoginSession(key);
    mismatchCooldownUntil.set(key, Date.now() + MISMATCH_COOLDOWN_MS);
    const text =
      "授权失败：扫码账号与当前钉钉用户不一致。请**本人**使用钉钉扫码，勿转发授权链接给他人。";
    const target = params.isDirect
      ? { userId: params.senderId }
      : { openConversationId: params.conversationId };
    try {
      await sendProactive(params.config, target, text, {
        msgType: "markdown",
        useAICard: false,
        fallbackToNormal: true,
        atUserIds: params.isDirect ? undefined : [params.senderId],
        log: params.log,
      });
    } catch {
      // ignore
    }
    return;
  }

  await ensureDwsLoginAndNotify({
    senderId: params.senderId,
    accountId: params.accountId,
    config: params.config,
    isDirect: params.isDirect,
    conversationId: params.conversationId,
    log: params.log,
  });
}

/** @internal test helper */
export function _resetDwsOAuthStateForTests(): void {
  for (const key of [...loginSessions.keys()]) {
    clearLoginSession(key);
  }
  mismatchCooldownUntil.clear();
}
