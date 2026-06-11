import { spawn, type ChildProcess } from "node:child_process";
import { getDwsSpawnEnv } from "../channel.ts";
import { parseDeviceLoginOutput } from "./auth-error.ts";
import {
  LOGIN_MAX_MS,
  LOGIN_REUSE_MS,
  MISMATCH_COOLDOWN_MS,
  sessionKey,
} from "./constants.ts";
import { writeDenialCache } from "./denial-cache.ts";
import { parseLoginDenial } from "./denial-parser.ts";
import {
  pushAuthLinkMessage,
  pushBlockedMessage,
  pushExpiredMessage,
  pushLoginSuccessMessage,
  pushMismatchMessage,
} from "./messages.ts";
import { invalidateAuthStatusCache } from "./status-cache.ts";
import type { NotifyContext } from "./types.ts";

type LoginSession = {
  pid: number;
  proc: ChildProcess;
  startedAt: number;
  verificationUrl: string;
  userCode?: string;
  outputBuffer: string;
  expiredNotified: boolean;
};

const loginSessions = new Map<string, LoginSession>();
const mismatchCooldownUntil = new Map<string, number>();

export function clearLoginSession(key: string): void {
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

async function handleLoginExit(
  code: number | null,
  buffer: string,
  ctx: NotifyContext,
  key: string,
): Promise<void> {
  if (code === 0) {
    invalidateAuthStatusCache(ctx.senderId, ctx.accountId);
    ctx.log?.info?.(`[DingTalk][dws-oauth] login succeeded for senderId=${ctx.senderId}`);
    await pushLoginSuccessMessage(ctx);
    return;
  }

  if (buffer.includes("IDENTITY_MISMATCH")) {
    clearLoginSession(key);
    mismatchCooldownUntil.set(key, Date.now() + MISMATCH_COOLDOWN_MS);
    invalidateAuthStatusCache(ctx.senderId, ctx.accountId);
    await pushMismatchMessage(ctx);
    return;
  }

  if (code === 5) {
    invalidateAuthStatusCache(ctx.senderId, ctx.accountId);
    const session = loginSessions.get(key);
    if (!session?.expiredNotified) {
      await pushExpiredMessage(ctx);
    }
    return;
  }

  const denial = parseLoginDenial(buffer);
  if (code === 2 || denial) {
    invalidateAuthStatusCache(ctx.senderId, ctx.accountId);
    const parsed =
      denial ?? {
        denialReason: "auth_denied",
        message: buffer.split("\n").slice(-5).join("\n").trim() || "login exit 2",
      };
    await writeDenialCache({
      senderId: ctx.senderId,
      denialReason: parsed.denialReason,
      message: parsed.message,
      recordedAt: new Date().toISOString(),
    });
    ctx.log?.info?.(
      `[DingTalk][dws-auth-gate] cliDenied senderId=${ctx.senderId} denialReason=${parsed.denialReason} loginExit=${code ?? "null"} source=login_step4 tokenPersisted=false`,
    );
    await pushBlockedMessage(ctx, parsed);
    return;
  }

  if (code !== null && code !== 0) {
    invalidateAuthStatusCache(ctx.senderId, ctx.accountId);
    ctx.log?.warn?.(
      `[DingTalk][dws-oauth] login exited code=${code} senderId=${ctx.senderId}`,
    );
  }
}

function spawnLoginProcess(ctx: NotifyContext): void {
  const { senderId, accountId, log } = ctx;
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

  const session: LoginSession = {
    pid: proc.pid,
    proc,
    startedAt: Date.now(),
    verificationUrl: "",
    outputBuffer: "",
    expiredNotified: false,
  };
  loginSessions.set(key, session);
  invalidateAuthStatusCache(senderId, accountId);

  const handleChunk = (chunk: Buffer) => {
    session.outputBuffer += chunk.toString("utf8");
    if (session.verificationUrl) {
      return;
    }
    const parsed = parseDeviceLoginOutput(session.outputBuffer);
    if (parsed?.verificationUrl) {
      session.verificationUrl = parsed.verificationUrl;
      session.userCode = parsed.userCode;
      void pushAuthLinkMessage({
        config: ctx.config,
        isDirect: ctx.isDirect,
        conversationId: ctx.conversationId,
        senderId,
        verificationUrl: session.verificationUrl,
        userCode: session.userCode,
        log,
      });
    }
  };

  proc.stdout?.on("data", handleChunk);
  proc.stderr?.on("data", handleChunk);

  const watchdog = setTimeout(() => {
    if (loginSessions.get(key)?.pid === proc.pid) {
      log?.warn?.(`[DingTalk][dws-oauth] login timeout (10m), killing pid=${proc.pid}`);
      const current = loginSessions.get(key);
      if (current) {
        current.expiredNotified = true;
      }
      void pushExpiredMessage(ctx).finally(() => {
        clearLoginSession(key);
      });
    }
  }, LOGIN_MAX_MS);

  proc.on("exit", (code) => {
    clearTimeout(watchdog);
    const buffer = session.outputBuffer;
    if (loginSessions.get(key)?.pid === proc.pid) {
      loginSessions.delete(key);
    }
    void handleLoginExit(code, buffer, ctx, key);
  });
}

export async function ensureDwsLoginAndNotify(params: NotifyContext): Promise<void> {
  const { senderId, accountId, log } = params;
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
      config: params.config,
      isDirect: params.isDirect,
      conversationId: params.conversationId,
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
    return;
  } else if (existing) {
    return;
  }

  spawnLoginProcess(params);
}

export function getLoginSession(key: string): LoginSession | undefined {
  return loginSessions.get(key);
}

export function getMismatchCooldownUntil(key: string): number | undefined {
  return mismatchCooldownUntil.get(key);
}

export function setMismatchCooldown(key: string, until: number): void {
  mismatchCooldownUntil.set(key, until);
}

export function resetSessionStateForTests(): void {
  for (const key of [...loginSessions.keys()]) {
    clearLoginSession(key);
  }
  mismatchCooldownUntil.clear();
}
