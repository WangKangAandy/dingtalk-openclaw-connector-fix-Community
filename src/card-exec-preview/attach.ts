import type { CardExecPreviewController } from "./update.ts";
import type { ResolvedCardExecPreviewConfig } from "./types.ts";

/**
 * Build OpenClaw replyOption hooks for exec preview.
 * replyOptions from typing only carries onReplyStart/onTyping*; safe to spread.
 */
export function buildCardExecPreviewHooks(opts: {
  config: ResolvedCardExecPreviewConfig;
  controller: CardExecPreviewController;
}): Record<string, unknown> {
  const { config, controller } = opts;
  if (!config.enabled) return {};

  const hooks: Record<string, unknown> = {
    suppressDefaultToolProgressMessages: true,
  };

  if (config.processVar) {
    hooks.onToolStart = controller.onToolStart;
    hooks.onPlanUpdate = controller.onPlanUpdate;
  }

  if (config.reasoningVar) {
    hooks.onReasoningStream = controller.onReasoningStream;
  }

  return hooks;
}
