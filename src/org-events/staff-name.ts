import type { DingtalkConfig } from "../types/index.ts";
import { DINGTALK_OAPI, getOapiAccessToken } from "../utils/utils-legacy.ts";
import type { OrgEventLog } from "./types.ts";

/** Directory name for a staff id. Official user_add_org payloads only carry userId. */
export async function lookupStaffName(
  config: DingtalkConfig,
  userId: string,
  log?: OrgEventLog,
): Promise<string | undefined> {
  try {
    const token = await getOapiAccessToken(config);
    if (!token) {
      log?.warn?.(`[org-events] no token to look up ${userId}`);
      return undefined;
    }
    const { dingtalkOapiHttp } = await import("../utils/http-client.ts");
    const resp = await dingtalkOapiHttp.get(`${DINGTALK_OAPI}/user/get`, {
      params: { access_token: token, userid: userId },
      timeout: 10_000,
    });
    if (resp.data?.errcode !== 0) {
      const errcode = resp.data?.errcode ?? "unknown";
      const hint = errcode === 60011 ? " missing qyapi_get_member" : "";
      log?.warn?.(`[org-events] user/get ${userId} errcode=${errcode}${hint}`);
      return undefined;
    }
    const name = resp.data?.name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch (err) {
    log?.warn?.(
      `[org-events] user/get ${userId} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}
