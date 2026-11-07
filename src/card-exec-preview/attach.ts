import type { CardExecPreviewController } from "./update.ts";
import type { ResolvedCardExecPreviewConfig } from "./types.ts";
import type { GetReplyOptions } from "openclaw/plugin-sdk/reply-runtime";
type ProgressHooks = Pick<GetReplyOptions, "suppressDefaultToolProgressMessages" | "onToolStart" | "onItemEvent" | "onPlanUpdate" | "onApprovalEvent">;

/**
 * Build OpenClaw replyOption hooks for exec preview.
 * replyOptions from typing only carries onReplyStart/onTyping*; safe to spread.
 */
export function buildCardExecPreviewHooks(opts: {
  config: ResolvedCardExecPreviewConfig;
  controller: CardExecPreviewController;
}): ProgressHooks {
  const { config, controller } = opts;
  if (!config.enabled) return {};

  const hooks: ProgressHooks = {};

  hooks.suppressDefaultToolProgressMessages = true;
  hooks.onToolStart = controller.onToolStart;
  hooks.onItemEvent = controller.onItemEvent;
  hooks.onPlanUpdate = controller.onPlanUpdate;
  hooks.onApprovalEvent = controller.onApprovalEvent;
  // No reasoning or tool-result payload hook: raw content is not public progress.

  return hooks;
}
