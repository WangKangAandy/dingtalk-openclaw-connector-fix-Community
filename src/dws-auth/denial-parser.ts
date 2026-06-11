import type { DenialCacheEntry } from "./denial-cache.ts";

/** Matches dws stderr contract: `DWS_AUTH_DENIAL reason=user_not_allowed` */
const AUTH_DENIAL_LINE_RE = /^DWS_AUTH_DENIAL reason=(\w+)\s*$/m;

const HOST_DENIAL_MESSAGES: Record<string, string> = {
  user_not_allowed: "您不在该组织的 CLI 授权人员范围内",
  cli_not_enabled: "该组织尚未开启 CLI 数据访问权限",
  user_forbidden: "该组织已禁止所有成员使用 CLI",
  auth_denied: "CLI 授权被拒绝",
};

function parseAuthDenialContractLine(
  output: string,
): Pick<DenialCacheEntry, "denialReason" | "message"> | null {
  const match = output.match(AUTH_DENIAL_LINE_RE);
  if (!match?.[1]) {
    return null;
  }
  const denialReason = match[1];
  return {
    denialReason,
    message: HOST_DENIAL_MESSAGES[denialReason] ?? denialReason,
  };
}

/** @deprecated Phase 1.5 transition — remove after dws contract is mandatory */
function parseLoginDenialFallback(
  output: string,
): Pick<DenialCacheEntry, "denialReason" | "message"> | null {
  if (output.includes("您不在该组织的 CLI 授权人员范围内")) {
    return {
      denialReason: "user_not_allowed",
      message: "您不在该组织的 CLI 授权人员范围内",
    };
  }
  if (output.includes("该组织尚未开启 CLI 数据访问权限")) {
    return {
      denialReason: "cli_not_enabled",
      message: "该组织尚未开启 CLI 数据访问权限",
    };
  }
  if (output.includes("该组织已禁止所有成员使用 CLI")) {
    return {
      denialReason: "user_forbidden",
      message: "该组织已禁止所有成员使用 CLI",
    };
  }
  return null;
}

export function parseLoginDenial(
  output: string,
): Pick<DenialCacheEntry, "denialReason" | "message"> | null {
  return parseAuthDenialContractLine(output) ?? parseLoginDenialFallback(output);
}
