import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { inspectTurns, type TurnInspectQuery } from "./inspect.ts";

export function registerTurnInspection(api: OpenClawPluginApi): void {
  api.registerGatewayMethod("dingtalk-connector.turns.inspect", async ({ params, respond }) => {
    try { respond(true, inspectTurns((params ?? {}) as TurnInspectQuery)); }
    catch { respond(false, { error: "Turn inspection failed: verify query parameters and the local ledger" }); }
  }, { scope: "operator.admin", profileAccess: "independent" });
}
