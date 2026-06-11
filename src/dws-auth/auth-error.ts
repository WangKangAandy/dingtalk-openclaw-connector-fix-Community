import { URL_PATTERN, USER_CODE_PATTERN } from "./constants.ts";
import type { DwsAuthErrorKind } from "./types.ts";

const AUTH_ERROR_CODES = new Set([
  "IDENTITY_NOT_AUTHENTICATED",
  "AUTH_TOKEN_EXPIRED",
  "USER_TOKEN_ILLEGAL",
]);

export function parseDwsAuthError(
  output: string | undefined,
  _exitCode: number | null | undefined,
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
