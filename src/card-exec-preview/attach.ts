import type { CardExecPreviewController } from "./update.ts";
import type { ResolvedCardExecPreviewConfig } from "./types.ts";

/**
 * Build OpenClaw replyOption hooks for exec preview.
 * Caller must compose these with existing callbacks (must not overwrite semantics).
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
    hooks.onToolStart = (payload: { name?: string; phase?: string }) => {
      controller.onToolStart(payload);
    };
    hooks.onItemEvent = (payload: {
      title?: string;
      name?: string;
      phase?: string;
      status?: string;
      summary?: string;
      progressText?: string;
    }) => {
      controller.onItemEvent(payload);
    };
    hooks.onPlanUpdate = (payload: {
      title?: string;
      explanation?: string;
      phase?: string;
      steps?: string[];
    }) => {
      controller.onPlanUpdate(payload);
    };
  }

  if (config.reasoningVar) {
    hooks.onReasoningStream = (payload: { text?: string }) => {
      controller.onReasoningStream(payload);
    };
  }

  return hooks;
}

/** Compose a notification-style callback: run existing then preview; isolate preview errors. */
export function composeNotifyCallback<T extends unknown[]>(
  existing: ((...args: T) => unknown) | undefined,
  preview: ((...args: T) => unknown) | undefined,
): ((...args: T) => unknown) | undefined {
  if (!preview) return existing;
  if (!existing) {
    return (...args: T) => {
      try {
        return preview(...args);
      } catch {
        return undefined;
      }
    };
  }
  return (...args: T) => {
    const result = existing(...args);
    try {
      preview(...args);
    } catch {
      /* preview must not break primary path */
    }
    return result;
  };
}
