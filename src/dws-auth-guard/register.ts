import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { isSenderAuthenticated } from "../dws-oauth.ts";

const LOG_PREFIX = "[DingTalk][dws-auth-guard]";

const DWS_BUSINESS_RE =
  /\bdws\s+(aitable|calendar|chat|contact|todo|approval|attendance|report|ding|workbench|devdoc|doc|wiki|drive)\b/i;
const DWS_LOGIN_RE = /\bdws\s+auth\s+login\b/i;
const KILL_LOGIN_RE = /\b(kill|pkill)\b[^\n]*(dws|login|auth)/i;

function extractCommandText(event: {
  toolName?: string;
  params?: Record<string, unknown>;
}): string {
  const params = event.params ?? {};
  const candidates = [
    params.command,
    params.cmd,
    params.script,
    params.raw,
    params.input,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  if (event.toolName === "exec" || event.toolName === "bash" || event.toolName === "shell") {
    return String(params.command ?? params.cmd ?? "");
  }
  return "";
}

export function registerDwsAuthGuard(api: OpenClawPluginApi): void {
  if (typeof api.on !== "function") {
    api.logger?.warn?.(`${LOG_PREFIX} plugin hooks unavailable; auth guard disabled`);
    return;
  }

  if (process.env.DINGTALK_DWS_AUTH_GUARD === "0") {
    api.logger?.info?.(`${LOG_PREFIX} disabled via DINGTALK_DWS_AUTH_GUARD=0`);
    return;
  }

  api.on(
    "before_tool_call",
    async (event) => {
      const commandText = extractCommandText(event);
      if (!commandText.trim()) {
        return;
      }

      if (DWS_LOGIN_RE.test(commandText)) {
        return {
          block: true,
          blockReason:
            "dws auth login 由 connector 统一管理，请勿手动执行。请直接发送您的需求，系统会推送授权链接。",
        };
      }

      if (KILL_LOGIN_RE.test(commandText)) {
        return {
          block: true,
          blockReason: "禁止终止 connector 管理的 dws login 子进程。",
        };
      }

      const senderId =
        typeof event.context?.senderId === "string"
          ? event.context.senderId
          : process.env.DWS_AUTH_IDENTITY;
      const accountId =
        typeof event.context?.accountId === "string" ? event.context.accountId : undefined;

      if (
        DWS_BUSINESS_RE.test(commandText) &&
        senderId &&
        !(await isSenderAuthenticated(senderId, accountId))
      ) {
        return {
          block: true,
          blockReason:
            "当前用户尚未完成 dws 授权（token 未落盘）。请等待授权链接或完成扫码后再试。",
        };
      }
    },
    { priority: 45 },
  );

  api.logger?.info?.(`${LOG_PREFIX} registered`);
}
