import { recordDelivery } from "./runtime.ts";

type ReceiptKind = "webhook" | "robot" | "card" | "placeholder" | "media";
/** Exact transport routes only. Token, download, upload, progress and reactions
 * are not evidence that the final answer was delivered. */
export function receiptKind(method: string, url: unknown, body: any): ReceiptKind | undefined {
  if (typeof url !== "string") return;
  let route: string;
  try { route = new URL(url).pathname; } catch { return; }
  if (method === "post" && route === "/robot/send" && ["text", "markdown"].includes(body?.msgtype)) return "webhook";
  if (method === "post" && ["/v1.0/robot/oToMessages/batchSend", "/v1.0/robot/groupMessages/send"].includes(route)) return "robot";
  if (method === "post" && ["/v1.0/robot/messageFiles/send", "/v1.0/robot/videos/send", "/v1.0/robot/audio/send"].includes(route)) return "media";
  if (method === "put" && route === "/v1.0/card/streaming" && body?.isFinalize === true) return "card";
  if (method === "put" && route === "/v1.0/card/instances" && body?.cardData?.cardParamMap?.flowStatus === "3") return "card";
  // Card creation/delivery is also a visible side effect even without an answer.
  if (method === "post" && ["/v1.0/card/instances", "/v1.0/card/instances/deliver"].includes(route)) return "placeholder";
}
export function confirmsDelivery(kind: ReceiptKind, response: any): boolean {
  const data = response?.data;
  const code = data?.errcode ?? data?.code;
  if (data?.success === false || code !== undefined && ![0, "0", "OK"].includes(code)) {
    throw Object.assign(new Error("DingTalk rejected the delivery request"), { deliveryRejected: true, response });
  }
  if (kind === "webhook") return code === 0 || code === "0";
  if (kind === "card" || kind === "placeholder") return response?.status >= 200 && response?.status < 300;
  return typeof data?.processQueryKey === "string" && data.processQueryKey.length > 0;
}

/** Decorates only the existing HTTP transport. No automatic retries are added. */
export function installDeliveryTracking(client: any): void {
  for (const method of ["post", "put"] as const) {
    const send = client[method].bind(client);
    client[method] = (url: unknown, body: unknown, options: unknown) => {
      const kind = receiptKind(method, url, body);
      if (!kind) return send(url, body, options);
      return recordDelivery(kind === "card" || kind === "placeholder" || kind === "media" ? kind : "text",
        () => send(url, body, options), response => confirmsDelivery(kind, response));
    };
  }
}
